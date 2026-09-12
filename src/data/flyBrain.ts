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
import type { PeterTelemetry } from "../brain/talk";
import type { SimResult } from "../brain/sim";

export type PeterReply = {
  text: string;
  note: string;
  real: boolean;
  telemetry?: PeterTelemetry;
  /** the raw simulation (per-step spikes) so the UI can draw the real raster */
  sim?: SimResult;
};

/** Run the real pipeline: message -> spikes on the real connectome -> words. */
export async function askPeter(prompt: string): Promise<PeterReply> {
  const { bundle, readout } = await loadPeterRuntime();
  const result = talk(prompt, bundle, readout);
  return {
    text: result.text,
    note: result.note,
    real: true,
    telemetry: result.telemetry,
    sim: result.sim,
  };
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
