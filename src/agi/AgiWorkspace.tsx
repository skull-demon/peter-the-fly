import { useState, useEffect, useRef } from "react";
import { BrainScene } from "./brain3d/scene/BrainScene";
import { brain } from "./brain3d/runtime";
import { useBrainRuntime } from "./brain3d/hooks";
import { CAMERA_PRESETS } from "./brain3d/camera";
import type { CameraPreset, VisualMode, SearchResult } from "./brain3d/types";
import { streamSimResultTo3D } from "./simBridge";
import { askPeter } from "../data/flyBrain";
import type { PeterTelemetry } from "../brain/talk";
import { loadPeterRuntime, type PeterRuntime } from "../brain/load";
import type { SimResult } from "../brain/sim";
import {
  Send,
  RotateCcw,
  Sparkles,
  Zap,
  Activity,
  Layers,
  Search,
  Database,
  Sliders,
  Radio,
  Eye,
  Maximize2,
  Minimize2,
  Gamepad2,
  Flame,
  HelpCircle,
  X,
  Crosshair,
  EyeOff
} from "lucide-react";

type Props = {
  onReturnToLab: () => void;
  onOpenDoom: () => void;
};

const VISUAL_MODES: Array<{ id: VisualMode; label: string }> = [
  { id: "NEURAL_ACTIVITY", label: "Neural Activity" },
  { id: "STRUCTURAL", label: "Structural" },
  { id: "CONNECTIVITY", label: "Connectivity" },
  { id: "REGION_ACTIVITY", label: "Region Activity" },
  { id: "SPIKE_PLAYBACK", label: "Spike Playback" },
  { id: "PLASTICITY", label: "Plasticity" },
  { id: "PATH_TRACING", label: "Path Tracing" },
];

const PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: "WHOLE_BRAIN", label: "Whole" },
  { id: "CENTRAL_COMPLEX", label: "Central Complex" },
  { id: "RIGHT_OPTIC_LOBE", label: "Optic Lobe" },
  { id: "MUSHROOM_BODY", label: "Mushroom Body" },
  { id: "TOP", label: "Top" },
  { id: "FRONT", label: "Front" },
  { id: "ISOMETRIC", label: "Iso" },
];

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

