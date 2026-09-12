import { brainRegions, regionById } from "./regions";
import type { BrainModel, Connection, Morphology, Neuron, SourceReference, Vec3 } from "../types";

const galleryUrl = "https://flywire.ai/gallery";

const proxySource: SourceReference = {
  dataset: "FlyWire-reference demonstration layer",
  version: "1.0",
  url: galleryUrl,
  geometryStatus: "PROCEDURAL_PROXY",
  note: "This runtime-generated morphology is intentionally marked UNKNOWN and is not a FlyWire reconstruction. Load source skeletons or meshes through brain.loadModel() for anatomical analysis.",
};

const actualMetadataSource: SourceReference = {
  dataset: "FlyWire FAFB",
  version: "783",
  url: "https://fafbseg-py.readthedocs.io/en/latest/source/tutorials/flywire_annotations.html",
  geometryStatus: "PROCEDURAL_PROXY",
  note: "ID and annotation fields are from the cited source. Bundled morphology and display placement are proxies.",
};

const demoConnectionSource: SourceReference = {
  dataset: "DEMO / SIMULATED ACTIVITY",
  version: "1.0",
  url: galleryUrl,
  geometryStatus: "PROCEDURAL_PROXY",
  note: "Demonstration-only edge. It is not asserted to be a biological FlyWire connection.",
};

const palette = ["#63d6c7", "#6ab8ec", "#827ee6", "#dda86c", "#cf76a8", "#8ec986"];

const mulberry32 = (seed: number) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const lengthBetween = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const makeMorphology = (position: Vec3, regionId: string, index: number): Morphology => {
  const region = regionById.get(regionId) ?? brainRegions[0];
  const random = mulberry32(1471 + index * 1777);
  const center = region.position;
  const inward: Vec3 = [
    center[0] * (region.category === "OPTIC_LOBE" ? 0.68 : 0.3),
    center[1] * 0.35,
    center[2] * 0.25,
  ];
  const branches: Vec3[][] = [];
  const trunk: Vec3[] = [];
  const trunkNodes = 8;

  for (let step = 0; step < trunkNodes; step += 1) {
    const t = step / (trunkNodes - 1);
    const curved = Math.sin(t * Math.PI);
    trunk.push([
      position[0] * (1 - t) + inward[0] * t + (random() - 0.5) * curved * 0.48,
      position[1] * (1 - t) + inward[1] * t + (random() - 0.5) * curved * 0.42,
      position[2] * (1 - t) + inward[2] * t + (random() - 0.5) * curved * 0.5,
    ]);
  }
  branches.push(trunk);

  const branchCount = 4 + Math.floor(random() * 3);
  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const anchorIndex = 1 + Math.floor(random() * (trunkNodes - 2));
    const anchor = trunk[anchorIndex];
    const branch: Vec3[] = [anchor];
    const direction: Vec3 = [
      (random() - 0.5) * region.scale[0] * 1.15,
      (random() - 0.5) * region.scale[1] * 1.15,
      (random() - 0.5) * region.scale[2] * 1.15,
    ];
    const nodes = 3 + Math.floor(random() * 3);
    for (let node = 1; node < nodes; node += 1) {
      const t = node / (nodes - 1);
      branch.push([
        anchor[0] + direction[0] * t + (random() - 0.5) * 0.2,
        anchor[1] + direction[1] * t + (random() - 0.5) * 0.2,
        anchor[2] + direction[2] * t + (random() - 0.5) * 0.2,
      ]);
    }
    branches.push(branch);
  }

  const totalLength = branches.reduce((total, branch) => {
    let branchLength = 0;
    for (let index = 1; index < branch.length; index += 1) branchLength += lengthBetween(branch[index - 1], branch[index]);
    return total + branchLength;
  }, 0);

  return {
    branches,
    somaRadius: 0.035 + random() * 0.025,
    totalLength,
    nodeCount: branches.reduce((sum, branch) => sum + branch.length, 0),
    representation: "PROCEDURAL_PROXY",
  };
};

type NamedProxy = {
  id: string;
  name: string;
  cellType: string;
  region: string;
  neurotransmitter?: Neuron["neurotransmitter"];
  sourceId?: string;
  annotation?: string;
};

