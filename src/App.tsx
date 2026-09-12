import { lazy, Suspense, useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import DataPathway from "./components/DataPathway";
import LeftPanel from "./components/LeftPanel";
import Dialog from "./components/Dialog";
import BrainMap from "./components/BrainMap";
import NeuronView from "./components/NeuronView";
import ConnectomeViewer from "./components/ConnectomeViewer";
import BootScreen from "./components/BootScreen";
import Disclosure from "./components/Disclosure";
import { ArrowIcon, EtchedFly, Flourish, PauseIcon, SoundIcon } from "./components/Marks";
import { useMotionPreference } from "./utils/useMotionPreference";
import { loadPeterRuntime } from "./brain/load";
import { simulateBrain, readoutState, type SimResult } from "./brain/sim";
import { stimulusForText } from "./brain/spikegen";
import type { PeterTelemetry } from "./brain/talk";
import { hydrateSharedBrain } from "./data/flyBrain";
import { initBuzzUnlock, setSoundEnabled } from "./utils/buzz";
import AgiWorkspace from "./agi/AgiWorkspace";
import DoomModal from "./agi/DoomModal";
import { streamSimResultTo3D } from "./agi/simBridge";
import { Sparkles, Gamepad2 } from "lucide-react";

const LabScene3D = lazy(() => import("./three/LabScene3D"));

export default function App() {
  const [appMode, setAppMode] = useState<"lab" | "agi">("lab");
  const [doomOpen, setDoomOpen] = useState(false);
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
  const [brainCounts, setBrainCounts] = useState<{ neurons: number; edges: number; dataset: string } | null>(null);
  const [booted, setBooted] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(() => !sessionStorage.getItem("flybrain-disclosure-v1"));
  const [telemetry, setTelemetry] = useState<PeterTelemetry | null>(null);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [lastExchange, setLastExchange] = useState<{ prompt: string; reply: string } | null>(null);
  const [soundOn, setSoundOn] = useState(() => typeof localStorage !== "undefined" && localStorage.getItem("peter-sound-v1") === "on");

  useEffect(() => {
    initBuzzUnlock();
    hydrateSharedBrain(); // visitors start from the owner-trained brain
  }, []);

  const handleTelemetry = (t: PeterTelemetry) => {
    setTelemetry(t);
  };

  const handleSim = (s: SimResult) => {
    setSim(s);
    streamSimResultTo3D(s);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
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
        setBrainCounts({ neurons: bundle.neuronCount, edges: bundle.edgeCount, dataset: bundle.dataset });
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

  if (appMode === "agi") {
    return (
      <>
        <AgiWorkspace
          onReturnToLab={() => setAppMode("lab")}
          onOpenDoom={() => setDoomOpen(true)}
        />
        <DoomModal open={doomOpen} onClose={() => setDoomOpen(false)} />
      </>
    );
  }

  return (
    <div className={`app-shell ${motion ? "motion-on" : "motion-off"}`} ref={shellRef}>
      <header className="masthead">
        <a className="lab-signature" href="#flybrain" aria-label="Peter the Fly laboratory">
          <EtchedFly />
          <span>PETER THE FLY</span>
        </a>
        <div className="masthead-center" aria-hidden="true">A most unusual conversation.</div>
        <div className="masthead-controls">
          <button
            className="masthead-mode-btn doom-nav-btn"
            onClick={() => setDoomOpen(true)}
            title="Watch Peter play DOOM using real brain decisions"
          >
            <Gamepad2 size={13} />
            <span>PLAY DOOM</span>
          </button>
          <button
            className="masthead-mode-btn agi-nav-btn"
            onClick={() => setAppMode("agi")}
            title="Enter full AGI Workspace mode"
          >
            <Sparkles size={13} />
            <span>AGI MODE</span>
          </button>
          <button className="text-control notes-control" onClick={() => setNotesOpen(true)}>
            Field notes <ArrowIcon diagonal />
          </button>
        </div>
      </header>

      <main className="workspace" id="flybrain">
        <LeftPanel
          active={active || testing}
          motion={motion}
          sceneRef={sceneRef}
          onInspect={() => setInspectorOpen(true)}
          onOpenBrain={() => setViewerOpen(true)}
          onOpenAgi={() => setAppMode("agi")}
          onOpenDoom={() => setDoomOpen(true)}
          brainStatus={brainStatus}
          brainCounts={brainCounts}
          sim={sim}
          telemetry={telemetry}
        />
        <ChatPanel
          active={active}
          onActivity={setActive}
          portRef={portRef}
          brainStatus={brainStatus}
          onTelemetry={handleTelemetry}
          onSim={handleSim}
          onExchange={(prompt, reply) => setLastExchange({ prompt, reply })}
        />
      </main>

      <footer className="page-footer">
        <span>INDEPENDENT RESEARCH <span className="footer-separator">/</span> EST. 2026</span>
        <span className="footer-aside">Small brain. Unreasonable possibilities.</span>
        <button
          className="text-control sound-control"
          onClick={toggleSound}
          aria-pressed={soundOn}
          title={soundOn ? "Mute the fly" : "Unmute the fly (buzz while Peter speaks)"}
        >
          <SoundIcon on={soundOn} />
          {soundOn ? "Sound on" : "Sound off"}
        </button>
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
        <div className="notes-entry"><span>01</span><div><h3>The proposition</h3><p>Peter is a chatbot whose only computer is a real piece of biology: the FlyWire FAFB v783 fruit-fly connectome, simulated as spiking neurons in your browser. No cloud, no large language model.</p></div></div>
        <div className="notes-entry"><span>02</span><div><h3>The specimen</h3><p>A 2,200-neuron visual-pathway subnetwork (medulla, lobula, optic lobe junctions — right hemisphere), 71,365 synapse-weighted edges, real transmitter signs. The bench fly is the portrait; the actual neurons are in the spike raster.</p></div></div>
        <div className="notes-entry"><span>03</span><div><h3>What is actually running</h3><p>Your words become stimulation of input neurons; the Leaky Integrate-and-Fire simulation runs on the real wiring; the spike pattern of the output pool selects Peter's words. If the brain bundle is missing, Peter says so — he never improvises. Not conscious, and honest about it.</p></div></div>
        <p className="handwritten note-signoff">It appears to understand language. Further tea is required.</p>
      </Dialog>

      <ConnectomeViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        telemetry={telemetry}
        sim={sim}
        lastPrompt={lastExchange?.prompt ?? null}
        lastReply={lastExchange?.reply ?? null}
      />

      <DoomModal open={doomOpen} onClose={() => setDoomOpen(false)} />

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
        <NeuronView telemetry={telemetry} sim={sim} />
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