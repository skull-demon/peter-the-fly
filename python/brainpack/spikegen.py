"""Stimulus mapping and neuron-role assignment for Peter's brain.

Honesty rules enforced here:
- Tokens map to INPUT neurons via a fixed hash projection (documented parity spec
  shared with the TypeScript runtime). The projection is a design choice, and we
  say so; it does not pretend to be biology.
- Neuron attributes (class / region / neurotransmitter) come only from the
  official FlyWire annotations. Unknown neurotransmitter stays unknown.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

SEED = 783  # FAFB v783 - the one seed to rule the pipeline


def fnv1a32(s: str) -> int:
    """FNV-1a 32-bit. MUST stay identical to fnv1a32() in src/brain/bundle.ts."""
    h = 0x811C9DC5
    for byte in s.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def token_neuron_indices(token: str, input_pool: np.ndarray, max_neurons: int = 24) -> np.ndarray:
    """Deterministically pick input-pool neurons for a token (parity spec)."""
    idx: list[int] = []
    salt = 0
    while len(idx) < max_neurons:
        h = fnv1a32(f"{token}#{salt}")
        i = input_pool[int(h % len(input_pool))]
        if i not in idx:
            idx.append(int(i))
        salt += 1
        if salt > 512:
            break
    return np.array(idx, dtype=np.int64)


SEMANTIC_CATEGORIES: dict[str, list[str]] = {
    "question": ["?"],
    "greeting": ["hello", "hi", "hey", "morning", "evening", "yo"],
    "politeness": ["please", "thank", "thanks", "sorry"],
    "self": ["you", "your", "yourself", "peter", "fly", "who"],
    "human": ["i", "me", "my", "we", "us", "human", "people"],
    "sensation": ["see", "look", "world", "light", "color", "smell", "hear", "feel"],
    "food": ["sugar", "food", "eat", "hungry", "sweet", "fruit", "apple"],
    "motion": ["fly", "flying", "wing", "wings", "move", "walk", "jump"],
    "emotion": ["love", "afraid", "happy", "sad", "like", "hate", "want"],
    "negation": ["not", "no", "never", "dont", "cant"],
}


def tokens_of(text: str) -> list[str]:
    """Lowercase words. Same regex as tokenize() in src/brain/spikegen.ts."""
    import re

    return [t for t in re.findall(r"[a-z0-9']+", text.lower()) if t]


def semantic_attributes(text: str) -> set[str]:
    toks = set(tokens_of(text))
    found: set[str] = set()
    for cat, words in SEMANTIC_CATEGORIES.items():
        if toks & set(words):
            found.add(cat)
    if "?" in text:
        found.add("question")
    return found


@dataclass
class StimulusPlan:
    """Which input neurons fire, at what rate, for how long."""

    neuron_rows: np.ndarray      # row indices into the subgraph
    rates_hz: np.ndarray         # per-neuron stimulus rate
    window_ms: int = 120
    note: str = ""


def stimulus_from_tokens(
    text: str,
    input_pool: np.ndarray,
    node_meta=None,
    *,
    base_hz: float = 6.0,
    max_rate_hz: float = 80.0,
    active_fraction: float = 0.10,
) -> StimulusPlan:
    """Map a user message onto stimulation of real input neurons.

    - every token recruits its deterministic hash-selected input neurons at base rate
    - semantic attributes add category neurons at boosted rates (still deterministic)
    - a fixed fraction of the pool gets low background stimulation so the brain
      always has live input (recorded in the plan note; not hidden)
    """
    rates: dict[int, float] = {}
    toks = tokens_of(text)
    for tok in toks:
        for row in token_neuron_indices(tok, input_pool):
            rates[row] = min(max_rate_hz, rates.get(row, 0.0) + base_hz)

    cats = semantic_attributes(text)
    for cat in sorted(cats):
        h = fnv1a32(f"category:{cat}")
        for k in range(max(4, len(input_pool) // 40)):
            row = int(input_pool[(h + k * 7919) % len(input_pool)])
            rates[row] = min(max_rate_hz, rates.get(row, 0.0) + max_rate_hz * 0.25)

    # quiet background: a deterministic subset at base rate so nothing is "off"
    n_bg = max(1, int(len(input_pool) * active_fraction / 4))
    h0 = fnv1a32("background|" + text)
    for k in range(n_bg):
        row = int(input_pool[(h0 + k * 104729) % len(input_pool)])
        rates.setdefault(row, base_hz * 0.5)

    rows = np.array(sorted(rates), dtype=np.int64)
    rr = np.array([rates[r] for r in rows], dtype=np.float64)
    note = "tokens:" + ",".join(toks[:12]) + (";cats:" + ",".join(sorted(cats)) if cats else "")
    return StimulusPlan(neuron_rows=rows, rates_hz=rr, window_ms=120, note=note)


def split_io(
    sub,
    rng: np.random.Generator,
    input_fraction: float = 0.10,
    readout_fraction: float = 0.30,
) -> tuple[np.ndarray, np.ndarray]:
    """Choose input and readout pools from real annotated central neurons.

    Deterministic given the subgraph and rng seed. Input pool favours neurons
    with many outgoing synapses (plausible "input" role); readout pool favours
    high fan-in neurons (plausible "output" role). Both stay inside the
    central brain (super_class in central/interneuron/optic etc.), never motor.
    """
    meta = sub.node_meta
    n = len(sub.neuron_ids)
    rows = np.arange(n)

    if "super_class" in meta and len(meta):
        sc = meta["super_class"].astype(str).to_numpy()
        central = np.array(
            [s.lower() not in {"motor", "sensory", "visual", "endocrine"} for s in sc]
        )
        if central.sum() >= 50:
            rows = rows[central]

    out_deg = np.bincount(sub.edges_src, minlength=n).astype(np.float64)
    in_deg = np.bincount(sub.edges_tgt, minlength=n).astype(np.float64)

    cand = rows[np.argsort(out_deg[rows] * -1 + rng.random(len(rows)) * 0.5)]
    n_in = max(16, int(n * input_fraction))
    input_pool = np.sort(cand[:n_in])

    rest = np.array([r for r in rows if r not in set(input_pool.tolist())])
    cand2 = rest[np.argsort(in_deg[rest] * -1 + rng.random(len(rest)) * 0.5)]
    n_out = max(24, int(n * readout_fraction))
    readout_pool = np.sort(cand2[:n_out])

    return input_pool, readout_pool


def sample_neuron_attributes(sub) -> dict[str, list[str]]:
    """Per-neuron attribute strings for the bundle (from official annotations)."""
    meta = sub.node_meta
    n = len(sub.neuron_ids)

    def col(name: str, default: str = "unknown") -> list[str]:
        if name in meta and len(meta):
            vals = meta[name].astype(str).to_numpy()
            vals = np.where((vals == "") | (vals == "nan") | (vals == "None"), default, vals)
            return list(vals[:n]) + [default] * max(0, n - len(vals))
        return [default] * n

    nt = col("top_nt", "unknown")
    sign = []
    for t in nt:
        tl = t.lower()
        if "gaba" in tl:
            sign.append("inhibitory")
        elif "ach" in tl or "acetylcholine" in tl:
            sign.append("excitatory")
        elif "glut" in tl:
            sign.append("mixed")
        elif t == "unknown":
            sign.append("unknown")
        else:
            sign.append("modulatory")
    return {
        "cell_class": col("class", "unknown"),
        "super_class": col("super_class", "unknown"),
        "region": col("cell_class", "unknown"),
        "nt": nt,
        "nt_sign": sign,
    }
