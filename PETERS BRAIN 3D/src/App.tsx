import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { brain } from "./brain";
import { BrainScene } from "./brain/scene/BrainScene";
import { ApiDrawer } from "./components/ApiDrawer";
import { ExplorerPanel } from "./components/ExplorerPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { SceneOverlay } from "./components/SceneOverlay";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { ViewControls } from "./components/ViewControls";

export default function App() {
  const [apiOpen, setApiOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    brain.startDemo();
    const timer = window.setTimeout(() => setInitializing(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="runtime-shell">
      <div className="scene-plane"><BrainScene /></div>
      <div className="ui-grid">
        <TopBar onApiOpen={() => setApiOpen(true)} />
        <ExplorerPanel />
        <InspectorPanel />
        <Timeline />
        <ViewControls />
      </div>
      <SceneOverlay />
      <AnimatePresence>{apiOpen && <ApiDrawer onClose={() => setApiOpen(false)} />}</AnimatePresence>
      <AnimatePresence>
        {initializing && (
          <motion.div className="boot-screen" exit={{ opacity: 0 }} transition={{ duration: 0.55 }}>
            <div className="boot-mark"><i /><i /><i /></div>
            <span>FLYWIRE RUNTIME</span>
            <b>INDEXING MORPHOLOGY / INITIALIZING GPU</b>
            <div><i /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
