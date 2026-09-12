import { motion } from "framer-motion";
import { Check, Clipboard, Download, FlaskConical, Radio, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useBrainRuntime } from "../brain";
import type { NeuralSnapshot } from "../brain";

const apiExample = `const brain = window.flyBrain;

brain.selectNeuron("UNKNOWN_CT1_GALLERY_PROXY_L");
brain.fireNeuron("UNKNOWN_CT1_GALLERY_PROXY_L", 1234.5, 0.82, 520);
brain.activateSynapse(sourceId, targetId, 0.9);
brain.setRegionActivity("ME_L", 0.71);
brain.setSimulationTime(1234.5);`;

const streamExample = `brain.ingest({
  type: "spike",
  neuron_id: "UNKNOWN_CT1_GALLERY_PROXY_L",
  timestamp: 18234,
  intensity: 0.82,
  duration: 520
});

const disconnect = brain.connectEventSource(webSocket);`;

export function ApiDrawer({ onClose }: { onClose: () => void }) {
  const runtime = useBrainRuntime();
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(apiExample);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const exportState = () => {
    const blob = new Blob([JSON.stringify(runtime.exportState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `flybrain-state-${Math.floor(runtime.getStatus().simulationTime)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importState = async (file?: File) => {
    if (!file) return;
    const snapshot = JSON.parse(await file.text()) as NeuralSnapshot;
    runtime.importState(snapshot);
  };

  return (
    <motion.div className="api-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.aside className="api-drawer" initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }} transition={{ ease: [0.2, 0.8, 0.2, 1] }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div><span>PUBLIC CONTROL SURFACE</span><h2>External event API</h2></div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="api-boundary"><Radio size={15} /><p><b>Renderer only.</b> Neural computation remains external. Every activity effect is produced by a public API call or the clearly labeled demonstration stream.</p></div>

        <section className="api-section">
          <div className="api-section-heading"><h3>Direct control</h3><button onClick={copy}>{copied ? <Check size={13} /> : <Clipboard size={13} />}{copied ? "Copied" : "Copy"}</button></div>
          <pre><code>{apiExample}</code></pre>
        </section>
        <section className="api-section">
          <h3>Event stream</h3>
          <pre><code>{streamExample}</code></pre>
        </section>

        <section className="method-grid">
          {[
            "loadModel(model)", "selectNeuron(id)", "selectRegion(id)", "setNeuronActivity(id, value)",
            "fireNeuron(id, time, amp)", "fireNeurons(events)", "activateSynapse(a, b, value)", "setRegionActivity(id, value)",
            "setNeuronState(id, state)", "setConnectionWeight(id, weight)", "highlightPath(ids)", "clearActivity()",
            "setSimulationTime(ms)", "exportState()", "importState(snapshot)", "connectEventSource(source)",
          ].map((method) => <code key={method}>{method}</code>)}
        </section>

        <section className="api-test-section">
          <h3>Runtime verification</h3>
          <p>Inject a timestamped batch through the same public ingest path used by external clients.</p>
          <button onClick={() => runtime.runSpikeStressTest(1200)}><FlaskConical size={15} /> Send 1,200 spike events</button>
          <button onClick={() => runtime.startDemo()}><Radio size={15} /> Restart demo stream</button>
        </section>

        <section className="state-actions">
          <button onClick={exportState}><Download size={14} /> Export state</button>
          <button onClick={() => inputRef.current?.click()}><Upload size={14} /> Import state</button>
          <input ref={inputRef} type="file" accept="application/json" onChange={(event) => void importState(event.target.files?.[0])} />
        </section>
      </motion.aside>
    </motion.div>
  );
}