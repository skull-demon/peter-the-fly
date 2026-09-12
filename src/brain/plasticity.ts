/**
 * Synaptic plasticity - the learning that lives IN the brain.
 *
 * A human hippocampus does not write facts to a text file; experience
 * strengthens the synapses between the neurons that participated. That is
 * what this module does to Peter:
 *
 *   effective_weight = base_flywire_weight x plastic_modifier
 *
 * - The canonical FlyWire graph is NEVER touched (it is read-only truth).
 * - The overlay is SPARSE: only synapses whose modifier != 1.0 are stored.
 * - Modifiers are clamped to [MIN_MOD, MAX_MOD] (+-25%) so learning can
 *   never destabilise the reservoir or fake enormous changes.
 * - Hebbian rule: when a teachable moment happens, every synapse between
 *   two neurons THAT ACTUALLY SPIKED in that simulation is potentiated.
 * - The state persists (localStorage) and survives reload - like memory.
 *
 * Honest claim, for the docs: "a fixed FlyWire-derived spiking reservoir
 * coupled to a persistent plasticity layer whose parameters adapt online."
 */

import type { BrainBundle } from "./bundle";
import type { SimResult } from "./sim";

export const PLASTIC_SCHEMA_VERSION = 1;
export const MIN_MOD = 0.75;
export const MAX_MOD = 1.25;
export const ETA = 0.06; // potentiation step per co-activation
export const MAX_MODIFIED_SYNAPSES = 40_000; // hard bound on overlay size
export const MAX_UPDATES_PER_TURN = 4_000; // bound on work per message

const PLASTIC_KEY = "peter-plastic-v1";

export type PlasticState = {
  /** edge index -> weight modifier (sparse; absent means 1.0) */
  mods: Map<number, number>;
  /** how many potentiation events have ever been applied */
  updates: number;
  schemaVersion: number;
};

export function freshPlastic(): PlasticState {
  return { mods: new Map(), updates: 0, schemaVersion: PLASTIC_SCHEMA_VERSION };
}

function validMods(raw: unknown): Map<number, number> | null {
  if (!Array.isArray(raw) || raw.length % 2 !== 0) return null;
  const mods = new Map<number, number>();
  for (let i = 0; i < raw.length; i += 2) {
    const e = raw[i];
    const m = raw[i + 1];
    if (!Number.isInteger(e) || e < 0) return null;
    if (typeof m !== "number" || !Number.isFinite(m) || m < MIN_MOD || m > MAX_MOD) return null;
    mods.set(e, m);
    if (mods.size > MAX_MODIFIED_SYNAPSES) return null;
  }
  return mods;
}

export function loadPlasticity(): PlasticState {
  try {
    const raw = localStorage.getItem(PLASTIC_KEY);
    if (!raw) return freshPlastic();
    const obj = JSON.parse(raw) as { mods?: unknown; updates?: unknown; schemaVersion?: unknown };
    if (obj.schemaVersion !== PLASTIC_SCHEMA_VERSION) return freshPlastic();
    const mods = validMods(obj.mods);
    if (!mods) return freshPlastic();
    const updates = typeof obj.updates === "number" && Number.isFinite(obj.updates) ? obj.updates : 0;
    return { mods, updates, schemaVersion: PLASTIC_SCHEMA_VERSION };
  } catch {
    return freshPlastic();
  }
}

export function savePlasticity(p: PlasticState): void {
  try {
    const flat: number[] = [];
    for (const [e, m] of p.mods) flat.push(e, Math.round(m * 10000) / 10000);
    localStorage.setItem(PLASTIC_KEY, JSON.stringify({ mods: flat, updates: p.updates, schemaVersion: PLASTIC_SCHEMA_VERSION }));
  } catch {
    /* storage unavailable: session-only plasticity */
  }
}

export function resetPlasticity(): PlasticState {
  try {
    localStorage.removeItem(PLASTIC_KEY);
  } catch {
    /* ignore */
  }
  return freshPlastic();
}

/** Clone with copy-on-write semantics so React state stays sane. */
export function clonePlastic(p: PlasticState): PlasticState {
  return { mods: new Map(p.mods), updates: p.updates, schemaVersion: p.schemaVersion };
}

/**
 * HEBBIAN POTENTIATION: every synapse whose source AND target both spiked
 * during `sim` is strengthened by ETA (clamped). This is the "neurons that
 * fire together, wire together" pass - applied only to enabled edges, only
 * within bounds, and counted honestly.
 */
export function potentiate(
  bundle: BrainBundle,
  sim: SimResult,
  plastic: PlasticState,
): { next: PlasticState; changed: number } {
  const next = clonePlastic(plastic);
  let changed = 0;
  let work = 0;

  // collect the fired set once
  const fired = new Set<number>();
  for (const step of sim.spikes) {
    for (let i = 0; i < step.length; i++) if (step[i]) fired.add(i);
  }
  if (fired.size === 0) return { next, changed: 0 };

  // edges leaving a fired neuron toward another fired neuron
  for (let e = 0; e < bundle.edgeCount && changed < MAX_UPDATES_PER_TURN; e++) {
    if (!bundle.edgesEnabled[e]) continue;
    const src = bundle.edgesSrc[e];
    const tgt = bundle.edgesTgt[e];
    if (!fired.has(src) || !fired.has(tgt)) continue;
    work++;
    const cur = next.mods.get(e) ?? 1.0;
    const bumped = Math.min(MAX_MOD, cur + ETA);
    if (bumped !== cur) {
      next.mods.set(e, bumped);
      changed++;
    }
    if (next.mods.size > MAX_MODIFIED_SYNAPSES) break;
  }
  next.updates += changed;
  return { next, changed };
}

/** The modifier for edge e (1.0 when untouched). */
export function modifierOf(p: PlasticState, e: number): number {
  return p.mods.get(e) ?? 1.0;
}
