/**
 * Peter's spiking brain - browser runtime.
 *
 * TS twin of python/brainpack/lif.py. Both implement the documented PARITY
 * SPEC: identical pcg2d hashing, identical constants, identical step order,
 * so the browser produces bit-identical spikes to the training simulations
 * (asserted by python/tests/test_parity.py).
 */

import type { BrainBundle } from "./bundle";

// ---- parity constants (mirrored in python/brainpack/lif.py) -----------------
const DT_MS = 0.5;
const WINDOW_MS = 120.0;
const TAU_MEM_MS = 22.0;
const TAU_INH_MS = 9.0;
const V_REST = -58.0;
const V_RESET = -66.0;
const V_THRESH = -48.0;
const REFRACTORY_MS = 2.0;
const W_GAIN = 0.55;
const INH_SCALE = 3.2;
const STIM_DRIVE = 30.0;
const BG_DRIVE = 6.0;
const BG_RATE = 0.0008;
const BIN_MS = 100.0;

const K_RELEASE_A = 1000003, K_RELEASE_B = 0x00000000;
const K_STIM_A = 7919, K_STIM_B = 0x85EBCA6B;
const K_BG_A = 2246822519, K_BG_B = 0x9E3779B9;
const K_V0_A = 374761393, K_V0_B = 0x5BF03635;

function imul32(a: number, b: number): number {
  return Math.imul(a, b) >>> 0;
}

function pcg2d(v: number, w: number): number {
  v = (imul32(v, 1664525) + 1013904223) >>> 0;
  w = (imul32(w, 1664525) + 1013904223) >>> 0;
  let x = (v ^ w) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = imul32(x, 0x2c1b3c6d);
  x = (x ^ (x >>> 12)) >>> 0;
  x = imul32(x, 0x297a2d39);
  x = (x ^ (x >>> 15)) >>> 0;
  return x >>> 0;
}

/** Parity-spec rand01: two counter lanes (a varies, b = row/edge index). */
function rand01(seed: number, a: number, b: number, ka: number, kb: number): number {
  const v = (imul32(a >>> 0, ka) + (b >>> 0)) >>> 0;
  const w = (seed ^ kb) >>> 0;
  return pcg2d(v, w) / 4294967296;
}

export type SimResult = {
  /** spikes[step][neuron] */
  spikes: Uint8Array[];
  /** total spikes per 100 ms bin */
  binCounts: Float64Array;
  steps: number;
  durationMs: number;
};

/** Group enabled edges by source neuron once (edge order preserved). */
type EdgeIndex = Map<number, number[]>; // src row -> enabled-edge indices

function buildEdgeIndex(bundle: BrainBundle): EdgeIndex {
  const map: EdgeIndex = new Map();
  for (let e = 0; e < bundle.edgeCount; e++) {
    if (bundle.edgesEnabled[e]) {
      const src = bundle.edgesSrc[e];
      let list = map.get(src);
      if (!list) {
        list = [];
        map.set(src, list);
      }
      list.push(e);
    }
  }
  return map;
}

/**
 * Simulate the connectome. Stimulus rows/rates mirror the python trainer.
 * durationMs defaults to 600 (6 bins); window is the first 120 ms.
 */