const namedProxies: NamedProxy[] = [
  { id: "UNKNOWN_CT1_GALLERY_PROXY_L", name: "CT1, left (gallery proxy)", cellType: "CT1", region: "ME_L", neurotransmitter: "GABA", annotation: "CT1 is source-supported as a visual GABAergic interneuron; morphology shown here is not source geometry." },
  { id: "UNKNOWN_CT1_GALLERY_PROXY_R", name: "CT1, right (gallery proxy)", cellType: "CT1", region: "ME_R", neurotransmitter: "GABA", annotation: "CT1 pair is featured in the FlyWire gallery." },
  { id: "UNKNOWN_APL_GALLERY_PROXY_L", name: "APL, left (gallery proxy)", cellType: "APL", region: "CA_L", neurotransmitter: "GABA", annotation: "APL neurons of the mushroom body are featured in the FlyWire gallery." },
  { id: "UNKNOWN_APL_GALLERY_PROXY_R", name: "APL, right (gallery proxy)", cellType: "APL", region: "CA_R", neurotransmitter: "GABA", annotation: "APL neurons of the mushroom body are featured in the FlyWire gallery." },
  { id: "UNKNOWN_RING_GALLERY_PROXY_01", name: "Ring neuron (gallery proxy)", cellType: "Ring neuron", region: "EB", annotation: "Ring neurons are a FlyWire gallery group." },
  { id: "UNKNOWN_OCELLAR_GALLERY_PROXY_01", name: "Ocellar neuron (gallery proxy)", cellType: "Ocellar neuron", region: "SMP_L", annotation: "Ocellar neurons are a FlyWire gallery group." },
  { id: "UNKNOWN_DM4_GALLERY_PROXY_01", name: "DM4 (gallery proxy)", cellType: "DM4", region: "AL_L", annotation: "DM4 neurons are featured in the FlyWire gallery." },
  { id: "UNKNOWN_AVLP538_GALLERY_PROXY_01", name: "AVLP538 (gallery proxy)", cellType: "AVLP538", region: "AVLP_R", annotation: "AVLP538 neurons are featured in the FlyWire gallery." },
  { id: "UNKNOWN_DPM_GALLERY_PROXY_01", name: "DPM (gallery proxy)", cellType: "DPM", region: "CA_R", annotation: "DPM neurons are featured in the FlyWire gallery." },
  { id: "UNKNOWN_OA_AL2I1_GALLERY_PROXY_01", name: "OA-AL2i1 (gallery proxy)", cellType: "OA-AL2i1", region: "AL_R", neurotransmitter: "OCTOPAMINE", annotation: "OA-AL2i1 neurons are featured in the FlyWire gallery." },
];

const actualExamples: NamedProxy[] = [
  { id: "720575940625431866", sourceId: "720575940625431866", name: "VM5v_adPN", cellType: "VM5v_adPN", region: "AL_L", neurotransmitter: "ACETYLCHOLINE", annotation: "FAFB v783 example in fafbseg documentation; source soma [125088, 52048, 782]." },
  { id: "720575940622287142", sourceId: "720575940622287142", name: "VM5v_adPN", cellType: "VM5v_adPN", region: "AL_R", neurotransmitter: "ACETYLCHOLINE", annotation: "FAFB v783 example in fafbseg documentation; source soma [139912, 51768, 698]." },
  { id: "720575940620189790", sourceId: "720575940620189790", name: "VM5v_adPN", cellType: "VM5v_adPN", region: "AL_L", neurotransmitter: "ACETYLCHOLINE", annotation: "FAFB v783 example in fafbseg documentation; source soma [124824, 49920, 998]." },
  { id: "720575940619637780", sourceId: "720575940619637780", name: "VM5v_adPN", cellType: "VM5v_adPN", region: "AL_R", neurotransmitter: "ACETYLCHOLINE", annotation: "FAFB v783 example in fafbseg documentation; source soma [140752, 52368, 374]." },
];

