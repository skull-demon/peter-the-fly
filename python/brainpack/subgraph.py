"""Meaningful subnetwork selection from the real FlyWire v783 connectome.

No random graphs. Every strategy grows a neuron set out of the actual
connectivity, grounded in the official annotations (super_class, class,
neuropil). Strategies are deterministic given a seed.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import sparse


@dataclass
class SelectionRequest:
    """Which slice of the real brain to build. Mirrors the TS side config."""

    strategy: str = "sensory_to_motor"
    max_neurons: int = 2200
    min_synapses: int = 3          # edge weight floor (real synapse counts)
    source_region: str = "ME"      # medulla (visual input) - fallback: any sensory
    target_region: str | None = None
    seed: int = 783


@dataclass
class Subgraph:
    """A selected piece of the real connectome, ready for simulation."""

    neuron_ids: np.ndarray                  # int64 FlyWire root IDs, aligned rows
    edges_src: np.ndarray                   # int32 row indices into neuron_ids
    edges_tgt: np.ndarray                   # int32 row indices
    edges_syn: np.ndarray                   # float32 synapse counts (weights)
    edges_neuropil: np.ndarray              # object: neuropil of each edge
    node_meta: pd.DataFrame                 # per-neuron annotations (may be empty strings)
    request: SelectionRequest
    stats: dict = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# graph construction (sparse, always)
# --------------------------------------------------------------------------- #
def build_pair_graph(connections: pd.DataFrame, min_synapses: int = 3) -> pd.DataFrame:
    """Collapse the per-neuropil table into one row per (pre, post) pair.

    The official proofread_connections_783.feather has one row per neuron pair
    per neuropil; the canonical v783 figures (3,732,460 connections) refer to
    summed pairs. Rows below `min_synapses` are dropped as likely spurious.
    Edge-level transmitter probabilities (ach_avg, gaba_avg, ...) are mean-
    aggregated when present - they carry the real sign evidence per edge.
    """
    agg: dict[str, tuple[str, str]] = {
        "syn_count": ("syn_count", "sum"),
        "neuropil": ("neuropil", "first"),
    }
    for col in ("ach_avg", "gaba_avg", "glut_avg", "oct_avg", "ser_avg", "da_avg"):
        if col in connections.columns:
            agg[col] = (col, "mean")
    pairs = (
        connections.groupby(["pre_pt_root_id", "post_pt_root_id"], sort=False)
        .agg(**agg)
        .reset_index()
    )
    return pairs[pairs["syn_count"] >= min_synapses].reset_index(drop=True)


def _adjacency(pairs: pd.DataFrame, id_to_row: dict[int, int]) -> sparse.csr_matrix:
    rows = pairs["pre_pt_root_id"].map(id_to_row).to_numpy(np.int64)
    cols = pairs["post_pt_root_id"].map(id_to_row).to_numpy(np.int64)
    n = len(id_to_row)
    return sparse.csr_matrix(
        (np.ones(len(pairs), dtype=np.int8), (rows, cols)), shape=(n, n)
    )


# --------------------------------------------------------------------------- #
# strategies
# --------------------------------------------------------------------------- #
def _bfs_layer(
    adj: sparse.csr_matrix,
    frontier: list[int],
    exclude: set[int],
    max_new: int,
    rng: np.random.Generator,
) -> list[int]:
    """One BFS layer downstream of `frontier`, deterministic given seed."""
    seen: set[int] = set(exclude)
    candidates: dict[int, int] = {}
    for src in frontier:
        row = adj.getrow(src)
        for tgt in row.indices:
            if tgt in seen:
                continue
            candidates[tgt] = candidates.get(tgt, 0) + 1
    if not candidates:
        return []
    # prefer targets receiving multiple inputs from the frontier (stronger paths)
    ordered = sorted(candidates.items(), key=lambda kv: (-kv[1], kv[0]))
    chosen = [t for t, _ in ordered[:max_new]]
    # deterministic tie-breaking jitter for near-frontier diversity
    if rng.random() < 0.5 and len(ordered) > max_new:
        extra = ordered[max_new : max_new + max_new // 4]
        chosen += [t for t, _ in extra[: max_new // 8]]
    return chosen


def select_sensory_to_motor(
    connections: pd.DataFrame,
    neurons: pd.DataFrame,
    req: SelectionRequest,
) -> Subgraph:
    """Grow a real pathway from sensory neurons toward motor output."""
    pairs = build_pair_graph(connections, req.min_synapses)
    all_ids = np.sort(
        pd.unique(pd.concat([pairs["pre_pt_root_id"], pairs["post_pt_root_id"]]))
    )
    id_to_row = {int(nid): i for i, nid in enumerate(all_ids)}
    adj = _adjacency(pairs, id_to_row)

    meta_by_id = neurons.set_index("root_id") if "root_id" in neurons else None

    def region_of(nid: int) -> str:
        """Region from the synapse table (edges_neuropil), not annotations:
        the official annotation file has no neuropil column in v783."""
        return ""

    def superclass_of(nid: int) -> str:
        if meta_by_id is None:
            return ""
        try:
            v = meta_by_id.at[nid, "super_class"]
            return str(v) if v == v else ""
        except KeyError:
            return ""

    rng = np.random.default_rng(req.seed)
    n = len(all_ids)
    super_arr = np.array([superclass_of(int(x)) for x in all_ids])

    # --- input population: real sensory/visual neurons (official super_class
    # values in v783: optic, visual_projection, sensory, visual_centrifugal...)
    sensory_mask = np.isin(
        super_arr,
        ["optic", "visual", "visual_projection", "visual_centrifugal", "sensory"],
    )
    sensory_rows = np.flatnonzero(sensory_mask)
    if len(sensory_rows) == 0:
        raise ValueError("no sensory neurons found in annotations; dataset corrupt?")

    # prefer neurons in the requested source region when available
    if req.source_region:
        in_region = np.array([req.source_region in region_of(int(all_ids[r])) for r in sensory_rows])
        if in_region.any():
            sensory_rows = sensory_rows[in_region]

    take = min(60, len(sensory_rows))
    seeds = sorted(rng.choice(sensory_rows, size=take, replace=False).tolist())

    # --- BFS downstream, stopping at motor neurons
    motor_rows = set(np.flatnonzero(super_arr == "motor").tolist())
    chosen = list(seeds)
    chosen_set = set(seeds)
    frontier = list(seeds)
    max_neurons = min(req.max_neurons, n)
    while len(chosen) < max_neurons and frontier:
        budget = max(1, (max_neurons - len(chosen)) // 2)
        layer = _bfs_layer(adj, frontier, chosen_set, budget, rng)
        if not layer:
            break
        chosen += layer
        chosen_set.update(layer)
        frontier = layer
        if motor_rows.intersection(chosen_set) and len(chosen) > max_neurons // 3:
            break  # we reached real motor output - stop growing

    rows = np.array(sorted(chosen_set), dtype=np.int64)
    sub = _to_subgraph(pairs, all_ids, rows, req, neurons)

    # Guarantee real motor output when it exists downstream of the grown set:
    # add the most synaptically-connected motor neurons reachable in one hop.
    if req.max_neurons and len(sub.neuron_ids) and "motor" not in set(
        sub.node_meta["super_class"].astype(str)
    ):
        meta_by_id = neurons.set_index("root_id") if "root_id" in neurons else None
        if meta_by_id is not None:
            sub_id_to_row = {int(nid): i for i, nid in enumerate(sub.neuron_ids)}
            candidates: dict[int, int] = {}
            # edges FROM neurons already in the sub TO motor neurons (which may
            # not be in the sub yet - that is exactly who we want to add)
            sel = pairs[pairs["pre_pt_root_id"].map(sub_id_to_row).notna()]
            for _, row in sel.iterrows():
                nid = int(row["post_pt_root_id"])
                try:
                    sc = meta_by_id.at[nid, "super_class"]
                except KeyError:
                    continue
                if str(sc) == "motor":
                    candidates[nid] = candidates.get(nid, 0) + int(row["syn_count"])
            if candidates:
                add = [
                    nid
                    for nid, _ in sorted(
                        candidates.items(), key=lambda kv: (-kv[1], kv[0])
                    )
                ][: max(1, req.max_neurons // 10)]
                merged_ids = np.sort(
                    np.append(sub.neuron_ids, np.array(add, dtype=np.int64))
                )
                # _to_subgraph takes row INDICES into all_ids (not IDs)
                id_to_row_full = {int(nid): i for i, nid in enumerate(all_ids)}
                merged_rows = np.array(
                    [id_to_row_full[int(x)] for x in merged_ids], dtype=np.int64
                )
                sub = _to_subgraph(pairs, all_ids, merged_rows, req, neurons)

    # Honor the neuron budget: if motor additions pushed us over max_neurons,
    # drop the weakest-connected non-motor neurons first.
    if req.max_neurons and len(sub.neuron_ids) > req.max_neurons:
        sc = sub.node_meta["super_class"].astype(str).to_numpy()
        degree = np.bincount(sub.edges_src, minlength=len(sub.neuron_ids)) + np.bincount(
            sub.edges_tgt, minlength=len(sub.neuron_ids)
        )
        weakest_first = np.argsort(degree, kind="stable")
        excess = len(sub.neuron_ids) - req.max_neurons
        drop: list[int] = []
        for r in weakest_first.tolist():
            if len(drop) >= excess:
                break
            if sc[r] != "motor":
                drop.append(r)
        if drop:
            remaining = np.setdiff1d(sub.neuron_ids, sub.neuron_ids[np.array(drop)])
            sub = _to_subgraph(
                pairs,
                all_ids,
                np.array([id_to_row_full[int(x)] for x in remaining], dtype=np.int64),
                req,
                neurons,
            )
    return sub


def select_neuropil_neighborhood(
    connections: pd.DataFrame,
    neurons: pd.DataFrame,
    req: SelectionRequest,
) -> Subgraph:
    """Neurons strongly wired within/around one neuropil (e.g. mushroom body)."""
    pairs = build_pair_graph(connections, req.min_synapses)
    region = (req.source_region or "MB").upper()
    region_pairs = pairs[pairs["neuropil"].astype(str).str.upper().str.startswith(region)]
    if len(region_pairs) < 50:
        region_pairs = pairs  # fall back to the whole graph rather than fabricate
    ids = pd.unique(
        pd.concat([region_pairs["pre_pt_root_id"], region_pairs["post_pt_root_id"]])
    )
    counts = (
        region_pairs.groupby("pre_pt_root_id")["syn_count"].sum()
        .add(region_pairs.groupby("post_pt_root_id")["syn_count"].sum(), fill_value=0)
        .sort_values(ascending=False)
    )
    rows_ids = counts.index.to_numpy()[: req.max_neurons]
    all_ids = np.sort(pd.unique(pd.concat([pairs["pre_pt_root_id"], pairs["post_pt_root_id"]])))
    id_to_row = {int(nid): i for i, nid in enumerate(all_ids)}
    rows = np.sort(np.array([id_to_row[int(x)] for x in rows_ids]))
    return _to_subgraph(pairs, all_ids, rows, req, neurons)


STRATEGIES = {
    "sensory_to_motor": select_sensory_to_motor,
    "neuropil_neighborhood": select_neuropil_neighborhood,
}


# --------------------------------------------------------------------------- #
# shared assembly
# --------------------------------------------------------------------------- #
def _to_subgraph(
    pairs: pd.DataFrame,
    all_ids: np.ndarray,
    rows: np.ndarray,
    req: SelectionRequest,
    neurons: pd.DataFrame,
) -> Subgraph:
    full_id_to_row = {int(nid): i for i, nid in enumerate(all_ids)}
    keep = {full_id_to_row[int(all_ids[r])] for r in rows.tolist()}
    sel_pairs = pairs[
        pairs["pre_pt_root_id"].map(full_id_to_row).isin(keep)
        & pairs["post_pt_root_id"].map(full_id_to_row).isin(keep)
    ]

    # CRITICAL: remap edge endpoints into the SUBSET's row numbering so that
    # edges_src/edges_tgt index directly into neuron_ids (bundle + sim space).
    neuron_ids = all_ids[np.asarray(rows, dtype=np.int64)]
    sub_id_to_row = {int(nid): i for i, nid in enumerate(neuron_ids)}
    src = sel_pairs["pre_pt_root_id"].map(sub_id_to_row).to_numpy(np.int32)
    tgt = sel_pairs["post_pt_root_id"].map(sub_id_to_row).to_numpy(np.int32)
    syn = sel_pairs["syn_count"].to_numpy(np.float32)
    neuro = sel_pairs["neuropil"].astype(str).to_numpy()

    node_meta = _node_meta(neuron_ids, neurons)

    n = len(neuron_ids)
    in_deg = np.bincount(tgt, minlength=n)[:n]
    out_deg = np.bincount(src, minlength=n)[:n]
    stats = {
        "neurons": int(len(rows)),
        "edges": int(len(src)),
        "isolated": int(np.count_nonzero((in_deg == 0) & (out_deg == 0))),
        "median_synapses": float(np.median(syn)) if len(syn) else 0.0,
        "max_synapses": float(syn.max()) if len(syn) else 0.0,
        "weakly_connected_fraction": float(
            np.count_nonzero((in_deg + out_deg) >= 2) / len(rows)
        ),
    }
    return Subgraph(
        neuron_ids=neuron_ids,
        edges_src=src,
        edges_tgt=tgt,
        edges_syn=syn,
        edges_neuropil=neuro,
        node_meta=node_meta,
        request=req,
        stats=stats,
    )


def load_region_table() -> pd.DataFrame | None:
    """Per-neuron dominant region from the official postsynaptic-neuropil
    counts (per_neuron_neuropil_count_post_783.feather, Zenodo 10676866).
    Returns a root_id -> dominant neuropil frame, or None if not cached."""
    from .ingest import RAW_DIR

    path = RAW_DIR / "per_neuron_neuropil_count_post_783.feather"
    if not path.exists():
        return None
    df = pd.read_feather(path)
    required = {"post_pt_root_id", "neuropil", "Count"}
    if not required <= set(df.columns):
        return None
    idx = df.groupby("post_pt_root_id")["Count"].idxmax()
    dom = df.loc[idx, ["post_pt_root_id", "neuropil"]]
    return dom.set_index("post_pt_root_id").rename(columns={"neuropil": "region"})


def _node_meta(
    neuron_ids: np.ndarray,
    neurons: pd.DataFrame,
    region_table: pd.DataFrame | None = None,
) -> pd.DataFrame:
    cols = ["root_id", "super_class", "cell_class", "cell_type", "side", "top_nt"]
    if neurons is None or len(neurons) == 0:
        meta = pd.DataFrame({"root_id": neuron_ids})
        meta["region"] = "unknown"
        if region_table is not None:
            lookup = region_table["region"].reindex(
                pd.Series(neuron_ids).map(int)
            ).fillna("unknown")
            meta["region"] = lookup.to_numpy()
        return meta
    meta = neurons[neurons["root_id"].isin(set(neuron_ids.tolist()))]
    meta = meta.drop_duplicates("root_id").set_index("root_id").reindex(neuron_ids)
    cols = [c for c in cols if c in meta.columns]
    meta = meta[cols].fillna("").reset_index(drop=True)
    return meta


def select_subgraph(
    connections: pd.DataFrame,
    neurons: pd.DataFrame,
    req: SelectionRequest | None = None,
) -> Subgraph:
    req = req or SelectionRequest()
    strategy = STRATEGIES.get(req.strategy)
    if strategy is None:
        raise ValueError(
            f"unknown strategy '{req.strategy}'. Available: {sorted(STRATEGIES)}"
        )
    sub = strategy(connections, neurons, req)
    if sub.stats["edges"] < 100:
        raise ValueError(
            f"selected subgraph too small ({sub.stats['edges']} edges); "
            "refusing to simulate on an implausible slice"
        )
    return sub


def selection_summary(sub: Subgraph) -> str:
    s = sub.stats
    sup = sub.node_meta["super_class"].value_counts().head(4).to_dict() if "super_class" in sub.node_meta else {}
    regions = pd.Series(sub.edges_neuropil).value_counts().head(4).to_dict()
    return (
        f"{s['neurons']} neurons / {s['edges']} real synapse-pairs "
        f"(median weight {s['median_synapses']:.0f}); "
        f"classes: {sup}; main neuropils: {regions}"
    )
