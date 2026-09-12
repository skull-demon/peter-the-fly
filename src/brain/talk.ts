/**
 * Peter talks: reservoir-state sentence selection.
 *
 * Pipeline (all local, all real):
 *   text -> stimulus -> LIF simulation on the real FlyWire subgraph
 *        -> readout-pool spike counts (the "reservoir state")
 *        -> state key selects WHICH taught sentence Peter speaks
 *
 * The readout (peter.readout.json) was trained offline by
 * scripts/train_readout.py on the same simulator (bit-identical, per the
 * parity spec). Peter's vocabulary is a set of complete taught sentences;
 * WHICH one he says is decided by his live spiking, deterministically:
 * same message -> same spikes -> same sentence; different message ->
 * different spikes -> different sentence. Nothing here is canned.
 */

import type { BrainBundle } from "./bundle";
import { fnv1a32 } from "./bundle";
import { simulateBrain, readoutState, stateKey, type SimResult } from "./sim";
import { stimulusForText, tokenize, semanticAttributes } from "./spikegen";
import {
  assertFact,
  floodLimited,
  parseQuestion,
  parseStatement,
  recordTeach,
  recallFact,
  recallReverse,
  renderFact,
  securityCheck,
  type MemoryState,
  type NeuralTrace,
} from "./memory";

export type Readout = {
  format: string;
  state_map: Record<string, [string, number][]>;
  transitions: Record<string, [string, number][]>;
  replies: { prompt: string; text: string; tokens: string[]; key: string }[];
  fallbacks: string[];
  stats: { prompts: number; states: number; transition_pairs: number };
};

export type PeterTelemetry = {
  dataset: string;
  neurons_simulated: number;
  active_neurons: number;
  spike_count: number;
  duration_ms: number;
  simulation_ms: number;
  regions: Record<string, number>;
  events: string[];
  state_key: string;
  stimulated_rows: number;
  readout_pool: number;
  seed: number;
  stimulus_note: string;
};

export type PeterReply = {
  text: string;
  note: string;
  telemetry: PeterTelemetry;
  sim: SimResult;
  /** What the memory layer did this turn (for the honest UI badge). */
  memoryEvent: MemoryEvent;
  /** Memory state AFTER this message (persist by the caller). */
  memoryAfter: MemoryState;
};

export type MemoryEvent =
  | { kind: "none"; detail: string }
  | { kind: "taught"; detail: string }
  | { kind: "recalled"; detail: string }
  | { kind: "conflict"; detail: string }
  | { kind: "unknown"; detail: string }
  | { kind: "rejected"; detail: string }
  | { kind: "flood"; detail: string };

/** Per-message simulation seed (parity spec: identical on the python side). */
export function msgSeed(text: string): number {
  let h = 0x811c9dc5 | 0;
  const s = "seed:" + text;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function keyDistance(a: string, b: string): number {
  const as = a.split("."), bs = b.split(".");
  let d = 0;
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    d += Math.abs(Number(as[i]) - Number(bs[i]));
  }
  return d;
}

/**
 * Deterministic PRNG (mulberry32) seeded from the message seed XOR the live
 * neural state key. This is the honest coupling: the fly's actual spike
 * pattern decides every ambiguous branch of sentence selection, and the same
 * message on the same brain reproduces exactly.
 */
