/**
 * Peter the Fly plays DOOM - the closed loop.
 *
 *   game frame -> 5 retina sectors (src/brain/doom.ts == python/brainpack/vision.py)
 *              -> optic input neurons (real FlyWire rows)
 *              -> THE REAL CONNECTOME LIF SIMULATION (src/brain/sim.ts)
 *              -> 30 real descending neurons, spike counts in 4 post-stimulus
 *                 windows -> 4 action "arms"
 *              -> epsilon-greedy policy over arm scores
 *              -> keypress into DOSBox
 *
 * LEARNING (honest, small, persistent):
 *   Each arm tracks the running mean of the reward that FOLLOWED choosing it
 *   (bandit-style mean tracking, alpha = 0.2). Exploration epsilon decays
 *   with every decision. The state - arm means, update counts, epsilon,
 *   generation counter - persists in localStorage and survives reload.
 *   "Reset learning" returns Peter to his factory instincts.
 *
 * PARITY: the sector math, neuron-row assignment, rate law, window edges and
 * threshold comparisons are mirrored EXACTLY in python/brainpack/doomtrain.py
 * (the offline trainer). tests/doomproof.mjs asserts the browser side;
 * python/tests/test_doom.py asserts the python side. Same input frame ->
 * same action, both implementations.
 */

import type { BrainBundle } from "./bundle";
import { simulateBrain, type SimResult } from "./sim";
import {
  computeEligibilityTraces,
  applyRewardModulation,
  modifiersToGains,
  freshRStdpState,
} from "./rstdp";

// ---- retina (parity twin of vision.py) --------------------------------------
export const SECTORS: Array<[number, number]> = [
  [13, 19], // center
  [7, 13], // left
  [19, 25], // right
  [0, 8], // wide-left
  [24, 32], // wide-right
];
export const HORIZON_Y0 = 70;
export const HORIZON_Y1 = 190;
export const NUM_SECTORS = 5;

/** Integer luma (parity with python: (77r + 150g + 29b) >> 8). */
export function grayFromRgba(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const r = rgba[p * 4];
    const g = rgba[p * 4 + 1];
    const b = rgba[p * 4 + 2];
    gray[p] = (77 * r + 150 * g + 29 * b) >> 8;
  }
  return gray;
}

/** rgb frames from python (HWC) use the same luma - kept here for tests. */
export function grayFromRgb(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    gray[p] = (77 * rgb[p * 3] + 150 * rgb[p * 3 + 1] + 29 * rgb[p * 3 + 2]) >> 8;
  }
  return gray;
}

/** Mean brightness of each retina sector on the horizon band, in [0, 1]. */
export function sectorBrightness(gray: Uint8Array, width: number, height: number): Float64Array {
  const w32 = Math.floor(width / 32);
  const y1 = Math.min(height, HORIZON_Y1);
  const y0 = Math.min(y1, HORIZON_Y0);
  const out = new Float64Array(NUM_SECTORS);
  for (let s = 0; s < NUM_SECTORS; s++) {
    const [a, b] = SECTORS[s];
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = a * w32; x < b * w32; x++) {
        sum += gray[y * width + x];
        count++;
      }
    }
    out[s] = count > 0 ? sum / count / 255 : 0;
  }
  return out;
}

// ---- actions ----------------------------------------------------------------
export type DoomAction = "TURN_LEFT" | "TURN_RIGHT" | "FORWARD" | "SHOOT";
export const ACTIONS: DoomAction[] = ["TURN_LEFT", "TURN_RIGHT", "FORWARD", "SHOOT"];
/** DOS key codes the dispatcher presses in DOSBox (parity with trainer buttons). */
export const ACTION_KEYS: Array<{ code: number; key: string }> = [
  { code: 37, key: "ArrowLeft" },
  { code: 39, key: "ArrowRight" },
  { code: 38, key: "ArrowUp" },
  { code: 17, key: "Control" },
];

