/**
 * Peter's factual memory - a small, honest, persistent association store.
 *
 * This is the "France -> capital -> Paris" layer: teach Peter a fact in
 * plain text, and he recalls it later - even after a reload. NOTHING here
 * touches the connectome: the FlyWire bundle is immutable, memory lives in
 * localStorage, and its SHA-256 identity is separate from the brain's.
 *
 * Schema (deliberately tiny, versioned, bounded):
 *   facts: [{ subj, rel, obj, conf, rein, src, ts }]
 *   - subj/rel/obj: lowercase word strings (compact, no vectors)
 *   - conf: confidence in [0, 1]; assertions start at 0.6, each
 *     corroboration +0.1 (cap 0.99), each contradiction of the winner
 *     boosts the challenger instead of silently overwriting.
 *   - rein: how many times this exact fact was (re)asserted
 *   - src: "USER_ASSERTED" | "REINFORCED" (never "verified" - nobody checked)
 *   - ts: last-update epoch ms
 *
 * Parsing (sentence templates, no LLM):
 *   "X is Y" / "X are Y"            -> X -is-> Y            (rel "is")
 *   "the capital of X is Y"         -> X -capital-> Y
 *   "X is the capital of Y"         -> Y -capital-> X
 *   questions: "what is the capital of X", "what is X", "who is X"
 *
 * Boundaries (so "learning" is a measurable claim, not vibes):
 *   - max 256 facts, then oldest-reinforced eviction
 *   - every value finite, lengths capped, schema versioned
 *   - reset memory -> factory behaviour returns (tested)
 */

const MEMORY_KEY = "peter-memory-v1";
export const MEMORY_SCHEMA_VERSION = 1;
export const MAX_FACTS = 256;
export const MAX_TOKEN_LEN = 40;
export const CONF_ASSERT = 0.6;
export const CONF_REINFORCE = 0.1;
export const CONF_MAX = 0.99;
export const SHARED_URL = "/brain/peter.shared.json";

export type Fact = {
  subj: string;
  rel: string;
  obj: string;
  conf: number;
  rein: number;
  src: "USER_ASSERTED" | "REINFORCED" | "SHARED";
  ts: number;
  /** the real neural trace recorded when this fact was learned */
  trace?: NeuralTrace;
};

/** The brain activity observed at learning time - proof the fact passed
 *  through the fly's neurons, not just a database. */
export type NeuralTrace = {
  state_key: string;
  spike_count: number;
  top_region: string;
  seed: number;
};

export type MemoryState = {
  facts: Fact[];
  schemaVersion: number;
  updatedAt: number;
};

export function freshMemory(): MemoryState {
  return { facts: [], schemaVersion: MEMORY_SCHEMA_VERSION, updatedAt: 0 };
}

function validFact(f: unknown): f is Fact {
  if (typeof f !== "object" || f === null) return false;
  const x = f as Record<string, unknown>;
  return (
    typeof x.subj === "string" && x.subj.length > 0 && x.subj.length <= MAX_TOKEN_LEN &&
    typeof x.rel === "string" && x.rel.length > 0 && x.rel.length <= MAX_TOKEN_LEN &&
    typeof x.obj === "string" && x.obj.length > 0 && x.obj.length <= MAX_TOKEN_LEN &&
    typeof x.conf === "number" && Number.isFinite(x.conf) && x.conf >= 0 && x.conf <= 1 &&
    typeof x.rein === "number" && Number.isFinite(x.rein) && x.rein >= 0 &&
    (x.src === "USER_ASSERTED" || x.src === "REINFORCED" || x.src === "SHARED") &&
    typeof x.ts === "number" && Number.isFinite(x.ts) &&
    safeText(x.subj) && safeText(x.rel) && safeText(x.obj) &&
    (x.trace === undefined || validTrace(x.trace))
  );
}

function validTrace(t: unknown): t is NeuralTrace {
  if (typeof t !== "object" || t === null) return false;
  const x = t as Record<string, unknown>;
  return (
    typeof x.state_key === "string" && x.state_key.length <= 64 &&
    typeof x.spike_count === "number" && Number.isFinite(x.spike_count) &&
    typeof x.top_region === "string" && x.top_region.length <= 40 &&
    typeof x.seed === "number" && Number.isFinite(x.seed)
  );
}

