import { demoModel, namedDemoNeuronIds } from "./data/model";
import { CAMERA_PRESETS } from "./camera";
import { buildDemoEventStream } from "./events/demoStream";
import { BrainSearchIndex } from "./search";
import type {
  BrainModel,
  CameraPreset,
  CameraRequest,
  Connection,
  NeuralEvent,
  NeuralSnapshot,
  Neuron,
  NeuronVisualState,
  PlasticityEvent,
  RuntimeStatus,
  SearchResult,
  SpikeEvent,
  SynapseEvent,
  Vec3,
  VisualMode,
} from "./types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothFps = (current: number, deltaSeconds: number) => current * 0.92 + Math.min(99, 1 / Math.max(0.001, deltaSeconds)) * 0.08;

type Listener = () => void;

type ActivityValue = {
  value: number;
  timestamp: number;
};

export class BrainRuntime {
  private model: BrainModel = demoModel;
  private neuronById = new Map<string, Neuron>();
  private regionById = new Map<string, BrainModel["regions"][number]>();
  private connectionById = new Map<string, Connection>();
  private listeners = new Set<Listener>();
  private revision = 0;
  private modelRevision = 0;
  private lastUiEmit = 0;
  private eventRateWindow: number[] = [];
  private neuronActivity = new Map<string, ActivityValue>();
  private regionActivity = new Map<string, ActivityValue>();
  private neuronStates = new Map<string, NeuronVisualState>();
  private connectionWeights = new Map<string, number>();
  private eventHistory: NeuralEvent[] = [];
  private highlightedPath: string[] = [];
  private demoDuration = 6400;
  private searchIndex: BrainSearchIndex;

  private status: RuntimeStatus = {
    modelState: "READY",
    isPlaying: true,
    speed: 1,
    simulationTime: 0,
    mode: "NEURAL_ACTIVITY",
    showLabels: true,
    showRegions: true,
    demoMode: true,
    eventCount: 0,
    eventsPerSecond: 0,
    fps: 60,
    selectedNeuronId: null,
    selectedRegionId: null,
    selectedConnectionId: null,
    isolatedNeuronId: null,
    cameraRequest: { serial: 0, ...CAMERA_PRESETS.WHOLE_BRAIN },
  };

  constructor(model: BrainModel = demoModel) {
    this.searchIndex = new BrainSearchIndex(model);
    this.indexModel(model);
  }

  private indexModel(model: BrainModel) {
    this.model = model;
    this.neuronById = new Map(model.neurons.map((neuron) => [neuron.id, neuron]));
    this.regionById = new Map(model.regions.map((region) => [region.id, region]));
    this.connectionById = new Map(model.connections.map((connection) => [connection.id, connection]));
    this.searchIndex?.rebuild(model);
    this.modelRevision += 1;
  }

