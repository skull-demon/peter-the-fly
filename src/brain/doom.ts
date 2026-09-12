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
): DoomArms {
  const stim = stimulusForFrame(bright, bundle);
  const sim = simulateBrain(bundle, stim.rows, stim.rates, seed, DOOM_SIM_MS);
  const perBin = Math.floor(sim.steps / sim.binCounts.length);
  const counts = new Float64Array(ARM_BINS.length);
  for (let a = 0; a < ARM_BINS.length; a++) {
    const bin = ARM_BINS[a];
    let sum = 0;
    for (let sIdx = bin * perBin; sIdx < (bin + 1) * perBin; sIdx++) {
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
  return { q: [0, 0, 0, 0], n: [0, 0, 0, 0], updates: 0, decisions: 0, schemaVersion: 1 };
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
 * Epsilon-greedy over the arms that fired. Arms whose descending pool stayed
 * silent can still be picked (they are simply scored lower: q - 0.5), so the
 * policy can learn to use quiet arms too. Deterministic given
 * (decisions, updates).
 */
export function chooseAction(arms: DoomArms, policy: DoomPolicy): number {
  const eps = epsilonOf(policy);
  const r = (policyRand(policy.decisions, policy.updates) % 100000) / 100000;
  if (r < eps) {
    return policyRand(policy.decisions + 1, policy.updates) % ACTIONS.length;
  }
  let best = 0;
  let bestScore = -Infinity;
  for (let a = 0; a < ACTIONS.length; a++) {
    const score = (arms.fire[a] ? policy.q[a] : policy.q[a] - 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** Mean-tracking update after observing the reward that followed the action. */
export function learn(policy: DoomPolicy, action: number, reward: number): DoomPolicy {
  const next: DoomPolicy = {
    ...policy,
    q: [...policy.q],
    n: [...policy.n],
  };
  next.n[action] += 1;
  next.q[action] += ALPHA * (reward - next.q[action]);
  next.updates += 1;
  next.decisions += 1;
  return next;
}
