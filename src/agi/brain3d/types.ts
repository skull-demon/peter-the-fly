export type Vec3 = [number, number, number];

export type Hemisphere = "LEFT" | "RIGHT" | "MIDLINE" | "UNKNOWN";

export type VisualMode =
  | "STRUCTURAL"
  | "NEURAL_ACTIVITY"
  | "CONNECTIVITY"
  | "REGION_ACTIVITY"
  | "SPIKE_PLAYBACK"
  | "PLASTICITY"
  | "SINGLE_NEURON"
  | "PATH_TRACING";

export type NeuronVisualState =
  | "INACTIVE"
  | "ACTIVE"
  | "HIGH_ACTIVITY"
  | "BURSTING"
  | "INHIBITORY"
  | "EXCITATORY"
  | "SELECTED"
  | "LEARNING"
  | "PLASTICITY_CHANGE";

export interface SourceReference {
  dataset: string;
  version: string;
  url: string;
  sourceId?: string;
  citation?: string;
  geometryStatus: "SOURCE" | "NORMALIZED_SOURCE" | "PROCEDURAL_PROXY";
  note?: string;
}

export interface Morphology {
  branches: Vec3[][];
  somaRadius: number;
  totalLength: number;
  nodeCount: number;
  representation: "SKELETON" | "MESH" | "PROCEDURAL_PROXY";
}

export interface EntityMetadata {
  id: string;
  name: string;
  type: string;
  hemisphere: Hemisphere;
  region: string;
  source: SourceReference;
  position: Vec3;
  morphology: Morphology | Record<string, unknown>;
  connections: string[];
  metadata: Record<string, unknown>;
}

export interface Neuron extends EntityMetadata {
  entityType: "NEURON";
  cellType: string;
  neurotransmitter: "ACETYLCHOLINE" | "GABA" | "GLUTAMATE" | "DOPAMINE" | "SEROTONIN" | "OCTOPAMINE" | "UNKNOWN";
  morphology: Morphology;
  color: string;
}

export interface BrainRegion extends EntityMetadata {
  entityType: "REGION";
  abbreviation: string;
  parentId: string;
  scale: Vec3;
  rotation?: Vec3;
  color: string;
  category: "OPTIC_LOBE" | "MUSHROOM_BODY" | "CENTRAL_COMPLEX" | "CENTRAL_BRAIN" | "SEZ";
  functionAnnotation?: string;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  weight: number;
  connectionType: "EXCITATORY" | "INHIBITORY" | "UNKNOWN";
  synapseCount?: number;
  region?: string;
  metadata: Record<string, unknown>;
  sourceRef: SourceReference;
}

export interface BrainModel {
  id: string;
  name: string;
  species: "Drosophila melanogaster";
  dataset: string;
  version: string;
  coordinateSystem: string;
  regions: BrainRegion[];
  neurons: Neuron[];
  connections: Connection[];
  metadata: Record<string, unknown>;
}

export interface SpikeEvent {
  type: "spike";
  neuron_id: string;
  timestamp: number;
  intensity: number;
  amplitude?: number;
  duration?: number;
}

export interface SynapseEvent {
  type: "synapse";
  source: string;
  target: string;
  timestamp: number;
  weight: number;
  intensity?: number;
  duration?: number;
}

export interface RegionActivityEvent {
  type: "region_activity";
  region: string;
  timestamp: number;
  activity: number;
}

export interface PlasticityEvent {
  type: "plasticity";
  connection: string;
  timestamp: number;
  old_weight: number;
  new_weight: number;
  change?: number;
}

export type NeuralEvent = SpikeEvent | SynapseEvent | RegionActivityEvent | PlasticityEvent;

export interface NeuralSnapshot {
  simulationTime: number;
  mode: VisualMode;
  neuronActivity: Record<string, number>;
  regionActivity: Record<string, number>;
  neuronStates: Record<string, NeuronVisualState>;
  connectionWeights: Record<string, number>;
  selectedNeuronId: string | null;
  selectedRegionId: string | null;
  selectedConnectionId: string | null;
  highlightedPath: string[];
  recentEvents: NeuralEvent[];
}

export interface SearchResult {
  id: string;
  name: string;
  kind: "NEURON" | "REGION";
  detail: string;
}

export type CameraPreset =
  | "WHOLE_BRAIN"
  | "CENTRAL_BRAIN"
  | "LEFT_OPTIC_LOBE"
  | "RIGHT_OPTIC_LOBE"
  | "CENTRAL_COMPLEX"
  | "MUSHROOM_BODY"
  | "VISUAL_SYSTEM"
  | "TOP"
  | "FRONT"
  | "SIDE"
  | "ISOMETRIC";

export interface CameraRequest {
  serial: number;
  position: Vec3;
  target: Vec3;
}

export interface RuntimeStatus {
  modelState: "LOADING" | "READY" | "ERROR";
  isPlaying: boolean;
  speed: number;
  simulationTime: number;
  mode: VisualMode;
  showLabels: boolean;
  showRegions: boolean;
  demoMode: boolean;
  eventCount: number;
  eventsPerSecond: number;
  fps: number;
  selectedNeuronId: string | null;
  selectedRegionId: string | null;
  selectedConnectionId: string | null;
  isolatedNeuronId: string | null;
  cameraRequest: CameraRequest;
}

declare global {
  interface Window {
    flyBrain?: import("./runtime").BrainRuntime;
  }
}