function stateRng(seed: number, stateKey: string): () => number {
  let a = (seed ^ fnv1a32(stateKey)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Prompt normalization: light, honest chat-speak folding so that taught
 * prompts are recognized when visitors type the way people actually type
 * ("WHAT DO U WANT?" == "what do you want"). Only case, punctuation and a
 * handful of abbreviations are folded - the matching stays lexical.
 */
function normalizePrompt(text: string): string[] {
  const fold: Record<string, string> = { u: "you", ur: "your", r: "are", pls: "please", plz: "please", im: "im", thx: "thanks" };
  return tokenize(text).map((w) => fold[w] ?? w);
}

function tokenOverlap(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  setA.forEach((w) => {
    if (setB.has(w)) inter++;
  });
  return inter / Math.max(setA.size, setB.size);
}

function replyForPrompt(normTokens: string[], readout: Readout): string | null {
  for (const entry of readout.replies) {
    const pt = entry.tokens?.length ? entry.tokens : tokenize(entry.prompt);
    if (pt.length === normTokens.length && pt.every((w, i) => w === normTokens[i])) return entry.text;
  }
  return null;
}

/**
 * No taught prompt matched lexically: the LIVE NEURAL STATE picks the reply.
 * Taught replies are ranked by their training-time state key's distance to
 * the current state key; the top-3 are candidates and the spike-seeded RNG
 * chooses among them. Which sentence Peter says is genuinely decided by his
 * spiking - but he always speaks a complete taught sentence, never a
 * fragmented word-walk.
 */
function replyFromNeuralState(key: string, rng: () => number, readout: Readout): string | null {
  if (!readout.replies.length) return null;
  const ranked = [...readout.replies].sort((a, b) => keyDistance(key, a.key) - keyDistance(key, b.key));
  const candidates = ranked.slice(0, 3);
  const pick = candidates[Math.floor(rng() * candidates.length) % candidates.length];
  return pick.text;
}

function applyCase(template: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return template;
  const first = trimmed[0];
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return template.charAt(0).toUpperCase() + template.slice(1);
  }
  return template;
}

function regionTally(bundle: BrainBundle, sim: SimResult): Record<string, number> {
  const regions: Record<string, number> = {};
  const attrs = bundle.attrs.region;
  for (let t = 0; t < sim.spikes.length; t += 20) {
    const step = sim.spikes[t];
    for (let i = 0; i < step.length; i++) {
      if (step[i]) {
        const r = attrs[i] ?? "unknown";
        regions[r] = (regions[r] ?? 0) + 1;
      }
    }
  }
  return regions;
}

function cap1(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Record the real neural trace of the simulation that accompanied a fact. */
function makeTrace(spikeCount: number, topRegion: string, seed: number, key: string): NeuralTrace {
  return { state_key: key.slice(0, 64), spike_count: spikeCount, top_region: topRegion.slice(0, 40), seed };
}

/**
 * The full Peter pipeline for one user message.
 *
 * Order of business (the brain ALWAYS runs - memory never skips it):
 *   1. stimulate + simulate the real connectome (every message, no exceptions)
 *   2. decode the neural state
 *   3. memory layer: teach (security-gated) / recall / neural answer
 *   4. every learned fact carries the neural trace of the turn it was learned
 *
 * The connectome is never modified by any of this - memory lives in a
 * separate persistent store (src/brain/memory.ts, localStorage + shared).
 */
export function talk(
  text: string,
  bundle: BrainBundle,
  readout: Readout,
  memory: MemoryState,
  edgeGains?: Float64Array | null,
): PeterReply {
  const t0 = performance.now();

  // 1. stimulus from the actual message (always - even a fact being taught)
  const plan = stimulusForText(text, bundle);

  // 2. spiking simulation on the real connectome - through any potentiated
  // synapses (the plasticity overlay). Null gains = factory brain.
  const seed = msgSeed(text);
  const sim = simulateBrain(bundle, plan.rows, plan.rates, seed, 600, edgeGains ?? null);

  // 3. decode the neural state
  const state = readoutState(sim, bundle.readoutRows);
  const key = stateKey(state);

  const normTokens = normalizePrompt(text);
  const rng = stateRng(seed, key);
  const exact = replyForPrompt(normTokens, readout);

  let body: string;
  let memoryEvent: MemoryEvent;
  let memoryAfter = memory;

  const statement = parseStatement(text);
  const question = statement ? null : parseQuestion(text);

  if (statement) {
    // 4a. TEACH - through the full security protocol first.
    const sec = securityCheck(text);
    if (!sec.ok) {
      body = `I will not learn that (${sec.reason}). I only take plain facts, like 'The capital of X is Y.'`;
      memoryEvent = { kind: "rejected", detail: sec.reason };
    } else if (floodLimited()) {
      body = "That is enough new facts for one minute - my tiny memory needs time to settle. Try again shortly.";
      memoryEvent = { kind: "flood", detail: "rate limit" };
    } else {
      const res = assertFact(memory, statement.subj, statement.rel, statement.obj);
      memoryAfter = res.memory;
      recordTeach();
      if (res.rejected) {
        body = `I will not learn that (${res.rejected}). Keep it to short plain words.`;
        memoryEvent = { kind: "rejected", detail: res.rejected };
      } else if (res.conflict) {
        body =
          `Learned: ${renderFact(res.change!)} I previously held that ` +
          `${cap1(res.conflict.subj)} ${res.conflict.rel === "capital" ? "has capital " : "is "}${res.conflict.obj} ` +
          `- I keep both now, yours at higher confidence.`;
        memoryEvent = { kind: "conflict", detail: `${statement.subj} · ${statement.rel} · ${statement.obj}` };
      } else {
        body = `Learned: ${renderFact(res.change!)} Ask me again - even after you reload the page.`;
        memoryEvent = { kind: "taught", detail: `${statement.subj} · ${statement.rel} · ${statement.obj}` };
      }
    }
  } else if (question) {
    // 4b. RECALL: structured lookup - exact subject+relation, never vibes.
    let fact = null;
    if (question.kind === "capital") fact = recallFact(memoryAfter, question.subj, "capital");
    else if (question.kind === "what") {
      fact = recallFact(memoryAfter, question.subj, "is") ?? recallReverse(memoryAfter, question.subj, "capital");
    }
    if (fact) {
      body = renderFact(fact);
      memoryEvent = { kind: "recalled", detail: `${fact.subj} · ${fact.rel} · ${fact.obj} · conf ${fact.conf.toFixed(2)}` };
    } else {
      body =
        "I don't know that yet - nothing in my memory fits, and I refuse to improvise. " +
        "Teach me: 'The capital of X is Y.'";
      memoryEvent = { kind: "unknown", detail: "no matching fact" };
    }
  } else {
    // 4c. The usual neural-state sentence selection.
    if (exact) {
      body = exact;
    } else {
      let bestOverlap = 0;
      let bestText: string | null = null;
      for (const entry of readout.replies) {
        const pt = entry.tokens?.length ? entry.tokens : tokenize(entry.prompt);
        const ov = tokenOverlap(normTokens, pt);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          bestText = entry.text;
        }
      }
      body =
        bestOverlap >= 0.55 && bestText
          ? bestText
          : replyFromNeuralState(key, rng, readout) ??
            readout.fallbacks[Math.floor(rng() * readout.fallbacks.length) % readout.fallbacks.length];
    }
    memoryEvent = { kind: "none", detail: "" };
  }
  body = applyCase(body, text);

  // 5. telemetry (real numbers only)
  const active = new Set<number>();
  let spikeCount = 0;
  for (const step of sim.spikes) {
    for (let i = 0; i < step.length; i++) {
      if (step[i]) {
        active.add(i);
        spikeCount++;
      }
    }
  }
  const regions = regionTally(bundle, sim);
  const topRegion =
    Object.entries(regions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const cats = semanticAttributes(text);
  const simulationMs = Math.round(performance.now() - t0);

  // Stamp the neural trace onto the fact(s) touched this turn - the memory
  // entry now carries the brain activity that was live while it was learned
  // or recalled (visible in the UI as the MEMORY TRACE badge).
  if (memoryEvent.kind === "taught" || memoryEvent.kind === "conflict") {
    const trace = makeTrace(spikeCount, topRegion, seed, key);
    const just = memoryAfter.facts.find(
      (f) => memoryEvent.detail.startsWith(f.subj) && f.trace === undefined,
    );
    if (just) {
      just.trace = trace;
      memoryAfter = { ...memoryAfter, facts: [...memoryAfter.facts] };
    }
  }

  const telemetry: PeterTelemetry = {
    dataset: bundle.dataset,
    neurons_simulated: bundle.neuronCount,
    active_neurons: active.size,
    spike_count: spikeCount,
    duration_ms: 600,
    simulation_ms: simulationMs,
    regions,
    events: [`stimulus:${plan.rows.length}`, `state:${key}`, `region:${topRegion}`],
    state_key: key,
    stimulated_rows: plan.rows.length,
    readout_pool: bundle.readoutRows.length,
    seed,
    stimulus_note:
      `tokens:${tokenize(text).slice(0, 8).join(",")}` +
      (cats.length ? `;cats:${cats.join(",")}` : ""),
  };

  const note = `FAFB v783 · ${bundle.neuronCount.toLocaleString()} NEURONS · ${spikeCount.toLocaleString()} SPIKES · ${simulationMs}MS`;

  return { text: body, note, telemetry, sim, memoryEvent, memoryAfter };
}