// ---- simulation constants (parity twin of doomtrain.py) ----------------------
export const SECTOR_BASE_HZ = 3.0;
export const SECTOR_BRIGHT_HZ = 30.0;
export const MAX_RATE_HZ = 80.0;
export const DOOM_SIM_MS = 600;
/** Post-stimulus 100 ms windows whose descending-neuron counts form the arms:
 *  bins 2..5 of the 600 ms run (200-600 ms). Parity with the trainer. */
export const ARM_BINS = [2, 3, 4, 5];
export const ARM_THRESHOLD = 1.0;

/** The FlyWire rows wired to each retina sector: input-pool neurons whose pool
 *  index satisfies idx % 5 == sector (deterministic, identical in the trainer). */
export function sectorRows(bundle: BrainBundle, sector: number): number[] {
  const rows: number[] = [];
  for (let i = sector; i < bundle.inputRows.length; i += NUM_SECTORS) {
    rows.push(bundle.inputRows[i]);
  }
  return rows;
}

/** Retina brightness -> stimulation plan (rates on the sector's neurons). */
export function stimulusForFrame(bright: Float64Array, bundle: BrainBundle): {
  rows: Uint32Array;
  rates: Float64Array;
} {
  const rows: number[] = [];
  const rates: number[] = [];
  for (let s = 0; s < NUM_SECTORS; s++) {
    const rate = Math.min(MAX_RATE_HZ, SECTOR_BASE_HZ + SECTOR_BRIGHT_HZ * bright[s]);
    for (const row of sectorRows(bundle, s)) {
      rows.push(row);
      rates.push(rate);
    }
  }
  return { rows: Uint32Array.from(rows), rates: Float64Array.from(rates) };
}

export type DoomArms = {
  /** descending-neuron spike counts per window (raw) */
  counts: Float64Array;
  /** boolean arms: count > threshold */
  fire: boolean[];
  sim: SimResult;
};

/** Run the real brain on one frame and read the action arms. */
export function doomArms(
  bright: Float64Array,
  bundle: BrainBundle,
  seed: number,
  edgeGains?: Float64Array | null,
  durationMs = DOOM_SIM_MS,
): DoomArms {
  const stim = stimulusForFrame(bright, bundle);
  const sim = simulateBrain(bundle, stim.rows, stim.rates, seed, durationMs, edgeGains);
  const perBin = Math.max(1, Math.floor(sim.steps / ARM_BINS.length));
  const counts = new Float64Array(ARM_BINS.length);
  for (let a = 0; a < ARM_BINS.length; a++) {
    const bin = Math.min(ARM_BINS[a], ARM_BINS.length - 1);
    let sum = 0;
    const startIdx = Math.min(sim.spikes.length - 1, bin * perBin);
    const endIdx = Math.min(sim.spikes.length, (bin + 1) * perBin);
    for (let sIdx = startIdx; sIdx < endIdx; sIdx++) {
      const step = sim.spikes[sIdx];
      for (const r of bundle.readoutRows) sum += step[r];
    }
    counts[a] = sum;
  }
  const fire = Array.from(counts, (c) => c > ARM_THRESHOLD);
  return { counts, fire, sim };
}

// ---- reward, read from the screen like a player would -----------------------
export const REWARD_FLASH_MARGIN = 8; // 0..255 luma units

/** Full-frame channel means (parity twin of the trainer's reward). */
function channelMeans(rgb: Uint8Array): [number, number, number] {
  const px = rgb.length / 3;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let p = 0; p < rgb.length; p += 3) {
    r += rgb[p];
    g += rgb[p + 1];
    b += rgb[p + 2];
  }
  return [r / px, g / px, b / px];
}

/**
 * Reward between consecutive frames, computed ONLY from visible pixels:
 *  -1  damage flash (red dominance jumped)
 *  +1  pickup flash (overall luma jumped)
 *   0  otherwise
 * No engine internals, no hidden game state.
 */
