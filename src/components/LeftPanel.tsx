import type { RefObject } from "react";
import { ArrowIcon, Flourish } from "./Marks";
import BenchScene from "./BenchScene";
import NeuronView from "./NeuronView";
import type { SimResult } from "../brain/sim";
import type { PeterTelemetry } from "../brain/talk";

type Props = {
  active: boolean;
  motion: boolean;
  sceneRef: RefObject<HTMLDivElement | null>;
  onInspect: () => void;
  /** live brain status from the real runtime (optional: defaults keep the design) */
  brainStatus?: "loading" | "live" | "fallback";
  brainCounts?: { neurons: number; edges: number; dataset: string } | null;
  /** the last real simulation - drives the live spike-raster overlay */
  sim?: SimResult | null;
  telemetry?: PeterTelemetry | null;
};

export default function LeftPanel({ active, motion, sceneRef, onInspect, brainStatus = "loading", brainCounts, sim, telemetry }: Props) {
  const connectomeLabel =
    brainStatus === "live"
      ? "CONNECTOME ONLINE"
      : brainStatus === "fallback"
        ? "CONNECTOME OFFLINE"
        : "CONNECTOME LOADING";

  const neurons = brainCounts ? brainCounts.neurons.toLocaleString() : "—";
  const edges = brainCounts ? brainCounts.edges.toLocaleString() : "—";
  const model = brainStatus === "live" ? brainCounts?.dataset ?? "FlyWire v783" : brainStatus === "fallback" ? "OFFLINE" : "LOADING";

  return (
    <section className="laboratory-panel" aria-labelledby="brand-title">
      <header className="laboratory-heading">
        <div className="specimen-number"><span className="eyebrow">EXPERIMENT</span><span className="specimen-number-value">No. 001</span></div>
        <div className="brand-block">
          <h1 id="brand-title">Peter<span> the Fly</span><span className="brand-stop">.</span></h1>
          <p>A conversation running on a real fly brain.</p>
          <div className="connectome-status"><i className={`status-dot ${brainStatus === "live" ? (active ? "working" : "") : "offline"}`} /> {connectomeLabel}</div>
        </div>
        <Flourish />
      </header>
      <BenchScene active={active} motion={motion} sceneRef={sceneRef} />
      {sim && (
        <div className="bench-raster-overlay" aria-hidden="false">
          <NeuronView telemetry={telemetry ?? null} sim={sim} compact />
        </div>
      )}
      <div className="specimen-caption">
        <span><span className="caption-number">Fig. 01</span> The thinking apparatus.</span>
        <button className="text-control inspect-control" onClick={onInspect}>Inspect in 3D <ArrowIcon diagonal /></button>
      </div>
      <footer className="laboratory-readouts">
        <dl>
          <div><dt>NEURONS SIMULATED</dt><dd>{neurons}</dd></div>
          <div><dt>SYNAPSE EDGES</dt><dd>{edges}</dd></div>
          <div><dt>CONNECTOME</dt><dd className="readout-word">{model}</dd></div>
          <div><dt>SIGNAL</dt><dd className="readout-word"><i className={`status-dot ${active ? "working" : ""}`} />{active ? "Thinking" : "Stable"}</dd></div>
        </dl>
      </footer>
    </section>
  );
}
