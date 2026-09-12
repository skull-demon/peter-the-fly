"""Shared fixtures: a tiny synthetic bundle for fast, hermetic tests.

Real-data tests (marked `realdata`) are skipped when the official FlyWire
cache is absent; everything else runs on synthetic bundles whose DATA IS
CLEARLY SYNTHETIC - they exercise code paths, not biology.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from brainpack.bundle import write_bundle  # noqa: E402


def write_synthetic_bundle(path) -> None:
    """THE synthetic bundle recipe - shared by every test suite (py + parity).

    Weights are strong enough to sustain propagation through the ring so the
    readout pool genuinely participates (a silent brain tests nothing).
    """
    n = 300
    rng = np.random.default_rng(783)
    ids = np.sort(
        rng.choice(np.arange(720575940000000000, 720575940001000000), n, replace=False)
    ).astype(np.int64)
    src, tgt, w, sign = [], [], [], []
    for i in range(n):
        for k in (1, 2, 3, 5):
            j = (i + k) % n
            src.append(i)
            tgt.append(j)
            w.append(float(10 + (i * 7 + k * 13) % 41))   # 10..50: propagation-capable
            sign.append(-1 if (i % 7 == 0) else 1)
    for i in range(0, n - 3, 40):
        src.append(i)
        tgt.append(i + 3)
        w.append(40.0)
        sign.append(1)
    src = np.array(src, dtype=np.int32)
    tgt = np.array(tgt, dtype=np.int32)
    w = np.array(w, dtype=np.float32)
    sign = np.array(sign, dtype=np.int8)
    prob = np.clip(1.0 - np.exp(-w / 30.0), 0.2, 0.95).astype(np.float32)
    attrs = {
        "cell_class": ["unknown"] * n,
        "super_class": ["interneuron"] * n,
        "region": ["ME_L"] * n,
        "nt": ["unknown"] * n,
        "nt_sign": ["excitatory"] * n,
    }
    write_bundle(
        path,
        "SYNTHETIC",
        ids,
        src,
        tgt,
        w,
        prob,
        sign,
        np.ones(len(src), dtype=np.int8),
        attrs,
        np.arange(0, 40, dtype=np.uint32),
        np.arange(40, 130, dtype=np.uint32),
        {"hello": [0, 1, 2, 3], "sugar": [4, 5, 6], "peter": [7, 8]},
        {"greeting": [9, 10], "food": [11, 12]},
        {"dataset": "SYNTHETIC", "counts": {"neurons": n, "edges": len(src)}, "sim": {}},
    )


@pytest.fixture(scope="session")
def synthetic_bundle(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("bundle")
    path = tmp / "synthetic.br"
    write_synthetic_bundle(path)
    from brainpack.bundle import read_bundle

    return read_bundle(path)


def pytest_configure(config):
    config.addinivalue_line("markers", "realdata: requires the cached official FlyWire data")
