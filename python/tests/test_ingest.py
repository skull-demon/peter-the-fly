"""Tests for the official-data ingestion layer (uses cache; downloads nothing)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from brainpack import ingest  # noqa: E402

pytestmark = pytest.mark.realdata


@pytest.fixture(scope="module")
def raw_available() -> bool:
    return (ingest.RAW_DIR / "proofread_root_ids_783.npy").exists()


def test_expected_counts_constants():
    # 139,255 proofread neurons; 15,091,983 unique directed pairs in the
    # checksum-verified proofread_connections_783.feather (the FlyWire-published
    # 3,732,460 figure uses the Codex synapse-level definition - see ingest.py).
    assert ingest.ExpectedCounts == {"neurons": 139_255, "connections": 15_091_983}
    assert ingest.VERSION == "v783"


def test_load_neuron_ids(raw_available):
    if not raw_available:
        pytest.skip("official FlyWire cache not present")
    ids = ingest.load_neuron_ids()
    assert len(ids) == 139_255
    assert np.issubdtype(ids.dtype, np.integer)  # official file is uint64


def test_load_connections(raw_available):
    if not raw_available:
        pytest.skip("official FlyWire cache not present")
    conn = ingest.load_connections(expect_downloaded=True)
    assert {"pre_pt_root_id", "post_pt_root_id", "neuropil", "syn_count"} <= set(conn.columns)
    assert conn["syn_count"].sum() > 50_000_000


def test_official_checksums_present():
    for name in ("proofread_connections_783.feather", "proofread_root_ids_783.npy"):
        assert name in ingest.OFFICIAL_CHECKSUMS
        assert ingest.OFFICIAL_CHECKSUMS[name]


def test_manifest_written_after_ingest(raw_available):
    if not raw_available:
        pytest.skip("official FlyWire cache not present")
    manifest_path = ingest.MANIFEST_PATH
    if manifest_path.exists():
        import json

        m = json.loads(manifest_path.read_text())
        assert m["dataset"] == "FlyWire FAFB"
        assert m["version"] == "v783"
        assert m["license"] == "CC BY-NC 4.0"
        assert len(m["files"]) >= 2
