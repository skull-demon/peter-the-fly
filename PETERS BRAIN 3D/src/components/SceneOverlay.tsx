import { Activity, MousePointer2 } from "lucide-react";
import { motion } from "framer-motion";
import { useBrainRuntime } from "../brain";

export function SceneOverlay() {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();
  return (
    <div className="scene-overlay" aria-hidden="true">
      <motion.div className="demo-banner" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}>
        <i /><span>DEMO / SIMULATED ACTIVITY</span><b>External renderer input, not a neural simulation</b>
      </motion.div>
      <div className="orientation orientation-left"><b>L</b><span>FLY LEFT</span></div>
      <div className="orientation orientation-right"><b>R</b><span>FLY RIGHT</span></div>
      <div className="canvas-caption">
        <MousePointer2 size={13} /> ORBIT / PAN / ZOOM
      </div>
      <div className="scene-readout">
        <span><Activity size={12} /> {status.mode.replace(/_/g, " ")}</span>
        <b>{runtime.getModel().neurons.length.toLocaleString()} neurons / {runtime.getModel().connections.length} loaded edges / {status.fps.toFixed(0)} fps</b>
      </div>
    </div>
  );
}