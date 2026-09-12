/**
 * The fly's voice: a synthesized house-fly buzz (no audio assets).
 *
 * Two detuned sawtooth oscillators around 190 Hz (house-fly wingbeat
 * frequency) through a low-pass filter, with a slow amplitude wobble.
 * Browsers block audio until the user interacts with the page; the first
 * click anywhere unlocks it. Sound defaults OFF — the visitor opts in once
 * via the mute toggle, and the choice persists in localStorage.
 */

let ctx: AudioContext | null = null;
let unlocked = false;
let userWantsSound: boolean =
  typeof localStorage !== "undefined" && localStorage.getItem("peter-sound-v1") === "on";

/** Call once from the App shell: unlocks audio on the visitor's first click. */
export function initBuzzUnlock(): void {
  if (unlocked || typeof window === "undefined") return;
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function soundEnabled(): boolean {
  return userWantsSound && unlocked;
}

export function setSoundEnabled(on: boolean): void {
  userWantsSound = on;
  try { localStorage.setItem("peter-sound-v1", on ? "on" : "off"); } catch { /* optional */ }
}

/**
 * Start buzzing. Returns a stop function. The buzz already running when a
 * second call arrives is left alone (refcounted by the caller's stop handle).
 */
export function playBuzz(active = false): () => void {
  if (!soundEnabled()) return () => {};
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(active ? 0.05 : 0.035, now + 0.25);

    // House-fly wingbeat sits around 150-220 Hz; two detuned saws give it body.
    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.setValueAtTime(186, now);
    const oscB = ctx.createOscillator();
    oscB.type = "sawtooth";
    oscB.frequency.setValueAtTime(193.5, now);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(active ? 1400 : 900, now);
    lp.Q.setValueAtTime(1.2, now);

    // slow wobble - the peripheral "bzzz-vzzz" amplitude pattern
    const wobble = ctx.createOscillator();
    wobble.type = "sine";
    wobble.frequency.setValueAtTime(6.5, now);
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.setValueAtTime(0.012, now);
    wobble.connect(wobbleGain).connect(master.gain);

    oscA.connect(lp);
    oscB.connect(lp);
    lp.connect(master);
    master.connect(ctx.destination);

    oscA.start(now);
    oscB.start(now);
    wobble.start(now);

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const t = ctx!.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      oscA.stop(t + 0.35);
      oscB.stop(t + 0.35);
      wobble.stop(t + 0.35);
    };
  } catch {
    return () => {}; // audio is a nicety, never a requirement
  }
}
