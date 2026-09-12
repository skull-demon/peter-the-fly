import { useEffect, useRef, useState } from "react";
import BootFly, { type BootFlyPose } from "./BootFly";

type Props = {
  brainStatus: "loading" | "live" | "fallback";
  neurons?: number;
  onEnter: () => void;
};

type Phase = "cruise" | "land" | "sit" | "depart";

export default function BootScreen({ brainStatus, neurons, onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("cruise");
  const [shown, setShown] = useState(1);
  const [departing, setDeparting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const land = setTimeout(() => setPhase("land"), 2200);
    const sit = setTimeout(() => setPhase("sit"), 3500);
    return () => {
      clearTimeout(land);
      clearTimeout(sit);
    };
  }, []);

  useEffect(() => {
    if (phase === "cruise") return;
    timer.current = setInterval(() => {
      setShown((s) => Math.min(s + 1, 5));
    }, 520);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [phase]);

  const flyPose: BootFlyPose =
    phase === "cruise" ? "cruise" : phase === "land" ? "landing" : "sitting";

  const enter = () => {
    if (departing) return;
    setDeparting(true);
    setPhase("depart");
    setShown(5);
    // give the fly a beat to lift off toward the bench, then hand over
    setTimeout(onEnter, 950);
  };

  return (
    <div className="boot-screen" role="status" aria-label="Booting the laboratory">
      <div className="boot-inner">
        <p className="boot-eyebrow">THE FLYBRAIN EXPERIMENT</p>
        <h1 className="boot-title">
          <span className="boot-word-peter">
            Peter
            <BootFly
              pose={flyPose}
              className={
                phase === "cruise"
                  ? "boot-fly boot-fly-cruise"
                  : phase === "land"
                    ? "boot-fly boot-fly-landing"
                    : departing
                      ? "boot-fly boot-fly-depart"
                      : "boot-fly boot-fly-sitting"
              }
            />
          </span>
          {", the Fly."}
        </h1>
        <p className="boot-sub">A conversation running on a real connectome.</p>
        <ul className="boot-lines">
          {[0, 1, 2, 3, 4].slice(0, shown).map((i) => (
            <li key={i} className="boot-line">{bootLine(i, brainStatus, neurons)}</li>
          ))}
        </ul>
        <div className="boot-bar" aria-hidden="true">
          <span style={{ width: `${(shown / 5) * 100}%` }} />
        </div>
        <button
          className="text-control boot-skip"
          onClick={enter}
        >
          Enter the laboratory
        </button>
      </div>
    </div>
  );
}

function bootLine(
  i: number,
  brainStatus: "loading" | "live" | "fallback",
  neurons?: number
): string {
  if (i === 0) return "MOUNTING APPARATUS";
  if (i === 1) {
    if (brainStatus === "fallback") return "CONNECTOME BUNDLE NOT FOUND · SCRIPTED FALLBACK READY";
    if (brainStatus === "loading") return "FETCHING CONNECTOME · FLYWIRE FAFB v783";
    return "CONNECTOME LOADED · FLYWIRE FAFB v783";
  }
  if (i === 2) {
    if (brainStatus === "live" && neurons) return "PARSING " + neurons.toLocaleString() + " NEURONS";
    return "PARSING NEURON TABLE";
  }
  if (i === 3) return "CALIBRATING GAUGES";
  if (brainStatus === "live") return "SPECIMEN AT REST · READY";
  return "SPECIMEN AT REST";
}
