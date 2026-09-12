/**
 * Token -> stimulus projection. TS twin of python/brainpack/spikegen.py.
 * Parity-critical: same hash, same categories, same rates.
 */

import type { BrainBundle } from "./bundle";
import { fnv1a32 } from "./bundle";

export const BASE_HZ = 6.0;
export const MAX_RATE_HZ = 80.0;
export const ACTIVE_FRACTION = 0.10;
export const WINDOW_MS = 120;

export const SEMANTIC_CATEGORIES: Record<string, string[]> = {
  question: ["?"],
  greeting: ["hello", "hi", "hey", "morning", "evening", "yo"],
  politeness: ["please", "thank", "thanks", "sorry"],
  self: ["you", "your", "yourself", "peter", "fly", "who"],
  human: ["i", "me", "my", "we", "us", "human", "people"],
  sensation: ["see", "look", "world", "light", "color", "smell", "hear", "feel"],
  food: ["sugar", "food", "eat", "hungry", "sweet", "fruit", "apple"],
  motion: ["fly", "flying", "wing", "wings", "move", "walk", "jump"],
  emotion: ["love", "afraid", "happy", "sad", "like", "hate", "want"],
  negation: ["not", "no", "never", "dont", "cant"],
};

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9']+/g);
  return matches ? matches.filter((t) => t.length > 0) : [];
}

export function semanticAttributes(text: string): string[] {
  const toks = new Set(tokenize(text));
  const found: string[] = [];
  for (const [cat, words] of Object.entries(SEMANTIC_CATEGORIES)) {
    if (cat === "question") continue;
    if (words.some((w) => toks.has(w))) found.push(cat);
  }
  if (text.includes("?")) found.push("question");
  return found.sort();
}

/** Deterministically pick input-pool neurons for a token (parity spec). */
export function tokenRows(token: string, inputPool: Uint32Array, maxNeurons = 24): number[] {
  const idx: number[] = [];
  let salt = 0;
  while (idx.length < maxNeurons && salt <= 512) {
    const h = fnv1a32(`${token}#${salt}`);
    const i = inputPool[h % inputPool.length];
    if (!idx.includes(i)) idx.push(i);
    salt++;
  }
  return idx;
}

export type StimulusPlan = { rows: Uint32Array; rates: Float64Array; windowMs: number };

export function stimulusForText(text: string, bundle: BrainBundle): StimulusPlan {
  const pool = bundle.inputRows;
  const rates = new Map<number, number>();

  for (const tok of tokenize(text)) {
    for (const row of tokenRows(tok, pool)) {
      rates.set(row, Math.min(MAX_RATE_HZ, (rates.get(row) ?? 0) + BASE_HZ));
    }
  }

  for (const cat of semanticAttributes(text)) {
    const h = fnv1a32(`category:${cat}`);
    const k = Math.max(4, Math.floor(pool.length / 40));
    for (let j = 0; j < k; j++) {
      const row = pool[(h + j * 7919) % pool.length];
      rates.set(row, Math.min(MAX_RATE_HZ, (rates.get(row) ?? 0) + MAX_RATE_HZ * 0.25));
    }
  }

  // quiet background subset (same rule as python side)
  const nBg = Math.max(1, Math.floor((pool.length * ACTIVE_FRACTION) / 4));
  const h0 = fnv1a32("background|" + text);
  for (let k = 0; k < nBg; k++) {
    const row = pool[(h0 + k * 104729) % pool.length];
    if (!rates.has(row)) rates.set(row, BASE_HZ * 0.5);
  }

  const rows = Uint32Array.from([...rates.keys()].sort((a, b) => a - b));
  const rr = Float64Array.from(rows, (r) => rates.get(r) ?? 0);
  return { rows, rates: rr, windowMs: WINDOW_MS };
}
