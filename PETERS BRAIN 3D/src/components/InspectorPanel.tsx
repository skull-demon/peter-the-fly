import { AnimatePresence, motion } from "framer-motion";
import { Box, Crosshair, ExternalLink, EyeOff, GitBranch, Radio, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useBrainRuntime } from "../brain";

const DataRow = ({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) => (
  <div className="data-row">
    <span>{label}</span>
    <b className={mono ? "mono" : ""}>{value}</b>
  </div>
);

function ActivityGraph({ values }: { values: number[] }) {
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 280},${55 - value * 48}`).join(" ");
  return (
    <div className="activity-graph">
      <svg viewBox="0 0 280 58" preserveAspectRatio="none" aria-label="Recent spike activity">
        <path d="M0 55H280M0 28H280" />
        <polyline points={points || "0,55 280,55"} />
      </svg>
    </div>
  );
}

export function InspectorPanel() {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();
  const neuron = runtime.getNeuron(status.selectedNeuronId);
  const region = runtime.getRegion(status.selectedRegionId);
  const connection = status.selectedConnectionId ? runtime.getConnection(status.selectedConnectionId) : undefined;

  return (
    <motion.aside className="inspector-panel glass-panel" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.65, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}>
      <AnimatePresence mode="wait">
        {neuron ? (
          <motion.div key={neuron.id} className="inspector-content" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
            <div className="inspector-kicker"><Radio size={12} /> NEURON / {neuron.hemisphere}</div>
            <h2>{neuron.name}</h2>
            <div className="entity-id">{neuron.id}</div>
            {neuron.source.geometryStatus === "PROCEDURAL_PROXY" && <div className="proxy-warning">PROXY GEOMETRY / SOURCE METADATA PRESERVED</div>}

            <div className="activity-summary">
              <div><span>Activity</span><b>{runtime.getNeuronActivity(neuron.id).toFixed(2)}</b></div>
              <div><span>Spike count</span><b>{runtime.getSpikeStats(neuron.id).count}</b></div>
              <div><span>Last spike</span><b>{runtime.getSpikeStats(neuron.id).lastSpike?.toFixed(0) ?? "--"} ms</b></div>
            </div>
            <ActivityGraph values={runtime.getSpikeStats(neuron.id).history.map((spike) => spike.intensity)} />

            <div className="inspector-actions">
              <button onClick={() => runtime.fireNeuron(neuron.id)}><Zap size={14} /> Fire</button>
              <button onClick={() => runtime.focusNeuron(neuron.id)}><Crosshair size={14} /> Center</button>
              <button onClick={() => runtime.isolateNeuron(status.isolatedNeuronId === neuron.id ? null : neuron.id)} data-active={status.isolatedNeuronId === neuron.id}><EyeOff size={14} /> Isolate</button>
            </div>

            <section className="metadata-section">
              <h3>Metadata</h3>
              <DataRow label="Cell type" value={neuron.cellType} />
              <DataRow label="Region anchor" value={neuron.region} mono />
              <DataRow label="Hemisphere" value={neuron.hemisphere} />
              <DataRow label="Transmitter" value={neuron.neurotransmitter} />
              <DataRow label="Coordinates" value={neuron.position.map((value) => value.toFixed(2)).join(", ")} mono />
              <DataRow label="Morphology" value={neuron.morphology.representation} />
              <DataRow label="Nodes" value={neuron.morphology.nodeCount} />
            </section>

            <section className="metadata-section">
              <h3>Connectivity</h3>
              <DataRow label="Loaded edges" value={neuron.connections.length} />
              <DataRow label="Incoming" value={runtime.getModel().connections.filter((edge) => edge.target === neuron.id).length} />
              <DataRow label="Outgoing" value={runtime.getModel().connections.filter((edge) => edge.source === neuron.id).length} />
              <button className="wide-action" onClick={() => {
                const next = runtime.getModel().connections.find((edge) => edge.source === neuron.id);
                if (next) runtime.activateSynapse(next.source, next.target, 0.9);
              }}><GitBranch size={14} /> Activate loaded downstream edge</button>
              <div className="path-actions">
                <button onClick={() => runtime.highlightUpstream(neuron.id)}>Highlight upstream</button>
                <button onClick={() => runtime.highlightDownstream(neuron.id)}>Highlight downstream</button>
              </div>
            </section>

            <section className="source-section">
              <h3>Source traceability</h3>
              <p>{neuron.source.note}</p>
              <a href={neuron.source.url} target="_blank" rel="noreferrer">{neuron.source.dataset} / {neuron.source.version}<ExternalLink size={12} /></a>
            </section>
          </motion.div>
        ) : connection ? (
          <motion.div key={connection.id} className="inspector-content" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
            <div className="inspector-kicker"><GitBranch size={12} /> CONNECTION / {connection.connectionType}</div>
            <h2>{connection.id}</h2>
            <div className="entity-id">{connection.source} -&gt; {connection.target}</div>
            <div className="proxy-warning">{String(connection.metadata.classification ?? "SOURCE CONNECTION")}</div>
            <div className="region-meter">
              <div><span>Current weight</span><b>{runtime.getConnectionWeight(connection.id).toFixed(2)}</b></div>
              <i><span style={{ width: `${Math.min(100, runtime.getConnectionWeight(connection.id) * 10)}%`, background: "#e7b565" }} /></i>
            </div>
            <div className="inspector-actions two">
              <button onClick={() => runtime.activateSynapse(connection.source, connection.target, 0.9)}><Zap size={14} /> Propagate</button>
              <button onClick={() => runtime.applyPlasticity(connection.id, runtime.getConnectionWeight(connection.id), runtime.getConnectionWeight(connection.id) + 2)}><Sparkles size={14} /> Strengthen</button>
            </div>
            <section className="metadata-section">
              <h3>Connection metadata</h3>
              <DataRow label="Source" value={connection.source} mono />
              <DataRow label="Target" value={connection.target} mono />
              <DataRow label="Type" value={connection.connectionType} />
              <DataRow label="Region" value={connection.region ?? "UNKNOWN"} mono />
              <DataRow label="Synapse count" value={connection.synapseCount ?? "Not supplied"} />
              <div className="path-actions">
                <button onClick={() => runtime.focusNeuron(connection.source)}>Inspect source</button>
                <button onClick={() => runtime.focusNeuron(connection.target)}>Inspect target</button>
              </div>
            </section>
            <section className="source-section">
              <h3>Source traceability</h3>
              <p>{connection.sourceRef.note}</p>
              <a href={connection.sourceRef.url} target="_blank" rel="noreferrer">{connection.sourceRef.dataset}<ExternalLink size={12} /></a>
            </section>
          </motion.div>
        ) : region ? (
          <motion.div key={region.id} className="inspector-content" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
            <div className="inspector-kicker"><Box size={12} /> NEUROPIL / {region.category.replace(/_/g, " ")}</div>
            <h2>{region.name}</h2>
            <div className="entity-id">{region.id}</div>
            <div className="proxy-warning">SOURCE NAME / NORMALIZED BOUNDARY PROXY</div>

            <div className="region-meter">
              <div><span>Regional activity</span><b>{runtime.getRegionActivity(region.id).toFixed(2)}</b></div>
              <i><span style={{ width: `${runtime.getRegionActivity(region.id) * 100}%`, background: region.color }} /></i>
            </div>
            <div className="inspector-actions two">
              <button onClick={() => runtime.setRegionActivity(region.id, 0.88)}><Sparkles size={14} /> Activate</button>
              <button onClick={() => runtime.focusRegion(region.id)}><Crosshair size={14} /> Center</button>
            </div>

            <section className="metadata-section">
              <h3>Region metadata</h3>
              <DataRow label="Region ID" value={region.id} mono />
              <DataRow label="Abbreviation" value={region.abbreviation} />
              <DataRow label="Hemisphere" value={region.hemisphere} />
              <DataRow label="Parent" value={region.parentId} mono />
              <DataRow label="Renderable neurons" value={runtime.getModel().neurons.filter((item) => item.region === region.id).length} />
              <DataRow label="Known function" value="Not supplied" />
            </section>
            <section className="source-section">
              <h3>Source traceability</h3>
              <p>{region.source.note}</p>
              <a href={region.source.url} target="_blank" rel="noreferrer">FlyWire neuropil reference<ExternalLink size={12} /></a>
            </section>
          </motion.div>
        ) : (
          <motion.div key="empty" className="empty-inspector" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="empty-orbit"><i /><i /><span /></div>
            <p>SELECT AN ENTITY</p>
            <h2>Inspect source metadata and live visual state.</h2>
            <span>Click a neuron arbor, soma, region boundary, or scientific label.</span>
            <button onClick={() => runtime.selectNeuron(runtime.getModel().neurons[0].id)}><Crosshair size={14} /> Select demonstration neuron</button>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="inspector-reset" onClick={() => runtime.reset()} title="Reset visualization"><RotateCcw size={14} /></button>
    </motion.aside>
  );
}