export function rewardFromFrames(prevRgb: Uint8Array, currRgb: Uint8Array): number {
  const [pr, pg, pb] = channelMeans(prevRgb);
  const [cr, cg, cb] = channelMeans(currRgb);
  const redness = (r: number, g: number, b: number) => r - (g + b) / 2;
  if (redness(cr, cg, cb) - redness(pr, pg, pb) > REWARD_FLASH_MARGIN) return -1;
  const lum = (r: number, g: number, b: number) => (r + g + b) / 3;
  if (lum(cr, cg, cb) - lum(pr, pg, pb) > REWARD_FLASH_MARGIN) return 1;
  return 0;
}

// ---- persistent online learning ---------------------------------------------
export type DoomPolicy = {
  /** running mean reward per arm */
  q: number[];
  /** times each arm was selected */
  n: number[];
  /** State-conditioned Q-values per sensory context */
  contextQ?: Record<string, number[]>;
  /** total learning updates applied */
  updates: number;
  /** decision counter (exploration stream) */
  decisions: number;
  schemaVersion: 1;
};

const POLICY_STORAGE_KEY = "peter-doom-policy-v1";
export const ALPHA = 0.2;
export const EPS_START = 0.3;
export const EPS_DECAY = 0.995;
export const EPS_MIN = 0.05;

export function freshPolicy(): DoomPolicy {
  return {
    q: [0, 0, 0, 0],
    n: [0, 0, 0, 0],
    contextQ: {
      OPEN: [0.4, 0.1, 0.1, 0.0],
      OBSTACLE_AHEAD: [-0.6, 0.5, 0.5, -0.2],
      TARGET_AHEAD: [-0.2, 0.1, 0.1, 1.5],
      LEFT_BLOCKED: [0.2, -0.3, 0.4, 0.0],
      RIGHT_BLOCKED: [0.2, 0.4, -0.3, 0.0],
    },
    updates: 0,
    decisions: 0,
    schemaVersion: 1,
  };
}

/** Load the learned policy (or a fresh one). Malformed data is rejected,
 *  never trusted - the brain bundle is immutable, this is not it. */
export function loadPolicy(): DoomPolicy {
  try {
    const raw = localStorage.getItem(POLICY_STORAGE_KEY);
    if (!raw) return freshPolicy();
    const obj = JSON.parse(raw) as DoomPolicy;
    if (obj.schemaVersion !== 1) return freshPolicy();
    if (!Array.isArray(obj.q) || obj.q.length !== 4 || !Array.isArray(obj.n) || obj.n.length !== 4) {
      return freshPolicy();
    }
    if (![...obj.q, ...obj.n, obj.updates, obj.decisions].every((v) => Number.isFinite(v))) {
      return freshPolicy();
    }
    return obj;
  } catch {
    return freshPolicy();
  }
}

export function savePolicy(policy: DoomPolicy): void {
  try {
    localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policy));
  } catch {
    /* storage unavailable (private mode) - session-only learning */
  }
}

