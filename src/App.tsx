import { lazy, Suspense, useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import DataPathway from "./components/DataPathway";
import LeftPanel from "./components/LeftPanel";
import Dialog from "./components/Dialog";
import BrainMap from "./components/BrainMap";
import BootScreen from "./components/BootScreen";
import Disclosure from "./components/Disclosure";
import { ArrowIcon, EtchedFly, Flourish, PauseIcon } from "./components/Marks";
import { useMotionPreference } from "./utils/useMotionPreference";
import { loadPeterRuntime } from "./brain/load";
import { simulateBrain, readoutState } from "./brain/sim";
import { stimulusForText } from "./brain/spikegen";
import type { PeterTelemetry } from "./brain/talk";

const LabScene3D = lazy(() => import("./three/LabScene3D"));

export default function App() {
  const [active, setActive] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const [testing, setTesting] = useState(false);
  const prefersReducedMotion = useMotionPreference();
  const motion = !paused && !prefersReducedMotion;
  const shellRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const portRef = useRef<HTMLSpanElement>(null);
  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [brainStatus, setBrainStatus] = useState<"loading" | "live" | "fallback">("loading");
  const [brainCounts, setBrainCounts] = useState<{ neurons: number; dataset: string } | null>(null);
  const [booted, setBooted] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(() => !sessionStorage.getItem("flybrain-disclosure-v1"));
  const [telemetry, setTelemetry] = useState<PeterTelemetry | null>(null);

  const handleTelemetry = (t: PeterTelemetry) => {
    setTelemetry(t);
  };

  const enterLab = () => {
    setBooted(true);
    if (brainCounts) {
      try { sessionStorage.setItem("flybrain-neurons-v1", String(brainCounts.neurons)); } catch { /* optional */ }
    }
  };

  useEffect(() => () => {
    if (testTimer.current) clearTimeout(testTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPeterRuntime()
      .then(({ bundle }) => {
        if (cancelled) return;
        setBrainStatus("live");
        setBrainCounts({ neurons: bundle.neuronCount, dataset: bundle.dataset });
      })
      .catch(() => {
        if (!cancelled) setBrainStatus("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissDisclosure = () => {
    setShowDisclosure(false);
    try { sessionStorage.setItem("flybrain-disclosure-v1", "1"); } catch { /* optional */ }
  };

  /** "Test the signal": run a REAL spiking simulation through the connectome. */
  const testSignal = async () => {
    if (testTimer.current) clearTimeout(testTimer.current);
    setTesting(true);
    testTimer.current = setTimeout(() => setTesting(false), 4800);
    try {
      const { bundle } = await loadPeterRuntime();
      const plan = stimulusForText("test signal hello peter", bundle);
      const sim = simulateBrain(bundle, plan.rows, plan.rates, 783, 300);
      readoutState(sim, bundle.readoutRows); // touch the state so it is computed
    } catch {
      /* bundle unavailable - the theatrical test timer still runs */
    }
  };

  if (!booted) {
    return (
      <>
        <BootScreen
          brainStatus={brainStatus}
          neurons={brainCounts?.neurons}
          onEnter={enterLab}
        />
        {showDisclosure && <Disclosure onClose={dismissDisclosure} />}
      </>
    );
  }

  return (
    <div className={`app-shell ${motion ? "motion-on" : "motion-off"}`} ref={shellRef}>
      <header className="masthead">
        <a className="lab-signature" href="#flybrain" aria-label="FlyBrain laboratory">
          <EtchedFly />
          <span>THE FLYBRAIN EXPERIMENT</span>
        </a>
        <div className="masthead-center" aria-hidden="true">A most unusual conversation.</div>
        <button className="text-control notes-control" onClick={() => setNotesOpen(true)}>
          Field notes <ArrowIcon diagonal />
        </button>
      </header>

      <main className="workspace" id="flybrain">
        <LeftPanel
          active={active || testing}
          motion={motion}
          sceneRef={sceneRef}
          onInspect={() => setInspectorOpen(true)}
          brainStatus={brainStatus}
          brainCounts={brainCounts}
        />
        <ChatPanel
          active={active}
          onActivity={setActive}
          portRef={portRef}
          brainStatus={brainStatus}
          onTelemetry={handleTelemetry}
        />
      </main>

      <footer className="page-footer">
        <span>INDEPENDENT RESEARCH <span className="footer-separator">/</span> EST. 2026</span>
        <span className="footer-aside">Small brain. Unreasonable possibilities.</span>
        <button
          className="text-control motion-control"
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
          disabled={prefersReducedMotion}
          title={prefersReducedMotion ? "Your device prefers reduced motion" : "Toggle scene animation"}
        >
          <PauseIcon paused={!motion} />
          {prefersReducedMotion ? "Reduced motion" : paused ? "Resume motion" : "Pause motion"}
        </button>
      </footer>

      <DataPathway shellRef={shellRef} sceneRef={sceneRef} portRef={portRef} active={active || testing} motion={motion} />

      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)} title="Notes from the laboratory" className="field-notes-dialog">
        <span className="eyebrow">THE FLYBRAIN EXPERIMENT / NO. 001</span>
        <h2>Notes from<br /><em>the laboratory.</em></h2>
        <Flourish />
        <p className="notes-intro">One house fly. An unreasonable amount of apparatus.<br />A conversation that probably should not be possible.</p>
        <div className="notes-entry"><span>01</span><div><h3>The proposition</h3><p>What if a very small biological mind could become a conversational instrument? FlyBrain is a speculative interface for that deliberately improbable idea.</p></div></div>
        <div className="notes-entry"><span>02</span><div><h3>The specimen</h3><p>A house fly, perfectly at rest. Its fine copper leads pass into an antique neural translator, and the translator passes its findings to you.</p></div></div>
        <div className="notes-entry"><span>03</span><div><h3>What is actually running</h3><p>Your words stimulate a real slice of the adult fruit-fly connectome (FlyWire FAFB v783), simulated as spiking neurons in this browser. The spikes choose the words. If the brain bundle is missing, a clearly labeled scripted demo answers instead. No cloud, no pretence: it is a fly-brain map, not a house-fly mind, and it is not conscious.</p></div></div>
        <p className="handwritten note-signoff">It appears to understand language. Further tea is required.</p>
      </Dialog>

      <Dialog open={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Inspect the apparatus in 3D" className="inspection-dialog">
        <div className="inspection-heading">
          <div><span className="eyebrow">BENCH 04 / INTERACTIVE STUDY</span><h2>The apparatus.</h2></div>
          <span className="inspection-hint">Drag to orbit. Scroll to examine.</span>
        </div>
        <div className="inspection-canvas">
          {inspectorOpen && (
            <Suspense fallback={<div className="scene-loading"><EtchedFly /><span>Uncovering the apparatus...</span></div>}>
              <LabScene3D key={viewKey} active={active || testing} motion={motion} />
            </Suspense>
          )}
        </div>
        <BrainMap telemetry={telemetry} active={active || testing} />
        <div className="inspection-controls">
          <span className="eyebrow"><i className={`status-dot ${testing ? "working" : ""}`} /> {testing ? "SIGNAL PASSING THROUGH" : "SPECIMEN AT REST"}</span>
          <button className="text-control" onClick={() => setViewKey(viewKey + 1)}>Reset view</button>
          <button className="physical-button" onClick={() => void testSignal()} disabled={testing}>Test the signal <ArrowIcon /></button>
        </div>
      </Dialog>
    </div>
  );
}