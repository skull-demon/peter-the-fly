/**
 * AGI Workspace
 *
 * This component uses the FlyWire neural substrate directly via agiEngine.ts.
 * It does NOT call askPeter(), talk.ts, or any chatbot pipeline.
 * Two different inputs → two different requestIds → two independent neural runs.
 * UNCERTAIN is shown honestly when confidence is below threshold.
 */

import { useState, useEffect, useRef } from "react";
import { BrainScene } from "./brain3d/scene/BrainScene";
import { useBrainRuntime } from "./brain3d/hooks";
import type { CameraPreset, VisualMode, SearchResult } from "./brain3d/types";
import { streamSimResultTo3D } from "./simBridge";
import {
  processAgiTask,
  resetAgiLearning,
  CONFIDENCE_HIGH,
  CONFIDENCE_LOW,
  type AgiTaskResult,
  type AgiTraceEntry,
} from "../brain/agiEngine";
import { loadPeterRuntime } from "../brain/load";
import { FlyWireAgiCore } from "../brain/agiCore";
import { evaluateAgiCore } from "../../evaluation/v1/evaluator";
import { TRAINING_CURRICULUM, BLIND_HOLDOUT } from "../../evaluation/v1/curriculum";
import {
  Send,
  RotateCcw,
  Zap,
  Activity,
  Search,
  Database,
  Minimize2,
  Gamepad2,
  Flame,
  X,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Brain,
  Cpu,
} from "lucide-react";

// ---- Types ----------------------------------------------------------------

type Props = {
  onReturnToLab: () => void;
  onOpenDoom: () => void;
};

interface AgiMessage {
  id: string;
  sender: "researcher" | "system";
  input?: string;
  result?: AgiTaskResult;
  errorText?: string;
  timestamp: number;
}

const VISUAL_MODES: Array<{ id: VisualMode; label: string }> = [
  { id: "NEURAL_ACTIVITY", label: "Activity" },
  { id: "STRUCTURAL", label: "Structural" },
  { id: "CONNECTIVITY", label: "Connectivity" },
  { id: "REGION_ACTIVITY", label: "Regions" },
  { id: "SPIKE_PLAYBACK", label: "Spikes" },
  { id: "PLASTICITY", label: "Plasticity" },
];

const PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: "WHOLE_BRAIN", label: "Whole" },
  { id: "CENTRAL_COMPLEX", label: "Central" },
  { id: "RIGHT_OPTIC_LOBE", label: "Optic" },
  { id: "MUSHROOM_BODY", label: "Mushroom" },
  { id: "TOP", label: "Top" },
  { id: "ISOMETRIC", label: "Iso" },
];

const REGIONS = [
  { id: "ME_R", label: "MEDULLA" },
  { id: "LA_R", label: "LAMINA" },
  { id: "LO_R", label: "LOBULA" },
  { id: "LOP_R", label: "LOBULA PLATE" },
  { id: "CA_R", label: "MUSHROOM BODY" },
  { id: "FB", label: "FAN-SHAPED BODY" },
  { id: "PB", label: "PROTO. BRIDGE" },
  { id: "EB", label: "ELLIPSOID BODY" },
];

// ---- Confidence badge ------------------------------------------------------

function ConfidenceBadge({ label, value }: { label: "HIGH" | "LOW" | "UNCERTAIN"; value: number }) {
  const colors: Record<string, string> = {
    HIGH: "#6be06b",
    LOW: "#e5b364",
    UNCERTAIN: "#e05a5a",
  };
  return (
    <span
      className="confidence-badge"
      style={{ color: colors[label], borderColor: colors[label] }}
    >
      {label} {(value * 100).toFixed(0)}%
    </span>
  );
}

// ---- Readout Vector Heatmap ------------------------------------------------

