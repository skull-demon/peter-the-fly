import { useEffect, useRef, useState } from "react";
import { loadPeterRuntime } from "../brain/load";
import type { SimResult } from "../brain/sim";
import type { PeterTelemetry } from "../brain/talk";

type Row = { row: number; region: string };

type Props = {
  telemetry: PeterTelemetry | null;
  sim: SimResult | null;
  /** compact mode for the bench overlay */
  compact?: boolean;
};

/**
 * SPIKE RASTER — the real thing, not a decoration.
 *
 * One row per simulated output neuron (the readout pool: the neurons whose
 * spikes ARE Peter's words), ordered by the FlyWire neuropil each neuron
 * belongs to. During playback a playhead sweeps the 600 ms simulation and
 * draws each spike exactly when it happened; the full raster stays until the
 * next run. Every dot on this canvas is a spike computed in this browser.
 */
export default function NeuronView({ telemetry, sim, compact = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [rows, setRows] = useState<Row[]>([]);

  // Load the readout-pool rows grouped by region once.
  useEffect(() => {
    let cancelled = false;
    loadPeterRuntime()
      .then(({ bundle }) => {
        if (cancelled) return;
        const region = bundle.attrs.region;
        const grouped: Row[] = Array.from(bundle.readoutRows)
          .filter((r) => r < bundle.neuronCount)
          .map((row) => ({ row, region: region[row] ?? "unknown" }))
          .sort((a, b) => (a.region < b.region ? -1 : a.region > b.region ? 1 : a.row - b.row));
        setRows(grouped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sim || rows.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padL = compact ? 0 : 92;
    const padR = 6;
    const padY = 4;
    const rowH = Math.max(2, Math.min(9, (h - padY * 2) / rows.length));
    const plotW = w - padL - padR;

    const INK = "rgba(131, 117, 97, 0.5)";
    const DOT = "#9e6b43";
    const DOT_HOT = "#6c7652";

    const drawFrame = (playheadMs: number | null) => {
      ctx.clearRect(0, 0, w, h);

      if (!compact) {
        ctx.font = "8px 'IBM Plex Mono', monospace";
        ctx.textBaseline = "middle";
        let prevRegion = "";
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r.region !== prevRegion) {
            const y = padY + i * rowH;
            ctx.fillStyle = "#837561";
            ctx.fillText(r.region.replace(/_/g, " ").toUpperCase().slice(0, 14), 0, y + rowH / 2);
            ctx.fillStyle = INK;
            ctx.fillRect(padL, y, plotW, 0.5);
            prevRegion = r.region;
          }
        }
      }

      const steps = sim.steps;
      const durationMs = sim.durationMs;
      const maxStep =
        playheadMs === null ? steps - 1 : Math.min(steps - 1, Math.floor((playheadMs / durationMs) * steps));

      if (compact) {
        // Compact strip: population firing rate over time (PSTH). One column
        // per simulation step; height = fraction of the pool spiking. All 660
        // neurons are represented even at thumbnail size.
        const plotH = h - padY * 2;
        let maxRate = 1;
        const rates = new Float32Array(steps);
        for (let t = 0; t < steps; t++) {
          const step = sim.spikes[t];
          let c = 0;
          for (let i = 0; i < rows.length; i++) if (step[rows[i].row]) c++;
          rates[t] = c;
          if (c > maxRate) maxRate = c;
        }
        for (let t = 0; t <= maxStep; t++) {
          const x = padL + (t / (steps - 1)) * plotW;
          const barH = (rates[t] / maxRate) * plotH;
          const isPlayhead = playheadMs !== null && t >= maxStep - 8;
          ctx.fillStyle = isPlayhead ? DOT_HOT : DOT;
          ctx.fillRect(x, padY + plotH - barH, playheadMs !== null ? 1.6 : 1.1, barH);
        }
      } else {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].row;
          const y = padY + i * rowH + rowH / 2;
          for (let t = 0; t <= maxStep; t++) {
            if (sim.spikes[t][row]) {
              const x = padL + (t / (steps - 1)) * plotW;
              const isPlayhead = playheadMs !== null && t >= maxStep - 8;
              ctx.fillStyle = isPlayhead ? DOT_HOT : DOT;
              ctx.fillRect(x, y - rowH / 2, playheadMs !== null ? 1.6 : 1.2, rowH);
            }
          }
        }
      }

      if (playheadMs !== null) {
        const x = padL + (playheadMs / durationMs) * plotW;
        ctx.fillStyle = "#926046";
        ctx.fillRect(x, padY, 1, rows.length * rowH);
      }
    };

    const start = performance.now();
    const SWEEP_MS = 1800;
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed < SWEEP_MS) {
        drawFrame((elapsed / SWEEP_MS) * sim.durationMs);
        rafRef.current = requestAnimationFrame(tick);
      } else {
        drawFrame(null);
      }
    };
    drawFrame(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sim, rows, compact]);

  const nSpikes = telemetry ? telemetry.spike_count.toLocaleString() : "—";
  const nNeurons = rows.length.toLocaleString();

  return (
    <div className={compact ? "neuron-view neuron-view-compact" : "neuron-view"}>
      <div className="neuron-view-heading">
        <span className="eyebrow">{compact ? "POPULATION FIRING · " : "SPIKE RASTER · "}{nNeurons} OUTPUT NEURONS</span>
        <span className="neuron-view-count">{nSpikes} SPIKES / 600 MS</span>
      </div>
      <canvas
        ref={canvasRef}
        className="neuron-view-canvas"
        aria-label="Spike raster: one row per simulated fly neuron, each dot is a real computed spike"
      />
      {!compact && (
        <p className="neuron-view-footnote eyebrow">
          EVERY DOT IS A SPIKE COMPUTED IN YOUR BROWSER · ROWS GROUPED BY FLYWIRE NEUROPIL
        </p>
      )}
    </div>
  );
}
