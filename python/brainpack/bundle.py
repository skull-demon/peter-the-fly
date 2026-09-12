"""Write/read Peter's brain bundle (.br) - a compact, versioned binary format.

The bundle is the ONLY thing the browser runtime loads. Byte layout
(all values little-endian; strings are u32 length + UTF-8 bytes):

    magic      8 bytes  "PETERBR1"
    dataset    u32 len + utf8           e.g. "FAFB v783"
    neurons    u32 N, then N x i64      FlyWire root IDs (ascending)
    edges      u32 E, then:
                 E x i32 src row, E x i32 tgt row,
                 E x f32 weight (synapse count), E x f32 release_prob,
                 E x i8 sign (+1 exc, -1 inh), E x i8 enabled (1/0)
    attrs      u32 len + utf8 JSON: per-neuron annotation arrays
    input      u32 I, then I x u32 row indices
    readout    u32 R, then R x u32 row indices
    tokens     u32 T, then T entries { u32 len, utf8 token, u32 k, u32 rows[k] }
    categories u32 C, same entry layout as tokens
    meta       u32 len + utf8 JSON: provenance, sim params, selection stats

ALIGNMENT RULES (required by JavaScript typed-array views):
    - every u32 field starts at a 4-byte-aligned offset
    - the i64 neuron-id section starts at an 8-byte-aligned offset
    - padding bytes are zero and are skipped by readers

The same layout is implemented in src/brain/bundle.ts. If you change it
here, change it there, and bump FORMAT_VERSION in both places.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

MAGIC = b"PETERBR1"
FORMAT_VERSION = 2  # informational; magic carries the layout generation

STR_DTYPE = "utf-8"


def _pad(buf: bytearray, boundary: int) -> None:
    while len(buf) % boundary:
        buf.append(0)


def write_bundle(
    path: str | Path,
    dataset: str,
    neuron_ids: np.ndarray,
    edges_src: np.ndarray,
    edges_tgt: np.ndarray,
    edges_weight: np.ndarray,
    edges_prob: np.ndarray,
    edges_sign: np.ndarray,
    edges_enabled: np.ndarray,
    attrs_json: dict,
    input_rows: np.ndarray,
    readout_rows: np.ndarray,
    token_vocab: dict[str, list[int]],
    category_vocab: dict[str, list[int]],
    meta_json: dict,
) -> Path:
    neuron_ids = np.asarray(neuron_ids, dtype="<i8")
    n = len(neuron_ids)
    src = np.asarray(edges_src, dtype="<i4")
    tgt = np.asarray(edges_tgt, dtype="<i4")
    weight = np.asarray(edges_weight, dtype="<f4")
    prob = np.asarray(edges_prob, dtype="<f4")
    sign = np.asarray(edges_sign, dtype=np.int8)
    enabled = np.asarray(edges_enabled, dtype=np.int8)
    assert len(src) == len(tgt) == len(weight) == len(prob) == len(sign) == len(enabled)
    if len(src):
        assert src.min() >= 0 and src.max() < n and tgt.min() >= 0 and tgt.max() < n

    buf = bytearray()
    buf += MAGIC

    dataset_bytes = dataset.encode(STR_DTYPE)
    _pad(buf, 4)
    buf += struct.pack("<I", len(dataset_bytes))
    buf += dataset_bytes

    _pad(buf, 4)
    buf += struct.pack("<I", n)
    _pad(buf, 8)                      # i64 alignment for the browser
    buf += neuron_ids.tobytes()

    _pad(buf, 4)
    buf += struct.pack("<I", len(src))
    buf += src.tobytes()
    buf += tgt.tobytes()
    buf += weight.tobytes()
    buf += prob.tobytes()
    buf += sign.tobytes()
    buf += enabled.tobytes()

    attrs = json.dumps(attrs_json, separators=(",", ":")).encode(STR_DTYPE)
    _pad(buf, 4)
    buf += struct.pack("<I", len(attrs))
    buf += attrs

    input_rows = np.asarray(input_rows, dtype="<u4")
    _pad(buf, 4)
    buf += struct.pack("<I", len(input_rows))
    buf += input_rows.tobytes()
    readout_rows = np.asarray(readout_rows, dtype="<u4")
    _pad(buf, 4)
    buf += struct.pack("<I", len(readout_rows))
    buf += readout_rows.tobytes()

    def _entries(vocab: dict[str, list[int]]) -> None:
        items = sorted(vocab.items())
        _pad(buf, 4)
        buf.extend(struct.pack("<I", len(items)))
        for token, rows in items:
            tb = token.encode(STR_DTYPE)
            rows_arr = np.asarray(rows, dtype="<u4")
            _pad(buf, 4)
            buf.extend(struct.pack("<I", len(tb)))
            buf.extend(tb)
            _pad(buf, 4)
            buf.extend(struct.pack("<I", len(rows_arr)))
            buf.extend(rows_arr.tobytes())

    _entries(token_vocab)
    _entries(category_vocab)

    meta = json.dumps(meta_json, separators=(",", ":")).encode(STR_DTYPE)
    _pad(buf, 4)
    buf += struct.pack("<I", len(meta))
    buf += meta

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(buf))
    print(
        f"  bundle written: {path} "
        f"({len(buf) / 1e6:.2f} MB, {n} neurons, {len(src)} edges, "
        f"{len(token_vocab)} token entries)"
    )
    return path


class BrainBundle:
    """Parsed bundle (numpy views). Mirrors src/brain/bundle.ts."""

    def __init__(self, raw: bytes):
        off = 0

        def align(boundary: int) -> None:
            nonlocal off
            r = off % boundary
            if r:
                off += boundary - r

        def take(nbytes: int) -> bytes:
            nonlocal off
            b = raw[off : off + nbytes]
            off += nbytes
            return b

        def u32() -> int:
            align(4)
            return struct.unpack("<I", take(4))[0]

        def utf8() -> str:
            return take(u32()).decode(STR_DTYPE)

        if take(8) != MAGIC:
            raise ValueError("not a Peter brain bundle (bad magic)")
        self.dataset = utf8()
        n = u32()
        align(8)
        self.neuron_ids = np.frombuffer(take(8 * n), dtype="<i8").copy()
        e = u32()
        self.edges_src = np.frombuffer(take(4 * e), dtype="<i4").copy()
        self.edges_tgt = np.frombuffer(take(4 * e), dtype="<i4").copy()
        self.edges_weight = np.frombuffer(take(4 * e), dtype="<f4").copy()
        self.edges_prob = np.frombuffer(take(4 * e), dtype="<f4").copy()
        self.edges_sign = np.frombuffer(take(e), dtype=np.int8).copy()
        self.edges_enabled = np.frombuffer(take(e), dtype=np.int8).copy()
        self.attrs = json.loads(utf8())
        i = u32()
        self.input_rows = np.frombuffer(take(4 * i), dtype="<u4").copy()
        r = u32()
        self.readout_rows = np.frombuffer(take(4 * r), dtype="<u4").copy()
        self.token_vocab = self._read_vocab(take, u32)
        self.category_vocab = self._read_vocab(take, u32)
        self.meta = json.loads(utf8())
        align(1)
        if off != len(raw):
            raise ValueError(f"trailing bytes in bundle: {len(raw) - off}")

    @staticmethod
    def _read_vocab(take, u32) -> dict[str, list[int]]:
        out: dict[str, list[int]] = {}
        for _ in range(u32()):
            token = take(u32()).decode(STR_DTYPE)
            k = u32()
            rows = np.frombuffer(take(4 * k), dtype="<u4").tolist()
            out[token] = rows
        return out

    @property
    def neuron_count(self) -> int:
        return len(self.neuron_ids)

    @property
    def edge_count(self) -> int:
        return len(self.edges_src)


def read_bundle(path: str | Path) -> BrainBundle:
    return BrainBundle(Path(path).read_bytes())
