import { useMemo } from "react";
import type { PeterTelemetry } from "../brain/talk";

type RegionSpec = {
  id: string;
  label: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

const REGIONS: RegionSpec[] = [
  { id: "ME", label: "MEDULLA", cx: 34, cy: 62, rx: 17, ry: 12 },
  { id: "LA", label: "LAMINA", cx: 22, cy: 47, rx: 9, ry: 7 },
  { id: "LO", label: "LOBULA", cx: 28, cy: 82, rx: 13, ry: 9 },
  { id: "LOP", label: "LOBULA PLATE", cx: 27, cy: 99, rx: 11, ry: 8 },
  { id: "MB", label: "MUSHROOM BODY", cx: 96, cy: 60, rx: 20, ry: 13 },
  { id: "FB", label: "FAN-SHAPED BODY", cx: 96, cy: 96, rx: 15, ry: 10 },
  { id: "CX", label: "CENTRAL COMPLEX", cx: 95, cy: 122, rx: 14, ry: 9 },
  { id: "AL", label: "ANTENNAL LOBE", cx: 150, cy: 70, rx: 12, ry: 10 },
  { id: "LH", label: "LATERAL HORN", cx: 148, cy: 98, rx: 11, ry: 8 },
  { id: "PB", label: "PROTOCEREBRAL BRIDGE", cx: 90, cy: 40, rx: 16, ry: 7 },
  { id: "NO", label: "NODULI", cx: 125, cy: 44, rx: 9, ry: 6 },
  { id: "EB", label: "ELLIPSOID BODY", cx: 120, cy: 140, rx: 13, ry: 8 },
  { id: "SIP", label: "SUPERIOR INT.", cx: 130, cy: 158, rx: 13, ry: 8 },
  { id: "CRE", label: "CREPTINE", cx: 160, cy: 150, rx: 10, ry: 7 },
  { id: "IB", label: "INFERIOR BRIDGE", cx: 62, cy: 140, rx: 12, ry: 8 },
  { id: "AVLP", label: "ANT. VENTRAL LP", cx: 60, cy: 110, rx: 12, ry: 8 },
  { id: "PVLP", label: "POST. VENTRAL LP", cx: 58, cy: 132, rx: 12, ry: 8 },
  { id: "WED", label: "WEDGE", cx: 70, cy: 158, rx: 11, ry: 7 },
  { id: "AME", label: "ACCESSORY MEDULLA", cx: 50, cy: 44, rx: 8, ry: 6 },
];

type Props = {
  telemetry: PeterTelemetry | null;
  active: boolean;
};

const REGION_IDS = new Set(REGIONS.map((r) => r.id));

function baseName(region: string): string {
  return region.replace(/_[LR]$/, "").toUpperCase();
}

/** A neuron's region string is an arborization pattern ("ME>LO", "ME.LOP",
 *  "LA>ME", "brain_motor_neuron"). Every neuropil it names gets credit —
 *  a neuron arborizing in ME and LO genuinely drives both regions. */
function arborizationRegions(region: string): string[] {
  const out: string[] = [];
  for (const token of region.split(/[>.\s]+/)) {
    const base = baseName(token);
    if (REGION_IDS.has(base) && !out.includes(base)) out.push(base);
  }
  return out;
}

export default function BrainMap({ telemetry, active }: Props) {
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    let sum = 0;
    const regions = telemetry ? telemetry.regions : {};
    const entries = Object.entries(regions);
    for (const entry of entries) {
      const region = entry[0];
      const count = entry[1];
      for (const id of arborizationRegions(region)) {
        map.set(id, (map.get(id) ?? 0) + count);
      }
      sum = sum + count;
    }
    return { map: map, sum: sum };
  }, [telemetry]);

  function intensity(id: string): number {
    const count = totals.map.get(id) ?? 0;
    if (totals.sum === 0) return 0;
    const share = (count / totals.sum) * 4;
    return Math.min(1, share);
  }

  const topRegion = [...totals.map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  function litLine(id: string): string | null {
    const count = totals.map.get(id) ?? 0;
    if (count === 0) return null;
    return id === topRegion ? `${count.toLocaleString()} SPIKES · TOP REGION` : `${count.toLocaleString()} SPIKES`;
  }

  const countLine = telemetry
    ? telemetry.neurons_simulated.toLocaleString() + " NEURONS · " + telemetry.spike_count.toLocaleString() + " SPIKES"
    : "AWAITING FIRST TRANSMISSION";

  return (
    <div className={active ? "brain-map brain-map-active" : "brain-map"}>
      <div className="brain-map-heading">
        <span className="eyebrow">BRAIN ACTIVATION · FLYWIRE v783</span>
        <span className="brain-map-count">{countLine}</span>
      </div>
      <svg
        viewBox="0 0 190 185"
        className="brain-map-svg"
        role="img"
        aria-label="Schematic of the fruit-fly brain, regions lit by recorded simulation activity"
      >
        <path
          d="M22 34 C60 18 140 18 172 40 C182 74 180 118 160 152 C132 178 66 178 40 156 C18 128 12 70 22 34 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
          opacity=".5"
        />
        {REGIONS.map((r) => {
          const level = intensity(r.id);
          const lit = level > 0.02;
          const line = litLine(r.id);
          return (
            <g key={r.id} style={{ opacity: 0.3 + level * 0.7 }}>
              <ellipse
                cx={r.cx}
                cy={r.cy}
                rx={r.rx}
                ry={r.ry}
                className={lit ? "brain-region-fill is-lit" : "brain-region-fill"}
                style={{ opacity: 0.15 + level * 0.85 }}
              >
                <title>{line ?? "no recorded spikes"}</title>
              </ellipse>
              <text x={r.cx} y={r.cy + 2.4} className="brain-region-label">
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="brain-map-footnote">
        Regions brighten with real spike counts from the last simulation. Hemisphere suffixes (_L / _R) are combined.
      </p>
    </div>
  );
}
