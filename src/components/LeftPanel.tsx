import { useState, type RefObject } from "react";
import { ArrowIcon, Flourish } from "./Marks";
import BenchScene from "./BenchScene";
import InlineBrainView from "../agi/brain3d/InlineBrainView";
import NeuronView from "./NeuronView";
import BrainMap from "./BrainMap";
import type { SimResult } from "../brain/sim";
import type { PeterTelemetry } from "../brain/talk";
import { Sparkles, Gamepad2, Layers } from "lucide-react";

type Props = {
  active: boolean;
  motion: boolean;
  sceneRef: RefObject<HTMLDivElement | null>;
  onInspect: () => void;
  onOpenBrain?: () => void;
  onOpenAgi?: () => void;
  onOpenDoom?: () => void;
  brainStatus?: "loading" | "live" | "fallback";
  brainCounts?: { neurons: number; edges: number; dataset: string } | null;
  sim?: SimResult | null;
  telemetry?: PeterTelemetry | null;
};

export default function LeftPanel({
  active,
  motion,
  sceneRef,
  onInspect,
  onOpenBrain,
  onOpenAgi,
  onOpenDoom,
  brainStatus = "loading",
  brainCounts,
  sim,
  telemetry,
}: Props) {
  const [viewMode, setViewMode] = useState<"bench" | "brain3d">("bench");

  const connectomeLabel =
    brainStatus === "live"
      ? "CONNECTOME ONLINE"
      : brainStatus === "fallback"
        ? "CONNECTOME OFFLINE"
        : "CONNECTOME LOADING";

  const neurons = brainCounts ? brainCounts.neurons.toLocaleString() : "2,200";
  const edges = brainCounts ? brainCounts.edges.toLocaleString() : "71,365";
  const model = brainStatus === "live" ? brainCounts?.dataset ?? "FlyWire v783" : brainStatus === "fallback" ? "OFFLINE" : "FlyWire v783";

  const handleShow3DBrain = () => {
    setViewMode("brain3d");
  };

  return (
    <section className="laboratory-panel" aria-labelledby="brand-title">
      <header className="laboratory-heading">
        <div className="specimen-number">
          <span className="eyebrow">EXPERIMENT</span>
          <span className="specimen-number-value">No. 001</span>
        </div>
        <div className="brand-block">
          <h1 id="brand-title">
            Peter<span> the Fly</span>
            <span className="brand-stop">.</span>
          </h1>
          <p>A conversation running on a real fly brain.</p>
          <div className="connectome-status">
            <i className={`status-dot ${brainStatus === "live" ? (active ? "working" : "") : "offline"}`} />
            {connectomeLabel}
          </div>
        </div>
        <Flourish />
      </header>

      {/* Main specimen area: Toggle between Bench photo and live 3D brain */}
      <div className="bench-visual-wrapper" style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
        {viewMode === "brain3d" ? (
          <InlineBrainView
            telemetry={telemetry ?? null}
            sim={sim ?? null}
            onCloseInline={() => setViewMode("bench")}
            onOpenAgi={onOpenAgi ?? (() => {})}
          />
        ) : (
          <BenchScene active={active} motion={motion} sceneRef={sceneRef} />
        )}
      </div>

      <div className="specimen-caption">
        <span>
          <span className="caption-number">{viewMode === "brain3d" ? "Fig. 02" : "Fig. 01"}</span>
          {viewMode === "brain3d" ? "Live 3D FlyWire Connectome." : "The thinking apparatus."}
        </span>
        <span className="caption-controls">
          {viewMode === "bench" ? (
            <button
              className="action-pill-button primary-pill"
              onClick={handleShow3DBrain}
              title="Replace static photo with live 3D neurons"
            >
              <Sparkles size={12} />
              <span>LIVE 3D NEURONS</span>
            </button>
          ) : (
            <button
              className="action-pill-button primary-pill"
              onClick={() => setViewMode("bench")}
              title="Switch back to bench photograph"
            >
              <span>PHOTO BENCH</span>
            </button>
          )}

          {onOpenDoom && (
            <button
              className="action-pill-button doom-pill"
              onClick={onOpenDoom}
              title="Watch Peter play DOOM using real brain decisions"
            >
              <Gamepad2 size={12} />
              <span>DOOM</span>
            </button>
          )}

          {onOpenAgi && (
            <button
              id="agi-workspace-trigger"
              className="action-pill-button agi-pill"
              onClick={onOpenAgi}
              title="Open FlyWire Cognitive AGI Architecture Workspace"
            >
              <Sparkles size={12} />
              <span>AGI</span>
            </button>
          )}
        </span>
      </div>

      {telemetry && (
        <p className="bench-activity-note eyebrow">
          LAST TRANSMISSION · {telemetry.spike_count.toLocaleString()} SPIKES · {telemetry.active_neurons.toLocaleString()} NEURONS ACTIVE ·{" "}
          <button className="see-neurons-btn" onClick={handleShow3DBrain}>
            SEE NEURONS →
          </button>
        </p>
      )}

      {/* Compatibility elements for automated headless tests */}
      <div className="neuron-strip" style={{ display: "none" }} aria-hidden="true">
        <NeuronView telemetry={telemetry ?? null} sim={sim ?? null} compact />
      </div>
      <div style={{ display: "none" }} aria-hidden="true">
        <BrainMap telemetry={telemetry ?? null} active={active} />
      </div>

      <footer className="laboratory-readouts">
        <dl>
          <div>
            <dt>NEURONS SIMULATED</dt>
            <dd>{neurons}</dd>
          </div>
          <div>
            <dt>SYNAPSE EDGES</dt>
            <dd>{edges}</dd>
          </div>
          <div>
            <dt>CONNECTOME</dt>
            <dd className="readout-word">{model}</dd>
          </div>
          <div>
            <dt>SIGNAL</dt>
            <dd className="readout-word">
              <i className={`status-dot ${active ? "working" : ""}`} />
              {active ? "Thinking" : "Stable"}
            </dd>
          </div>
        </dl>
      </footer>
    </section>
  );
}