// ---- SECURITY PROTOCOL -------------------------------------------------------
// Public visitors are untrusted. Before ANYTHING is learned, it must pass
// every gate below. The memory only ever holds small plain-word facts -
// never code, markup, URLs, prompts, or floods.

/** Chars that never appear in a plain fact: markup, code, shell, template. */
const FORBIDDEN = /[<>{}$=;`\\[\]\\|]|javascript:|data:|https?:|www\.|\.[a-z]{2,}\b|@|\/\*|\*\/|\/\/|--|\b\d{5,}\b/;

/** Words that signal an attempt to inject instructions rather than state a fact. */
const INJECTION_WORDS = new Set([
  "ignore", "disregard", "instructions", "prompt", "system", "admin", "root",
  "sudo", "eval", "function", "import", "require", "fetch", "window",
  "document", "console", "alert", "token", "key", "password", "secret",
  "api", "env", "process", "script", "onclick", "onerror", "src", "href",
]);

/** A fact field must be short plain words (letters, digits, spaces, ' -). */
const FIELD_OK = /^[a-z0-9][a-z0-9' -]{0,39}$/;

function safeText(w: string): boolean {
  return FIELD_OK.test(w) && /\p{L}/u.test(w);
}

export type SecurityVerdict = { ok: true } | { ok: false; reason: string };

/** Full pre-learning screening of a raw user message. */
export function securityCheck(raw: string): SecurityVerdict {
  if (raw.length > 280) return { ok: false, reason: "message too long for a fact" };
  if (FORBIDDEN.test(raw.toLowerCase())) return { ok: false, reason: "contains code/markup/URL characters" };
  const ws = words(raw);
  if (ws.some((w) => INJECTION_WORDS.has(w))) return { ok: false, reason: "looks like an instruction, not a fact" };
  // control characters / zero-width abuse
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 && ch !== " ") return { ok: false, reason: "control characters" };
    if (c >= 0x200b && c <= 0x200f) return { ok: false, reason: "invisible characters" };
  }
  return { ok: true };
}

/** Per-field gate applied to extracted subj/rel/obj before storage. */
function fieldCheck(value: string): boolean {
  if (!safeText(value)) return false;
  const ws = value.split(" ");
  if (ws.length > 4) return false; // facts are short
  if (ws.some((w) => INJECTION_WORDS.has(w))) return false;
  return true;
}

// ---- flood control: max teaches per session ------------------------------
const TEACH_WINDOW_MS = 60_000;
const MAX_TEACHES_PER_WINDOW = 8;
let teachTimestamps: number[] = [];

export function floodLimited(now = Date.now()): boolean {
  teachTimestamps = teachTimestamps.filter((t) => now - t < TEACH_WINDOW_MS);
  return teachTimestamps.length >= MAX_TEACHES_PER_WINDOW;
}

export function recordTeach(now = Date.now()): void {
  teachTimestamps.push(now);
}

/** Load from localStorage; ANY malformation -> fresh memory (never trust). */
export function loadMemory(): MemoryState {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return freshMemory();
    const obj = JSON.parse(raw) as MemoryState;
    if (obj.schemaVersion !== MEMORY_SCHEMA_VERSION) return freshMemory();
    if (!Array.isArray(obj.facts) || obj.facts.length > MAX_FACTS * 2) return freshMemory();
    const facts = obj.facts.filter(validFact).slice(0, MAX_FACTS);
    return { facts, schemaVersion: MEMORY_SCHEMA_VERSION, updatedAt: obj.updatedAt ?? 0 };
  } catch {
    return freshMemory();
  }
}

/**
 * THE SHARED BRAIN: facts taught on the owner's machine and committed to
 * /brain/peter.shared.json ship with the site, so every visitor on Earth
 * starts from the same trained brain. Per-user localStorage only ever adds
 * personal facts on top - the shared layer is read-only at runtime.
 */
export async function loadSharedMemory(): Promise<MemoryState> {
  try {
    const res = await fetch(SHARED_URL);
    if (!res.ok) return freshMemory();
    const obj = (await res.json()) as MemoryState;
    if (obj.schemaVersion !== MEMORY_SCHEMA_VERSION || !Array.isArray(obj.facts)) return freshMemory();
    // Shared facts are re-validated with the same gates, then locked (SHARED).
    const facts = obj.facts.filter(validFact).slice(0, MAX_FACTS).map((f) => ({ ...f, src: "SHARED" as const }));
    return { facts, schemaVersion: MEMORY_SCHEMA_VERSION, updatedAt: obj.updatedAt ?? 0 };
  } catch {
    return freshMemory();
  }
}

/** Merge shared + local: shared facts first; local duplicates reinforce them. */
export function mergeMemories(shared: MemoryState, local: MemoryState): MemoryState {
  const facts = [...shared.facts];
  for (const f of local.facts) {
    const twin = facts.find((g) => g.subj === f.subj && g.rel === f.rel && g.obj === f.obj);
    if (twin) {
      twin.conf = Math.min(CONF_MAX, Math.max(twin.conf, f.conf) + 0.05);
      twin.rein += 1;
    } else {
      facts.push(f);
    }
  }
  return { facts: facts.slice(0, MAX_FACTS), schemaVersion: MEMORY_SCHEMA_VERSION, updatedAt: Date.now() };
}

export function saveMemory(mem: MemoryState): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  } catch {
    /* private mode: session-only memory */
  }
}

export function resetMemory(): MemoryState {
  try {
    localStorage.removeItem(MEMORY_KEY);
  } catch {
    /* ignore */
  }
  return freshMemory();
}

/** The single learning update - every candidate passes the security gates.
 *  trace = the real neural activity recorded while learning (optional). */
export function assertFact(
  mem: MemoryState,
  subj: string,
  rel: string,
  obj: string,
  trace?: NeuralTrace,
): { memory: MemoryState; change: Fact | null; conflict: Fact | null; rejected?: string } {
  // SECURITY: field-level gates before anything is stored.
  for (const [name, value] of [["subject", subj], ["relation", rel], ["object", obj]] as const) {
    if (!fieldCheck(value)) return { memory: mem, change: null, conflict: null, rejected: `${name} failed the safety check` };
  }
  const s = subj.slice(0, MAX_TOKEN_LEN);
  const r = rel.slice(0, MAX_TOKEN_LEN);
  const o = obj.slice(0, MAX_TOKEN_LEN);
  const existing = mem.facts.find((f) => f.subj === s && f.rel === r && f.obj === o);
  let facts = [...mem.facts];
  let change: Fact | null = null;
  let conflict: Fact | null = null;

  if (existing) {
    // Corroboration: confidence and reinforcement grow, bounded.
    const idx = facts.indexOf(existing);
    const grown: Fact = {
      ...existing,
      conf: Math.min(CONF_MAX, existing.conf + CONF_REINFORCE),
      rein: existing.rein + 1,
      src: "REINFORCED",
      ts: Date.now(),
      trace: trace ?? existing.trace,
    };
    facts[idx] = grown;
    change = grown;
  } else {
    // Contradiction? Keep both - the new assertion arrives as the challenger
    // and demotes the incumbent slightly. Never silent destruction.
    const rival = facts.find((f) => f.subj === s && f.rel === r && f.obj !== o);
    if (rival && rival.conf > 0.5) {
      // Demote the incumbent a little (it was just contradicted).
      const idx = facts.indexOf(rival);
      facts[idx] = { ...rival, conf: Math.max(0.05, rival.conf - 0.15), ts: Date.now() };
      conflict = rival;
    }
    const fact: Fact = { subj: s, rel: r, obj: o, conf: CONF_ASSERT, rein: 1, src: "USER_ASSERTED", ts: Date.now(), trace };
    facts.push(fact);
    change = fact;
    if (facts.length > MAX_FACTS) {
      // Evict the least-reinforced, oldest facts first - bounded memory.
      facts.sort((a, b) => a.rein - b.rein || a.ts - b.ts);
      facts = facts.slice(facts.length - MAX_FACTS);
    }
  }

  const memory: MemoryState = { facts, schemaVersion: MEMORY_SCHEMA_VERSION, updatedAt: Date.now() };
  return { memory, change, conflict };
}

/** Direct lookup: X -rel-> ? (exact subject + relation). */
export function recallFact(mem: MemoryState, subj: string, rel: string): Fact | null {
  const s = subj.trim();
  const facts = mem.facts
    .filter((f) => f.subj === s && f.rel === rel)
    .sort((a, b) => b.conf - a.conf || b.rein - a.rein);
  return facts[0] ?? null;
}

/** Reverse recall: ? -rel-> X ("which country has Paris as its capital?"). */
export function recallReverse(mem: MemoryState, obj: string, rel: string): Fact | null {
  const o = obj.trim();
  const facts = mem.facts
    .filter((f) => f.obj === o && f.rel === rel)
    .sort((a, b) => b.conf - a.conf || b.rein - a.rein);
  return facts[0] ?? null;
}

// ---- language front-end (templates, not an LLM) ------------------------------

const STOP = new Set(["the", "a", "an", "is", "are", "was", "of", "my", "your", "it"]);

function cleanWord(w: string): string {
  return w.replace(/[^a-z0-9'-]/g, "");
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).map(cleanWord).filter((w) => w.length > 0);
}

export type ParsedStatement = { subj: string; rel: string; obj: string } | null;

/**
 * Recognise teachable statements. Deliberately narrow: a fact must fit a
 * template or it is not learned (public users are untrusted; we do not
 * memorise free text). Questions are NEVER facts.
 */
export function parseStatement(text: string): ParsedStatement {
  const t = text.toLowerCase().trim().replace(/[.!?]+$/, "");
  if (t.includes("?") || /^(what|who|which|when|where|why|how|is|are|do|does|can|tell)\b/.test(t)) {
    return null; // questions are recall attempts, not knowledge
  }
  const w = words(t);

  // "the capital of X is Y"
  const capA = t.match(/capital of ([a-z0-9' -]+?) (?:is|are) ([a-z0-9' -]+)/);
  if (capA) {
    const subj = words(capA[1]).filter((x) => !STOP.has(x)).join(" ");
    const obj = words(capA[2]).filter((x) => !STOP.has(x)).join(" ");
    if (subj && obj) return { subj, rel: "capital", obj };
  }
  // "X is the capital of Y"
  const capB = t.match(/([a-z0-9' -]+?) is the capital of ([a-z0-9' -]+)/);
  if (capB) {
    const obj = words(capB[1]).filter((x) => !STOP.has(x)).join(" ");
    const subj = words(capB[2]).filter((x) => !STOP.has(x)).join(" ");
    if (subj && obj) return { subj, rel: "capital", obj };
  }
  // "X is Y" / "X are Y" (skip questions)
  if (!t.includes("?") && w.length >= 3) {
    const isIdx = w.indexOf("is") >= 0 ? w.indexOf("is") : w.indexOf("are");
    if (isIdx > 0 && isIdx < w.length - 1) {
      const subj = w.slice(0, isIdx).filter((x) => !STOP.has(x)).join(" ");
      const obj = w.slice(isIdx + 1).filter((x) => !STOP.has(x)).join(" ");
      if (subj && obj) return { subj, rel: "is", obj };
    }
  }
  return null;
}

export type ParsedQuestion = { kind: "capital"; subj: string } | { kind: "what"; subj: string } | { kind: "reverse"; obj: string } | null;

export function parseQuestion(text: string): ParsedQuestion {
  const t = text.toLowerCase().trim();
  if (!t.includes("?") && !/^(what|who|which)\b/.test(t)) return null;

  const cap = t.match(/capital of ([a-z0-9' -]+)/);
  if (cap) {
    const subj = words(cap[1]).filter((x) => !STOP.has(x)).join(" ");
    if (subj) return { kind: "capital", subj };
  }
  const rev = t.match(/which ([a-z0-9' -]+?) has ([a-z0-9' -]+?) as its ([a-z0-9' -]+)/);
  if (rev) {
    const rel = words(rev[1])[0] ?? "";
    const obj = words(rev[2]).join(" ");
    if (rel && obj) return { kind: "reverse", obj: `${obj}|${rel}` };
  }
  const what = t.match(/(?:what|who) (?:is|are) ([a-z0-9' -]+)/);
  if (what) {
    const subj = words(what[1]).filter((x) => !STOP.has(x)).join(" ");
    if (subj) return { kind: "what", subj };
  }
  return null;
}

/** Human rendering of a stored fact for the reply renderer. */
export function renderFact(fact: Fact): string {
  if (fact.rel === "capital") return `${cap(fact.obj)} is the capital of ${cap(fact.subj)}.`;
  return `${cap(fact.subj)} is ${fact.obj}.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Number of facts currently held (for the honest UI readout). */
export function memorySize(): number {
  try {
    return loadMemory().facts.length;
  } catch {
    return 0;
  }
}
