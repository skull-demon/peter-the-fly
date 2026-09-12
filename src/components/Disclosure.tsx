import Dialog from "./Dialog";
import { Flourish } from "./Marks";

type Props = { onClose: () => void };

/**
 * First-visit disclosure. Honest, short, in the house voice.
 * Shown once per session before the laboratory is entered.
 */
export default function Disclosure({ onClose }: Props) {
  return (
    <Dialog open onClose={onClose} title="What this experiment is" className="disclosure-dialog">
      <span className="eyebrow">DISCLOSURE / SPECIMEN 001</span>
      <h2>Built on the brain of<br /><em>a real fly.</em></h2>
      <Flourish />
      <p className="notes-intro">
        Everything Peter computes runs through the wiring of an actual fruit-fly
        brain — mapped neuron by neuron by the FlyWire project and public for
        anyone to download.
      </p>
      <div className="notes-entry"><span>01</span><div><h3>What is real</h3><p>The connectome: 139,255 neurons and their 50 million synapses, reconstructed from electron microscopy. Your message becomes stimulation of a real subnetwork; the spikes that follow are simulated on that wiring, in your browser.</p></div></div>
      <div className="notes-entry"><span>02</span><div><h3>What is taught</h3><p>Peter's words come from a tiny readout trained on his own spiking states — like teaching a parrot a vocabulary, except the parrot is a connectome and recall is driven by genuine neural activity.</p></div></div>
      <div className="notes-entry"><span>03</span><div><h3>What is not claimed</h3><p>This is not a conscious mind and not a house-fly brain (the data is Drosophila). No cloud, no large language model — a small brain, honestly wired, speaking borrowed words.</p></div></div>
      <p className="handwritten note-signoff">The wiring is real. The vocabulary is new.</p>
      <button className="physical-button disclosure-accept" onClick={onClose}>
        I understand — continue
      </button>
    </Dialog>
  );
}
