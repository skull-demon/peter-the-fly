"""Subgraph selection tests (synthetic connectivity; strategy logic only)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from brainpack.subgraph import (  # noqa: E402
    SelectionRequest,
    build_pair_graph,
    select_subgraph,
)


@pytest.fixture(scope="module")
def synthetic_connectome():
    """A tiny *obviously synthetic* connectome: layered feed-forward + labels."""
    rng = np.random.default_rng(783)
    n_sensory, n_inter, n_motor = 40, 120, 20
    ids = np.arange(72057594000000100, 72057594000000100 + n_sensory + n_inter + n_motor)
    rows = []
    sensory = ids[:n_sensory]
    inter = ids[n_sensory : n_sensory + n_inter]
    motor = ids[n_sensory + n_inter :]
    for s in sensory:
        for t in rng.choice(inter, 8, replace=False):
            rows.append((s, t, int(rng.integers(3, 30)), "ME_L"))
    for s in inter:
        for t in rng.choice(inter, 5, replace=False):
            if s != t:
                rows.append((s, t, int(rng.integers(2, 15)), "MB_CA_R"))
        if rng.random() < 0.35:
            rows.append((s, rng.choice(motor), int(rng.integers(3, 20)), "FB"))
    conn = pd.DataFrame(rows, columns=["pre_pt_root_id", "post_pt_root_id", "syn_count", "neuropil"])
    neurons = pd.DataFrame(
        {
            "root_id": ids,
            "super_class": ["visual"] * n_sensory + ["interneuron"] * n_inter + ["motor"] * n_motor,
            "class": ["optics"] * n_sensory + ["local"] * n_inter + ["descending"] * n_motor,
            "cell_type": ["T4"] * n_sensory + [""] * n_inter + ["DN"] * n_motor,
            "side": ["L"] * n_sensory + [""] * n_inter + ["M"] * n_motor,
            "neuropil": ["ME_L"] * n_sensory + ["MB_CA_R"] * n_inter + ["FB"] * n_motor,
            "nt_type": ["acetylcholine"] * n_sensory + ["gaba"] * (n_inter // 2) + ["unknown"] * (n_inter - n_inter // 2) + ["acetylcholine"] * n_motor,
        }
    )
    return conn, neurons


def test_build_pair_graph_sums_and_filters(synthetic_connectome):
    conn, _ = synthetic_connectome
    conn = pd.concat([conn, conn.iloc[[0]].assign(neuropil="FB")])  # duplicate pair, second neuropil
    pairs = build_pair_graph(conn, min_synapses=3)
    assert (pairs["syn_count"] >= 3).all()
    grouped = pairs.groupby(["pre_pt_root_id", "post_pt_root_id"]).size()
    assert (grouped == 1).all()  # per-neuropil rows collapsed to single pairs


def test_select_sensory_to_motor(synthetic_connectome):
    conn, neurons = synthetic_connectome
    req = SelectionRequest(strategy="sensory_to_motor", max_neurons=90, min_synapses=2)
    sub = select_subgraph(conn, neurons, req)
    assert sub.stats["neurons"] <= 90
    assert sub.stats["edges"] >= 100
    meta_classes = set(sub.node_meta["super_class"])
    assert "visual" in meta_classes  # starts from real annotated sensory neurons
    assert "motor" in meta_classes   # reaches motor output
    assert len(sub.neuron_ids) == len(set(sub.neuron_ids.tolist()))


def test_select_neuropil_neighborhood(synthetic_connectome):
    conn, neurons = synthetic_connectome
    req = SelectionRequest(strategy="neuropil_neighborhood", max_neurons=60, source_region="MB")
    sub = select_subgraph(conn, neurons, req)
    assert 0 < sub.stats["neurons"] <= 60
    assert sub.stats["edges"] > 0


def test_unknown_strategy_rejected(synthetic_connectome):
    conn, neurons = synthetic_connectome
    with pytest.raises(ValueError, match="unknown strategy"):
        select_subgraph(conn, neurons, SelectionRequest(strategy="random_noise"))


def test_no_random_graphs_without_data(synthetic_connectome):
    """Refuses to proceed from empty/degenerate input (never fabricates)."""
    conn, neurons = synthetic_connectome
    empty_conn = conn.iloc[0:0]
    with pytest.raises(ValueError):
        select_subgraph(empty_conn, neurons, SelectionRequest(strategy="sensory_to_motor", max_neurons=50))
