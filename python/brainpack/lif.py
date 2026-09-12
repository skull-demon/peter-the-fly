"""Reference LIF simulation of Peter's brain (numpy).

This is the Python twin of src/brain/sim.ts. Both implement the same
PARITY SPEC so tests can assert bit-identical spike patterns:

Determinism / parity spec (v1)
------------------------------
- All stochasticity comes from counter-based hashing (pcg2d, O'Neill):
      v = imul(v, 1664525) + 1013904223 (mod 2^32);  same for w
      x = v ^ w; x ^= x>>15; x = imul(x,0x2c1b3c6d);
      x ^= x>>12; x = imul(x,0x297a2d39); x ^= x>>15;  return x
  rand01(seed, a, b) = pcg2d((imul(a, K_a) + b) >>> 0, seed ^ K_b) / 2^32
  with per-purpose constants:
      release   : K_a = 1000003,    K_b = 0x00000000
      stimulus  : K_a = 7919,       K_b = 0x85EBCA6B
      background: K_a = 2246822519, K_b = 0x9E3779B9
      v_init    : K_a = 374761393,  K_b = 0x5BF03635
- Simulation loop per step t (dt = 0.5 ms):
  1. synaptic delivery (one-step delay) from spikes at t-1: for every
     spiked neuron u in ASCENDING row order, for its ENABLED edges in
     EDGE ORDER: release if rand01(release, t, edge_idx) < prob[edge];
     current[v] += w * W_GAIN, or -= w * W_GAIN * INH_SCALE if sign < 0.
  2. stimulus (only while t*dt < window_ms): for stim rows in ORDER:
     if rand01(stim, t, i) < rate*dt/1000: current[row] += STIM_DRIVE.
  3. background: for every neuron i: if rand01(bg, t, i) < BG_RATE:
     current[i] += BG_DRIVE.
  4. membrane: v += (v_rest - v) * dt/tau; v += current.
     tau = TAU_INH for neurons whose nt_sign == "inhibitory", else TAU_MEM.
  5. spikes: refr_t = max(refr - 1, 0);
     spiked = (v >= v_thresh) & (refr_t == 0);
     v[spiked] = v_reset; refr = where(spiked, refractory_steps, refr_t).
- Initial v = V_REST + (rand01(v_init, 0, i) * 2 - 1) mV.

Current accumulation follows the spec order exactly (arrays are built in
spec order, then accumulated once), so results match a naive loop bit for
bit while running fast enough to train on.

Do not change either side without changing both, then run the parity test.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# ---- parity constants (mirrored in src/brain/sim.ts) --------------------
DT_MS = 0.5
WINDOW_MS = 120.0
TAU_MEM_MS = 22.0
TAU_INH_MS = 9.0
V_REST = -58.0
V_RESET = -66.0
V_THRESH = -48.0
REFRACTORY_MS = 2.0
W_GAIN = 0.55
INH_SCALE = 3.2
STIM_DRIVE = 30.0
BG_DRIVE = 6.0
BG_RATE = 0.0008  # per step (~1.6 Hz)
BIN_MS = 100.0

K_RELEASE_A, K_RELEASE_B = 1000003, 0x00000000
K_STIM_A, K_STIM_B = 7919, 0x85EBCA6B
K_BG_A, K_BG_B = 2246822519, 0x9E3779B9
K_V0_A, K_V0_B = 374761393, 0x5BF03635

M32 = 0xFFFFFFFF


def imul32(a: int | np.ndarray, b: int) -> np.ndarray:
    """a * b mod 2^32 on unsigned 32-bit lanes (JS Math.imul equivalent)."""
    a = np.asarray(a, dtype=np.uint64)
    return ((a * np.uint64(b & M32)) & np.uint64(M32)).astype(np.uint32)


def add32(a: np.ndarray, b: int) -> np.ndarray:
    a = np.asarray(a, dtype=np.uint64)
    return ((a + np.uint64(b & M32)) & np.uint64(M32)).astype(np.uint32)


def pcg2d(v: np.ndarray, w: np.ndarray) -> np.ndarray:
    v = add32(imul32(v, 1664525), 1013904223)
    w = add32(imul32(w, 1664525), 1013904223)
    x = v ^ w
    x = x ^ (x >> np.uint32(15))
    x = imul32(x, 0x2C1B3C6D)
    x = x ^ (x >> np.uint32(12))
    x = imul32(x, 0x297A2D39)
    x = x ^ (x >> np.uint32(15))
    return x


def rand01(seed: int, a: np.ndarray, b: np.ndarray, ka: int, kb: int) -> np.ndarray:
    """Vectorised rand01(seed, a_i, b_i) for parallel a/b lanes (parity spec)."""
    a = np.asarray(a, dtype=np.uint64) & np.uint64(M32)
    b = np.asarray(b, dtype=np.uint64) & np.uint64(M32)
    v = ((imul32(a, ka).astype(np.uint64) + b) & np.uint64(M32)).astype(np.uint32)
    w = np.full(len(v), np.uint32((seed ^ kb) & M32), dtype=np.uint32)
    return pcg2d(v, w).astype(np.float64) / 4294967296.0


@dataclass
class SimResult:
    spikes: np.ndarray          # bool (steps, n)
    bin_counts: np.ndarray      # float64 (n_bins,) total spikes per bin
    steps: int
    duration_ms: float


def simulate(
    bundle,
    stim_rows: np.ndarray,
    stim_rates: np.ndarray,
    *,
    seed: int = 783,
    duration_ms: float = 600.0,
    window_ms: float = WINDOW_MS,
) -> SimResult:
    """Run the parity-spec LIF simulation over the bundle's connectome."""
    n = bundle.neuron_count
    steps = int(duration_ms / DT_MS)
    refractory_steps = int(REFRACTORY_MS / DT_MS)
    n_bins = int(duration_ms / BIN_MS)
    per_bin = int(BIN_MS / DT_MS)

    nt_sign = bundle.attrs.get("nt_sign") or ["unknown"] * n
    tau = np.full(n, TAU_MEM_MS)
    inh_rows = np.array(
        [i for i, s in enumerate(nt_sign[:n]) if s == "inhibitory"], dtype=np.int64
    )
    if len(inh_rows):
        tau[inh_rows] = TAU_INH_MS

    enabled = bundle.edges_enabled.astype(bool)
    idx_enabled = np.flatnonzero(enabled)
    src_enabled = bundle.edges_src[idx_enabled]
    order = np.argsort(src_enabled, kind="stable")  # ascending source, edge order kept
    idx_enabled = idx_enabled[order]
    src_enabled = bundle.edges_src[idx_enabled]
    tgt_enabled = bundle.edges_tgt[idx_enabled].astype(np.int64)
    w_enabled = bundle.edges_weight[idx_enabled].astype(np.float64) * W_GAIN
    sign_enabled = bundle.edges_sign[idx_enabled].astype(np.float64)
    contrib = np.where(sign_enabled < 0, -w_enabled * INH_SCALE, w_enabled)
    prob_enabled = bundle.edges_prob[idx_enabled].astype(np.float64)
    # group edges by source neuron
    boundaries = np.flatnonzero(np.diff(src_enabled, prepend=-1))
    src_starts = dict(zip(src_enabled[boundaries].tolist(), boundaries.tolist()))
    src_ends = dict(
        zip(
            src_enabled[boundaries].tolist(),
            np.append(boundaries[1:], len(src_enabled)).tolist(),
        )
    )

    v0 = rand01(seed, np.zeros(n), np.arange(n), K_V0_A, K_V0_B)
    v = V_REST + (v0 * 2.0 - 1.0)
    refr = np.zeros(n, dtype=np.int64)

    stim_rows = np.asarray(stim_rows, dtype=np.int64)
    stim_rates = np.asarray(stim_rates, dtype=np.float64)
    stim_lambda = stim_rates * DT_MS / 1000.0
    stim_t = np.full(len(stim_rows), 0, dtype=np.uint64)
    bg_t = np.full(n, 0, dtype=np.uint64)
    bg_rows = np.arange(n, dtype=np.uint64)

    spikes = np.zeros((steps, n), dtype=bool)

    for t in range(steps):
        current = np.zeros(n, dtype=np.float64)

        # 1. synaptic delivery from previous step (spec order)
        spiked_prev = np.flatnonzero(spikes[t - 1]) if t > 0 else np.array([], dtype=np.int64)
        if len(spiked_prev):
            edge_chunks = []
            for u in spiked_prev.tolist():
                s = src_starts.get(u)
                if s is not None:
                    edge_chunks.append(np.arange(s, src_ends[u]))
            if edge_chunks:
                pos = np.concatenate(edge_chunks)  # positions in enabled-sorted order
                # PARITY SPEC: the RNG lane b is the ORIGINAL edge index
                # (idx_enabled maps position -> original index), matching the
                # TS loop, which iterates bundle.edgesEnabled[e] by index e.
                r = rand01(
                    seed,
                    np.full(len(pos), t, dtype=np.uint64),
                    idx_enabled[pos].astype(np.uint64),
                    K_RELEASE_A,
                    K_RELEASE_B,
                )
                fire_mask = r < prob_enabled[pos]
                if fire_mask.any():
                    p = pos[fire_mask]
                    # accumulate in spec order (np.add.at is sequential)
                    np.add.at(current, tgt_enabled[p], contrib[p])

        # 2. stimulus
        if t * DT_MS < window_ms and len(stim_rows):
            stim_t.fill(t)
            rs = rand01(seed, stim_t, stim_rows.astype(np.uint64), K_STIM_A, K_STIM_B)
            fired = rs < stim_lambda
            if fired.any():
                current[stim_rows[fired]] += STIM_DRIVE

        # 3. background
        bg_t.fill(t)
        rb = rand01(seed, bg_t, bg_rows, K_BG_A, K_BG_B)
        bg = rb < BG_RATE
        if bg.any():
            current[bg] += BG_DRIVE

        # 4. membrane
        v += (V_REST - v) * (DT_MS / tau)
        v += current

        # 5. spikes
        refr_t = np.maximum(refr - 1, 0)
        spiked = (v >= V_THRESH) & (refr_t == 0)
        v[spiked] = V_RESET
        refr = np.where(spiked, refractory_steps, refr_t)

        spikes[t] = spiked

    bin_counts = spikes[: n_bins * per_bin]
    bin_counts = bin_counts.reshape(n_bins, per_bin, n).sum(axis=(1, 2)).astype(np.float64)
    return SimResult(spikes=spikes, bin_counts=bin_counts, steps=steps, duration_ms=duration_ms)


def readout_state(sim: SimResult, readout_rows: np.ndarray) -> np.ndarray:
    """Per-bin spike counts of the readout pool (the reservoir state vector)."""
    counts = sim.spikes[:, np.asarray(readout_rows, dtype=np.int64)].sum(axis=1)
    n_bins = sim.bin_counts.shape[0]
    per_bin = sim.steps // n_bins
    return counts.reshape(n_bins, per_bin).sum(axis=1).astype(np.float64)


def state_key(state: np.ndarray, scale: float = 8.0, levels: int = 16) -> str:
    """Quantise the state vector into a stable string key (parity spec)."""
    q = np.clip(np.round(np.asarray(state) / scale), 0, levels - 1).astype(int)
    return ".".join(str(int(x)) for x in q)
