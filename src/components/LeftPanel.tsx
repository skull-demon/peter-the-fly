import type { RefObject } from "react";
import { ArrowIcon, Flourish } from "./Marks";
import BenchScene from "./BenchScene";
import type { SimResult } from "../brain/sim";
import type { PeterTelemetry } from "../brain/talk";

type Props = {
  active: boolean;
  motion: boolean;
  sceneRef: RefObject<HTMLDivElement | null>;
  onInspect: () => void;
  /** open the connectome viewer (neuron activity + brain map + last output) */
  onOpenBrain: () => void;
  /** live brain status from the real runtime (optional: defaults keep the design) */
  brainStatus?: "loading" | "live" | "fallback";
  brainCounts?: { neurons: number; edges: number; dataset: string } | null;
  /** the last real simulation - drives the live spike-raster overlay */
  sim?: SimResult | null;
  telemetry?: PeterTelemetry | null;
};

export default function LeftPanel({ active, motion, sceneRef, onInspect, onOpenBrain, brainStatus = "loading", brainCounts, sim, telemetry }: Props) {
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
      <div className="specimen-caption">
        <span><span className="caption-number">Fig. 01</span> The thinking apparatus.</span>
        <span className="caption-controls">
          <button className="text-control inspect-control brain-view-control" onClick={onOpenBrain} disabled={!sim} title={sim ? "Every neuron that fired, and Peter's last output" : "Send a message first - the view opens after the first simulation"}>
            Neuron activity <ArrowIcon diagonal />
          </button>
          <button className="text-control inspect-control" onClick={onInspect}>Inspect in 3D <ArrowIcon diagonal /></button>
        </span>
      </div>
      {telemetry && (
        <p className="bench-activity-note eyebrow">
          LAST TRANSMISSION · {telemetry.spike_count.toLocaleString()} SPIKES · {telemetry.active_neurons.toLocaleString()} NEURONS ACTIVE · <button className="linklike" onClick={onOpenBrain}>SEE THE NEURONS</button>
        </p>
      )}
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
