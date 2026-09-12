#!/usr/bin/env python3
"""Corpus coverage report: which intents/words exist, word counts, sizes.

Used by tests and for documentation. Read-only; writes nothing.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from brainpack.corpus import PeterCorpus


def main() -> int:
    pairs = PeterCorpus.pairs()
    words = set()
    total_words = 0
    for prompt, reply in pairs:
        for text in (prompt, reply):
            ws = [t for t in text.lower().split() if t]
            words.update(ws)
            total_words += len(ws)
    report = {
        "pairs": len(pairs),
        "unique_words": len(words),
        "total_words": total_words,
        "avg_reply_words": round(total_words / (2 * len(pairs)), 1),
        "fallbacks": len(PeterCorpus.fallbacks()),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
