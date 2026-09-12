import { Activity, BookOpen, Braces, Database, Eye, EyeOff, Layers3, Radio } from "lucide-react";
import { useBrainRuntime } from "../brain";

type TopBarProps = {
  onApiOpen: () => void;
};

export function TopBar({ onApiOpen }: TopBarProps) {
  const runtime = useBrainRuntime();
  const status = runtime.getStatus();
  const model = runtime.getModel();

  return (
    <header className="topbar glass-panel">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div>
          <div className="brand-name">FLYWIRE RUNTIME</div>
          <div className="brand-subtitle">Drosophila connectome visualization layer</div>
        </div>
      </div>

      <div className="dataset-readout">
        <Database size={13} />
        <span>FAFB v783 REFERENCE</span>
        <b>{model.neurons.length.toLocaleString()} renderable proxies</b>
      </div>

      <div className="top-actions">
        <div className="stream-status" title="Events accepted in the last second">
          <Radio size={13} />
          <span>{status.eventsPerSecond}/s</span>
        </div>
        <button className="icon-text-button" onClick={() => runtime.setRegions(!status.showRegions)} title="Toggle region boundaries">
          <Layers3 size={15} />
          <span>Regions</span>
        </button>
        <button className="icon-text-button" onClick={() => runtime.setLabels(!status.showLabels)} title="Toggle scientific labels">
          {status.showLabels ? <Eye size={15} /> : <EyeOff size={15} />}
          <span>Labels</span>
        </button>
        <a className="icon-button" href="https://flywire.ai/gallery" target="_blank" rel="noreferrer" title="Open source reference">
          <BookOpen size={16} />
        </a>
        <button className="api-button" onClick={onApiOpen}>
          <Braces size={15} />
          API
        </button>
      </div>
      <div className="mobile-status"><Activity size={14} /> {status.eventsPerSecond}/s</div>
    </header>
  );
}