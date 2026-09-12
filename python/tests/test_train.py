"""Training pipeline tests: the full corpus -> reservoir -> readout flow."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from brainpack.corpus import PeterCorpus  # noqa: E402
from brainpack.lif import readout_state, simulate, state_key  # noqa: E402
from brainpack.spikegen import stimulus_from_tokens  # noqa: E402


@pytest.fixture(scope="module")
def trained(tmp_path_factory, synthetic_bundle):
    """Run the real training flow over a small synthetic corpus slice."""
    sys.path.insert(0, str(ROOT.parent / "scripts"))
    import train_readout

    out = tmp_path_factory.mktemp("readout") / "peter.readout.json"
    # monkeypatch the bundle loader onto the synthetic bundle
    original = train_readout.read_bundle
    train_readout.read_bundle = lambda path: synthetic_bundle
    readout = train_readout.train(Path("ignored"))
    train_readout.read_bundle = original
    out.write_text(json.dumps(readout))
    return readout


def test_corpus_exists_and_nontrivial():
    pairs = PeterCorpus.pairs()
    assert len(pairs) >= 60
    assert all(prompt and reply for prompt, reply in pairs)
    assert all(len(reply.split()) >= 3 for _, reply in pairs)
    assert len(PeterCorpus.fallbacks()) >= 3


def test_training_produces_states(trained):
    assert trained["format"] == "peter-readout-1"
    assert trained["stats"]["prompts"] == len(PeterCorpus.pairs())
    assert trained["stats"]["states"] > 0
    assert len(trained["state_map"]) == trained["stats"]["states"]


def test_training_produces_transitions(trained):
    assert "<s>" in trained["transitions"]
    assert len(trained["transitions"]["<s>"]) > 0
    # "</s>" is a walk TARGET (ends sentences), never a transition key
    targets = {tok for opts in trained["transitions"].values() for tok, _ in opts}
    assert "</s>" in targets


def test_readout_is_small(trained):
    size = len(json.dumps(trained))
    assert size < 2_000_000, "readout must stay tiny (no language model in disguise)"


def test_every_reply_has_state_key(trained):
    for entry in trained["replies"]:
        assert "key" in entry and "text" in entry
        assert all(0 <= int(x) < 16 for x in entry["key"].split("."))


def test_end_to_end_simulation_actually_runs(synthetic_bundle):
    """The neural simulator actually runs and produces message-dependent states."""
    states = []
    for prompt, _ in PeterCorpus.pairs()[:8]:
        plan = stimulus_from_tokens(prompt, synthetic_bundle.input_rows)
        sim = simulate(
            synthetic_bundle, plan.neuron_rows, plan.rates_hz,
            seed=783, duration_ms=300.0,
        )
        total = int(sim.spikes.sum())
        assert total > 0, f"silent brain for prompt: {prompt!r}"
        states.append(state_key(readout_state(sim, synthetic_bundle.readout_rows)))
    assert len(set(states)) > 1, "all prompts produced identical states - projection broken"
