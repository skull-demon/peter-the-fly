import type { RefObject } from "react";
import { ArrowIcon, Flourish } from "./Marks";
import BenchScene from "./BenchScene";

type Props = {
  active: boolean;
  motion: boolean;
  sceneRef: RefObject<HTMLDivElement | null>;
  onInspect: () => void;
  /** live brain status from the real runtime (optional: defaults keep the design) */
  brainStatus?: "loading" | "live" | "fallback";
  brainCounts?: { neurons: number; dataset: string } | null;
};

export default function LeftPanel({ active, motion, sceneRef, onInspect, brainStatus = "loading", brainCounts }: Props) {
  const connectomeLabel =
    brainStatus === "live"
      ? "CONNECTOME ONLINE"
      : brainStatus === "fallback"
        ? "CONNECTOME OFFLINE · DEMO"
        : "CONNECTOME LOADING";

  return (
    <section className="laboratory-panel" aria-labelledby="brand-title">
      <header className="laboratory-heading">
        <div className="specimen-number"><span className="eyebrow">EXPERIMENT</span><span className="specimen-number-value">No. 001</span></div>
        <div className="brand-block">
          <h1 id="brand-title">Fly<span>Brain</span><span className="brand-stop">.</span></h1>
          <p>A conversational experiment in biological intelligence.</p>
          <div className="connectome-status"><i className={`status-dot ${brainStatus === "live" ? (active ? "working" : "") : "offline"}`} /> {connectomeLabel}</div>
        </div>
        <Flourish />
      </header>
      <BenchScene active={active} motion={motion} sceneRef={sceneRef} />
      <div className="specimen-caption">
        <span><span className="caption-number">Fig. 01</span> The thinking apparatus.</span>
        <button className="text-control inspect-control" onClick={onInspect}>Inspect in 3D <ArrowIcon diagonal /></button>
      </div>
      <footer className="laboratory-readouts">
        <dl>
          <div><dt>NEURONS</dt><dd>{brainCounts ? brainCounts.neurons.toLocaleString() : "139,255"}</dd></div>
          <div><dt>SYNAPSES</dt><dd>50M<span>+</span></dd></div>
          <div><dt>MODEL</dt><dd className="readout-word">{brainStatus === "live" ? "FlyWire v783" : "Local"}</dd></div>
          <div><dt>SIGNAL</dt><dd className="readout-word"><i className={`status-dot ${active ? "working" : ""}`} />{active ? "Thinking" : "Stable"}</dd></div>
        </dl>
      </footer>
    </section>
  );
}