export function simulateBrain(
  bundle: BrainBundle,
  stimRows: ArrayLike<number>,
  stimRates: ArrayLike<number>,
  seed: number,
  durationMs = 600,
): SimResult {
  const n = bundle.neuronCount;
  const steps = Math.floor(durationMs / DT_MS);
  const refractorySteps = Math.floor(REFRACTORY_MS / DT_MS);
  const nBins = Math.floor(durationMs / BIN_MS);
  const perBin = Math.floor(BIN_MS / DT_MS);

  const ntSign = bundle.attrs.nt_sign ?? [];
  const tau = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tau[i] = ntSign[i] === "inhibitory" ? TAU_INH_MS : TAU_MEM_MS;
  }

  const edgeIndex = buildEdgeIndex(bundle);

  // v_init from the parity spec
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rand01(seed, 0, i, K_V0_A, K_V0_B);
    v[i] = V_REST + (r * 2 - 1);
  }
  const refr = new Int32Array(n);

  const spikes: Uint8Array[] = [];
  for (let t = 0; t < steps; t++) spikes.push(new Uint8Array(n));

  const stimRowsArr = Array.from(stimRows);
  const stimRatesArr = Array.from(stimRates);

  for (let t = 0; t < steps; t++) {
    const current = new Float64Array(n);
    const prev = t > 0 ? spikes[t - 1] : null;

    // 1. synaptic delivery from previous step (ascending source order)
    if (prev) {
      for (let u = 0; u < n; u++) {
        if (!prev[u]) continue;
        const edges = edgeIndex.get(u);
        if (!edges) continue;
        for (const e of edges) {
          if (rand01(seed, t, e, K_RELEASE_A, K_RELEASE_B) < bundle.edgesProb[e]) {
            const w = bundle.edgesWeight[e] * W_GAIN;
            if (bundle.edgesSign[e] < 0) {
              current[bundle.edgesTgt[e]] -= w * INH_SCALE;
            } else {
              current[bundle.edgesTgt[e]] += w;
            }
          }
        }
      }
    }

    // 2. stimulus
    if (t * DT_MS < WINDOW_MS && stimRowsArr.length) {
      for (let s = 0; s < stimRowsArr.length; s++) {
        const row = stimRowsArr[s];
        const lambda = stimRatesArr[s] * DT_MS / 1000;
        if (rand01(seed, t, row, K_STIM_A, K_STIM_B) < lambda) {
          current[row] += STIM_DRIVE;
        }
      }
    }

    // 3. background
    for (let i = 0; i < n; i++) {
      if (rand01(seed, t, i, K_BG_A, K_BG_B) < BG_RATE) {
        current[i] += BG_DRIVE;
      }
    }

    // 4. membrane
    for (let i = 0; i < n; i++) {
      v[i] += (V_REST - v[i]) * (DT_MS / tau[i]);
      v[i] += current[i];
    }

    // 5. spikes
    const step = spikes[t];
    for (let i = 0; i < n; i++) {
      const refrT = Math.max(refr[i] - 1, 0);
      if (v[i] >= V_THRESH && refrT === 0) {
        step[i] = 1;
        v[i] = V_RESET;
        refr[i] = refractorySteps;
      } else {
        refr[i] = refrT;
      }
    }
  }

  const binCounts = new Float64Array(nBins);
  for (let b = 0; b < nBins; b++) {
    let sum = 0;
    for (let s = b * perBin; s < (b + 1) * perBin; s++) {
      const step = spikes[s];
      for (let i = 0; i < n; i++) sum += step[i];
    }
    binCounts[b] = sum;
  }

  return { spikes, binCounts, steps, durationMs };
}

/** Per-bin spike counts of the readout pool (the reservoir state). */
export function readoutState(sim: SimResult, readoutRows: ArrayLike<number>): Float64Array {
  const nBins = sim.binCounts.length;
  const perBin = Math.floor(sim.steps / nBins);
  const state = new Float64Array(nBins);
  const rows = Array.from(readoutRows);
  for (let b = 0; b < nBins; b++) {
    let sum = 0;
    for (let s = b * perBin; s < (b + 1) * perBin; s++) {
      const step = sim.spikes[s];
      for (const r of rows) sum += step[r];
    }
    state[b] = sum;
  }
  return state;
}

/** Quantise the state vector into a stable key (parity spec). */
export function stateKey(state: ArrayLike<number>, scale = 8.0, levels = 16): string {
  const parts: string[] = [];
  for (let i = 0; i < state.length; i++) {
    const q = Math.max(0, Math.min(levels - 1, Math.round(state[i] / scale)));
    parts.push(String(q));
  }
  return parts.join(".");
}