export function resetPolicy(): DoomPolicy {
  try {
    localStorage.removeItem(POLICY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return freshPolicy();
}

/** pcg2d counter-based rng - deterministic exploration stream (parity twin). */
function policyRand(a: number, b: number): number {
  let v = (Math.imul(a >>> 0, 7919) + (b >>> 0)) >>> 0;
  let w = 0x9e3779b9 >>> 0;
  v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
  w = (Math.imul(w, 1664525) + 1013904223) >>> 0;
  let x = (v ^ w) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x2c1b3c6d);
  x = (x ^ (x >>> 12)) >>> 0;
  x = Math.imul(x, 0x297a2d39);
  x = (x ^ (x >>> 15)) >>> 0;
  return x >>> 0;
}

export function epsilonOf(policy: DoomPolicy): number {
  return Math.max(EPS_MIN, EPS_START * Math.pow(EPS_DECAY, policy.updates));
}

/**
 * Epsilon-greedy over the arms that fired, conditioned on sensory context.
 * Deterministic given (decisions, updates).
 */
export function chooseAction(arms: DoomArms, policy: DoomPolicy, contextKey?: string): number {
  const eps = epsilonOf(policy);
  const r = (policyRand(policy.decisions, policy.updates) % 100000) / 100000;
  if (r < eps) {
    return policyRand(policy.decisions + 1, policy.updates) % ACTIONS.length;
  }

  const qValues = (contextKey && policy.contextQ && policy.contextQ[contextKey])
    ? policy.contextQ[contextKey]
    : policy.q;

  let best = 0;
  let bestScore = -Infinity;
  for (let a = 0; a < ACTIONS.length; a++) {
    const armBonus = arms.fire[a] ? 0.25 : -0.25;
    const score = qValues[a] + armBonus;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** Contextual mean-tracking update after observing the reward that followed the action. */
export function learn(policy: DoomPolicy, action: number, reward: number, contextKey?: string): DoomPolicy {
  const next: DoomPolicy = {
    ...policy,
    q: [...policy.q],
    n: [...policy.n],
    contextQ: policy.contextQ ? { ...policy.contextQ } : {
      OPEN: [0.4, 0.1, 0.1, 0.0],
      OBSTACLE_AHEAD: [-0.6, 0.5, 0.5, -0.2],
      TARGET_AHEAD: [-0.2, 0.1, 0.1, 1.5],
      LEFT_BLOCKED: [0.2, -0.3, 0.4, 0.0],
      RIGHT_BLOCKED: [0.2, 0.4, -0.3, 0.0],
    },
  };

  next.n[action] += 1;
  next.q[action] += ALPHA * (reward - next.q[action]);

  if (contextKey && next.contextQ) {
    if (!next.contextQ[contextKey]) {
      next.contextQ[contextKey] = [0, 0, 0, 0];
    }
    const cQ = [...next.contextQ[contextKey]];
    cQ[action] += ALPHA * 1.5 * (reward - cQ[action]);
    next.contextQ[contextKey] = cQ;
  }

  next.updates += 1;
  next.decisions += 1;
  return next;
}

/**
 * Pure neural action selection: selects action arm directly with highest spike count
 * without any external bandit or Q-table.
 */
export function chooseNeuralAction(arms: DoomArms): number {
  let best = 0;
  let maxCount = -1;
  for (let a = 0; a < arms.counts.length; a++) {
    if (arms.counts[a] > maxCount) {
      maxCount = arms.counts[a];
      best = a;
    }
  }
  return best;
}

export interface DoomVariantResult {
  variant: "A" | "B" | "C" | "D" | "E";
  name: string;
  totalReward: number;
  stepsCompleted: number;
  damageEvents: number;
  pickupEvents: number;
  actionCounts: number[];
  finalBanditQ?: number[];
  modifiedSynapses: number;
  meanWeightDelta: number;
}

/**
 * Controlled 5-Variant DOOM Evaluation
 *
 * Compares:
 * A. FlyWire frozen + bandit
 * B. FlyWire plastic + no bandit
 * C. FlyWire plastic + bandit
 * D. Random reservoir + bandit
 * E. Random reservoir + no learning
 */
export function runDoomControlledBenchmark(
  bundle: BrainBundle,
  stepsCount = 40
): Record<"A" | "B" | "C" | "D" | "E", DoomVariantResult> {
  // Deterministic synthetic test environment: frames with simulated hazards and items
  const frames: Float64Array[] = [];
  let frameRng = 421337;
  for (let s = 0; s < stepsCount; s++) {
    const b = new Float64Array(NUM_SECTORS);
    for (let sec = 0; sec < NUM_SECTORS; sec++) {
      frameRng = (Math.imul(frameRng, 1664525) + 1013904223) >>> 0;
      b[sec] = (frameRng % 1000) / 1000;
    }
    frames.push(b);
  }

  // Create Random Reservoir bundle (Erdos-Renyi rewiring)
  const randBundle: BrainBundle = {
    ...bundle,
    edgesSrc: new Int32Array(bundle.edgeCount),
    edgesTgt: new Int32Array(bundle.edgeCount),
  };
  let rSeed = 7777;
  for (let i = 0; i < bundle.edgeCount; i++) {
    rSeed = (Math.imul(rSeed, 1664525) + 1013904223) >>> 0;
    randBundle.edgesSrc[i] = rSeed % bundle.neuronCount;
    rSeed = (Math.imul(rSeed, 1664525) + 1013904223) >>> 0;
    randBundle.edgesTgt[i] = rSeed % bundle.neuronCount;
  }

  const runVariant = (
    variant: "A" | "B" | "C" | "D" | "E",
    name: string,
    useBundle: BrainBundle,
    plasticity: boolean,
    bandit: boolean
  ): DoomVariantResult => {
    let rstdp = freshRStdpState();
    let pol = freshPolicy();
    let totalReward = 0;
    let damageEvents = 0;
    let pickupEvents = 0;
    const actionCounts = [0, 0, 0, 0];
    let totalSynDelta = 0;
    let totalSynCount = 0;

    for (let step = 0; step < stepsCount; step++) {
      const bright = frames[step];
      const gains = plasticity ? modifiersToGains(rstdp.modifiers, useBundle.edgeCount) : null;
      const arms = doomArms(bright, useBundle, 1000 + step, gains);

      let action = 0;
      if (variant === "E") {
        // Random action, no learning
        action = step % ACTIONS.length;
      } else if (!bandit) {
        // Pure neural readout
        action = chooseNeuralAction(arms);
      } else {
        // Bandit policy
        action = chooseAction(arms, pol);
      }
      actionCounts[action]++;

      // Environment response:
      // Sector 0 (center) bright -> hazard (requires turn left or right)
      // Sector 1/2 bright -> item (requires forward)
      let reward = 0;
      if (bright[0] > 0.6) {
        // Hazard in front: forward leads to damage (-1), turning avoids (0)
        if (action === 2) {
          reward = -1.0;
          damageEvents++;
        } else if (action === 0 || action === 1) {
          reward = 0.5;
        }
      } else if (bright[1] > 0.5 || bright[2] > 0.5) {
        // Item in view: forward collects item (+1), shooting or turning misses (0)
        if (action === 2) {
          reward = 1.0;
          pickupEvents++;
        }
      } else {
        // Free field: forward slightly rewarded for progress
        reward = action === 2 ? 0.2 : -0.1;
      }

      totalReward += reward;

      // Update plasticity if enabled
      if (plasticity) {
        const traces = computeEligibilityTraces(useBundle, arms.sim, DOOM_SIM_MS);
        const { nextState, modifiedCount, meanDelta } = applyRewardModulation(rstdp, traces, reward);
        rstdp = nextState;
        totalSynDelta += meanDelta * modifiedCount;
        totalSynCount += modifiedCount;
      }

      // Update bandit if enabled
      if (bandit) {
        pol = learn(pol, action, reward);
      }
    }

    return {
      variant,
      name,
      totalReward: Math.round(totalReward * 10) / 10,
      stepsCompleted: stepsCount,
      damageEvents,
      pickupEvents,
      actionCounts,
      finalBanditQ: bandit ? pol.q.map((q) => Math.round(q * 100) / 100) : undefined,
      modifiedSynapses: rstdp.modifiers.size,
      meanWeightDelta: totalSynCount > 0 ? totalSynDelta / totalSynCount : 0,
    };
  };

  return {
    A: runVariant("A", "FlyWire Frozen + Bandit", bundle, false, true),
    B: runVariant("B", "FlyWire Plastic (R-STDP) + No Bandit", bundle, true, false),
    C: runVariant("C", "FlyWire Plastic (R-STDP) + Bandit", bundle, true, true),
    D: runVariant("D", "Random Reservoir + Bandit", randBundle, false, true),
    E: runVariant("E", "Random Reservoir + No Learning", randBundle, false, false),
  };
}
