#!/usr/bin/env python3
"""Train Peter's readout ("the teacher layer") - deterministic, local, tiny.

Method (deliberately small and honest):
- Each corpus prompt is run through the SAME pipeline the browser uses:
  token projection -> stimulus -> the parity-spec LIF simulation on the real
  FlyWire subgraph -> per-bin spike counts of the readout pool = reservoir
  state -> quantised state key.
- Learned artifacts:
    * state_map   : state key -> affinity counts for reply words
    * transitions : reply word -> counts of following words (from the corpus)
    * replies     : each corpus reply with its training state key (for
                    nearest-state retrieval when the walk needs a hand)
- Generation (web side) is a state-biased Markov walk: at every ambiguous
  branch, the live reservoir state genuinely shifts word choice, with
  nearest-state retrieval as a safety net. Nothing is random at runtime:
  the "variability" is the fly's actual spiking.

There is no RNG anywhere in training - all stochasticity is counter-based
hashing (pcg2d) shared with the TypeScript runtime, so results are
reproducible bit-for-bit.

Output: public/brain/peter.readout.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from brainpack.bundle import read_bundle
from brainpack.corpus import PeterCorpus
from brainpack.lif import readout_state, simulate, state_key
from brainpack.spikegen import fnv1a32, stimulus_from_tokens

PUBLIC_BRAIN_DIR = Path(__file__).resolve().parents[1] / "public" / "brain"
BUNDLE_PATH = PUBLIC_BRAIN_DIR / "peter.br"
READOUT_PATH = PUBLIC_BRAIN_DIR / "peter.readout.json"

DURATION_MS = 600.0


def msg_seed(text: str) -> int:
    """Per-message simulation seed (parity spec: identical on the TS side)."""
    return fnv1a32("seed:" + text)


def words(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9']+", text.lower()) if t]


def train(bundle_path: Path = BUNDLE_PATH) -> dict:
    bundle = read_bundle(bundle_path)
    input_pool = bundle.input_rows
    readout_pool = bundle.readout_rows

    state_map: dict[str, Counter] = {}
    transitions: dict[str, Counter] = {}
    replies: list[dict] = []

    pairs = PeterCorpus.pairs()
    print(f"[train] simulating {len(pairs)} corpus prompts on the real subgraph...")
    for i, (prompt, reply) in enumerate(pairs):
        plan = stimulus_from_tokens(prompt, input_pool)
        sim = simulate(
            bundle,
            plan.neuron_rows,
            plan.rates_hz,
            seed=msg_seed(prompt),
            duration_ms=DURATION_MS,
        )
        state = readout_state(sim, readout_pool)
        key = state_key(state)

        rw = words(reply)
        state_map.setdefault(key, Counter())
        for tok in set(rw):
            state_map[key][tok] += 1

        seq = ["<s>", *rw, "</s>"]
        for a, b in zip(seq, seq[1:]):
            transitions.setdefault(a, Counter())
            transitions[a][b] += 1

        replies.append(
            {
                "prompt": prompt,
                "text": reply,
                "tokens": rw,
                "key": key,
                "state": [int(x) for x in state],
            }
        )
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(pairs)} prompts simulated")

    def top(counter: Counter, k: int) -> list[list]:
        return [[tok, n] for tok, n in counter.most_common(k)]

    readout = {
        "format": "peter-readout-1",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": bundle.dataset,
        "bundle_meta": {
            "neurons": bundle.neuron_count,
            "edges": bundle.edge_count,
            "built_at": bundle.meta.get("built_at"),
        },
        "bins": {"count": 6, "ms": 100},
        "state": {"scale": 8.0, "levels": 16},
        "state_map": {k: top(c, 8) for k, c in sorted(state_map.items())},
        "transitions": {a: top(c, 8) for a, c in sorted(transitions.items())},
        "replies": replies,
        "fallbacks": PeterCorpus.fallbacks(),
        "stats": {
            "prompts": len(pairs),
            "states": len(state_map),
            "transition_pairs": sum(len(c) for c in transitions.values()),
        },
        "provenance": {
            "method": "reservoir-state-biased Markov decoding over a real "
            "FlyWire v783 subgraph; no cloud, no fine-tuning",
            "corpus": "authored teaching corpus (python/brainpack/corpus.py)",
            "license_note": "fly data CC BY-NC 4.0; corpus and readout are project-original",
        },
    }
    return readout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", default=str(BUNDLE_PATH))
    ap.add_argument("--out", default=str(READOUT_PATH))
    args = ap.parse_args()

    readout = train(Path(args.bundle))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(readout, indent=1))
    print(
        f"[done] readout: {out} ({out.stat().st_size / 1024:.0f} KB, "
        f"{readout['stats']['states']} states, "
        f"{readout['stats']['transition_pairs']} transition pairs)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
