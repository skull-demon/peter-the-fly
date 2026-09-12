import { Box, Eye, Focus, Rotate3D, Scan } from "lucide-react";
import { useBrainRuntime } from "../brain";
import type { CameraPreset } from "../brain";

const views: Array<{ id: CameraPreset; label: string }> = [
  { id: "WHOLE_BRAIN", label: "Whole brain" },
  { id: "CENTRAL_BRAIN", label: "Central" },
  { id: "LEFT_OPTIC_LOBE", label: "Left optic" },
  { id: "RIGHT_OPTIC_LOBE", label: "Right optic" },
  { id: "CENTRAL_COMPLEX", label: "Central complex" },
  { id: "MUSHROOM_BODY", label: "Mushroom body" },
];

export function ViewControls() {
  const runtime = useBrainRuntime();
  return (
    <div className="view-controls glass-panel">
      <button title="Front view" onClick={() => runtime.cameraPreset("FRONT")}><Eye size={15} /></button>
      <button title="Top view" onClick={() => runtime.cameraPreset("TOP")}><Scan size={15} /></button>
      <button title="Side view" onClick={() => runtime.cameraPreset("SIDE")}><Box size={15} /></button>
      <button title="Isometric view" onClick={() => runtime.cameraPreset("ISOMETRIC")}><Rotate3D size={15} /></button>
      <div className="view-menu">
        <button title="Camera presets"><Focus size={15} /></button>
        <div>{views.map((view) => <button key={view.id} onClick={() => runtime.cameraPreset(view.id)}>{view.label}</button>)}</div>
      </div>
    </div>
  );
}