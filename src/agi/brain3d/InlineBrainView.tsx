import { useState, useEffect } from "react";
import { BrainScene } from "./scene/BrainScene";
import { brain } from "./runtime";
import { useBrainRuntime } from "./hooks";
import type { PeterTelemetry } from "../../brain/talk";
import type { SimResult } from "../../brain/sim";
import { streamSimResultTo3D } from "../simBridge";
import { Maximize2, RotateCcw, Zap, Eye } from "lucide-react";

type Props = {
  telemetry: PeterTelemetry | null;
  sim: SimResult | null;
  onCloseInline: () => void;
  onOpenAgi: () => void;
};

const REGIONS = [
  { id: "ME_R", label: "MEDULLA" },
  { id: "LA_R", label: "LAMINA" },
  { id: "LO_R", label: "LOBULA" },
  { id: "LOP_R", label: "LOBULA PLATE" },
  { id: "CA_R", label: "MUSHROOM BODY" },
  { id: "FB", label: "FAN-SHAPED BODY" },
  { id: "PB", label: "PROTOCEREBRAL BRIDGE" },
  { id: "EB", label: "ELLIPSOID BODY" },
  { id: "NO", label: "NODULI" },
  { id: "AL_R", label: "ANTENNAL LOBE" },
  { id: "LH_R", label: "LATERAL HORN" },
];

export default function InlineBrainView({ telemetry, sim, onCloseInline, onOpenAgi }: Props) {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // When a new simulation arrives, stream it to the 3D brain
  useEffect(() => {
    if (sim) {
      streamSimResultTo3D(sim);
    }
  }, [sim]);

  const handleSelectRegion = (regionId: string) => {
    if (selectedRegion === regionId) {
      setSelectedRegion(null);
      runtime.selectRegion(null);
      runtime.cameraPreset("WHOLE_BRAIN");
    } else {
      setSelectedRegion(regionId);
      runtime.focusRegion(regionId);
    }
  };

  const handleResetCamera = () => {
    setSelectedRegion(null);
    runtime.selectRegion(null);
    runtime.cameraPreset("WHOLE_BRAIN");
  };

  const spikesCount = telemetry?.spike_count ?? (sim?.totalSpikes ?? 1640);
  const neuronsCount = telemetry?.active_neurons ?? 2200;

  return (
    <div className="inline-brain-container" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#020607" }}>
      {/* 3D Scene */}
      <div style={{ position: "absolute", inset: 0 }}>
        <BrainScene />
      </div>

      {/* Top Banner HUD */}
      <div className="inline-brain-header">
        <div className="inline-brain-title-block">
          <span className="inline-brain-badge">LIVE 3D CONNECTOME</span>
          <span className="inline-brain-stats">
            FLYWIRE v783 · <b>{neuronsCount.toLocaleString()} NEURONS</b> · <b>{spikesCount.toLocaleString()} SPIKES</b>
          </span>
        </div>
        <div className="inline-brain-actions">
          <button
            className="hud-button"
            onClick={handleResetCamera}
            title="Reset 3D camera to whole brain view"
          >
            <RotateCcw size={13} />
            <span>RESET</span>
          </button>
          <button
            className="hud-button primary"
            onClick={onOpenAgi}
            title="Open full-screen AGI Workspace"
          >
            <Maximize2 size={13} />
            <span>AGI MODE</span>
          </button>
          <button
            className="hud-button secondary"
            onClick={onCloseInline}
            title="Return to Bench Apparatus photograph"
          >
            <Eye size={13} />
            <span>BENCH</span>
          </button>
        </div>
      </div>

      {/* Bottom Region Pills Filter */}
      <div className="inline-brain-footer">
        <div className="region-chips-scroll">
          {REGIONS.map((reg) => {
            const isSelected = selectedRegion === reg.id || status.selectedRegionId === reg.id;
            return (
              <button
                key={reg.id}
                className={`region-chip ${isSelected ? "is-active" : ""}`}
                onClick={() => handleSelectRegion(reg.id)}
              >
                <i className="chip-dot" />
                <span>{reg.label}</span>
              </button>
            );
          })}
        </div>
        <div className="inline-brain-hint">
          <span>DRAG TO ORBIT · SCROLL TO ZOOM · CLICK NEURON TO INSPECT</span>
        </div>
      </div>
    </div>
  );
}
