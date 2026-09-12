/**
 * Peter's brain bundle parser.
 *
 * Implements the documented binary layout of python/brainpack/bundle.py
 * (all little-endian, with alignment padding - see the ALIGNMENT RULES in
 * the python writer). One memory copy total; typed-array views afterwards.
 *
 * Byte layout:
 *   magic 8 bytes "PETERBR1"
 *   dataset: u32 len + utf8
 *   neurons: u32 N + (align 8) + N x i64
 *   edges:   u32 E + E x (i32 src, i32 tgt, f32 weight, f32 prob, i8 sign, i8 enabled)
 *   attrs:   u32 len + utf8 JSON
 *   input:   u32 I + I x u32
 *   readout: u32 R + R x u32
 *   tokens:  u32 T + T x { u32 len + utf8 (align 4 before each field), u32 k + k x u32 }
 *   categories: same as tokens
 *   meta:    u32 len + utf8 JSON
 *
 * ALIGNMENT RULES: every u32 sits at a 4-byte-aligned offset; the i64 neuron
 * section starts 8-byte-aligned; padding is zero and skipped by readers.
 */

export const MAGIC = "PETERBR1";

export type BrainBundle = {
  dataset: string;
  neuronIds: BigInt64Array;
  edgesSrc: Int32Array;
  edgesTgt: Int32Array;
  edgesWeight: Float32Array;
  edgesProb: Float32Array;
  edgesSign: Int8Array;
  edgesEnabled: Int8Array;
  attrs: {
    cell_class: string[];
    super_class: string[];
    region: string[];
    nt: string[];
    nt_sign: string[];
  };
  inputRows: Uint32Array;
  readoutRows: Uint32Array;
  tokenVocab: Map<string, Uint32Array>;
  categoryVocab: Map<string, Uint32Array>;
  meta: Record<string, unknown>;
  neuronCount: number;
  edgeCount: number;
};

const dec = new TextDecoder();

function readU32(view: DataView, off: { value: number }): number {
  const r = off.value % 4;
  if (r) off.value += 4 - r;
  const v = view.getUint32(off.value, true);
  off.value += 4;
  return v;
}

function readUtf8(view: DataView, off: { value: number }): string {
  const len = readU32(view, off);
  const bytes = new Uint8Array(view.buffer, view.byteOffset + off.value, len);
  off.value += len;
  return dec.decode(bytes);
}

/** FNV-1a 32-bit. MUST stay identical to fnv1a32() in python/brainpack/spikegen.py. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff; // tokens are ascii-range; byte-level parity holds
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function parseBrainBundle(buffer: ArrayBuffer): BrainBundle {
  const view = new DataView(buffer);
  const off = { value: 0 };

  const magicBytes = new Uint8Array(buffer, 0, 8);
  if (dec.decode(magicBytes) !== MAGIC) {
    throw new Error("not a Peter brain bundle (bad magic)");
  }
  off.value = 8;

  const dataset = readUtf8(view, off);

  const n = readU32(view, off);
  let r = off.value % 8;
  if (r) off.value += 8 - r;
  const neuronIds = new BigInt64Array(buffer, off.value, n);
  off.value += 8 * n;

  const e = readU32(view, off);
  const edgesSrc = new Int32Array(buffer, off.value, e);
  off.value += 4 * e;
  const edgesTgt = new Int32Array(buffer, off.value, e);
  off.value += 4 * e;
  const edgesWeight = new Float32Array(buffer, off.value, e);
  off.value += 4 * e;
  const edgesProb = new Float32Array(buffer, off.value, e);
  off.value += 4 * e;
  const edgesSign = new Int8Array(buffer, off.value, e);
  off.value += e;
  const edgesEnabled = new Int8Array(buffer, off.value, e);
  off.value += e;

  const attrs = JSON.parse(readUtf8(view, off)) as BrainBundle["attrs"];

  const i = readU32(view, off);
  const inputRows = new Uint32Array(buffer, off.value, i);
  off.value += 4 * i;
  const rr = readU32(view, off);
  const readoutRows = new Uint32Array(buffer, off.value, rr);
  off.value += 4 * rr;

  function readVocab(): Map<string, Uint32Array> {
    const count = readU32(view, off);
    const map = new Map<string, Uint32Array>();
    for (let k = 0; k < count; k++) {
      const token = readUtf8(view, off);
      const rows = readU32(view, off);
      map.set(token, new Uint32Array(buffer, off.value, rows));
      off.value += 4 * rows;
    }
    return map;
  }
  const tokenVocab = readVocab();
  const categoryVocab = readVocab();

  const meta = JSON.parse(readUtf8(view, off)) as Record<string, unknown>;
  if (off.value !== buffer.byteLength) {
    throw new Error(`trailing bytes in bundle: ${buffer.byteLength - off.value}`);
  }

  return {
    dataset,
    neuronIds,
    edgesSrc,
    edgesTgt,
    edgesWeight,
    edgesProb,
    edgesSign,
    edgesEnabled,
    attrs,
    inputRows,
    readoutRows,
    tokenVocab,
    categoryVocab,
    meta,
    neuronCount: n,
    edgeCount: e,
  };
}
