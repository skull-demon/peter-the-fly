import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CircleDot, LocateFixed, Search, X } from "lucide-react";
import { useBrainRuntime } from "../brain";
import type { SearchResult, VisualMode } from "../brain";

const modes: Array<{ id: VisualMode; label: string; code: string }> = [
  { id: "STRUCTURAL", label: "Structural", code: "01" },
  { id: "NEURAL_ACTIVITY", label: "Neural activity", code: "02" },
  { id: "CONNECTIVITY", label: "Connectivity", code: "03" },
  { id: "REGION_ACTIVITY", label: "Region activity", code: "04" },
  { id: "SPIKE_PLAYBACK", label: "Spike playback", code: "05" },
  { id: "PLASTICITY", label: "Plasticity", code: "06" },
  { id: "SINGLE_NEURON", label: "Single neuron", code: "07" },
  { id: "PATH_TRACING", label: "Path tracing", code: "08" },
];

export function ExplorerPanel() {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();
  const [query, setQuery] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [section, setSection] = useState<"regions" | "neurons">("regions");
  const results = useMemo(() => runtime.search(query), [query, runtime, runtime.getRevision()]);
  const regions = runtime.getModel().regions;
  const namedNeurons = runtime.getModel().neurons.filter((neuron) => neuron.cellType !== "UNKNOWN").slice(0, 18);

  const chooseResult = (result: SearchResult) => {
    if (result.kind === "NEURON") runtime.focusNeuron(result.id);
    else runtime.focusRegion(result.id);
    setResultsOpen(false);
  };

  return (
    <motion.aside className="explorer-panel glass-panel" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="search-wrap">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResultsOpen(Boolean(event.target.value));
          }}
          onFocus={() => setResultsOpen(Boolean(query))}
          placeholder="Search CT1, optic, root ID..."
          aria-label="Search neurons and regions"
        />
        {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
        <AnimatePresence>
          {resultsOpen && (
            <motion.div className="search-results" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <div className="results-count">{results.length} matches in loaded layer</div>
              {results.map((result) => (
                <button key={`${result.kind}-${result.id}`} onClick={() => chooseResult(result)}>
                  <i data-kind={result.kind} />
                  <span><b>{result.name}</b><small>{result.detail}</small></span>
                  <LocateFixed size={13} />
                </button>
              ))}
              {!results.length && <p>No loaded entity matches. Source-scale data can be provided through loadModel().</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <section className="panel-section mode-section">
        <div className="section-heading"><span>VISUAL MODE</span><b>{status.mode.replace(/_/g, " ")}</b></div>
        <div className="mode-list">
          {modes.map((mode) => (
            <button key={mode.id} data-active={status.mode === mode.id} onClick={() => runtime.setMode(mode.id)}>
              <small>{mode.code}</small>
              <span>{mode.label}</span>
              {status.mode === mode.id && <motion.i layoutId="mode-active" />}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section entity-section">
        <div className="section-heading"><span>MODEL HIERARCHY</span><b>BRAIN / 3</b></div>
        <div className="hierarchy-root">
          <button onClick={() => setSection(section === "regions" ? "neurons" : "regions")}>
            <ChevronDown size={13} />
            <span>Adult female brain</span>
            <small>{runtime.getModel().neurons.length}</small>
          </button>
        </div>
        <div className="entity-tabs">
          <button data-active={section === "regions"} onClick={() => setSection("regions")}>Regions</button>
          <button data-active={section === "neurons"} onClick={() => setSection("neurons")}>Named neurons</button>
        </div>
        <div className="entity-list subtle-scroll">
          {section === "regions" ? regions.map((region) => (
            <button key={region.id} data-active={status.selectedRegionId === region.id} onClick={() => runtime.focusRegion(region.id)}>
              <CircleDot size={11} style={{ color: region.color }} />
              <span>{region.name}</span>
              <small>{region.abbreviation}</small>
            </button>
          )) : namedNeurons.map((neuron) => (
            <button key={neuron.id} data-active={status.selectedNeuronId === neuron.id} onClick={() => runtime.focusNeuron(neuron.id)}>
              <CircleDot size={11} style={{ color: neuron.color }} />
              <span>{neuron.name}</span>
              <small>{neuron.cellType}</small>
            </button>
          ))}
        </div>
      </section>
    </motion.aside>
  );
}