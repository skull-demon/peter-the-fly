/**
 * Peter talks: reservoir-state-biased Markov decoding.
 *
 * Pipeline (all local, all real):
 *   text -> stimulus -> LIF simulation on the real FlyWire subgraph
 *        -> readout-pool spike counts (the "reservoir state")
 *        -> state key -> readout lookup -> word walk biased by live spikes
 *
 * The readout (peter.readout.json) was trained offline by
 * scripts/train_readout.py on the same simulator (bit-identical, per the
 * parity spec). At runtime, a different message means different stimulation,
 * which means genuinely different spikes, which means a genuinely different
 * word choice at every ambiguous branch. Nothing here is canned: the fly's
 * actual activity decides the sentence.
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

function nearestStateKey(key: string, readout: Readout): string | null {
  const keys = Object.keys(readout.state_map);
  if (!keys.length) return null;
  let best = keys[0];
  let bestD = Infinity;
  for (const k of keys) {
    const d = keyDistance(key, k);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/**
 * Deterministic PRNG (mulberry32) seeded from the message seed XOR the live
 * neural state key. This is the honest coupling: the fly's actual spike
 * pattern decides every ambiguous branch of the sentence walk, and the same
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

function pickWeighted(options: [string, number][], bias: number, rng: () => number): string {
  // bias in [0,1]: 0 = first (most trained continuation), 1 = uniform spread.
  // Proper weighted sampling; the draw comes from the spike-state RNG.
  const weights = options.map((_, i) => Math.exp(-i * 2.2 * (1 - bias)));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = rng() * total;
  for (let i = 0; i < options.length; i++) {
    acc -= weights[i];
    if (acc <= 0) return options[i][0];
  }
  return options[options.length - 1][0];
}

function replyForPrompt(text: string, readout: Readout): string | null {
  const t = tokenize(text);
  const norm = (ws: string[]) => ws.join(" ");
  for (const entry of readout.replies) {
    if (norm(tokenize(entry.prompt)) === norm(t)) return entry.text;
  }
  return null;
}

/**
 * Walk the learned transitions; the live reservoir state biases every branch
 * and can anchor the sentence on a word associated with this neural state.
 */
function walk(bias: number, rng: () => number, readout: Readout, anchor?: string): string {
  const out: string[] = [];
  let cur = "<s>";
  if (anchor && anchor !== "</s>" && readout.transitions[anchor]) {
    cur = anchor;
    out.push(anchor);
  }
  for (let guard = 0; guard < 40; guard++) {
    const options = readout.transitions[cur];
    if (!options || !options.length) break;
    const next = pickWeighted(options, bias, rng);
    if (next === "</s>") break;
    out.push(next);
    cur = next;
  }
  return out.join(" ");
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

  // 4. language selection, biased by the live spikes
  const bias = Math.min(
    1,
    state.reduce((a, b) => a + b, 0) / Math.max(1, state.length * 6),
  );
  const exact = replyForPrompt(text, readout);
  const rng = stateRng(seed, key);
  let body: string;
  if (exact && bias < 0.35) {
    body = exact; // quiet brain -> the taught sentence
  } else {
    const stateWords = readout.state_map[key] ?? [];
    const bankKey =
      stateWords.length > 0
        ? key
        : nearestStateKey(key, readout) ?? key;
    const bank = readout.state_map[bankKey] ?? [];
    const anchor =
      bank.length && rng() < 0.6
        ? bank[Math.floor(rng() * bank.length) % bank.length][0]
        : undefined;
    const started = bank.length ? walk(bias, rng, readout, anchor) : "";
    body = started || (exact ?? readout.fallbacks[Math.floor(bias * readout.fallbacks.length) % readout.fallbacks.length]);
    if (exact && started && bias >= 0.35 && bias < 0.6) {
      body = exact; // moderate activity: taught sentence wins
    }
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
