"""Bundle format tests: round-trip integrity and corruption detection."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from brainpack.bundle import BrainBundle, read_bundle, write_bundle  # noqa: E402


def test_roundtrip_all_fields(tmp_path, synthetic_bundle):
    # rewrite the synthetic bundle with known values and read it back
    path = tmp_path / "rt.br"
    n = 10
    ids = np.arange(100, 100 + n, dtype=np.int64)
    src = np.array([0, 1, 2], dtype=np.int32)
    tgt = np.array([1, 2, 3], dtype=np.int32)
    w = np.array([1.5, 2.5, 3.5], dtype=np.float32)
    prob = np.array([0.5, 0.6, 0.7], dtype=np.float32)
    sign = np.array([1, -1, 1], dtype=np.int8)
    enabled = np.array([1, 1, 0], dtype=np.int8)
    attrs = {"cell_class": ["a"] * n, "nt_sign": ["excitatory"] * n}
    meta = {"counts": {"neurons": n, "edges": 3}, "sim": {"dt_ms": 0.5}}
    write_bundle(path, "TEST", ids, src, tgt, w, prob, sign, enabled, attrs,
                 np.array([0, 1], dtype=np.uint32), np.array([2, 3], dtype=np.uint32),
                 {"hi": [0]}, {"q": [1]}, meta)
    b = read_bundle(path)
    assert b.dataset == "TEST"
    assert np.array_equal(b.neuron_ids, ids)
    assert np.array_equal(b.edges_src, src)
    assert np.array_equal(b.edges_weight, w)
    assert np.array_equal(b.edges_sign, sign)
    assert np.array_equal(b.edges_enabled, enabled)
    assert b.attrs["nt_sign"][0] == "excitatory"
    assert b.meta["sim"]["dt_ms"] == 0.5
    assert b.token_vocab == {"hi": [0]}
    assert b.category_vocab == {"q": [1]}


def test_bad_magic_rejected():
    with pytest.raises(ValueError, match="bad magic"):
        BrainBundle(b"NOTABRAIN" + b"\x00" * 64)


def test_truncated_rejected():
    with pytest.raises(Exception):
        BrainBundle(b"PETERBR1\x05\x00\x00\x00abcde\x02\x00\x00\x00\x01")  # cut short


def test_trailing_bytes_rejected(synthetic_bundle_path=None, tmp_path=None):
    path = Path(__import__("tempfile").mkdtemp()) / "trail.br"
    n = 5
    ids = np.arange(n, dtype=np.int64)
    write_bundle(path, "T", ids,
                 np.array([0], dtype=np.int32), np.array([1], dtype=np.int32),
                 np.array([2.0], dtype=np.float32), np.array([0.5], dtype=np.float32),
                 np.array([1], dtype=np.int8), np.array([1], dtype=np.int8),
                 {}, np.array([0], dtype=np.uint32), np.array([1], dtype=np.uint32),
                 {}, {}, {"counts": {"neurons": n, "edges": 1}})
    raw = path.read_bytes() + b"XX"
    with pytest.raises(ValueError, match="trailing"):
        BrainBundle(raw)


def test_unicode_tokens_roundtrip(tmp_path):
    path = tmp_path / "u.br"
    write_bundle(path, "U", np.arange(3, dtype=np.int64),
                 np.array([], dtype=np.int32), np.array([], dtype=np.int32),
                 np.array([], dtype=np.float32), np.array([], dtype=np.float32),
                 np.array([], dtype=np.int8), np.array([], dtype=np.int8),
                 {}, np.array([0], dtype=np.uint32), np.array([1], dtype=np.uint32),
                 {"café": [0, 1], "糖": [2]}, {}, {"counts": {"neurons": 3, "edges": 0}})
    b = read_bundle(path)
    assert set(b.token_vocab) == {"café", "糖"}


def test_vocab_sorted_for_stable_hashes(tmp_path):
    """Bundle entries are sorted so any hash over the vocab is stable."""
    path = tmp_path / "s.br"
    write_bundle(path, "S", np.arange(4, dtype=np.int64),
                 np.array([], dtype=np.int32), np.array([], dtype=np.int32),
                 np.array([], dtype=np.float32), np.array([], dtype=np.float32),
                 np.array([], dtype=np.int8), np.array([], dtype=np.int8),
                 {}, np.array([0], dtype=np.uint32), np.array([1], dtype=np.uint32),
                 {"b": [1], "a": [0]}, {"z": [3], "y": [2]}, {"counts": {"neurons": 4, "edges": 0}})
    raw = path.read_bytes()
    # both orderings must produce identical bytes
    path2 = tmp_path / "s2.br"
    write_bundle(path2, "S", np.arange(4, dtype=np.int64),
                 np.array([], dtype=np.int32), np.array([], dtype=np.int32),
                 np.array([], dtype=np.float32), np.array([], dtype=np.float32),
                 np.array([], dtype=np.int8), np.array([], dtype=np.int8),
                 {}, np.array([0], dtype=np.uint32), np.array([1], dtype=np.uint32),
                 {"a": [0], "b": [1]}, {"y": [2], "z": [3]}, {"counts": {"neurons": 4, "edges": 0}})
    assert raw == path2.read_bytes()
