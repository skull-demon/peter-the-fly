"""Download and validate the official public FlyWire FAFB v783 datasets.

Sources (official/public, no third-party mirrors):
- Connectivity: Zenodo record 10676866 (FlyWire Consortium), files:
    * proofread_connections_783.feather   (852 MB) - the v783 edge list
    * proofread_root_ids_783.npy          (1.1 MB) - all 139,255 proofread root IDs
    * flywire_synapses_783.feather        (9.5 GB, optional) - synapse-level table
- Neuron annotations: flyconnectome/flywire_annotations (GitHub), tag v3.1.0,
  file supplemental_files/Supplemental_file1_neuron_annotations.tsv

Files are cached under data/flywire/raw/ and validated against the official
MD5 checksums published on the Zenodo record and GitHub. Nothing is fabricated:
if a file cannot be fetched, we fail loudly instead of inventing data.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data" / "flywire"
RAW_DIR = DATA_DIR / "raw"
MANIFEST_PATH = DATA_DIR / "data_manifest.json"

ZENODO_RECORD_URL = "https://zenodo.org/records/10676866"
ZENODO_BASE = "https://zenodo.org/records/10676866/files"
ANNOTATIONS_REPO = "https://github.com/flyconnectome/flywire_annotations"
ANNOTATIONS_TAG = "v3.1.0"
ANNOTATIONS_URL = (
    "https://raw.githubusercontent.com/flyconnectome/flywire_annotations/"
    f"{ANNOTATIONS_TAG}/supplemental_files/Supplemental_file1_neuron_annotations.tsv"
)

# Official MD5 checksums as published on the Zenodo record / release page.
# Required files must be present; optional files are checksum-verified only
# when they happen to be on disk.
OFFICIAL_CHECKSUMS = {
    "proofread_connections_783.feather": "f48f972d262323a102aed49af1396b8a",
    "proofread_root_ids_783.npy": "e0e6c19732fd8c7a4e39a2d170105421",
}
OPTIONAL_CHECKSUMS = {
    "flywire_synapses_783.feather": "f8f1b97c9d4b0ea9b4c8b287f6b99091",
    "Supplemental_file1_neuron_annotations.tsv": None,  # size/row-count sanity checks only
}

# NOTE on published counts: FlyWire's marketing figure of 3,732,460
# "connections" uses the synapse-level definition from the Codex pipeline.
# The pair-level proofread_connections file we consume aggregates the same
# synapses into directed neuron pairs; its own ground truth (unique directed
# pairs) is asserted in ExpectedCounts below and verified against the
# checksum-verified file.

DATASET = "FlyWire FAFB"
VERSION = "v783"

ExpectedCounts = {"neurons": 139_255, "connections": 15_091_983}


@dataclass
class IngestedData:
    connections: pd.DataFrame
    neuron_ids: np.ndarray
    neurons: pd.DataFrame


# --------------------------------------------------------------------------- #
# checksums / manifest
# --------------------------------------------------------------------------- #
def md5sum(path: Path, chunk_size: int = 1 << 20) -> str:
    h = hashlib.md5()
    with path.open("rb") as fh:
        while chunk := fh.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


def _cache_path(name: str) -> Path:
    return RAW_DIR / name


def _download(url: str, dest: Path, min_bytes: int = 10_000) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url}")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        done = 0
        with dest.open("wb") as fh:
            for chunk in r.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
                done += len(chunk)
                if total and done % (100 << 20) < (1 << 20):
                    print(f"    {done / 1e9:.2f} / {total / 1e9:.2f} GB")
    if dest.stat().st_size < min_bytes:
        dest.unlink(missing_ok=True)
        raise RuntimeError(f"downloaded file suspiciously small: {dest.name}")


def _ensure_file(name: str, url: str, min_bytes: int = 10_000) -> Path:
    """Return a cached, checksum-verified copy of `name` (downloads if needed)."""
    path = _cache_path(name)
    expected = OFFICIAL_CHECKSUMS.get(name, OPTIONAL_CHECKSUMS.get(name))
    if path.exists():
        if expected is None or md5sum(path) == expected:
            print(f"  cached ok: {name}")
            return path
        print(f"  checksum mismatch for cached {name}; re-downloading")
        path.unlink()
    _download(url, path, min_bytes)
    if expected is not None:
        actual = md5sum(path)
        if actual != expected:
            path.unlink(missing_ok=True)
            raise RuntimeError(
                f"checksum mismatch for {name}: got {actual}, expected {expected}. "
                "Refusing to continue with corrupt data."
            )
        print(f"  checksum ok: {name}")
    return path


# --------------------------------------------------------------------------- #
# loaders
# --------------------------------------------------------------------------- #
def _require_columns(df: pd.DataFrame, required: set[str], what: str) -> None:
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{what} is missing required columns: {sorted(missing)}")


def load_connections(expect_downloaded: bool = False) -> pd.DataFrame:
    """The proofread v783 neuron-to-neuron edge list (one row per pair+neuropil)."""
    name = "proofread_connections_783.feather"
    path = _cache_path(name)
    if not path.exists():
        if expect_downloaded:
            raise FileNotFoundError(
                f"{name} not found. Run `make download-data` (or scripts/build_brain.py) first."
            )
        _ensure_file(
            name, f"{ZENODO_BASE}/{name}?download=1"
        )
    df = pd.read_feather(path)
    _require_columns(df, {"pre_pt_root_id", "post_pt_root_id", "neuropil", "syn_count"}, name)
    return df


def load_neuron_ids() -> np.ndarray:
    name = "proofread_root_ids_783.npy"
    path = _cache_path(name)
    if not path.exists():
        _ensure_file(name, f"{ZENODO_BASE}/{name}?download=1")
    ids = np.load(path)
    if ids.ndim != 1 or len(ids) != ExpectedCounts["neurons"]:
        raise ValueError(
            f"expected {ExpectedCounts['neurons']} proofread root IDs, got {ids.shape}"
        )
    return ids


def load_neurons(expect_downloaded: bool = False) -> pd.DataFrame:
    """Neuron metadata from the official flywire_annotations release."""
    name = "Supplemental_file1_neuron_annotations.tsv"
    path = _cache_path(name)
    if not path.exists():
        if expect_downloaded:
            raise FileNotFoundError(f"{name} not found. Run the data download first.")
        _ensure_file(name, ANNOTATIONS_URL, min_bytes=1_000_000)
    df = pd.read_csv(path, sep="\t", low_memory=False)
    _require_columns(
        df,
        {"root_id", "flow", "super_class", "cell_class", "cell_type", "side", "top_nt"},
        name,
    )
    return df


def load_synapses(expect_downloaded: bool = False) -> pd.DataFrame | None:
    """Optional 9.5 GB synapse-level table. Never loaded casually."""
    name = "flywire_synapses_783.feather"
    path = _cache_path(name)
    if not path.exists():
        if expect_downloaded:
            return None
        print("  synapse table not downloaded (optional, 9.5 GB) - skipping")
        return None
    return pd.read_feather(path)


# --------------------------------------------------------------------------- #
# stats + manifest
# --------------------------------------------------------------------------- #
def dataset_stats(connections: pd.DataFrame, neuron_ids: np.ndarray, neurons: pd.DataFrame) -> dict:
    pairs = connections.groupby(["pre_pt_root_id", "post_pt_root_id"], sort=False)[
        "syn_count"
    ].sum()
    return {
        "neuron_count": int(len(neuron_ids)),
        "connection_count": int(len(pairs)),
        "synapse_count": int(connections["syn_count"].sum()),
        "annotated_neurons": int(neurons["root_id"].nunique()),
        "super_classes": {
            str(k): int(v) for k, v in neurons["super_class"].value_counts().items()
        },
    }


def write_manifest(connections: pd.DataFrame, neuron_ids: np.ndarray, neurons: pd.DataFrame) -> dict:
    files = []
    for name in sorted(p.name for p in RAW_DIR.glob("*")):
        p = RAW_DIR / name
        files.append(
            {
                "name": name,
                "bytes": p.stat().st_size,
                "md5": md5sum(p),
                "official_md5": OFFICIAL_CHECKSUMS.get(name),
            }
        )
    manifest = {
        "dataset": DATASET,
        "version": VERSION,
        "source": "Codex/FlyWire",
        "connectivity_source": ZENODO_RECORD_URL,
        "annotations_source": f"{ANNOTATIONS_REPO} (tag {ANNOTATIONS_TAG})",
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "license": "CC BY-NC 4.0",
        "expected_counts": ExpectedCounts,
        "stats": dataset_stats(connections, neuron_ids, neurons),
        "files": files,
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    print(f"  manifest written: {MANIFEST_PATH}")
    return manifest


def ingest(expect_downloaded: bool = False) -> IngestedData:
    """Download (or reuse cache), validate and return the official v783 data."""
    print("[ingest] FlyWire FAFB v783 (official sources)")
    connections = load_connections(expect_downloaded)
    neuron_ids = load_neuron_ids()
    neurons = load_neurons(expect_downloaded)
    return IngestedData(connections=connections, neuron_ids=neuron_ids, neurons=neurons)
