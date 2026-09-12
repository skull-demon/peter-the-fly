/**
 * Three-Factor Reward-Modulated Spike-Timing-Dependent Plasticity (R-STDP)
 * for the FlyWire Connectome.
 *
 * Mathematical specification:
 * 1. STDP timing kernel:
 *    Δt = t_post - t_pre
 *    K(Δt) = A+ * exp(-Δt / tau+)   if Δt > 0  (causal pre->post potentiation)
 *          = -A- * exp(Δt / tau-)   if Δt < 0  (anti-causal post->pre depression)
 *
 * 2. Eligibility trace:
 *    de/dt = -e / tau_e + K(Δt) * delta(t - t_spike)
 *    Synapses that participated in the trajectory accumulate an eligibility trace.
 *
 * 3. Third-factor reward/error modulation:
 *    Δw = eta * (Reward - Baseline) * eligibility
 *    When reinforcement/error arrives from the environment, marked synapses
 *    are updated in proportion to their eligibility.
 *
 * Effective synaptic weight in LIF simulation:
 *    W_effective = W_base * (1.0 + modifier)
 *    clamped to [MIN_MODIFIER, MAX_MODIFIER] = [0.25, 2.5]
 */

import type { BrainBundle } from "./bundle";
import type { SimResult } from "./sim";

export const RSTDP_SCHEMA_VERSION = 3;
export const TAU_PLUS_MS = 20.0;
export const TAU_MINUS_MS = 25.0;
export const A_PLUS = 1.0;
export const A_MINUS = 0.85;
export const TAU_ELIGIBILITY_MS = 200.0;
export const ETA_LEARNING = 0.045;
export const MIN_MODIFIER = 0.25;
export const MAX_MODIFIER = 2.50;
export const MAX_STORED_SYNAPSES = 50_000;

export type SynapticModifierMap = Map<number, number>; // edge_idx -> modifier

export interface RStdpState {
  modifiers: SynapticModifierMap;
  readoutWeights: Map<string, Float64Array>; // class/token -> weights over readout rows
  eligibilityBuffer: Map<number, number>; // edge_idx -> eligibility trace
  rewardBaseline: number;
  episodesCount: number;
  schemaVersion: number;
}

const STORAGE_KEY = "peter-rstdp-v3";

export function freshRStdpState(): RStdpState {
  return {
    modifiers: new Map(),
    readoutWeights: new Map(),
    eligibilityBuffer: new Map(),
    rewardBaseline: 0.0,
    episodesCount: 0,
    schemaVersion: RSTDP_SCHEMA_VERSION,
  };
}

/**
 * Calculates STDP kernel value for a spike timing difference.
 */
export function stdpKernel(dtMs: number): number {
  if (dtMs > 0 && dtMs < 60) {
    return A_PLUS * Math.exp(-dtMs / TAU_PLUS_MS);
  } else if (dtMs < 0 && dtMs > -60) {
    return -A_MINUS * Math.exp(dtMs / TAU_MINUS_MS);
  }
  return 0.0;
}

export interface RStdpMetrics {
  changedSynapses: number;
  potentiatedSynapses: number;
  depressedSynapses: number;
  meanWeightChange: number;
  maxWeightChange: number;
  meanEligibility: number;
  maxEligibility: number;
  reward: number;
  learningRate: number;
  baseline: number;
}

/**
 * Computes eligibility traces for all synapses connecting active pre & post neurons.
 * Temporal causality: pre-before-post produces positive trace, post-before-pre produces negative.
 * Traces decay exponentially toward reward arrival at simDurationMs.
 */
export function computeEligibilityTraces(
  bundle: BrainBundle,
  sim: SimResult,
  simDurationMs = 450.0
): Map<number, number> {
  const traces = new Map<number, number>();
  const stepCount = sim.spikes.length;
  if (stepCount === 0) return traces;

  // Find spike times for all neurons: neuron -> array of step indices
  const spikeTimes = new Map<number, number[]>();
  for (let s = 0; s < stepCount; s++) {
    const step = sim.spikes[s];
    for (let n = 0; n < step.length; n++) {
      if (step[n] === 1) {
        const times = spikeTimes.get(n) ?? [];
        times.push(s);
        spikeTimes.set(n, times);
      }
    }
  }

  // Iterate over connectome edges that had activity
  const edgeCount = bundle.edgeCount;
  const srcArr = bundle.edgesSrc;
  const tgtArr = bundle.edgesTgt;

  for (let e = 0; e < edgeCount; e++) {
    const src = srcArr[e];
    const tgt = tgtArr[e];

    const preTimes = spikeTimes.get(src);
    const postTimes = spikeTimes.get(tgt);
    if (!preTimes || !postTimes) continue;

    let traceVal = 0.0;
    for (let i = 0; i < preTimes.length; i++) {
      const tPre = preTimes[i] * 0.5; // DT = 0.5ms
      for (let j = 0; j < postTimes.length; j++) {
        const tPost = postTimes[j] * 0.5;
        const dt = tPost - tPre;
        const k = stdpKernel(dt);
        if (Math.abs(k) > 0.01) {
          const tPair = Math.max(tPre, tPost);
          const timeToReward = Math.max(0, simDurationMs - tPair);
          const decay = Math.exp(-timeToReward / TAU_ELIGIBILITY_MS);
          traceVal += k * decay;
        }
      }
    }

    if (Math.abs(traceVal) > 0.005) {
      traces.set(e, Math.max(-2.0, Math.min(2.0, traceVal)));
    }
  }

  return traces;
}

