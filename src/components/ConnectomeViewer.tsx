import { useEffect, useMemo, useRef, useState } from "react";
import { loadPeterRuntime } from "../brain/load";
import type { SimResult } from "../brain/sim";
import type { PeterTelemetry } from "../brain/talk";
import Dialog from "./Dialog";
import BrainMap from "./BrainMap";

type Row = { row: number; region: string };

type Props = {
  open: boolean;
  onClose: () => void;
  telemetry: PeterTelemetry | null;
  sim: SimResult | null;
  /** Peter's latest reply, shown next to the activity that produced it */
  lastReply: string | null;
  lastPrompt: string | null;
};

/**
 * Vivid neuropil palette (per-track), in the spirit of FlyWire's gallery
 * visualizations: dark ground, saturated region hues, real per-neuron traces.
 * Colors are presentation only - every dot below is still a real spike.
 */
const REGION_COLORS: Record<string, string> = {
  ME: "#4fc3f7", LO: "#ffb74d", LOP: "#f06292", LA: "#aed581",
  AME: "#9575cd", AVLP: "#4db6ac", PVLP: "#ffd54f", AL: "#e57373",
  MB: "#ba68c8", LH: "#90a4ae", FB: "#81d4fa", CX: "#a1887f",
  PB: "#ce93d8", NO: "#ffcc80", EB: "#80cbc4", SIP: "#b0bec5",
  CRE: "#dce775", IB: "#ffab91", WED: "#9fa8da",
};
const FALLBACK_PALETTE = ["#64b5f6", "#ffb74d", "#f06292", "#aed581", "#ba68c8", "#4db6ac", "#ffd54f", "#9575cd"];