export default function AgiWorkspace({ onReturnToLab, onOpenDoom }: Props) {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();
  const [activeTab, setActiveTab] = useState<"chat" | "memory" | "experiment" | "inspector">("chat");

  // Chat & Cognitive State
  const [messages, setMessages] = useState<Array<{ sender: "user" | "peter"; text: string; telemetry?: PeterTelemetry }>>([
    {
      sender: "peter",
      text: "AGI workspace active. The FlyWire connectome is initialized. What shall we explore together?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [currentTelemetry, setCurrentTelemetry] = useState<PeterTelemetry | null>(null);
  const [lastSim, setLastSim] = useState<SimResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Search in 3D Brain
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchResults(runtime.search(searchQuery.trim(), 10));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, runtime]);

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || isThinking) return;

    setInput("");
    setMessages((prev) => [...prev, { sender: "user", text: prompt }]);
    setIsThinking(true);

    try {
      const exchange = await askPeter(prompt);
      if (exchange.sim) {
        setLastSim(exchange.sim);
        streamSimResultTo3D(exchange.sim);
      }

      setCurrentTelemetry(exchange.telemetry ?? null);
      setMessages((prev) => [
        ...prev,
        {
          sender: "peter",
          text: exchange.text,
          telemetry: exchange.telemetry,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "peter",
          text: "My neural pathways encountered an interruption. Please try again.",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleStimulateRegion = (regId: string) => {
    runtime.focusRegion(regId);
    runtime.setRegionActivity(regId, 1.0);
    // Fire sample neurons in that region
    const neurons = runtime.getModel().neurons.filter((n) => n.region.includes(regId));
    neurons.slice(0, 15).forEach((n, idx) => {
      runtime.fireNeuron(n.id, runtime.getStatus().simulationTime + idx * 15, 1.0);
    });
  };

  const selectedNeuron = status.selectedNeuronId ? runtime.getNeuron(status.selectedNeuronId) : null;

  return (
    <div className="agi-workspace-root">
      {/* Top Masthead */}
      <header className="agi-masthead">
        <div className="agi-brand">
          <div className="agi-logo-dot" />
          <div>
            <h1>PETER THE FLY <span className="agi-tag">AGI WORKSPACE</span></h1>
            <p className="agi-subtitle">Direct Connectome Interface · FlyWire FAFB v783</p>
          </div>
        </div>

        <div className="agi-stats-strip">
          <div className="stat-pill">
            <Activity size={12} />
            <span>2,200 LIF NEURONS</span>
          </div>
          <div className="stat-pill">
            <Zap size={12} />
            <span>71,365 SYNAPSES</span>
          </div>
          <div className="stat-pill highlight">
            <Flame size={12} />
            <span>{currentTelemetry ? `${currentTelemetry.spike_count.toLocaleString()} SPIKES` : "CONNECTOME IDLE"}</span>
          </div>
        </div>

        <div className="agi-nav-actions">
          <button className="agi-btn doom-btn" onClick={onOpenDoom}>
            <Gamepad2 size={14} />
            <span>DOOM</span>
          </button>
          <button className="agi-btn lab-btn" onClick={onReturnToLab}>
            <Minimize2 size={14} />
            <span>RETURN TO LAB</span>
          </button>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="agi-main-grid">
        {/* Left: 3D Connectome Workspace */}
        <div className="agi-brain-pane">
          <div className="agi-canvas-holder">
            <BrainScene />

            {/* Top Overlay: Search & Camera Presets */}
            <div className="brain-overlay-top">
              <div className="search-box">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Search neuron, region (CT1, ME, AL)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}><X size={12} /></button>
                )}
                {searchResults.length > 0 && (
                  <div className="search-dropdown">
                    {searchResults.map((res) => (
                      <div
                        key={res.id}
                        className="search-item"
                        onClick={() => {
                          if (res.kind === "NEURON") {
                            runtime.focusNeuron(res.id);
                            setActiveTab("inspector");
                          } else {
                            runtime.focusRegion(res.id);
                          }
                          setSearchQuery("");
                        }}
                      >
                        <b>{res.name}</b>
                        <small>{res.detail}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="preset-buttons">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="preset-btn"
                    onClick={() => runtime.cameraPreset(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Overlay: Visual Modes & Region Chips */}
            <div className="brain-overlay-bottom">
              <div className="visual-modes-strip">
                <span className="strip-title">MODE:</span>
                {VISUAL_MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`mode-btn ${status.mode === m.id ? "active" : ""}`}
                    onClick={() => runtime.setMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="region-chips-strip">
                {REGIONS.map((r) => {
                  const isFocused = status.selectedRegionId === r.id;
                  return (
                    <button
                      key={r.id}
                      className={`region-pill ${isFocused ? "active" : ""}`}
                      onClick={() => {
                        if (isFocused) {
                          runtime.selectRegion(null);
                          runtime.cameraPreset("WHOLE_BRAIN");
                        } else {
                          runtime.focusRegion(r.id);
                        }
                      }}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Cognitive Console */}
        <div className="agi-console-pane">
          {/* Navigation Tabs */}
          <div className="console-tabs">
            <button
              className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >
              <Radio size={14} />
              <span>COGNITIVE CHAT</span>
            </button>
            <button
              className={`tab-btn ${activeTab === "memory" ? "active" : ""}`}
              onClick={() => setActiveTab("memory")}
            >
              <Database size={14} />
              <span>MEMORY</span>
            </button>
            <button
              className={`tab-btn ${activeTab === "experiment" ? "active" : ""}`}
              onClick={() => setActiveTab("experiment")}
            >
              <Sliders size={14} />
              <span>EXPERIMENTS</span>
            </button>
            {selectedNeuron && (
              <button
                className={`tab-btn ${activeTab === "inspector" ? "active" : ""}`}
                onClick={() => setActiveTab("inspector")}
              >
                <Crosshair size={14} />
                <span>INSPECTOR</span>
              </button>
            )}
          </div>

          {/* Tab 1: Chat & Live Telemetry */}
          {activeTab === "chat" && (
            <div className="console-tab-content chat-content">
              {/* Telemetry Summary Card */}
              {currentTelemetry && (
                <div className="telemetry-bar">
                  <div className="tele-metric">
                    <label>SPIKES</label>
                    <span>{currentTelemetry.spike_count.toLocaleString()}</span>
                  </div>
                  <div className="tele-metric">
                    <label>ACTIVE NEURONS</label>
                    <span>{currentTelemetry.active_neurons.toLocaleString()}</span>
                  </div>
                  <div className="tele-metric">
                    <label>SIM DURATION</label>
                    <span>{currentTelemetry.sim_duration_ms} ms</span>
                  </div>
                  <div className="tele-metric highlight">
                    <label>WINNING WINNER</label>
                    <span>"{currentTelemetry.winner_token}"</span>
                  </div>
                </div>
              )}

              {/* Message Feed */}
              <div className="chat-messages-container" ref={chatScrollRef}>
                {messages.map((m, idx) => (
                  <div key={idx} className={`agi-msg ${m.sender}`}>
                    <div className="msg-header">
                      <span className="msg-sender">{m.sender === "user" ? "RESEARCHER" : "PETER"}</span>
                      {m.telemetry && (
                        <span className="msg-tele-tag">
                          {m.telemetry.spike_count.toLocaleString()} spikes · {m.telemetry.sim_duration_ms}ms
                        </span>
                      )}
                    </div>
                    <div className="msg-body">{m.text}</div>
                  </div>
                ))}
                {isThinking && (
                  <div className="agi-msg peter thinking">
                    <div className="msg-header">
                      <span className="msg-sender">PETER</span>
                    </div>
                    <div className="thinking-indicator">
                      <span className="pulse-dot" />
                      <span>Simulating 2,200 LIF neurons through connectome...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form className="chat-input-form" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  placeholder="Stimulate Peter's connectome with thoughts..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isThinking}
                />
                <button type="submit" disabled={isThinking || !input.trim()}>
                  <Send size={15} />
                  <span>TRANSMIT</span>
                </button>
              </form>
            </div>
          )}

          {/* Tab 2: Memory & Synaptic Plasticity */}
          {activeTab === "memory" && (
            <div className="console-tab-content memory-content">
              <div className="memory-section">
                <h3>SYNAPTIC WEIGHT MATRIX & HEBBIAN PLASTICITY</h3>
                <p>
                  Peter integrates dynamic weight updates through paired spike-timing Hebbian potentiation.
                  Synaptic traces modify readouts and association vectors without cloud dependencies.
                </p>

                <div className="matrix-stats-grid">
                  <div className="m-card">
                    <label>TOTAL EDGES</label>
                    <span>71,365</span>
                  </div>
                  <div className="m-card">
                    <label>EXCITATORY FRACTION</label>
                    <span>68.4%</span>
                  </div>
                  <div className="m-card">
                    <label>INHIBITORY FRACTION</label>
                    <span>31.6%</span>
                  </div>
                  <div className="m-card">
                    <label>PLASTICITY RULE</label>
                    <span>STDP / Hebbian</span>
                  </div>
                </div>

                <div className="synapse-activity-preview">
                  <h4>RECENT POTENTIATION EVENTS</h4>
                  <div className="event-list">
                    <div className="event-item">
                      <span>ME_R → LO_R (Optic Integration)</span>
                      <b>+0.042 ΔW</b>
                    </div>
                    <div className="event-item">
                      <span>AL_R → CA_R (Olfactory to Mushroom Body)</span>
                      <b>+0.087 ΔW</b>
                    </div>
                    <div className="event-item">
                      <span>FB → SMP_R (Action Selection)</span>
                      <b>+0.031 ΔW</b>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Experiments & Current Injection */}
          {activeTab === "experiment" && (
            <div className="console-tab-content experiment-content">
              <div className="experiment-section">
                <h3>TARGETED MICRO-STIMULATION</h3>
                <p>
                  Inject artificial depolaryzing current into specific neuropil clusters to observe downstream cascading activity across the 3D connectome.
                </p>

                <div className="stimulate-grid">
                  {REGIONS.map((r) => (
                    <button
                      key={r.id}
                      className="stim-btn"
                      onClick={() => handleStimulateRegion(r.id)}
                    >
                      <Zap size={13} />
                      <span>STIMULATE {r.label}</span>
                    </button>
                  ))}
                </div>

                <div className="control-switches">
                  <h4>GLOBAL COGNITIVE CONTROLS</h4>
                  <button
                    className="toggle-action-btn"
                    onClick={() => {
                      runtime.clearActivity();
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>FLUSH CURRENT SPIKE TRACES</span>
                  </button>
                  <button
                    className="toggle-action-btn danger"
                    onClick={() => {
                      runtime.reset();
                    }}
                  >
                    <span>RESET CAMERA & VIEWPORT</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Neuron Inspector */}
          {activeTab === "inspector" && selectedNeuron && (
            <div className="console-tab-content inspector-content">
              <div className="inspector-card">
                <div className="insp-header">
                  <Radio size={16} />
                  <div>
                    <h3>{selectedNeuron.name}</h3>
                    <span className="insp-id">{selectedNeuron.id}</span>
                  </div>
                </div>

                <div className="insp-fields">
                  <div className="field-row">
                    <label>REGION</label>
                    <b>{selectedNeuron.region}</b>
                  </div>
                  <div className="field-row">
                    <label>CELL TYPE</label>
                    <b>{selectedNeuron.cellType}</b>
                  </div>
                  <div className="field-row">
                    <label>TRANSMITTER</label>
                    <b>{selectedNeuron.neurotransmitter}</b>
                  </div>
                  <div className="field-row">
                    <label>HEMISPHERE</label>
                    <b>{selectedNeuron.hemisphere}</b>
                  </div>
                  <div className="field-row">
                    <label>COORDINATES</label>
                    <b>{selectedNeuron.position.map((v) => v.toFixed(1)).join(", ")}</b>
                  </div>
                  <div className="field-row">
                    <label>NODES IN SKELETON</label>
                    <b>{selectedNeuron.morphology.nodeCount}</b>
                  </div>
                </div>

                <div className="insp-actions">
                  <button
                    className="insp-btn primary"
                    onClick={() => runtime.fireNeuron(selectedNeuron.id, runtime.getStatus().simulationTime, 1.0)}
                  >
                    <Zap size={14} />
                    <span>FIRE NEURON</span>
                  </button>
                  <button
                    className="insp-btn"
                    onClick={() => runtime.focusNeuron(selectedNeuron.id)}
                  >
                    <Crosshair size={14} />
                    <span>CENTER</span>
                  </button>
                  <button
                    className="insp-btn"
                    onClick={() => runtime.isolateNeuron(status.isolatedNeuronId === selectedNeuron.id ? null : selectedNeuron.id)}
                  >
                    <EyeOff size={14} />
                    <span>{status.isolatedNeuronId === selectedNeuron.id ? "SHOW ALL" : "ISOLATE"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