const createNeuron = (seed: NamedProxy, index: number, random: () => number, source: SourceReference): Neuron => {
  const region = regionById.get(seed.region) ?? brainRegions[0];
  const position: Vec3 = [
    region.position[0] + (random() - 0.5) * region.scale[0] * 1.7,
    region.position[1] + (random() - 0.5) * region.scale[1] * 1.7,
    region.position[2] + (random() - 0.5) * region.scale[2] * 1.7,
  ];
  const side = region.hemisphere;
  return {
    id: seed.id,
    name: seed.name,
    type: "NEURON",
    entityType: "NEURON",
    hemisphere: side,
    region: seed.region,
    source: { ...source, sourceId: seed.sourceId },
    position,
    morphology: makeMorphology(position, seed.region, index),
    connections: [],
    metadata: {
      annotation: seed.annotation ?? "No biological annotation supplied.",
      geometryStatus: "PROCEDURAL_PROXY",
      visualAnchorRegion: seed.region,
      warning: "Do not use bundled proxy geometry for anatomical measurements.",
    },
    cellType: seed.cellType,
    neurotransmitter: seed.neurotransmitter ?? "UNKNOWN",
    color: region.color,
  };
};

const buildNeurons = (): Neuron[] => {
  const random = mulberry32(7832024);
  const neurons: Neuron[] = [];
  namedProxies.forEach((seed, index) => neurons.push(createNeuron(seed, index, random, { ...proxySource, sourceId: seed.cellType })));
  actualExamples.forEach((seed, index) => neurons.push(createNeuron(seed, 100 + index, random, actualMetadataSource)));

  const targetCount = 1180;
  while (neurons.length < targetCount) {
    const index = neurons.length;
    const weightedRegions = brainRegions.flatMap((region) => {
      const weight = region.category === "OPTIC_LOBE" ? 5 : region.category === "CENTRAL_BRAIN" ? 3 : 2;
      return Array.from({ length: weight }, () => region);
    });
    const region = weightedRegions[Math.floor(random() * weightedRegions.length)];
    const localIndex = String(index + 1).padStart(6, "0");
    const seed: NamedProxy = {
      id: `UNKNOWN_FAFB_PROXY_${localIndex}`,
      name: `UNKNOWN_${region.abbreviation}_${localIndex}`,
      cellType: "UNKNOWN",
      region: region.id,
    };
    const neuron = createNeuron(seed, 500 + index, random, proxySource);
    neuron.color = palette[index % palette.length];
    neurons.push(neuron);
  }
  return neurons;
};

const buildConnections = (neurons: Neuron[]): Connection[] => {
  const anchorIds = namedProxies.map((proxy) => proxy.id);
  const connections: Connection[] = [];
  for (let index = 0; index < anchorIds.length - 1; index += 1) {
    const source = anchorIds[index];
    const target = anchorIds[index + 1];
    const connection: Connection = {
      id: `DEMO_CONNECTION_${String(index + 1).padStart(3, "0")}`,
      source,
      target,
      weight: 3 + (index % 6),
      connectionType: index % 4 === 0 ? "INHIBITORY" : "UNKNOWN",
      synapseCount: undefined,
      region: neurons.find((neuron) => neuron.id === target)?.region,
      metadata: { classification: "DEMONSTRATION_ONLY", biologicalClaim: false },
      sourceRef: demoConnectionSource,
    };
    connections.push(connection);
    neurons.find((neuron) => neuron.id === source)?.connections.push(connection.id);
    neurons.find((neuron) => neuron.id === target)?.connections.push(connection.id);
  }
  return connections;
};

const neurons = buildNeurons();
const connections = buildConnections(neurons);

export const demoModel: BrainModel = {
  id: "FLYWIRE_REFERENCE_RUNTIME_DEMO_V1",
  name: "Adult Drosophila Connectome Runtime",
  species: "Drosophila melanogaster",
  dataset: "FlyWire FAFB v783 reference / proxy render layer",
  version: "1.0.0",
  coordinateSystem: "Normalized display space; +X right, +Y dorsal, +Z anterior. Source coordinates are preserved in metadata when supplied.",
  regions: brainRegions,
  neurons,
  connections,
  metadata: {
    sourceDataset: "FlyWire FAFB v783",
    sourceUrl: galleryUrl,
    sourceNeuronCount: 139255,
    sourceConnectionCount: 3732460,
    bundledRenderableNeuronCount: neurons.length,
    bundledGeometry: "Procedural proxy",
    scientificBoundary: "This package is a renderer and interaction layer. It does not simulate neural computation.",
    loadingContract: "Replace this demonstration layer using brain.loadModel(model) with source-derived skeletons/meshes and metadata.",
  },
};

export const namedDemoNeuronIds = namedProxies.map((proxy) => proxy.id);