function regionColor(region: string, index: number): string {
  const base = region.replace(/_[LR]$/, "").toUpperCase();
  if (REGION_COLORS[base]) return REGION_COLORS[base];
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

/**
 * THE CONNECTOME VIEWER - what the user asked for:
 * a clean, dark, FlyWire-gallery-style window showing exactly which neurons
 * fired, which brain regions that lights up, and the words those spikes
 * produced - one honest, side-by-side view, opened by a button instead of
 * smothering the bench photograph.
 */
export default function ConnectomeViewer({ open, onClose, telemetry, sim, lastReply, lastPrompt }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "spiked">("spiked");

  useEffect(() => {
    if (!open) return;
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
    return () => { cancelled = true; };
  }, [open]);

  const spikedRows = useMemo(() => {
    if (!sim || filter !== "spiked") return rows;
    const fired = new Set<number>();
    for (const step of sim.spikes) for (let i = 0; i < step.length; i++) if (step[i]) fired.add(i);
    return rows.filter((r) => fired.has(r.row));
  }, [rows, sim, filter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open || !sim || spikedRows.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padL = 110;
    const padR = 10;
    const padY = 8;
    const rowH = Math.max(3, Math.min(10, (h - padY * 2) / spikedRows.length));
    const plotW = w - padL - padR;

    const drawFrame = (playheadMs: number | null) => {
      // dark gallery ground
      ctx.fillStyle = "#10141a";
      ctx.fillRect(0, 0, w, h);

      // time grid every 100 ms
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let ms = 0; ms <= sim.durationMs; ms += 100) {
        const x = padL + (ms / sim.durationMs) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, padY);
        ctx.lineTo(x, padY + spikedRows.length * rowH + 4);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "8px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${ms}`, x, h - 2);
      }
      ctx.textAlign = "left";

      let prevRegion = "";
      for (let i = 0; i < spikedRows.length; i++) {
        const r = spikedRows[i];
        const color = regionColor(r.region, i);
        const y = padY + i * rowH;
        if (r.region !== prevRegion) {
          ctx.fillStyle = color;
          ctx.font = "8px 'IBM Plex Mono', monospace";
          ctx.textBaseline = "middle";
          ctx.fillText(r.region.replace(/_/g, " ").toUpperCase().slice(0, 15), 4, y + rowH / 2);
          ctx.strokeStyle = `${color}33`;
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + plotW, y);
          ctx.stroke();
          prevRegion = r.region;
        }
        const row = r.row;
        const steps = sim.steps;
        const maxStep = playheadMs === null ? steps - 1 : Math.min(steps - 1, Math.floor((playheadMs / sim.durationMs) * steps));
        for (let t = 0; t <= maxStep; t++) {
          if (sim.spikes[t][row]) {
            const x = padL + (t / (steps - 1)) * plotW;
            const fresh = playheadMs !== null && t >= maxStep - 8;
            ctx.fillStyle = fresh ? "#ffffff" : color;
            ctx.fillRect(x, y + rowH * 0.15, playheadMs !== null ? 2 : 1.4, rowH * 0.7);
          }
        }
      }

      if (playheadMs !== null) {
        const x = padL + (playheadMs / sim.durationMs) * plotW;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(x, padY, 1, spikedRows.length * rowH);
      }
    };

    const start = performance.now();
    const SWEEP_MS = 1600;
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
  }, [open, sim, spikedRows]);

  if (!open) return null;

  // Region color groups for the legend (in display order).
  const legend: { region: string; color: string }[] = [];
  {
    let prev = "";
    spikedRows.forEach((r, i) => {
      if (r.region !== prev) {
        legend.push({ region: r.region, color: regionColor(r.region, i) });
        prev = r.region;
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Connectome viewer" className="connectome-dialog">
      <span className="eyebrow">CONNECTOME VIEWER · FLYWIRE FAFB v783</span>
      <h2>What fired, and what it said.</h2>
      <p className="viewer-intro">
        One row per simulated fly neuron, colored by FlyWire neuropil. Every mark is a real
        spike computed in your browser during your last message.
        {" "}<a href="https://flywire.ai/gallery" target="_blank" rel="noreferrer">flywire.ai/gallery</a>{" "}
        hosts the full reconstructed brain this subnetwork comes from.
      </p>

      <div className="viewer-toolbar">
        <div className="viewer-filter" role="group" aria-label="Which neurons to show">
          <button className={filter === "spiked" ? "is-on" : ""} onClick={() => setFilter("spiked")}>NEURONS THAT SPIKED ({spikedRows.length})</button>
          <button className={filter === "all" ? "is-on" : ""} onClick={() => setFilter("all")}>ALL OUTPUT NEURONS ({rows.length})</button>
        </div>
        <span className="viewer-total eyebrow">
          {telemetry ? `${telemetry.spike_count.toLocaleString()} SPIKES · ${telemetry.simulation_ms}MS SIM` : "NO SIMULATION YET"}
        </span>
      </div>

      {sim ? (
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          aria-label="Spike raster of the last simulation, one row per neuron, colored by brain region"
        />
      ) : (
        <p className="viewer-empty">Send Peter a message - his neurons will appear here, spiking.</p>
      )}

      {legend.length > 0 && (
        <div className="viewer-legend" aria-hidden="true">
          {legend.slice(0, 14).map((l) => (
            <span key={l.region} className="legend-item"><i style={{ background: l.color }} />{l.region.replace(/_/g, " ").toUpperCase()}</span>
          ))}
        </div>
      )}

      <div className="viewer-bottom">
        <div className="viewer-map">
          <BrainMap telemetry={telemetry} active={false} />
        </div>
        <div className="viewer-io">
          <span className="eyebrow">THE SAME SPIKES, AS LANGUAGE</span>
          {lastPrompt && <p className="viewer-prompt"><span className="author-tick" /> {lastPrompt}</p>}
          {lastReply ? (
            <blockquote className="viewer-reply">{lastReply}</blockquote>
          ) : (
            <p className="viewer-empty">No reply yet.</p>
          )}
          {telemetry && (
            <p className="viewer-telemetry eyebrow">
              STATE {telemetry.state_key.slice(0, 24)}… · SEED {telemetry.seed} · {telemetry.stimulated_rows} INPUT NEURONS STIMULATED
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
