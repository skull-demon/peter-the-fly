"""LIF simulation tests on the synthetic bundle: determinism and dynamics."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from brainpack.lif import readout_state, simulate, state_key  # noqa: E402
from brainpack.spikegen import stimulus_from_tokens  # noqa: E402


@pytest.fixture(scope="module")
def hello_sim(synthetic_bundle):
    plan = stimulus_from_tokens("hello peter", synthetic_bundle.input_rows)
    return simulate(synthetic_bundle, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=300.0)


def test_determinism_same_seed(synthetic_bundle):
    plan = stimulus_from_tokens("hello", synthetic_bundle.input_rows)
    s1 = simulate(synthetic_bundle, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=200.0)
    s2 = simulate(synthetic_bundle, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=200.0)
    assert np.array_equal(s1.spikes, s2.spikes)


def test_seed_changes_activity(synthetic_bundle):
    plan = stimulus_from_tokens("hello", synthetic_bundle.input_rows)
    s1 = simulate(synthetic_bundle, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=200.0)
    s2 = simulate(synthetic_bundle, plan.neuron_rows, plan.rates_hz, seed=999, duration_ms=200.0)
    assert not np.array_equal(s1.spikes, s2.spikes)


def test_simulation_produces_activity(hello_sim):
    assert hello_sim.spikes.shape[1] == 300
    total = int(hello_sim.spikes.sum())
    assert 0 < total < 0.12 * 300 * hello_sim.steps, (
        f"brain went silent or runaway: {total} spikes"
    )
    assert int((hello_sim.bin_counts > 0).sum()) >= 2


def test_bins_structure(hello_sim):
    assert hello_sim.bin_counts.shape == (3,)  # 300 ms -> 3 bins of 100 ms
    assert hello_sim.steps == 600  # 300 ms / 0.5 ms


def test_readout_state_shape(hello_sim, synthetic_bundle):
    state = readout_state(hello_sim, synthetic_bundle.readout_rows)
    assert state.shape == (3,)
    assert (state >= 0).all()


def test_state_key_stable_and_bounded(hello_sim, synthetic_bundle):
    state = readout_state(hello_sim, synthetic_bundle.readout_rows)
    key = state_key(state)
    key2 = state_key(state)
    assert key == key2
    assert all(0 <= int(x) < 16 for x in key.split("."))
    assert key == state_key(state + 0.04)  # below 0.5 quantisation step: stable


def test_different_messages_differ(hello_sim, synthetic_bundle):
    plan_a = stimulus_from_tokens("hello", synthetic_bundle.input_rows)
    plan_b = stimulus_from_tokens("sugar", synthetic_bundle.input_rows)
    sa = simulate(synthetic_bundle, plan_a.neuron_rows, plan_a.rates_hz, seed=783, duration_ms=200.0)
    sb = simulate(synthetic_bundle, plan_b.neuron_rows, plan_b.rates_hz, seed=783, duration_ms=200.0)
    assert not np.array_equal(sa.spikes, sb.spikes)


def test_refractory_enforced(synthetic_bundle):
    sim = simulate(synthetic_bundle, np.array([0]), np.array([80.0]), seed=1, duration_ms=50.0)
    steps = sim.spikes.shape[0]
    row0 = sim.spikes[:, 0]
    # no two spikes within the 2 ms (= 4 step) refractory window
    for t in range(steps):
        if row0[t]:
            assert not row0[t + 1 : t + 4].any()
