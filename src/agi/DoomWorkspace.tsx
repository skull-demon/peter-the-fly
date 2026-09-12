import { useState, useEffect, useRef, useCallback } from "react";
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
  type DoomAction,
} from "../brain/doom";
import { loadPeterRuntime, type PeterRuntime } from "../brain/load";
import { streamDoomStepTo3D } from "./simBridge";
import {
  createInitialDoomState,
  stepDoomGame,
  renderDoomScene,
  getRetinaSectorsFast,
  getVisualContext,
  type DoomGameState,
} from "./doomEngine";
import { Play, Pause, RotateCcw, StepForward, ArrowLeft, Brain, Crosshair } from "lucide-react";

type Props = {
  onReturnToLab: () => void;
  onOpenAgi: () => void;
};

export default function DoomWorkspace({ onReturnToLab, onOpenAgi }: Props) {
  const [running, setRunning] = useState(false);
  const [policy, setPolicy] = useState<DoomPolicy>(() => loadPolicy());
  const [runtime, setRuntime] = useState<PeterRuntime | null>(null);
  const [step, setStep] = useState(0);
  const [lastAction, setLastAction] = useState<string>("READY");
  const [lastEvent, setLastEvent] = useState<string>("Connectome standing by");
  const [lastReward, setLastReward] = useState<number>(0);
  const [cumulativeReward, setCumulativeReward] = useState<number>(0);
  const [sectors, setSectors] = useState<number[]>([0.2, 0.4, 0.8, 0.5, 0.2]);
  const [visualContext, setVisualContext] = useState<string>("OPEN");
  const [simSpikes, setSimSpikes] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"arena" | "retina">("arena");
  const [manualControl, setManualControl] = useState(false);

  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<DoomGameState>(createInitialDoomState());

  // Load Peter connectome runtime
  useEffect(() => {
    loadPeterRuntime().then(setRuntime).catch(() => {});
    brain.cameraPreset("WHOLE_BRAIN");
  }, []);

  // Initial render of DOOM scene onto canvas
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderDoomScene(ctx, gameStateRef.current, 320, 200);
  }, []);

  useEffect(() => {
    drawScene();
  }, [drawScene]);

  // Execute a single step of the closed loop
  const executeStep = useCallback((overrideAction?: DoomAction) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Zero-lag retina sectors calculated directly from raycaster geometry
    const currentSectors = getRetinaSectorsFast(gameStateRef.current);
    const sectorsArray = Array.from(currentSectors);
    setSectors(sectorsArray);

    // 2. Sensory visual context for state-conditioned reinforcement learning
    const vContext = getVisualContext(gameStateRef.current);
    setVisualContext(vContext);

    let chosenAction: DoomAction;
    let actionIdx = 0;

    if (overrideAction) {
      chosenAction = overrideAction;
      actionIdx = ACTIONS.indexOf(overrideAction);
      if (actionIdx === -1) actionIdx = 0;
    } else if (runtime) {
      // 3. Stimulate FlyWire optic input neurons and run fast 150ms LIF simulation
      const seed = (Date.now() & 0xffff) ^ (gameStateRef.current.stepCount * 7919);
      const arms = doomArms(currentSectors, runtime.bundle, seed, null, 150);
      const totalSpk = Array.from(arms.sim.binCounts).reduce((a, b) => a + b, 0);
      setSimSpikes(totalSpk);

      // 4. Contextual action selection combining descending motor pool with learned context Q
      actionIdx = chooseAction(arms, policy, vContext);
      chosenAction = ACTIONS[actionIdx];
    } else {
      chosenAction = "FORWARD";
    }

    setLastAction(chosenAction);

    // 5. Step game world: player moves, turns, fires shotgun, damages demon
    const stepResult = stepDoomGame(gameStateRef.current, chosenAction);
    setLastEvent(stepResult.event);
    setLastReward(stepResult.reward);
    setCumulativeReward(gameStateRef.current.cumulativeReward);

    // 6. Render updated frame
    renderDoomScene(ctx, gameStateRef.current, 320, 200);

    // 7. Update contextual reinforcement learning policy
    const nextPolicy = learn(policy, actionIdx, stepResult.reward, vContext);
    setPolicy(nextPolicy);
    savePolicy(nextPolicy);

    // 8. Stream spikes and motor decision to 3D connectome
    streamDoomStepTo3D(sectorsArray, actionIdx, chosenAction, stepResult.reward);

    setStep((prev) => prev + 1);
  }, [policy, runtime]);

  // Autonomous loop runner
  useEffect(() => {
    if (running && !manualControl) {
      loopTimerRef.current = setTimeout(() => {
        executeStep();
      }, 200);
    }
    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [running, manualControl, step, executeStep]);

  // Manual keyboard controls (Scientist override)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === "ArrowUp" || e.code === "KeyW") {
        executeStep("FORWARD");
      } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
        executeStep("TURN_LEFT");
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        executeStep("TURN_RIGHT");
      } else if (e.code === "Space" || e.code === "ControlLeft" || e.code === "ControlRight") {
        executeStep("SHOOT");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [executeStep]);

  const handleReset = () => {
    setRunning(false);
    gameStateRef.current = createInitialDoomState();
    const fresh = resetPolicy();
    setPolicy(fresh);
    setStep(0);
    setCumulativeReward(0);
    setLastReward(0);
    setLastAction("READY");
    setLastEvent("Agent reset to factory baseline");
    drawScene();
  };

  const currentEps = epsilonOf(policy);
  const gameState = gameStateRef.current;

  return (
    <div className="doom-workspace-root">
      {/* Masthead */}
      <header className="doom-masthead">
        <div className="doom-brand">
          <button className="text-control return-btn" onClick={onReturnToLab}>
            <ArrowLeft size={13} />
            <span>LAB BENCH</span>
          </button>
          <span className="masthead-separator">/</span>
          <span className="doom-title">PETER THE FLY · DOOM COGNITIVE ARENA</span>
          <span className="doom-subtitle">FlyWire FAFB v783 Connectome · Closed-Loop Motor Control</span>
        </div>

        <div className="doom-nav-actions">
          <button className="text-control nav-control" onClick={onOpenAgi}>
            <Brain size={13} />
            <span>AGI WORKSPACE</span>
          </button>
        </div>
      </header>

      {/* Main Grid: Game Viewport + Live 3D Connectome */}
      <main className="doom-main-grid">
        {/* Left Pane: Interactive DOOM Screen & Brain Telemetry */}
        <section className="doom-left-section">
          {/* Controls Bar */}
          <div className="doom-controls-bar">
            <button
              className={`doom-action-btn ${running ? "active" : ""}`}
              onClick={() => {
                setRunning(!running);
                if (manualControl) setManualControl(false);
              }}
            >
              {running ? <Pause size={13} /> : <Play size={13} />}
              <span>{running ? "PAUSE NEURAL AGENT" : "RUN NEURAL AGENT"}</span>
            </button>

            <button
              className="doom-action-btn"
              onClick={() => executeStep()}
              disabled={running}
            >
              <StepForward size={13} />
              <span>SINGLE STEP</span>
            </button>

            <button
              className={`doom-action-btn ${manualControl ? "active" : ""}`}
              onClick={() => {
                setManualControl(!manualControl);
                if (running) setRunning(false);
              }}
              title="Control with Arrow Keys or WASD, Space to Shoot"
            >
              <Crosshair size={13} />
              <span>{manualControl ? "KEYBOARD ACTIVE" : "KEYBOARD OVERRIDE"}</span>
            </button>

            <button
              className="doom-action-btn danger"
              onClick={handleReset}
            >
              <RotateCcw size={12} />
              <span>RESET ARENA</span>
            </button>

            <div className="doom-view-selector">
              <button
                className={`view-toggle-btn ${viewMode === "arena" ? "active" : ""}`}
                onClick={() => setViewMode("arena")}
              >
                DOOM ARENA
              </button>
              <button
                className={`view-toggle-btn ${viewMode === "retina" ? "active" : ""}`}
                onClick={() => setViewMode("retina")}
              >
                RETINA HUD
              </button>
            </div>
          </div>

          {/* DOOM Viewport Container */}
          <div className="doom-viewport-container">
            <div className="retina-canvas-wrapper">
              <canvas
                ref={canvasRef}
                width={320}
                height={200}
                className="doom-pixel-canvas"
              />

              {viewMode === "retina" && (
                <div className="retina-hud-overlay">
                  <div className="retina-sectors-visualizer">
                    {sectors.map((val, idx) => (
                      <div
                        key={idx}
                        className="retina-sector-column"
                        style={{ opacity: 0.15 + val * 0.75 }}
                      >
                        <span>S{idx + 1}</span>
                        <small>{(val * 100).toFixed(0)}%</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="hud-overlay-tag">
                ACTION: <b>{lastAction}</b> · REWARD: <b>{lastReward >= 0 ? `+${lastReward.toFixed(1)}` : lastReward.toFixed(1)}</b> · {lastEvent}
              </div>
            </div>
          </div>

          {/* Neural Decision & Telemetry Strip */}
          <div className="doom-telemetry-panel">
            <div className="decision-banner">
              <div className="current-action-display">
                <label>SENSORY CONTEXT</label>
                <span className="action-tag" style={{ color: "#e5b364" }}>{visualContext}</span>
              </div>
              <div className="current-action-display">
                <label>FLYWIRE MOTOR ACTION</label>
                <span className="action-tag">{lastAction}</span>
              </div>
              <div className="reward-display">
                <label>REWARD SIGNAL</label>
                <span className={`reward-tag ${lastReward > 0 ? "positive" : lastReward < 0 ? "negative" : ""}`}>
                  {lastReward >= 0 ? `+${lastReward.toFixed(1)}` : lastReward.toFixed(1)}
                </span>
              </div>
              <div className="cumul-reward-display">
                <label>TOTAL REWARD</label>
                <span className="cumul-tag">+{cumulativeReward.toFixed(1)}</span>
              </div>
              <div className="cumul-reward-display">
                <label>MONSTERS KILLED</label>
                <span className="cumul-tag">{gameState.player.kills}</span>
              </div>
            </div>

            {/* 5-Sector Retina Luminance from FAFB Visual Neuropil */}
            <div className="retina-strip">
              <label>FAFB OPTIC INPUT NEURONS (5-SECTOR RETINA INTEGRATION)</label>
              <div className="retina-meters">
                {sectors.map((val, idx) => (
                  <div key={idx} className="retina-meter">
                    <div className="meter-fill" style={{ height: `${val * 100}%` }} />
                    <span className="meter-label">S{idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reinforcement Learning Policy Parameters */}
            <div className="policy-stats-grid">
              <div className="stat-box">
                <label>EXPLORATION (ε)</label>
                <span>{currentEps.toFixed(3)}</span>
              </div>
              <div className="stat-box">
                <label>LIF SPIKES / STEP</label>
                <span>{simSpikes.toLocaleString()}</span>
              </div>
              <div className="stat-box">
                <label>POLICY UPDATES</label>
                <span>{policy.updates.toLocaleString()}</span>
              </div>
              <div className="stat-box">
                <label>DESCENDING MOTOR POOLS</label>
                <span>30 NEURONS (4 ARMS)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Pane: Live 3D FlyWire Connectome */}
        <section className="doom-right-section">
          <div className="connectome-3d-header">
            <span className="header-badge">LIVE 3D CONNECTOME</span>
            <span className="header-info">FAFB v783 · 2,200 LIF NEURONS · 71,365 SYNAPSES</span>
          </div>

          <div className="connectome-3d-wrapper">
            <BrainScene />
          </div>

          <div className="connectome-3d-footer">
            <span>DRAG TO ROTATE · SCROLL TO ZOOM · REAL-TIME SPIKE ACTIVATION LINKED TO MOTOR OUTPUT</span>
          </div>
        </section>
      </main>
    </div>
  );
}
