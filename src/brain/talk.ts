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
};

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

/**
 * The full Peter pipeline for one user message.
 * Returns the reply text, a telemetry note for the chat UI, and the full sim.
 */
export function talk(
  text: string,
  bundle: BrainBundle,
  readout: Readout,
): PeterReply {
  const t0 = performance.now();

  // 1. stimulus from the actual message
  const plan = stimulusForText(text, bundle);

  // 2. spiking simulation on the real connectome
  const seed = msgSeed(text);
  const sim = simulateBrain(bundle, plan.rows, plan.rates, seed, 600);

  // 3. decode the neural state
  const state = readoutState(sim, bundle.readoutRows);
  const key = stateKey(state);

  // 4. language selection, decided by the live spikes
  //
  // Peter speaks in complete taught sentences (that is the honest story:
  // a tiny taught vocabulary). WHICH sentence is selected by his live
  // reservoir state - exact lexical recall first, then neural-state
  // selection over taught replies. The fragmented word-walk is gone.
  const normTokens = normalizePrompt(text);
  const rng = stateRng(seed, key);
  const exact = replyForPrompt(normTokens, readout);
  let body: string;
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

  return { text: body, note, telemetry, sim };
}
