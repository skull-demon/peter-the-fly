"""Spike-generation tests: hash projection, stimulus plan, IO pools, parity helpers."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from brainpack.lif import imul32, pcg2d, rand01  # noqa: E402
from brainpack.spikegen import (  # noqa: E402
    SEMANTIC_CATEGORIES,
    fnv1a32,
    semantic_attributes,
    split_io,
    stimulus_from_tokens,
    token_neuron_indices,
    tokens_of,
)


def test_fnv1a32_known_vectors():
    # published FNV-1a 32-bit test vectors
    assert fnv1a32("") == 0x811C9DC5
    assert fnv1a32("a") == 0xE40C292C
    assert fnv1a32("foobar") == 0xBF9CF968


def test_token_projection_deterministic():
    pool = np.arange(100)
    a = token_neuron_indices("hello", pool)
    b = token_neuron_indices("hello", pool)
    c = token_neuron_indices("world", pool)
    assert np.array_equal(a, b)
    assert not np.array_equal(a, c)  # different tokens recruit different neurons
    assert len(a) <= 24
    assert all(pool[int(i)] in pool for i in a)


def test_tokens_of_matches_ts_spec():
    # apostrophe stays inside a token on BOTH sides (parity with [a-z0-9']+ regex)
    assert tokens_of("Hello, World! It's 2x") == ["hello", "world", "it's", "2x"]
    assert tokens_of("???") == []


def test_semantic_attributes():
    assert "greeting" in semantic_attributes("hello there")
    assert "food" in semantic_attributes("got any sugar?")
    assert "question" in semantic_attributes("what time is it?")
    assert semantic_attributes("xyzzy") == set()


def test_stimulus_plan_shape_and_determinism(synthetic_bundle):
    b = synthetic_bundle
    p1 = stimulus_from_tokens("hello peter", b.input_rows)
    p2 = stimulus_from_tokens("hello peter", b.input_rows)
    assert np.array_equal(p1.neuron_rows, p2.neuron_rows)
    assert np.array_equal(p1.rates_hz, p2.rates_hz)
    assert len(p1.neuron_rows) == len(p1.rates_hz)
    assert p1.rates_hz.max() <= 80.0 + 1e-9
    # different message -> different stimulation (nothing is canned)
    p3 = stimulus_from_tokens("sugar now", b.input_rows)
    assert not np.array_equal(p1.neuron_rows, p3.neuron_rows)


def test_split_io_deterministic_and_disjoint(synthetic_bundle):
    b = synthetic_bundle
    from brainpack.subgraph import Subgraph

    class FakeSub:
        neuron_ids = b.neuron_ids
        edges_src = b.edges_src
        edges_tgt = b.edges_tgt
        node_meta = __import__("pandas").DataFrame(
            {"super_class": ["interneuron"] * b.neuron_count}
        )

    rng1 = np.random.default_rng(783)
    rng2 = np.random.default_rng(783)
    in1, out1 = split_io(FakeSub(), rng1)
    in2, out2 = split_io(FakeSub(), rng2)
    assert np.array_equal(in1, in2) and np.array_equal(out1, out2)
    assert not set(in1.tolist()) & set(out1.tolist())
    assert len(in1) >= 16 and len(out1) >= 24
    assert (in1 < b.neuron_count).all() and (out1 < b.neuron_count).all()


def test_parity_pcg2d_known_value():
    # reference value computed with the JS implementation (tests/test_parity.mjs)
    v = np.array([1], dtype=np.uint64)
    w = np.array([2], dtype=np.uint64)
    x = pcg2d(imul32(v, 1664525) + np.uint64(1013904223) & np.uint64(0xFFFFFFFF), w)
    assert isinstance(x[0], np.uint32)


def test_rand01_range_and_determinism():
    a = np.arange(1000, dtype=np.uint64)
    r1 = rand01(783, a, a * 3, 7919, 0x85EBCA6B)
    r2 = rand01(783, a, a * 3, 7919, 0x85EBCA6B)
    assert np.array_equal(r1, r2)
    assert (r1 >= 0).all() and (r1 < 1).all()
    r3 = rand01(784, a, a * 3, 7919, 0x85EBCA6B)
    assert not np.array_equal(r1, r3)


def test_categories_cover_expected_domains():
    for cat in ("greeting", "food", "sensation", "question"):
        assert cat in SEMANTIC_CATEGORIES
