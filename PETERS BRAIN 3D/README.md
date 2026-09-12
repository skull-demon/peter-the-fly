# FlyWire Reference Connectome Runtime

An interactive WebGL rendering and interaction layer for adult *Drosophila melanogaster* connectome data. The application uses the visual language and source-supported nomenclature of the FlyWire FAFB v783 connectome and exposes a simulator-agnostic JavaScript API.

## Scientific boundary

This project is a visualization runtime. It does not simulate neurons, infer activity, or implement learning.

The bundled scene contains:

- Source-supported FlyWire neuropil identifiers and names
- A normalized bilateral region layout for exploration
- 1,180 independently addressable render entities
- Explicitly labeled procedural morphology proxies for the demonstration layer
- A small set of source-cited FAFB v783 metadata examples
- Demonstration-only connections and timestamped activity events

The bundled neuron arbors and neuropil surfaces are not FlyWire reconstruction meshes. They are marked `PROCEDURAL_PROXY` in metadata and `UNKNOWN_...` when an exact source ID is not available. This avoids presenting invented geometry as anatomical data. Use `brain.loadModel()` to attach source-derived SWC skeletons, meshes, coordinates, and connectivity for anatomical work.

FlyWire and Codex do not directly serve all full neuron meshes as a small browser package. The publication-scale FAFB skeleton collection contains hundreds of millions of tree nodes. Keeping that data external is also necessary for practical lazy loading and LOD.

## Run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Production output is generated with:

```bash
npm run build
```

## Runtime API

The singleton is exported from `src/brain/index.ts` and is also attached to `window.flyBrain` for non-React integrations.

```ts
import { brain } from "./brain";

brain.selectNeuron("UNKNOWN_CT1_GALLERY_PROXY_L");
brain.fireNeuron("UNKNOWN_CT1_GALLERY_PROXY_L", 1234.5, 0.82, 520);
brain.activateSynapse(sourceId, targetId, 0.9);
brain.setRegionActivity("ME_L", 0.71);
brain.setSimulationTime(1234.5);
```

Core methods:

- `loadModel(model)`
- `reloadScene()`
- `selectNeuron(id)`
- `selectRegion(id)`
- `selectConnection(id)`
- `setNeuronActivity(id, value)`
- `fireNeuron(id, timestamp, amplitude, duration)`
- `fireNeurons(events)`
- `activateSynapse(source, target, intensity, timestamp, duration)`
- `setRegionActivity(id, value, timestamp)`
- `setNeuronState(id, state)`
- `setConnectionWeight(id, weight)`
- `applyPlasticity(id, oldWeight, newWeight, timestamp)`
- `highlightPath(neuronIds)`
- `highlightUpstream(id)` and `highlightDownstream(id)`
- `clearActivity()`
- `setSimulationTime(time)`
- `play()`, `pause()`, `step()`, `setSpeed()`, `replay()`
- `exportState()` and `importState(snapshot)`
- `ingest(event)` and `ingestBatch(events)`
- `connectEventSource(eventTarget)`

All mutation methods return the runtime, allowing method chaining.

## Streaming

Any `EventTarget` that emits `MessageEvent` objects can be connected. This includes WebSocket and Worker instances.

```ts
const socket = new WebSocket("wss://your-simulator.example/events");
const disconnect = brain.connectEventSource(socket);

// Later
disconnect();
```

Accepted event objects:

```ts
brain.ingest({
  type: "spike",
  neuron_id: "720575940625431866",
  timestamp: 18234,
  intensity: 0.82,
  duration: 420,
});

brain.ingest({
  type: "synapse",
  source: "source-id",
  target: "target-id",
  timestamp: 18235,
  weight: 6,
});

brain.ingest({
  type: "region_activity",
  region: "ME_R",
  timestamp: 18240,
  activity: 0.71,
});

brain.ingest({
  type: "plasticity",
  connection: "connection-id",
  timestamp: 18250,
  old_weight: 5,
  new_weight: 7,
});
```

## Loading source models

`BrainModel`, `Neuron`, `BrainRegion`, and `Connection` are defined in `src/brain/types.ts`. Every neuron and region must have a stable unique ID. Duplicate IDs are rejected by `loadModel()`.

Morphology is represented as branches, where each branch is an ordered array of `[x, y, z]` points. The renderer batches these segments into one GPU buffer. Source coordinates can be normalized for display while raw values remain in the metadata object.

```ts
const model: BrainModel = {
  id: "my-fafb-model",
  name: "FAFB source model",
  species: "Drosophila melanogaster",
  dataset: "FlyWire FAFB",
  version: "783",
  coordinateSystem: "normalized FAFB display coordinates",
  regions,
  neurons,
  connections,
  metadata: { sourceUrl: "https://codex.flywire.ai" },
};

brain.loadModel(model);
```

The SWC helper in `src/brain/adapters/swc.ts` converts source skeleton text into a typed neuron while retaining provenance:

```ts
import { parseSwcNeuron } from "./brain";

const neuron = parseSwcNeuron(swcText, {
  id: rootId,
  source: {
    dataset: "FlyWire FAFB",
    version: "783",
    url: sourceUrl,
    sourceId: rootId,
    geometryStatus: "SOURCE",
  },
}, { scale: 0.00002, offset: [-2, -1, 0] });
```

For the full dataset, split models by spatial tile or population and feed only the current LOD into `loadModel()`. The scene renderer already uses batched line geometry, instanced somas and pulses, frustum culling, capped transient effects, and GPU post-processing.

## React integration

Use the complete scene directly:

```tsx
import { BrainScene } from "./brain/scene/BrainScene";

export function Visualization() {
  return <div style={{ width: "100%", height: "100%" }}><BrainScene /></div>;
}
```

Use `useBrainRuntime()` in React controls. It subscribes through `useSyncExternalStore` and stays compatible with activity emitted outside React.

## Demonstration and verification

The built-in demo is labeled `DEMO / SIMULATED ACTIVITY`. It schedules spikes, connection pulses, regional activity and plasticity markers without claiming biological activity.

Open the API drawer to:

- Restart timestamped demonstration playback
- Inject 1,200 spike events through the batch API
- Export a neural state snapshot
- Import and replay a state snapshot

The renderer caps simultaneous pulse meshes while retaining recent event history. This preserves interaction during event bursts. Actual frame rate remains hardware and browser dependent, and is shown in the scene readout.

## Structure

```text
src/brain/types.ts              Data and event contracts
src/brain/data/                 Source metadata and demo model
src/brain/adapters/             Source format adapters
src/brain/events/               Demonstration event stream
src/brain/runtime.ts            Public state and control API
src/brain/search.ts             Search index
src/brain/camera.ts             Camera presets
src/brain/scene/                GPU renderer and activity effects
src/components/                 Explorer interface
```

## Sources

- FlyWire Gallery: https://flywire.ai/gallery
- FlyWire Codex: https://codex.flywire.ai
- Dorkenwald et al. 2024, *Neuronal wiring diagram of an adult brain*, Nature
- Schlegel et al. 2024, *Whole-brain annotation and multi-connectome cell typing of Drosophila*, Nature
- Ito et al. 2014, systematic insect brain nomenclature
- FlyWire FAFB v783 connectivity archive: https://zenodo.org/records/10676866

The source reference is stored per object under `entity.source`, including dataset, version, URL, source ID where available, geometry status, and an explanatory note.