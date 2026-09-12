#!/usr/bin/env python3
"""Verify the FlyWire dataset and the built brain bundle.

Checks:
  raw data     - official checksums (where published), expected counts
  connections  - required columns, no self loops, IDs exist in root-id array
  annotations  - required columns, unique root_ids, super_class coverage
  bundle       - magic/format, sorted IDs, edge index bounds, enabled subset,
                 pool bounds, vocab bounds, JSON sections parse, meta counts
  live-fire    - one full LIF simulation; refuses to pass a silent brain
                 (0 spikes) or a runaway one (> 12% of all spikes/step)

Exit code 0 = everything verified. Never silently continues on corruption.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from brainpack.bundle import read_bundle
from brainpack.ingest import (
    OFFICIAL_CHECKSUMS,
    OPTIONAL_CHECKSUMS,
    RAW_DIR,
    ExpectedCounts,
    load_connections,
    load_neuron_ids,
    load_neurons,
    md5sum,
)
from brainpack.lif import simulate
from brainpack.spikegen import stimulus_from_tokens

PUBLIC_BRAIN_DIR = Path(__file__).resolve().parents[1] / "public" / "brain"
BUNDLE_PATH = PUBLIC_BRAIN_DIR / "peter.brain"

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    status = "ok  " if ok else "FAIL"
    print(f"  [{status}] {name}" + (f" - {detail}" if detail else ""))
    if not ok:
        failures.append(name)
    return ok


def verify_raw() -> dict:
    print("[1/4] raw FlyWire data")
    ids = load_neuron_ids()
    check("neuron count", len(ids) == ExpectedCounts["neurons"], f"{len(ids):,}")
    conn = load_connections(expect_downloaded=True)
    pairs = conn.groupby(["pre_pt_root_id", "post_pt_root_id"], sort=False)["syn_count"].sum()
    check(
        "connection count",
        len(pairs) == ExpectedCounts["connections"],
        f"{len(pairs):,} (expected {ExpectedCounts['connections']:,})",
    )
    check("no self loops", int((pairs.index.get_level_values(0) == pairs.index.get_level_values(1)).sum()) == 0)
    known = set(ids.tolist())
    unknown_pre = int((~conn["pre_pt_root_id"].isin(known)).sum())
    unknown_post = int((~conn["post_pt_root_id"].isin(known)).sum())
    check("edge endpoints in root-id array", unknown_pre + unknown_post == 0, f"{unknown_pre + unknown_post} broken refs")
    neurons = load_neurons(expect_downloaded=True)
    check(
        "annotation columns",
        {"root_id", "super_class", "cell_class", "cell_type", "top_nt"} <= set(neurons.columns),
    )
    check("annotation root_ids unique", neurons["root_id"].is_unique, f"{neurons['root_id'].nunique():,}")
    for name, expected_md5 in {**OFFICIAL_CHECKSUMS, **OPTIONAL_CHECKSUMS}.items():
        path = RAW_DIR / name
        if not path.exists():
            continue  # optional files are verified only when present
        if expected_md5 is not None:
            check(f"official md5: {name}", md5sum(path) == expected_md5)
    return {"neurons": len(ids), "pairs": len(pairs), "synapses": int(conn["syn_count"].sum())}


def verify_bundle() -> None:
    print("[2/4] brain bundle")
    raw = BUNDLE_PATH.read_bytes()
    check("bundle exists", True, f"{len(raw) / 1e6:.2f} MB")
    b = read_bundle(BUNDLE_PATH)
    check("magic", raw[:8] == b"PETERBR1")
    check("ids ascending & unique", bool(np.all(np.diff(b.neuron_ids) > 0)))
    n = b.neuron_count
    check("edge index bounds", int(b.edges_src.max()) < n and int(b.edges_tgt.max()) < n)
    check("no self loops", int((b.edges_src == b.edges_tgt).sum()) == 0)
    check("weights positive", float(b.edges_weight.min()) > 0)
    check("release prob in (0,1]", bool((b.edges_prob > 0).all() and (b.edges_prob <= 1).all()))
    check("signs valid", bool(np.isin(b.edges_sign, [-1, 1]).all()))
    check("enabled subset valid", bool(np.isin(b.edges_enabled, [0, 1]).all()))
    check("input pool in range", bool((b.input_rows < n).all()))
    check("readout pool in range", bool((b.readout_rows < n).all()))
    for entry in b.token_vocab.values():
        if not all(r < n for r in entry):
            check("token vocab rows in range", False)
            break
    else:
        check("token vocab rows in range", True)
    meta_counts = b.meta.get("counts", {})
    check("meta neuron count", meta_counts.get("neurons") == n)
    check("meta edge count", meta_counts.get("edges") == b.edge_count)
    check("dataset label", b.dataset == "FAFB v783")
    check(
        "manifest hash recorded",
        bool(b.meta.get("manifest_md5")),
        str(b.meta.get("manifest_md5", ""))[:12],
    )


def verify_live_fire() -> None:
    print("[3/4] live-fire simulation")
    b = read_bundle(BUNDLE_PATH)
    plan = stimulus_from_tokens("hello peter", b.input_rows)
    sim = simulate(b, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=600.0)
    total = int(sim.spikes.sum())
    max_per_step = int(sim.spikes.sum(axis=1).max())
    n = b.neuron_count
    check("simulation produced spikes", total > 0, f"{total} spikes in 600 ms")
    check(
        "simulation not runaway",
        max_per_step <= 0.12 * n,
        f"peak {max_per_step}/{n} neurons/step",
    )
    check("bins populated", int((sim.bin_counts > 0).sum()) >= 3, f"{int((sim.bin_counts > 0).sum())}/6 bins active")
    check(
        "readout pool participates",
        int(sim.spikes[:, b.readout_rows].sum()) > 0,
        f"{int(sim.spikes[:, b.readout_rows].sum())} readout-pool spikes",
    )
    check("determinism (same seed)", simulate(b, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=600.0).spikes.sum() == total)
    sim2 = simulate(b, plan.neuron_rows, plan.rates_hz, seed=784, duration_ms=600.0)
    check("seed changes dynamics", bool(not np.array_equal(sim.spikes, sim2.spikes)))


def verify_sidecar() -> None:
    print("[4/4] frontend sidecar")
    side = PUBLIC_BRAIN_DIR / "peter.brain.json"
    check("sidecar exists", side.exists())
    if side.exists():
        data = json.loads(side.read_text())
        check("sidecar dataset", data.get("dataset") == "FAFB v783")
        check("sidecar bundle path", data.get("bundle") == "/brain/peter.brain")
        check(
            "sidecar counts match bundle",
            read_bundle(BUNDLE_PATH).neuron_count == data.get("counts", {}).get("neurons"),
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-raw", action="store_true", help="skip raw-data checks (no cache present)")
    ap.add_argument("--skip-live", action="store_true")
    args = ap.parse_args()

    stats: dict | None = None
    if not args.skip_raw and (RAW_DIR / "proofread_root_ids_783.npy").exists():
        stats = verify_raw()
    else:
        print("[1/4] raw FlyWire data - SKIPPED (no cached data)")
    verify_bundle()
    if not args.skip_live:
        verify_live_fire()
    verify_sidecar()

    print()
    if failures:
        print(f"VERIFY: {len(failures)} failure(s): {failures}")
        return 1
    print("VERIFY: all checks passed." + (f" Dataset: {stats}" if stats else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
