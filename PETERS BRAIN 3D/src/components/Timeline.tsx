import { ChevronLeft, FastForward, Gauge, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useBrainRuntime } from "../brain";

export function Timeline() {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();
  const maximum = status.demoMode ? 6400 : Math.max(10000, status.simulationTime + 1000);
  const time = Math.min(maximum, status.simulationTime);

  return (
    <div className="timeline glass-panel">
      <div className="transport">
        <button onClick={() => runtime.replay()} title="Replay"><RotateCcw size={14} /></button>
        <button onClick={() => runtime.setSimulationTime(Math.max(0, status.simulationTime - 100))} title="Step backward"><ChevronLeft size={16} /></button>
        <button className="play-button" onClick={() => status.isPlaying ? runtime.pause() : runtime.play()} title={status.isPlaying ? "Pause" : "Play"}>
          {status.isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <button onClick={() => runtime.step()} title="Step forward"><SkipForward size={15} /></button>
        <button onClick={() => runtime.setSpeed(status.speed >= 4 ? 1 : status.speed * 2)} title="Fast forward"><FastForward size={15} /></button>
      </div>
      <div className="timecode">
        <span>SIMULATION TIME</span>
        <b>{Math.floor(status.simulationTime).toString().padStart(6, "0")}<small> ms</small></b>
      </div>
      <div className="scrubber">
        <div className="scrubber-labels"><span>0</span><b>{status.isPlaying ? "LIVE PLAYBACK" : "PAUSED"}</b><span>{maximum} ms</span></div>
        <input type="range" min={0} max={maximum} value={time} onChange={(event) => runtime.setSimulationTime(Number(event.target.value))} aria-label="Simulation timeline" />
        <div className="event-ticks" aria-hidden="true">
          {runtime.getRecentEvents(28).map((event, index) => <i key={`${event.type}-${event.timestamp}-${index}`} style={{ left: `${Math.min(100, (event.timestamp / maximum) * 100)}%` }} data-type={event.type} />)}
        </div>
      </div>
      <button className="speed-control" onClick={() => runtime.setSpeed(status.speed === 1 ? 0.25 : status.speed === 0.25 ? 2 : 1)} title="Playback speed">
        <Gauge size={14} /> {status.speed}x
      </button>
    </div>
  );
}