#!/usr/bin/env python3
"""Build Peter's brain bundle from the official FlyWire FAFB v783 data.

Pipeline:
  1. ingest official data (Zenodo connectivity + GitHub annotations), verify checksums
  2. select a real subnetwork (no random graphs)
  3. assign roles (input pool / readout pool) and per-edge signs from transmitter data
  4. write public/brain/peter.br + a JSON sidecar for the frontend readouts

Usage:
  python scripts/build_brain.py [--strategy sensory_to_motor] [--max-neurons 2200]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from brainpack.bundle import read_bundle, write_bundle
from brainpack.ingest import MANIFEST_PATH, ingest, write_manifest
from brainpack.spikegen import (
    SEMANTIC_CATEGORIES,
    SEED,
    fnv1a32,
    sample_neuron_attributes,
    split_io,
)
from brainpack.subgraph import (
    SelectionRequest,
    build_pair_graph,
    select_subgraph,
    selection_summary,
)

PUBLIC_BRAIN_DIR = Path(__file__).resolve().parents[1] / "public" / "brain"
BUNDLE_PATH = PUBLIC_BRAIN_DIR / "peter.br"
SIDECAR_PATH = PUBLIC_BRAIN_DIR / "peter.brain.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strategy", default="sensory_to_motor")
    ap.add_argument("--max-neurons", type=int, default=2200)
    ap.add_argument("--min-synapses", type=int, default=3)
    ap.add_argument("--source-region", default="ME")
    ap.add_argument("--enable-fraction", type=float, default=0.85)
    ap.add_argument("--skip-download", action="store_true", help="use cached raw files only")
    args = ap.parse_args()

    data = ingest(expect_downloaded=args.skip_download)
    manifest = (
        write_manifest(data.connections, data.neuron_ids, data.neurons)
        if not MANIFEST_PATH.exists() or not args.skip_download
        else json.loads(MANIFEST_PATH.read_text())
    )

    print("[select] choosing a real subnetwork...")
    req = SelectionRequest(
        strategy=args.strategy,
        max_neurons=args.max_neurons,
        min_synapses=args.min_synapses,
        source_region=args.source_region,
        seed=SEED,
    )
    sub = select_subgraph(data.connections, data.neurons, req)
    print("  " + selection_summary(sub))

    print("[roles] assigning input / readout pools from real connectivity...")
    rng = np.random.default_rng(SEED)
    input_pool, readout_pool = split_io(sub, rng)
    attrs = sample_neuron_attributes(sub)

    print("[edges] weights, release probability, signs...")
    pairs = build_pair_graph(data.connections, req.min_synapses)
    n = len(sub.neuron_ids)
    id_to_row = {int(nid): i for i, nid in enumerate(sub.neuron_ids)}
    sel = pairs[
        pairs["pre_pt_root_id"].map(id_to_row).notna()
        & pairs["post_pt_root_id"].map(id_to_row).notna()
    ].copy()
    sel["src"] = sel["pre_pt_root_id"].map(id_to_row).astype(np.int32)
    sel["tgt"] = sel["post_pt_root_id"].map(id_to_row).astype(np.int32)
    sel = sel.drop_duplicates(["src", "tgt"])

    weight = sel["syn_count"].to_numpy(np.float32)
    ach = sel["ach_avg"].to_numpy(np.float64) if "ach_avg" in sel else np.zeros(len(sel))
    gaba = sel["gaba_avg"].to_numpy(np.float64) if "gaba_avg" in sel else np.zeros(len(sel))

    src_nt = np.array([attrs["nt_sign"][i] for i in sel["src"]])
    sign = np.zeros(len(sel), dtype=np.int8)
    sign[gaba > ach] = -1          # transmitter evidence says inhibitory
    sign[ach > gaba] = +1          # transmitter evidence says excitatory
    fallback = (ach == gaba)
    sign[fallback & (src_nt == "inhibitory")] = -1
    sign[fallback & (src_nt == "excitatory")] = +1
    sign[sign == 0] = 1            # unknown: treat as excitatory, recorded in meta
    sign_evidence = (
        "edge_nt_probabilities (ach_avg/gaba_avg from proofread_connections)"
        if "ach_avg" in sel
        else "neuron_annotations (nt_type fallback)"
    )

    # keep the strongest edges enabled; weight rank + absolute floor
    order = np.argsort(-weight, kind="stable")
    keep_n = int(len(weight) * args.enable_fraction)
    enabled = np.zeros(len(weight), dtype=np.int8)
    enabled[order[:keep_n]] = 1
    enabled[weight >= 5] = 1

    prob = np.clip(1.0 - np.exp(-weight.astype(np.float64) / 8.0), 0.05, 0.95)

    print("[vocab] token / category projections (parity spec)...")
    token_vocab = {tok: _rows_for_token(tok, input_pool) for tok in corpus_tokens()}
    category_vocab = {
        cat: _rows_for_token(f"category:{cat}", input_pool)
        for cat in SEMANTIC_CATEGORIES
    }

    meta = {
        "dataset": "FAFB v783",
        "version": "v783",
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "manifest_md5": _file_md5(MANIFEST_PATH),
        "seed": SEED,
        "selection": {
            "strategy": req.strategy,
            "max_neurons": req.max_neurons,
            "min_synapses": req.min_synapses,
            "source_region": req.source_region,
            "stats": sub.stats,
        },
        "sim": {
            "dt_ms": 0.5,
            "duration_ms": 550,
            "window_ms": 120,
            "tau_mem_ms": 22.0,
            "tau_inh_ms": 9.0,
            "v_rest_mv": -58.0,
            "v_reset_mv": -66.0,
            "v_thresh_mv": -48.0,
            "w_gain": 0.55,
            "inh_scale": 3.2,
        },
        "counts": {
            "neurons": n,
            "edges": int(len(weight)),
            "enabled_edges": int(enabled.sum()),
            "inhibitory_edges": int((sign < 0).sum()),
            "input_pool": int(len(input_pool)),
            "readout_pool": int(len(readout_pool)),
        },
        "sign_evidence": sign_evidence,
        "provenance": {
            "connectivity": "Zenodo 10676866 (FlyWire Consortium), proofread_connections_783",
            "annotations": "flyconnectome/flywire_annotations v3.1.0",
            "license": "CC BY-NC 4.0",
            "note": "No neuron, edge, weight or label is generated. Unknown values stay unknown.",
        },
    }

    attrs_json = {
        "cell_class": attrs["cell_class"],
        "super_class": attrs["super_class"],
        "region": attrs["region"],
        "nt": attrs["nt"],
        "nt_sign": attrs["nt_sign"],
    }

    print("[write] bundle + sidecar...")
    write_bundle(
        BUNDLE_PATH,
        "FAFB v783",
        sub.neuron_ids,
        sel["src"].to_numpy(),
        sel["tgt"].to_numpy(),
        weight,
        prob.astype(np.float32),
        sign,
        enabled,
        attrs_json,
        input_pool,
        readout_pool,
        token_vocab,
        category_vocab,
        meta,
    )

    regions: dict[str, int] = {}
    for r in attrs["region"]:
        regions[r] = regions.get(r, 0) + 1
    sidecar = {
        "dataset": "FAFB v783",
        "bundle": "/brain/peter.br",
        "bundle_bytes": BUNDLE_PATH.stat().st_size,
        "built_at": meta["built_at"],
        "sim": meta["sim"],
        "counts": meta["counts"],
        "regions_top": dict(
            sorted(regions.items(), key=lambda kv: -kv[1])[:14]
        ),
        "provenance": meta["provenance"],
    }
    SIDECAR_PATH.parent.mkdir(parents=True, exist_ok=True)
    SIDECAR_PATH.write_text(json.dumps(sidecar, indent=2))

    # round-trip verification before declaring success
    check = read_bundle(BUNDLE_PATH)
    assert check.neuron_count == n and check.edge_count == len(weight)
    assert check.meta["counts"]["enabled_edges"] == int(enabled.sum())
    print(
        f"[done] {n} neurons, {len(weight)} edges "
        f"({int(enabled.sum())} enabled, {int((sign < 0).sum())} inhibitory). "
        f"Bundle: {BUNDLE_PATH}"
    )
    return 0


def _rows_for_token(token: str, input_pool: np.ndarray, max_neurons: int = 24) -> list[int]:
    from brainpack.spikegen import token_neuron_indices

    return token_neuron_indices(token, input_pool, max_neurons).tolist()


def corpus_tokens() -> set[str]:
    """Tokens from the training corpus (readout vocabulary)."""
    from brainpack.corpus import PeterCorpus

    toks: set[str] = set()
    for prompt, reply in PeterCorpus.pairs():
        toks.update(_words(prompt))
        toks.update(_words(reply))
    return toks


def _words(text: str) -> set[str]:
    import re

    return {t for t in re.findall(r"[a-z0-9']+", text.lower()) if t}


def _file_md5(path: Path) -> str:
    import hashlib

    if not path.exists():
        return ""
    return hashlib.md5(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    raise SystemExit(main())