/**
 * Applies third-factor reward modulation to eligibility traces, updating synaptic modifiers.
 * Exposes rigorous metrics for potentiated, depressed, and mean/max weight changes.
 */
export function applyRewardModulation(
  state: RStdpState,
  traces: Map<number, number>,
  reward: number,
  customEta = ETA_LEARNING
): { nextState: RStdpState; metrics: RStdpMetrics; modifiedCount: number; meanDelta: number } {
  const nextMods = new Map(state.modifiers);
  const pe = reward - state.rewardBaseline; // prediction error
  let potentiatedCount = 0;
  let depressedCount = 0;
  let totalDelta = 0.0;
  let maxDelta = 0.0;
  let totalElig = 0.0;
  let maxElig = 0.0;

  traces.forEach((eligibility, edgeIdx) => {
    const absElig = Math.abs(eligibility);
    totalElig += absElig;
    if (absElig > maxElig) maxElig = absElig;

    const delta = customEta * pe * eligibility;
    const absDelta = Math.abs(delta);
    if (absDelta > 0.0001) {
      const current = nextMods.get(edgeIdx) ?? 1.0;
      const updated = Math.max(MIN_MODIFIER, Math.min(MAX_MODIFIER, current + delta));
      nextMods.set(edgeIdx, updated);
      if (delta > 0) potentiatedCount++;
      else depressedCount++;
      totalDelta += absDelta;
      if (absDelta > maxDelta) maxDelta = absDelta;
    }
  });

  const modifiedCount = potentiatedCount + depressedCount;

  // Bound maximum modified synapses
  if (nextMods.size > MAX_STORED_SYNAPSES) {
    const sorted = Array.from(nextMods.entries()).sort(
      (a, b) => Math.abs(b[1] - 1.0) - Math.abs(a[1] - 1.0)
    );
    nextMods.clear();
    for (let i = 0; i < MAX_STORED_SYNAPSES; i++) {
      nextMods.set(sorted[i][0], sorted[i][1]);
    }
  }

  const newBaseline = state.rewardBaseline * 0.9 + reward * 0.1;
  const meanDelta = modifiedCount > 0 ? totalDelta / modifiedCount : 0.0;
  const meanEligibility = traces.size > 0 ? totalElig / traces.size : 0.0;

  const metrics: RStdpMetrics = {
    changedSynapses: modifiedCount,
    potentiatedSynapses: potentiatedCount,
    depressedSynapses: depressedCount,
    meanWeightChange: meanDelta,
    maxWeightChange: maxDelta,
    meanEligibility,
    maxEligibility: maxElig,
    reward,
    learningRate: customEta,
    baseline: state.rewardBaseline,
  };

  const nextState: RStdpState = {
    modifiers: nextMods,
    readoutWeights: state.readoutWeights,
    eligibilityBuffer: traces,
    rewardBaseline: newBaseline,
    episodesCount: state.episodesCount + 1,
    schemaVersion: RSTDP_SCHEMA_VERSION,
  };

  return { nextState, metrics, modifiedCount, meanDelta };
}

/**
 * Converts synaptic modifiers into dense Float64Array for fast LIF simulation.
 */
export function modifiersToGains(modifiers: SynapticModifierMap, edgeCount: number): Float64Array {
  const gains = new Float64Array(edgeCount).fill(1.0);
  modifiers.forEach((mod, edgeIdx) => {
    if (edgeIdx < edgeCount) {
      gains[edgeIdx] = mod;
    }
  });
  return gains;
}

/**
 * Local storage persistence for learned neural state.
 */
export function saveRStdpState(state: RStdpState): void {
  try {
    const modsArr: number[] = [];
    state.modifiers.forEach((v, k) => {
      modsArr.push(k, Math.round(v * 10000) / 10000);
    });

    const readoutObj: Record<string, number[]> = {};
    state.readoutWeights.forEach((w, k) => {
      readoutObj[k] = Array.from(w);
    });

    const serialized = {
      modifiers: modsArr,
      readoutWeights: readoutObj,
      rewardBaseline: state.rewardBaseline,
      episodesCount: state.episodesCount,
      schemaVersion: RSTDP_SCHEMA_VERSION,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Storage quota or disabled
  }
}

export function loadRStdpState(): RStdpState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshRStdpState();
    const obj = JSON.parse(raw);
    if (obj.schemaVersion !== RSTDP_SCHEMA_VERSION) return freshRStdpState();

    const mods = new Map<number, number>();
    const modsArr = obj.modifiers;
    if (Array.isArray(modsArr)) {
      for (let i = 0; i < modsArr.length; i += 2) {
        mods.set(modsArr[i], modsArr[i + 1]);
      }
    }

    const readout = new Map<string, Float64Array>();
    if (obj.readoutWeights) {
      Object.entries(obj.readoutWeights).forEach(([k, arr]) => {
        readout.set(k, Float64Array.from(arr as number[]));
      });
    }

    return {
      modifiers: mods,
      readoutWeights: readout,
      eligibilityBuffer: new Map(),
      rewardBaseline: typeof obj.rewardBaseline === "number" ? obj.rewardBaseline : 0.0,
      episodesCount: typeof obj.episodesCount === "number" ? obj.episodesCount : 0,
      schemaVersion: RSTDP_SCHEMA_VERSION,
    };
  } catch {
    return freshRStdpState();
  }
}

export function resetRStdpStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    //
  }
}