  private publish(force = true) {
    const now = performance.now();
    if (!force && now - this.lastUiEmit < 80) return;
    this.lastUiEmit = now;
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  private registerEvent(event: NeuralEvent) {
    this.eventHistory.push(event);
    if (this.eventHistory.length > 12000) this.eventHistory.splice(0, this.eventHistory.length - 12000);
    this.eventRateWindow.push(performance.now());
    this.status = { ...this.status, eventCount: this.status.eventCount + 1 };
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = () => this.revision;

  getModelRevision = () => this.modelRevision;

  getModel = () => this.model;

  getStatus = () => this.status;

  getNeuron = (id: string | null) => (id ? this.neuronById.get(id) : undefined);

  getRegion = (id: string | null) => (id ? this.regionById.get(id) : undefined);

  getConnection = (id: string) => this.connectionById.get(id);

  getRecentEvents = (limit = 40) => this.eventHistory.slice(-limit);

  getHighlightedPath = () => this.highlightedPath;

  getNeuronState = (id: string) => this.neuronStates.get(id) ?? "INACTIVE";

  getConnectionWeight = (id: string) => this.connectionWeights.get(id) ?? this.connectionById.get(id)?.weight ?? 0;

  getNeuronActivity = (id: string, atTime = this.status.simulationTime) => {
    let value = this.neuronActivity.get(id)?.value ?? 0;
    const lookback = Math.max(0, this.eventHistory.length - 3000);
    for (let index = this.eventHistory.length - 1; index >= lookback; index -= 1) {
      const event = this.eventHistory[index];
      if (event.type !== "spike" || event.neuron_id !== id || event.timestamp > atTime) continue;
      const duration = event.duration ?? 520;
      const age = atTime - event.timestamp;
      if (age <= duration) value = Math.max(value, event.intensity * (1 - age / duration));
      if (age > duration * 1.5) break;
    }
    return clamp01(value);
  };

  getActivityFrame = (atTime = this.status.simulationTime) => {
    const frame = new Map<string, number>();
    this.neuronActivity.forEach((activity, id) => frame.set(id, activity.value));
    this.getActiveSpikes(atTime, 192).forEach((event) => {
      const duration = event.duration ?? 520;
      const decay = Math.max(0, 1 - (atTime - event.timestamp) / duration);
      frame.set(event.neuron_id, Math.max(frame.get(event.neuron_id) ?? 0, event.intensity * decay));
    });
    return frame;
  };

  getRegionActivity = (id: string, atTime = this.status.simulationTime) => {
    const direct = this.regionActivity.get(id);
    let value = direct?.value ?? 0;
    for (let index = this.eventHistory.length - 1; index >= 0; index -= 1) {
      const event = this.eventHistory[index];
      if (event.type === "region_activity" && event.region === id && event.timestamp <= atTime) {
        const decay = Math.max(0, 1 - (atTime - event.timestamp) / 2400);
        value = Math.max(value, event.activity * decay);
        break;
      }
    }
    return clamp01(value);
  };

  getActiveSpikes = (atTime = this.status.simulationTime, limit = 96) => {
    const active: SpikeEvent[] = [];
    for (let index = this.eventHistory.length - 1; index >= 0 && active.length < limit; index -= 1) {
      const event = this.eventHistory[index];
      if (event.type !== "spike") continue;
      const duration = event.duration ?? 520;
      if (event.timestamp <= atTime && event.timestamp + duration >= atTime && this.neuronById.has(event.neuron_id)) active.push(event);
      if (event.timestamp < atTime - 2500) break;
    }
    return active;
  };

  getActiveSynapses = (atTime = this.status.simulationTime, limit = 48) => {
    const active: SynapseEvent[] = [];
    for (let index = this.eventHistory.length - 1; index >= 0 && active.length < limit; index -= 1) {
      const event = this.eventHistory[index];
      if (event.type !== "synapse") continue;
      const duration = event.duration ?? 820;
      if (event.timestamp <= atTime && event.timestamp + duration >= atTime) active.push(event);
      if (event.timestamp < atTime - 2500) break;
    }
    return active;
  };

  getSpikeStats = (id: string) => {
    const spikes = this.eventHistory.filter((event): event is SpikeEvent => event.type === "spike" && event.neuron_id === id);
    return {
      count: spikes.length,
      lastSpike: spikes.length ? spikes[spikes.length - 1].timestamp : null,
      history: spikes.slice(-24),
    };
  };

  loadModel(model: BrainModel) {
    const ids = [...model.neurons.map((entity) => entity.id), ...model.regions.map((entity) => entity.id)];
    if (new Set(ids).size !== ids.length) throw new Error("brain.loadModel(): all neuron and region IDs must be unique.");
    this.status = { ...this.status, modelState: "LOADING" };
    this.publish();
    this.clearActivity(false);
    this.indexModel(model);
    this.status = { ...this.status, modelState: "READY", selectedNeuronId: null, selectedRegionId: null, selectedConnectionId: null };
    this.publish();
    return this;
  }

  reloadScene() {
    const current = this.model;
    this.status = { ...this.status, modelState: "LOADING" };
    this.publish();
    this.indexModel(current);
    this.clearActivity(false);
    this.status = { ...this.status, modelState: "READY", simulationTime: 0 };
    this.cameraPreset("WHOLE_BRAIN");
    return this;
  }

  selectNeuron(id: string | null) {
    if (id && !this.neuronById.has(id)) throw new Error(`Unknown neuron ID: ${id}`);
    this.status = { ...this.status, selectedNeuronId: id, selectedRegionId: null, selectedConnectionId: null };
    if (id) this.neuronStates.set(id, "SELECTED");
    this.publish();
    return this;
  }

  selectRegion(id: string | null) {
    if (id && !this.regionById.has(id)) throw new Error(`Unknown region ID: ${id}`);
    this.status = { ...this.status, selectedRegionId: id, selectedNeuronId: null, selectedConnectionId: null };
    this.publish();
    return this;
  }

  selectConnection(id: string | null) {
    if (id && !this.connectionById.has(id)) throw new Error(`Unknown connection ID: ${id}`);
    this.status = { ...this.status, selectedConnectionId: id, selectedNeuronId: null, selectedRegionId: null, mode: id ? "CONNECTIVITY" : this.status.mode };
    this.publish();
    return this;
  }

  setNeuronActivity(id: string, value: number) {
    if (!this.neuronById.has(id)) return this;
    this.neuronActivity.set(id, { value: clamp01(value), timestamp: this.status.simulationTime });
    this.publish();
    return this;
  }

  fireNeuron(id: string, timestamp = this.status.simulationTime, amplitude = 1, duration = 520) {
    if (!this.neuronById.has(id)) return this;
    const event: SpikeEvent = { type: "spike", neuron_id: id, timestamp, intensity: clamp01(amplitude), amplitude, duration };
    this.registerEvent(event);
    this.publish();
    return this;
  }

  fireNeurons(events: Array<SpikeEvent | { neuron_id: string; timestamp: number; intensity?: number; amplitude?: number; duration?: number }>) {
    events.forEach((event) => {
      if (!this.neuronById.has(event.neuron_id)) return;
      this.registerEvent({
        type: "spike",
        neuron_id: event.neuron_id,
        timestamp: event.timestamp,
        intensity: clamp01(event.intensity ?? event.amplitude ?? 1),
        amplitude: event.amplitude,
        duration: event.duration ?? 420,
      });
    });
    this.publish();
    return this;
  }

  activateSynapse(source: string, target: string, intensity = 1, timestamp = this.status.simulationTime, duration = 820) {
    if (!this.neuronById.has(source) || !this.neuronById.has(target)) return this;
    const event: SynapseEvent = { type: "synapse", source, target, timestamp, weight: intensity, intensity: clamp01(intensity), duration };
    this.registerEvent(event);
    this.publish();
    return this;
  }

  setRegionActivity(id: string, value: number, timestamp = this.status.simulationTime) {
    if (!this.regionById.has(id)) return this;
    const activity = clamp01(value);
    this.regionActivity.set(id, { value: activity, timestamp });
    this.registerEvent({ type: "region_activity", region: id, timestamp, activity });
    this.publish();
    return this;
  }

  setNeuronState(id: string, state: NeuronVisualState) {
    if (!this.neuronById.has(id)) return this;
    this.neuronStates.set(id, state);
    this.publish();
    return this;
  }

  setConnectionWeight(id: string, weight: number) {
    if (!this.connectionById.has(id)) return this;
    this.connectionWeights.set(id, weight);
    this.publish();
    return this;
  }

  applyPlasticity(id: string, oldWeight: number, newWeight: number, timestamp = this.status.simulationTime) {
    if (!this.connectionById.has(id)) return this;
    const event: PlasticityEvent = { type: "plasticity", connection: id, timestamp, old_weight: oldWeight, new_weight: newWeight, change: newWeight - oldWeight };
    this.connectionWeights.set(id, newWeight);
    this.registerEvent(event);
    this.publish();
    return this;
  }

  highlightPath(path: string[]) {
    this.highlightedPath = path.filter((id) => this.neuronById.has(id));
    this.status = { ...this.status, mode: "PATH_TRACING" };
    this.publish();
    return this;
  }

  highlightUpstream(id: string) {
    if (!this.neuronById.has(id)) return this;
    const upstream = this.model.connections.filter((connection) => connection.target === id).map((connection) => connection.source);
    return this.highlightPath([...upstream, id]);
  }

  highlightDownstream(id: string) {
    if (!this.neuronById.has(id)) return this;
    const downstream = this.model.connections.filter((connection) => connection.source === id).map((connection) => connection.target);
    return this.highlightPath([id, ...downstream]);
  }

  clearActivity(publish = true) {
    this.neuronActivity.clear();
    this.regionActivity.clear();
    this.neuronStates.clear();
    this.connectionWeights.clear();
    this.eventHistory = [];
    this.highlightedPath = [];
    this.status = { ...this.status, eventCount: 0, eventsPerSecond: 0, isolatedNeuronId: null };
    if (publish) this.publish();
    return this;
  }

  reset() {
    this.clearActivity(false);
    this.status = {
      ...this.status,
      simulationTime: 0,
      isPlaying: false,
      selectedNeuronId: null,
      selectedRegionId: null,
      selectedConnectionId: null,
      isolatedNeuronId: null,
      mode: "STRUCTURAL",
      demoMode: false,
    };
    this.cameraPreset("WHOLE_BRAIN");
    this.publish();
    return this;
  }

  setSimulationTime(time: number) {
    this.status = { ...this.status, simulationTime: Math.max(0, time) };
    this.publish();
    return this;
  }

  setMode(mode: VisualMode) {
    this.status = { ...this.status, mode };
    this.publish();
    return this;
  }

  setPlaying(isPlaying: boolean) {
    this.status = { ...this.status, isPlaying };
    this.publish();
    return this;
  }

  play() { return this.setPlaying(true); }

  pause() { return this.setPlaying(false); }

  step(milliseconds = 40) {
    this.status = { ...this.status, isPlaying: false, simulationTime: this.status.simulationTime + milliseconds };
    this.publish();
    return this;
  }

  setSpeed(speed: number) {
    this.status = { ...this.status, speed: Math.max(0.05, Math.min(8, speed)) };
    this.publish();
    return this;
  }

  replay() {
    this.status = { ...this.status, simulationTime: 0, isPlaying: true };
    this.publish();
    return this;
  }

  setLabels(showLabels: boolean) {
    this.status = { ...this.status, showLabels };
    this.publish();
    return this;
  }

  setRegions(showRegions: boolean) {
    this.status = { ...this.status, showRegions };
    this.publish();
    return this;
  }

  isolateNeuron(id: string | null) {
    if (id && !this.neuronById.has(id)) return this;
    this.status = { ...this.status, isolatedNeuronId: id, mode: id ? "SINGLE_NEURON" : this.status.mode };
    this.publish();
    return this;
  }

  focusNeuron(id: string) {
    const neuron = this.neuronById.get(id);
    if (!neuron) return this;
    this.selectNeuron(id);
    this.requestCamera([neuron.position[0], neuron.position[1], neuron.position[2] + 3.2], neuron.position);
    return this;
  }

  focusRegion(id: string) {
    const region = this.regionById.get(id);
    if (!region) return this;
    this.selectRegion(id);
    const distance = Math.max(...region.scale) * 3.2 + 1.6;
    this.requestCamera([region.position[0], region.position[1], region.position[2] + distance], region.position);
    return this;
  }

  private requestCamera(position: Vec3, target: Vec3) {
    const request: CameraRequest = { serial: this.status.cameraRequest.serial + 1, position, target };
    this.status = { ...this.status, cameraRequest: request };
    this.publish();
  }

  cameraPreset(preset: CameraPreset) {
    const next = CAMERA_PRESETS[preset];
    this.requestCamera(next.position, next.target);
    return this;
  }

  search(query: string, limit = 30): SearchResult[] {
    return this.searchIndex.search(query, limit);
  }

  ingest(event: NeuralEvent) {
    if (event.type === "spike") return this.fireNeuron(event.neuron_id, event.timestamp, event.intensity ?? event.amplitude ?? 1, event.duration ?? 520);
    if (event.type === "synapse") return this.activateSynapse(event.source, event.target, event.intensity ?? event.weight, event.timestamp, event.duration ?? 820);
    if (event.type === "region_activity") return this.setRegionActivity(event.region, event.activity, event.timestamp);
    return this.applyPlasticity(event.connection, event.old_weight, event.new_weight, event.timestamp);
  }

  ingestBatch(events: NeuralEvent[]) {
    events.forEach((event) => {
      if (event.type === "spike" && this.neuronById.has(event.neuron_id)) this.registerEvent({ ...event, intensity: clamp01(event.intensity) });
      else if (event.type === "synapse" && this.neuronById.has(event.source) && this.neuronById.has(event.target)) this.registerEvent(event);
      else if (event.type === "region_activity" && this.regionById.has(event.region)) this.registerEvent(event);
      else if (event.type === "plasticity" && this.connectionById.has(event.connection)) this.registerEvent(event);
    });
    this.publish();
    return this;
  }

  connectEventSource(source: EventTarget, eventName = "message") {
    const handler = (rawEvent: Event) => {
      const message = rawEvent as MessageEvent<NeuralEvent | string>;
      try {
        const payload = typeof message.data === "string" ? JSON.parse(message.data) as NeuralEvent : message.data;
        this.ingest(payload);
      } catch (error) {
        console.warn("FlyBrain event rejected", error);
      }
    };
    source.addEventListener(eventName, handler);
    return () => source.removeEventListener(eventName, handler);
  }

  exportState(): NeuralSnapshot {
    return {
      simulationTime: this.status.simulationTime,
      mode: this.status.mode,
      neuronActivity: Object.fromEntries([...this.neuronActivity].map(([id, value]) => [id, value.value])),
      regionActivity: Object.fromEntries([...this.regionActivity].map(([id, value]) => [id, value.value])),
      neuronStates: Object.fromEntries(this.neuronStates),
      connectionWeights: Object.fromEntries(this.connectionWeights),
      selectedNeuronId: this.status.selectedNeuronId,
      selectedRegionId: this.status.selectedRegionId,
      selectedConnectionId: this.status.selectedConnectionId,
      highlightedPath: this.highlightedPath,
      recentEvents: this.eventHistory.slice(-2000),
    };
  }

  importState(snapshot: NeuralSnapshot) {
    this.neuronActivity = new Map(Object.entries(snapshot.neuronActivity).map(([id, value]) => [id, { value, timestamp: snapshot.simulationTime }]));
    this.regionActivity = new Map(Object.entries(snapshot.regionActivity).map(([id, value]) => [id, { value, timestamp: snapshot.simulationTime }]));
    this.neuronStates = new Map(Object.entries(snapshot.neuronStates));
    this.connectionWeights = new Map(Object.entries(snapshot.connectionWeights));
    this.highlightedPath = snapshot.highlightedPath.filter((id) => this.neuronById.has(id));
    this.eventHistory = snapshot.recentEvents.slice(-12000);
    this.status = {
      ...this.status,
      simulationTime: snapshot.simulationTime,
      mode: snapshot.mode,
      selectedNeuronId: snapshot.selectedNeuronId,
      selectedRegionId: snapshot.selectedRegionId,
      selectedConnectionId: snapshot.selectedConnectionId,
    };
    this.publish();
    return this;
  }

  startDemo() {
    this.clearActivity(false);
    const sequence = namedDemoNeuronIds.slice(0, 8);
    buildDemoEventStream(sequence).forEach((event) => this.registerEvent(event));
    this.highlightedPath = sequence.slice(0, 5);
    this.status = {
      ...this.status,
      simulationTime: 0,
      isPlaying: true,
      speed: 1,
      mode: "NEURAL_ACTIVITY",
      demoMode: true,
      selectedNeuronId: sequence[0],
      selectedRegionId: null,
      selectedConnectionId: null,
    };
    this.publish();
    return this;
  }

  runSpikeStressTest(count = 1200) {
    const neurons = this.model.neurons;
    const start = this.status.simulationTime;
    const events: SpikeEvent[] = Array.from({ length: count }, (_, index) => ({
      type: "spike",
      neuron_id: neurons[(index * 47) % neurons.length].id,
      timestamp: start + (index % 320) * 1.5,
      intensity: 0.35 + ((index * 13) % 60) / 100,
      duration: 360,
    }));
    this.ingestBatch(events);
    this.status = { ...this.status, isPlaying: true, demoMode: true, mode: "SPIKE_PLAYBACK" };
    this.publish();
    return this;
  }

  advance(deltaSeconds: number) {
    const now = performance.now();
    this.eventRateWindow = this.eventRateWindow.filter((timestamp) => now - timestamp <= 1000);
    let simulationTime = this.status.simulationTime;
    if (this.status.isPlaying) simulationTime += deltaSeconds * 1000 * this.status.speed;
    if (this.status.demoMode && simulationTime > this.demoDuration) simulationTime %= this.demoDuration;

    for (const [id, activity] of this.neuronActivity) {
      const decay = Math.max(0, activity.value - deltaSeconds * 0.48);
      if (decay <= 0.001) this.neuronActivity.delete(id);
      else this.neuronActivity.set(id, { ...activity, value: decay });
    }
    this.status = {
      ...this.status,
      simulationTime,
      eventsPerSecond: this.eventRateWindow.length,
      fps: smoothFps(this.status.fps, deltaSeconds),
    };
    this.publish(false);
  }
}

export const brain = new BrainRuntime();

if (typeof window !== "undefined") window.flyBrain = brain;