function ReadoutHeatmap({ vector }: { vector: Float64Array }) {
  if (!vector || vector.length === 0) return null;
  const max = Math.max(...vector) || 1;
  const sample = Array.from(vector).slice(0, 60); // show first 60 neurons
  return (
    <div className="readout-heatmap">
      {sample.map((v, i) => (
        <div
          key={i}
          className="heatmap-cell"
          style={{
            opacity: 0.15 + (v / max) * 0.85,
            background: v > max * 0.5 ? "#d4ad71" : "#7ab4c4",
          }}
          title={`Neuron ${i}: ${v.toFixed(1)} spikes`}
        />
      ))}
    </div>
  );
}

// ---- Trace log display -----------------------------------------------------

function TraceLog({ trace, collapsed }: { trace: AgiTraceEntry[]; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="trace-log">
      {trace.map((entry, i) => (
        <div key={i} className="trace-entry">
          <span className="trace-stage">{entry.stage}</span>
          <span className="trace-detail">{entry.detail}</span>
          {entry.value !== undefined && (
            <span className="trace-value">{String(entry.value)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- AGI Result Card -------------------------------------------------------

function AgiResultCard({ msg }: { msg: AgiMessage }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const r = msg.result;

  if (!r) return null;

  return (
    <div className={`agi-result-card ${r.confidenceLabel.toLowerCase()}`}>
      {/* Answer line */}
      <div className="result-answer-row">
        <div className="result-answer">
          {r.answer === "UNCERTAIN" ? (
            <span className="uncertain-answer">
              <AlertTriangle size={14} />
              UNCERTAIN — neural state insufficient
            </span>
          ) : (
            <span className="resolved-answer">{r.answer}</span>
          )}
        </div>
        <ConfidenceBadge label={r.confidenceLabel} value={r.confidence} />
      </div>

      {/* Neural metrics row */}
      <div className="result-metrics-row">
        <span className="metric-pill">
          <Zap size={10} /> {r.spikes.toLocaleString()} spikes
        </span>
        <span className="metric-pill">
          <Activity size={10} /> {r.activeNeurons} active neurons
        </span>
        <span className="metric-pill">
          <Cpu size={10} /> {r.simDurationMs}ms sim
        </span>
        <span className="metric-pill subtle">
          {r.modifiedSynapses.toLocaleString()} plastic synapses
        </span>
      </div>

      {/* Readout heatmap */}
      <div className="readout-section">
        <span className="readout-label">660-NEURON READOUT POOL (first 60 shown):</span>
        <ReadoutHeatmap vector={r.readoutVector} />
      </div>

      {/* State key */}
      <div className="state-key-row">
        <span className="state-key-label">STATE KEY:</span>
        <code className="state-key-value">{r.stateKey}</code>
      </div>

      {/* Pipeline trace toggle */}
      <button
        className="trace-toggle-btn"
        onClick={() => setTraceOpen(!traceOpen)}
      >
        {traceOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {traceOpen ? "HIDE" : "SHOW"} EXECUTION TRACE ({r.trace.length} steps)
      </button>
      <TraceLog trace={r.trace} collapsed={!traceOpen} />

      {/* Request ID */}
      <div className="request-id-row">
        <span className="req-id-label">REQUEST:</span>
        <code className="req-id-value">{r.requestId}</code>
      </div>
    </div>
  );
}

// ---- Main Workspace --------------------------------------------------------

export default function AgiWorkspace({ onReturnToLab, onOpenDoom }: Props) {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();

  const [activeTab, setActiveTab] = useState<"task" | "neural" | "memory" | "validation">("task");
  const [messages, setMessages] = useState<AgiMessage[]>([
    {
      id: "init",
      sender: "system",
      errorText: "AGI workspace ready. FlyWire connectome initializing. Send any input — the neural substrate will process it.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<AgiTaskResult | null>(null);
  const [learningEnabled, setLearningEnabled] = useState(false);
  const [feedbackInput, setFeedbackInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [evalRunning, setEvalRunning] = useState(false);
  const [evalOutput, setEvalOutput] = useState<string | null>(null);
  const taskScrollRef = useRef<HTMLDivElement>(null);

  // Search neurons
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchResults(runtime.search(searchQuery.trim(), 8));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, runtime]);

  // Auto-scroll
  useEffect(() => {
    if (taskScrollRef.current) {
      taskScrollRef.current.scrollTop = taskScrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  // ---- AGI Task Handler — THE critical path --------------------------------
  // Does NOT call askPeter(). Does NOT use talk.ts.
  // Routes through agiEngine.processAgiTask() → FlyWireAgiCore.predict()
  const handleSubmitTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || isProcessing) return;

    setInput("");
    const msgId = `msg-${Date.now()}`;

    // Add researcher input immediately
    setMessages((prev) => [
      ...prev,
      { id: msgId + "-in", sender: "researcher", input: prompt, timestamp: Date.now() },
    ]);
    setIsProcessing(true);

    try {
      // This is the ACTUAL AGI pipeline — not the chatbot
      const result = await processAgiTask(prompt, {
        enableLearning: learningEnabled,
        feedbackToken: learningEnabled && feedbackInput.trim() ? feedbackInput.trim() : undefined,
      });

      // Stream real spikes to 3D visualization
      streamSimResultTo3D(result.sim);

      setLastResult(result);
      setMessages((prev) => [
        ...prev,
        { id: msgId + "-out", sender: "system", result, timestamp: Date.now() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: msgId + "-err",
          sender: "system",
          errorText: `Neural processing failed: ${err instanceof Error ? err.message : "unknown error"}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = async () => {
    await resetAgiLearning();
    setLastResult(null);
    setMessages([
      {
        id: "reset",
        sender: "system",
        errorText: "Neural state reset. Learned synaptic modifiers cleared.",
        timestamp: Date.now(),
      },
    ]);
  };

  const handleRunEval = async () => {
    setEvalRunning(true);
    setEvalOutput("Running evaluation on real FlyWire substrate...");
    try {
      const rt = await loadPeterRuntime();
      const core = new FlyWireAgiCore(rt.bundle);
      const trainResult = evaluateAgiCore(core, TRAINING_CURRICULUM);
      const holdoutResult = evaluateAgiCore(core, BLIND_HOLDOUT);
      setEvalOutput(
        `TRAIN accuracy (${TRAINING_CURRICULUM.length} examples): ${(trainResult.accuracy * 100).toFixed(1)}%\n` +
        `HOLDOUT accuracy (${BLIND_HOLDOUT.length} examples, unseen): ${(holdoutResult.accuracy * 100).toFixed(1)}%\n\n` +
        `Untrained baseline — readout weights are random.\n` +
        `These results reflect pure FlyWire reservoir state projection.\n\n` +
        `Sample predictions:\n` +
        trainResult.details.slice(0, 5).map(
          d => `  "${d.input}" → predicted: "${d.predicted}" (expected: "${d.expected}") ${d.isCorrect ? "✓" : "✗"}`
        ).join("\n")
      );
    } catch (err) {
      setEvalOutput(`Evaluation error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setEvalRunning(false);
    }
  };


  return (
    <div className="agi-workspace-root">
      {/* Top Masthead */}
      <header className="agi-masthead">
        <div className="agi-brand">
          <div className="agi-logo-dot" />
          <div>
            <h1>PETER THE FLY <span className="agi-tag">AGI WORKSPACE</span></h1>
            <p className="agi-subtitle">Direct Connectome Interface · FlyWire FAFB v783 · No LLM</p>
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
          <div className={`stat-pill ${learningEnabled ? "highlight" : ""}`}>
            <Flame size={12} />
            <span>{learningEnabled ? "R-STDP LEARNING ON" : "LEARNING OFF"}</span>
          </div>
          {lastResult && (
            <div className="stat-pill">
              <Brain size={12} />
              <span>{lastResult.spikes.toLocaleString()} SPIKES</span>
            </div>
          )}
        </div>

        <div className="agi-nav-actions">
          <button className="agi-btn doom-btn" onClick={onOpenDoom}>
            <Gamepad2 size={14} />
            <span>DOOM</span>
          </button>
          <button className="agi-btn lab-btn" onClick={onReturnToLab}>
            <Minimize2 size={14} />
            <span>LAB</span>
          </button>
        </div>
      </header>

      {/* Main grid */}
      <div className="agi-main-grid">
        {/* Left: 3D Brain */}
        <div className="agi-brain-pane">
          <div className="agi-canvas-holder">
            <BrainScene />

            {/* Top overlay */}
            <div className="brain-overlay-top">
              <div className="search-box">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Search neuron, region..."
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

            {/* Bottom overlay */}
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
          {/* Tabs */}
          <div className="console-tabs">
            <button
              className={`tab-btn ${activeTab === "task" ? "active" : ""}`}
              onClick={() => setActiveTab("task")}
            >
              <Cpu size={13} />
              <span>NEURAL TASK</span>
            </button>
            <button
              className={`tab-btn ${activeTab === "neural" ? "active" : ""}`}
              onClick={() => setActiveTab("neural")}
            >
              <Activity size={13} />
              <span>PIPELINE</span>
            </button>
            <button
              className={`tab-btn ${activeTab === "memory" ? "active" : ""}`}
              onClick={() => setActiveTab("memory")}
            >
              <Database size={13} />
              <span>PLASTICITY</span>
            </button>
            <button
              className={`tab-btn ${activeTab === "validation" ? "active" : ""}`}
              onClick={() => setActiveTab("validation")}
            >
              <ShieldCheck size={13} />
              <span>PROOF</span>
            </button>
          </div>

          {/* ---- TAB: NEURAL TASK ------------------------------------------ */}
          {activeTab === "task" && (
            <div className="console-tab-content task-content">
              {/* Learning control */}
              <div className="learning-control-bar">
                <label className="learning-toggle">
                  <input
                    type="checkbox"
                    checked={learningEnabled}
                    onChange={(e) => setLearningEnabled(e.target.checked)}
                  />
                  <span>R-STDP LEARNING</span>
                </label>
                {learningEnabled && (
                  <input
                    type="text"
                    className="feedback-input"
                    placeholder="Correct answer (feedback token for R-STDP)"
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                  />
                )}
                <button className="agi-btn-sm reset-btn" onClick={handleReset} title="Reset learned synaptic state">
                  <RotateCcw size={11} />
                  RESET
                </button>
              </div>

              {/* Message feed */}
              <div className="task-messages-container" ref={taskScrollRef}>
                {messages.map((msg) => {
                  if (msg.sender === "researcher") {
                    return (
                      <div key={msg.id} className="agi-msg researcher">
                        <div className="msg-header">
                          <span className="msg-sender">RESEARCHER INPUT</span>
                          <code className="msg-time">{new Date(msg.timestamp).toLocaleTimeString()}</code>
                        </div>
                        <div className="msg-body task-input">{msg.input}</div>
                      </div>
                    );
                  }
                  if (msg.result) {
                    return (
                      <div key={msg.id} className="agi-msg system">
                        <div className="msg-header">
                          <span className="msg-sender">NEURAL OUTPUT</span>
                          <code className="msg-time">{new Date(msg.timestamp).toLocaleTimeString()}</code>
                        </div>
                        <AgiResultCard msg={msg} />
                      </div>
                    );
                  }
                  // system message / error
                  return (
                    <div key={msg.id} className="agi-msg system-note">
                      <span className="system-note-text">{msg.errorText}</span>
                    </div>
                  );
                })}

                {isProcessing && (
                  <div className="agi-msg system processing">
                    <div className="msg-header">
                      <span className="msg-sender">NEURAL PROCESSING</span>
                    </div>
                    <div className="thinking-indicator">
                      <span className="pulse-dot" />
                      <span>Simulating 2,200 LIF neurons through FlyWire connectome...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Task input */}
              <form className="chat-input-form" onSubmit={handleSubmitTask}>
                <input
                  type="text"
                  placeholder="Enter any task — the FlyWire substrate processes it..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isProcessing}
                />
                <button type="submit" disabled={isProcessing || !input.trim()}>
                  <Send size={15} />
                  <span>TRANSMIT</span>
                </button>
              </form>
            </div>
          )}

          {/* ---- TAB: PIPELINE --------------------------------------------- */}
          {activeTab === "neural" && (
            <div className="console-tab-content pipeline-content">
              <h3 className="section-title">AGI PIPELINE (NOT THE CHATBOT)</h3>

              <div className="pipeline-diagram">
                <div className="pipe-stage">
                  <span className="pipe-label">INPUT</span>
                  <div className="pipe-desc">Arbitrary text → <code>stimulusForText()</code></div>
                </div>
                <div className="pipe-arrow">↓</div>
                <div className="pipe-stage">
                  <span className="pipe-label">ENCODING</span>
                  <div className="pipe-desc">Token hash → 220 input-pool neurons (FlyWire)</div>
                </div>
                <div className="pipe-arrow">↓</div>
                <div className="pipe-stage active">
                  <span className="pipe-label">LIF SIMULATION</span>
                  <div className="pipe-desc"><code>simulateBrain()</code> — 2,200 neurons, 71,365 synapses, 0.5ms dt</div>
                </div>
                <div className="pipe-arrow">↓</div>
                <div className="pipe-stage">
                  <span className="pipe-label">READOUT</span>
                  <div className="pipe-desc">660 motor/readout neurons → spike count vector</div>
                </div>
                <div className="pipe-arrow">↓</div>
                <div className="pipe-stage">
                  <span className="pipe-label">DECODE</span>
                  <div className="pipe-desc">Learned readout weight matrix → argmax over vocabulary</div>
                </div>
                <div className="pipe-arrow">↓</div>
                <div className="pipe-stage">
                  <span className="pipe-label">CONFIDENCE GATE</span>
                  <div className="pipe-desc">
                    &gt;{(CONFIDENCE_HIGH * 100).toFixed(0)}% → HIGH &nbsp;|&nbsp;
                    &gt;{(CONFIDENCE_LOW * 100).toFixed(0)}% → LOW &nbsp;|&nbsp;
                    else → UNCERTAIN
                  </div>
                </div>
              </div>

              <div className="pipeline-separation-note">
                <AlertTriangle size={13} />
                <div>
                  <strong>CHATBOT PIPELINE IS SEPARATE.</strong>
                  <br />
                  AGI mode does NOT call <code>askPeter()</code>, <code>talk.ts</code>, or the readout corpus.
                  The chatbot uses authored sentences. AGI uses learned readout weights.
                  Two completely separate code paths.
                </div>
              </div>

              {lastResult && (
                <div className="last-run-summary">
                  <h4>LAST NEURAL RUN</h4>
                  <div className="matrix-stats-grid">
                    <div className="m-card">
                      <label>REQUEST ID</label>
                      <span style={{ fontSize: "9px" }}>{lastResult.requestId}</span>
                    </div>
                    <div className="m-card">
                      <label>SPIKES</label>
                      <span>{lastResult.spikes.toLocaleString()}</span>
                    </div>
                    <div className="m-card">
                      <label>ACTIVE NEURONS</label>
                      <span>{lastResult.activeNeurons}</span>
                    </div>
                    <div className="m-card">
                      <label>SIM TIME</label>
                      <span>{lastResult.simDurationMs}ms</span>
                    </div>
                    <div className="m-card">
                      <label>STATE KEY</label>
                      <span style={{ fontSize: "9px" }}>{lastResult.stateKey}</span>
                    </div>
                    <div className="m-card">
                      <label>CONFIDENCE</label>
                      <span>{(lastResult.confidence * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- TAB: PLASTICITY ------------------------------------------- */}
          {activeTab === "memory" && (
            <div className="console-tab-content memory-content">
              <h3 className="section-title">SYNAPTIC PLASTICITY STATE</h3>
              <p className="section-desc">
                Real R-STDP (Reward-Modulated STDP) state from <code>localStorage["peter-rstdp-v2"]</code>.
                These are actual synaptic modifier values computed from spike timing × reward signal.
                Not a lookup table.
              </p>

              <div className="matrix-stats-grid">
                <div className="m-card">
                  <label>MODIFIED SYNAPSES</label>
                  <span>{lastResult?.modifiedSynapses.toLocaleString() ?? "—"}</span>
                </div>
                <div className="m-card">
                  <label>REWARD BASELINE</label>
                  <span>{lastResult ? lastResult.rewardBaseline.toFixed(4) : "—"}</span>
                </div>
                <div className="m-card">
                  <label>MODIFIER RANGE</label>
                  <span>[0.25 – 2.50]</span>
                </div>
                <div className="m-card">
                  <label>PLASTICITY RULE</label>
                  <span>Three-Factor R-STDP</span>
                </div>
              </div>

              <div className="plasticity-explanation">
                <h4>HOW LEARNING WORKS</h4>
                <div className="pipe-stage" style={{ marginBottom: 6 }}>
                  <code>spike timing → stdpKernel(Δt) → eligibility trace</code>
                </div>
                <div className="pipe-arrow" style={{ fontSize: 11, marginBottom: 6 }}>↓</div>
                <div className="pipe-stage" style={{ marginBottom: 6 }}>
                  <code>reward - baseline → prediction error</code>
                </div>
                <div className="pipe-arrow" style={{ fontSize: 11, marginBottom: 6 }}>↓</div>
                <div className="pipe-stage">
                  <code>Δw = η × PE × eligibility → clamped to [0.25, 2.50]</code>
                </div>
              </div>

              <div className="note-box">
                <strong>EXTERNAL MEMORY vs NEURAL MEMORY</strong>
                <br />
                <em>External memory</em> (chatbot facts) = the <code>peterMemory</code> store in <code>memory.ts</code>.
                Used only by the chatbot (<code>talk.ts</code>). Not used here.
                <br />
                <em>Neural memory</em> = the synaptic modifier map in <code>RStdpState</code>.
                Used only by the AGI engine. Not used by the chatbot.
              </div>

              <button className="toggle-action-btn danger" onClick={handleReset}>
                <RotateCcw size={13} />
                RESET SYNAPTIC LEARNING STATE
              </button>
            </div>
          )}

          {/* ---- TAB: PROOF ------------------------------------------------ */}
          {activeTab === "validation" && (
            <div className="console-tab-content validation-content">
              <h3 className="section-title">SCIENTIFIC VERIFICATION</h3>

              <div className="matrix-stats-grid">
                <div className="m-card">
                  <label>NEURONS</label>
                  <span>2,200 LIF</span>
                </div>
                <div className="m-card">
                  <label>SYNAPSES</label>
                  <span>71,365</span>
                </div>
                <div className="m-card">
                  <label>INPUT POOL</label>
                  <span>220 neurons</span>
                </div>
                <div className="m-card">
                  <label>READOUT POOL</label>
                  <span>660 neurons</span>
                </div>
                <div className="m-card">
                  <label>CHATBOT CALLS</label>
                  <span style={{ color: "#6be06b" }}>0 (NONE)</span>
                </div>
                <div className="m-card">
                  <label>EXTERNAL API</label>
                  <span style={{ color: "#6be06b" }}>0 (NONE)</span>
                </div>
              </div>

              <button
                className="action-pill-button agi-pill"
                style={{ width: "100%", padding: "11px", justifyContent: "center", fontSize: "10px", marginTop: 10 }}
                onClick={handleRunEval}
                disabled={evalRunning}
              >
                <ShieldCheck size={15} />
                <span>{evalRunning ? "RUNNING NEURAL EVALUATION..." : "RUN IN-BROWSER EVALUATION (FlyWire substrate)"}</span>
              </button>

              {evalOutput && (
                <pre className="eval-output">{evalOutput}</pre>
              )}

              <div className="note-box" style={{ marginTop: 12 }}>
                <strong>WHAT THE EVALUATION PROVES:</strong>
                <br />
                Each prediction is made by running a full LIF simulation on the FlyWire connectome.
                The readout is a dot-product of the spike vector with learned weights.
                Untrained = random weights → random predictions.
                After training steps → weights bias toward correct tokens.
                <br /><br />
                <strong>WHAT IT DOES NOT PROVE:</strong> general intelligence, reasoning, or understanding.
                The system is a small biological neural substrate with R-STDP.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
