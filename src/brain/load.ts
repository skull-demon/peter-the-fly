/** Loads the brain bundle and the trained readout, with status reporting. */

import { parseBrainBundle, type BrainBundle } from "./bundle";
import type { Readout } from "./talk";

export type RuntimeStatus =
  | { phase: "idle" }
  | { phase: "loading-bundle" }
  | { phase: "loading-readout" }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export type PeterRuntime = {
  bundle: BrainBundle;
  readout: Readout;
};

let runtimePromise: Promise<PeterRuntime> | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Fetch + parse both artifacts exactly once per page session. */
export function loadPeterRuntime(
  onStatus?: (s: RuntimeStatus) => void,
): Promise<PeterRuntime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    try {
      onStatus?.({ phase: "loading-bundle" });
      const res = await fetch("/brain/peter.br");
      if (!res.ok) throw new Error(`brain bundle unavailable (HTTP ${res.status})`);
      const buf = await res.arrayBuffer();
      const bundle = parseBrainBundle(buf);

      onStatus?.({ phase: "loading-readout" });
      const readout = (await fetchJson("/brain/peter.readout.json")) as Readout;
      if (readout.format !== "peter-readout-1") {
        throw new Error(`unknown readout format: ${readout.format}`);
      }

      onStatus?.({ phase: "ready" });
      return { bundle, readout };
    } catch (err) {
      runtimePromise = null; // allow a retry on next ask
      onStatus?.({ phase: "error", message: String(err) });
      throw err;
    }
  })();
  return runtimePromise;
}

/** True when the build ships a real brain bundle (checked cheaply). */
export async function probeBrainAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/brain/peter.br", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
