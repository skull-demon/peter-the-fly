import { useState, useEffect, useRef } from "react";
import { BrainScene } from "./brain3d/scene/BrainScene";
import { brain } from "./brain3d/runtime";
import {
  ACTIONS,
  doomArms,
  chooseAction,
  learn,
  loadPolicy,
  savePolicy,
  resetPolicy,
  epsilonOf,
  type DoomPolicy,
  NUM_SECTORS,
} from "../brain/doom";
import { loadPeterRuntime, type PeterRuntime } from "../brain/load";
import { streamDoomStepTo3D } from "./simBridge";
import { Play, Pause, RotateCcw, StepForward, X, Gamepad2, Activity } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function DoomModal({ open, onClose }: Props) {
  const [running, setRunning] = useState(false);
  const [policy, setPolicy] = useState<DoomPolicy>(() => loadPolicy());
  const [runtime, setRuntime] = useState<PeterRuntime | null>(null);
  const [step, setStep] = useState(0);
  const [lastAction, setLastAction] = useState<string>("READY");
  const [lastReward, setLastReward] = useState<number>(0);
  const [cumulativeReward, setCumulativeReward] = useState<number>(0);
  const [sectors, setSectors] = useState<number[]>([0.2, 0.4, 0.8, 0.5, 0.2]);
  const [simSpikes, setSimSpikes] = useState<number>(0);
  const [doomViewMode, setDoomViewMode] = useState<"wasm" | "neural">("wasm");
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load Peter runtime on mount and paint initial frame
  useEffect(() => {
    if (open) {
      loadPeterRuntime().then(setRuntime).catch(() => {});
      brain.cameraPreset("WHOLE_BRAIN");
      const timer = setTimeout(() => {
        drawDoomCanvas([0.2, 0.4, 0.8, 0.5, 0.2], "READY", 0);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Execute a single DOOM step
  const executeStep = () => {
    if (!runtime) return;

    // Simulate dynamic retina luminance across 5 sectors
    const t = Date.now() * 0.003;
    const currentSectors = [
      Math.max(0.1, Math.min(1.0, 0.4 + 0.3 * Math.sin(t))),
      Math.max(0.1, Math.min(1.0, 0.5 + 0.4 * Math.sin(t * 1.3 + 1))),
      Math.max(0.1, Math.min(1.0, 0.6 + 0.35 * Math.sin(t * 0.7 + 2))),
      Math.max(0.1, Math.min(1.0, 0.4 + 0.3 * Math.cos(t * 1.1))),
      Math.max(0.1, Math.min(1.0, 0.3 + 0.25 * Math.sin(t * 1.7))),
    ];
    setSectors(currentSectors);

    // 1. Run real LIF brain on the frame's retina sectors
    const brightArray = Float64Array.from(currentSectors);
    const seed = (Date.now() & 0xffff) ^ (step * 7919);
    const arms = doomArms(brightArray, runtime.bundle, seed);
    setSimSpikes(Array.from(arms.sim.binCounts).reduce((a, b) => a + b, 0));

    // 2. Select action via epsilon-greedy policy
    const actionIdx = chooseAction(arms, policy);
    const actionName = ACTIONS[actionIdx];
    setLastAction(actionName);

    // 3. Compute simulated game feedback reward
    // Shooting when bright center or moving forward yields rewards
    let reward = 0;
    if (actionName === "SHOOT" && currentSectors[2] > 0.65) {
      reward = 2.0; // Hit enemy!
    } else if (actionName === "FORWARD" && currentSectors[2] > 0.4) {
      reward = 0.5; // Advancing corridor
    } else if (actionName === "TURN_LEFT" || actionName === "TURN_RIGHT") {
      reward = 0.1; // Scanning room
    }

    setLastReward(reward);
    setCumulativeReward((prev) => prev + reward);

    // 4. Update policy learning
    const nextPolicy = learn(policy, actionIdx, reward);
    setPolicy(nextPolicy);
    savePolicy(nextPolicy);

    // 5. Stream real spikes and DOOM action into the 3D brain
    streamDoomStepTo3D(currentSectors, actionIdx, actionName, reward);

    // 6. Draw retro DOOM frame visual
    drawDoomCanvas(currentSectors, actionName, reward);

    setStep((s) => s + 1);
  };

  const drawDoomCanvas = (sect: number[], action: string, reward: number) => {
    const canvas = frameCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Deep retro DOOM palette
    ctx.fillStyle = "#1a0808";
    ctx.fillRect(0, 0, w, h);

    // Ceiling & floor gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#2d1b18");
    grad.addColorStop(0.5, "#482721");
    grad.addColorStop(1, "#181412");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Sector columns visualizer
    const secW = w / NUM_SECTORS;
    sect.forEach((lum, i) => {
      const colHeight = h * (0.35 + lum * 0.5);
      const y = (h - colHeight) / 2;
      ctx.fillStyle = `rgba(${Math.floor(180 + lum * 75)}, ${Math.floor(60 + lum * 50)}, ${Math.floor(30 + lum * 30)}, ${0.25 + lum * 0.6})`;
      ctx.fillRect(i * secW + 2, y, secW - 4, colHeight);

      // Walls / corridor geometry
      ctx.strokeStyle = `rgba(255, 140, 60, ${0.4 + lum * 0.5})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(i * secW + 2, y, secW - 4, colHeight);
    });

    // Crosshair / gun
    ctx.strokeStyle = reward > 0 ? "#55ff55" : "#ff3333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 14, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - 20, h / 2);
    ctx.lineTo(w / 2 + 20, h / 2);
    ctx.moveTo(w / 2, h / 2 - 20);
    ctx.lineTo(w / 2, h / 2 + 20);
    ctx.stroke();

    // Gun sprite baseline
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(w / 2 - 32, h - 55, 64, 55);
    ctx.fillStyle = "#111111";
    ctx.fillRect(w / 2 - 12, h - 65, 24, 20);

    if (action === "SHOOT") {
      ctx.fillStyle = "#ffff55";
      ctx.beginPath();
      ctx.arc(w / 2, h - 70, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // Game loop runner
  useEffect(() => {
    if (running && open) {
      loopTimerRef.current = setTimeout(() => {
        executeStep();
      }, 350);
    }
    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [running, open, step]);

  const handleResetPolicy = () => {
    const fresh = resetPolicy();
    setPolicy(fresh);
    setCumulativeReward(0);
    setStep(0);
  };

  if (!open) return null;

  const currentEps = epsilonOf(policy);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="doom-workspace" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="doom-header">
          <div className="doom-title">
            <Gamepad2 className="doom-icon" size={20} />
            <div>
              <h2>PETER PLAYS DOOM · 3D NEURAL COGNITION</h2>
              <p>Real-time closed-loop motor control powered by the FlyWire FAFB v783 connectome</p>
            </div>
          </div>
          <div className="doom-header-controls">
            <button
              className={`action-btn ${running ? "btn-active" : ""}`}
              onClick={() => setRunning(!running)}
            >
              {running ? <Pause size={14} /> : <Play size={14} />}
              <span>{running ? "PAUSE" : "START LOOP"}</span>
            </button>
            <button className="action-btn" onClick={executeStep} disabled={running}>
              <StepForward size={14} />
              <span>STEP</span>
            </button>
            <button className="action-btn" onClick={handleResetPolicy} title="Reset learned weights">
              <RotateCcw size={14} />
              <span>RESET</span>
            </button>
            <button className="close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Main Content: Split Screen */}
        <div className="doom-body">
          {/* Left: DOOM Viewport & Telemetry */}
          <div className="doom-left-pane">
            {/* Screen Mode Selector */}
            <div className="doom-view-toggle" style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              <button
                className={`action-pill-button ${doomViewMode === "wasm" ? "primary-pill" : ""}`}
                onClick={() => setDoomViewMode("wasm")}
                style={{ padding: "4px 10px", fontSize: "8px" }}
              >
                LIVE WASM DOOM
              </button>
              <button
                className={`action-pill-button ${doomViewMode === "neural" ? "primary-pill" : ""}`}
                onClick={() => setDoomViewMode("neural")}
                style={{ padding: "4px 10px", fontSize: "8px" }}
              >
                RETINA SIMULATOR
              </button>
            </div>

            <div className="doom-screen-frame" style={{ position: "relative", minHeight: "260px" }}>
              {doomViewMode === "wasm" ? (
                <iframe
                  src="https://diekmann.github.io/wasm-fizzbuzz/doom/"
                  title="WebAssembly Linux DOOM"
                  className="doom-iframe"
                  style={{
                    width: "100%",
                    height: "260px",
                    border: "none",
                    borderRadius: "4px",
                    background: "#000",
                  }}
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <>
                  <canvas
                    ref={frameCanvasRef}
                    width={360}
                    height={240}
                    className="doom-canvas"
                  />
                  <div className="doom-hud-overlay">
                    <span className="hud-metric">ACTION: <b>{lastAction}</b></span>
                    <span className="hud-metric">REWARD: <b className={lastReward > 0 ? "reward-pos" : ""}>+{lastReward.toFixed(1)}</b></span>
                  </div>
                </>
              )}
            </div>

            {/* Retina Sectors */}
            <div className="doom-retina-bar">
              <span className="retina-label">5-SECTOR RETINA INPUT (LUMA):</span>
              <div className="retina-cells">
                {sectors.map((val, idx) => (
                  <div key={idx} className="retina-cell">
                    <div className="cell-fill" style={{ height: `${val * 100}%` }} />
                    <span className="cell-text">S{idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bandit Telemetry */}
            <div className="doom-stats-card">
              <h3>EPSILON-GREEDY BANDIT POLICY</h3>
              <div className="stat-grid">
                <div>
                  <label>EXPLORATION (ε)</label>
                  <span>{currentEps.toFixed(3)}</span>
                </div>
                <div>
                  <label>TOTAL STEPS</label>
                  <span>{policy.updates.toLocaleString()}</span>
                </div>
                <div>
                  <label>CUMULATIVE REWARD</label>
                  <span className="highlight-val">+{cumulativeReward.toFixed(1)}</span>
                </div>
                <div>
                  <label>LIF SPIKES / STEP</label>
                  <span>{simSpikes.toLocaleString()}</span>
                </div>
              </div>

              <div className="action-values-list">
                <label>ACTION-VALUE ESTIMATES Q(a):</label>
                {ACTIONS.map((act, i) => (
                  <div key={act} className="q-bar-row">
                    <span className="q-name">{act}</span>
                    <div className="q-bar-track">
                      <div
                        className="q-bar-fill"
                        style={{
                          width: `${Math.min(100, Math.max(5, (policy.q[i] + 1) * 35))}%`,
                        }}
                      />
                    </div>
                    <span className="q-val">{policy.q[i].toFixed(2)} (n={policy.n[i]})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Live 3D Brain Viewport */}
          <div className="doom-right-pane">
            <div className="doom-brain-container">
              <BrainScene />
              <div className="doom-brain-overlay">
                <div className="overlay-badge">
                  <Activity size={13} />
                  <span>VISUALIZING FLY CONNECTOME · CENTRAL COMPLEX & MOTOR POOL</span>
                </div>
                <div className="overlay-hint">
                  Orbit & inspect the 3D neurons in real-time as Peter makes decisions
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
