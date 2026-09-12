"""brainpack: turn the public FlyWire FAFB v783 connectome into Peter's brain.

All data comes from the official public releases:
- Connectivity: Zenodo record 10676866 (FlyWire Consortium, "FlyWire Whole-brain
  Connectome Connectivity Data", version 783).
- Neuron annotations: flyconnectome/flywire_annotations (v783, GitHub).
No fabricated neurons, no random graphs.
"""

from .bundle import write_bundle
from .ingest import load_connections, load_neurons, load_synapses, MANIFEST_PATH, RAW_DIR
from .subgraph import selection_summary, select_subgraph
from .spikegen import sample_neuron_attributes, split_io, stimulus_from_tokens

__all__ = [
    "load_connections",
    "load_neurons",
    "load_synapses",
    "MANIFEST_PATH",
    "RAW_DIR",
    "write_bundle",
    "select_subgraph",
    "selection_summary",
    "stimulus_from_tokens",
    "sample_neuron_attributes",
    "split_io",
]
