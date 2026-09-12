export type Role = "you" | "fly";

export type Message = {
  id: number;
  role: Role;
  text: string;
  /** small technical annotation shown under a fly reply */
  note?: string;
};

/* ------------------------------------------------------------------ */
/* The ONLY answering path: the real Peter pipeline.                   */
/* message -> stimulus -> LIF spikes on the FlyWire v783 subnetwork    */
/*          -> reservoir state -> state-biased word walk               */
/* There is no scripted fallback. If the brain bundle cannot load,     */
/* Peter says so plainly. Nothing is ever faked.                       */
/* ------------------------------------------------------------------ */
import { loadPeterRuntime } from "../brain/load";
import { talk } from "../brain/talk";
import type { MemoryEvent, PeterTelemetry } from "../brain/talk";
import type { SimResult } from "../brain/sim";
import { loadMemory, saveMemory, resetMemory as resetPeterMemoryStore, loadSharedMemory, mergeMemories, freshMemory, type MemoryState } from "../brain/memory";
import { loadPlasticity, savePlasticity, potentiate, resetPlasticity, type PlasticState } from "../brain/plasticity";

export type PeterReply = {
  text: string;
  note: string;
  real: boolean;
  telemetry?: PeterTelemetry;
  /** the raw simulation (per-step spikes) so the UI can draw the real raster */
  sim?: SimResult;
  memoryEvent?: MemoryEvent;
};

/** Peter's persistent memory: the SHARED brain (trained by the owner, ships
 *  with the site) merged with this visitor's personal facts.
 *  Exposed as a window global so tests can read the live memory state. */
export let peterMemory: MemoryState = freshMemory();
if (typeof window !== "undefined") { (window as any).peterMemory = peterMemory; }
try {
  peterMemory = loadMemory();
} catch {
  /* no storage - session-only memory */
}

/** Kick off the shared-brain merge; runs once per session. */
export function hydrateSharedBrain(): void {
  void loadSharedMemory().then((shared) => {
    if (shared.facts.length > 0) {
      peterMemory = mergeMemories(shared, peterMemory);
    }
  });
}

/** Peter's synaptic plasticity - the learning that lives in the brain.
 *  Loads once (persisted), potentiates on every message.
 *  Exposed as a window global so tests can read the live plastic state. */
export let peterPlasticity: PlasticState = loadPlasticity();
if (typeof window !== "undefined") { (window as any).peterPlasticity = peterPlasticity; }

/** Synapses modified so far (for the honest UI readout). */
export function plasticSynapseCount(): number {
  return peterPlasticity.mods.size;
}

export function resetPeterPlasticity(): PlasticState {
  peterPlasticity = resetPlasticity();
  return peterPlasticity;
}

/** Forget: wipe storage AND the live in-memory state (the running brain
 *  must reflect the reset immediately, not just after a reload). */
export function resetPeterMemory(): MemoryState {
  peterMemory = resetPeterMemoryStore();
  return peterMemory;
}

/** Run the real pipeline: message -> spikes on the real connectome -> words.
 *  Memory (facts learned from the user) is consulted and updated inside.
 *  AFTER the reply, the synapses that fired together are potentiated -
 *  Hebbian learning, persisted, so the brain itself slowly changes. */
export async function askPeter(prompt: string): Promise<PeterReply> {
  const { bundle, readout } = await loadPeterRuntime();
  const gains = peterPlasticity.mods.size > 0 ? gainsFrom(peterPlasticity, bundle.edgeCount) : null;
  const result = talk(prompt, bundle, readout, peterMemory, gains);
  peterMemory = result.memoryAfter;
  saveMemory(peterMemory);
  // Keep the window globals in sync so tests / DevTools see the live state.
  if (typeof window !== "undefined") { (window as any).peterMemory = peterMemory; }
  // Hebbian pass: neurons that fired together wire together (bounded).
  const potentiated = potentiate(bundle, result.sim, peterPlasticity);
  if (potentiated.changed > 0) {
    peterPlasticity = potentiated.next;
    savePlasticity(peterPlasticity);
    if (typeof window !== "undefined") { (window as any).peterPlasticity = peterPlasticity; }
  }
  return {
    text: result.text,
    note: result.note,
    real: true,
    telemetry: result.telemetry,
    sim: result.sim,
    memoryEvent: result.memoryEvent,
  };
}

function gainsFrom(p: PlasticState, edgeCount: number): Float64Array {
  const g = new Float64Array(edgeCount).fill(1.0);
  for (const [e, m] of p.mods) if (e < edgeCount) g[e] = m;
  return g;
}

/** Ask Peter. If the brain is unavailable, return an honest failure — never a fake answer. */
export async function askPeterOrScripted(
  prompt: string,
  _history: string[] = []
): Promise<PeterReply> {
  try {
    return await askPeter(prompt);
  } catch {
    return {
      text:
        "My brain bundle failed to load, so I cannot think right now. " +
        "Nothing is being simulated — I refuse to pretend. Reload the page, " +
        "or rebuild the bundle with `python scripts/build_brain.py`.",
      note: "CONNECTOME OFFLINE · NO SIMULATION RAN · NO FABRICATED REPLY",
      real: false,
    };
  }
}

let idCounter = 1000;
export const newMessage = (role: Role, text: string, note?: string): Message => ({
  id: ++idCounter,
  role,
  text,
  note,
});
