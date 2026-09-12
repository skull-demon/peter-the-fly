import type { BrainRegion, Hemisphere, SourceReference, Vec3 } from "../types";

const FLYWIRE_SOURCE: SourceReference = {
  dataset: "FlyWire FAFB",
  version: "783",
  url: "https://codex.flywire.ai/app/neuropils?dataset=fafb",
  citation: "Dorkenwald et al., Nature 2024; Ito et al., Neuron 2014",
  geometryStatus: "PROCEDURAL_PROXY",
  note: "The identifier and anatomical name are source-supported. The bundled surface is a normalized runtime proxy, not the FlyWire neuropil mesh.",
};

type RegionSeed = {
  abbreviation: string;
  name: string;
  hemisphere: Hemisphere;
  position: Vec3;
  scale: Vec3;
  category: BrainRegion["category"];
  color: string;
  parentId?: string;
  rotation?: Vec3;
};

const paired = (
  abbreviation: string,
  name: string,
  x: number,
  y: number,
  z: number,
  scale: Vec3,
  category: BrainRegion["category"],
  color: string,
  parentId = "BRAIN",
  rotation?: Vec3,
): RegionSeed[] => [
  { abbreviation: `${abbreviation}_L`, name: `${name}, left`, hemisphere: "LEFT", position: [-x, y, z], scale, category, color, parentId: parentId === "BRAIN" ? "HEMISPHERE_L" : parentId, rotation },
  { abbreviation: `${abbreviation}_R`, name: `${name}, right`, hemisphere: "RIGHT", position: [x, y, z], scale, category, color, parentId: parentId === "BRAIN" ? "HEMISPHERE_R" : parentId, rotation },
];

const seeds: RegionSeed[] = [
  ...paired("LA", "Lamina", 6.25, 0.15, 0.15, [0.46, 2.18, 1.82], "OPTIC_LOBE", "#5eead4", "BRAIN", [0, 0, 0.1]),
  ...paired("ME", "Medulla", 5.47, 0.16, 0.02, [0.86, 2.38, 2.04], "OPTIC_LOBE", "#49b6ff"),
  ...paired("LO", "Lobula", 4.52, 0.15, 0.48, [0.68, 1.72, 1.38], "OPTIC_LOBE", "#7776ff", "BRAIN", [0.15, 0.06, 0.08]),
  ...paired("LOP", "Lobula plate", 4.48, 0.2, -0.82, [0.42, 1.64, 1.13], "OPTIC_LOBE", "#9b8cff", "BRAIN", [0.22, 0.08, 0]),
  ...paired("AME", "Accessory medulla", 4.72, -1.42, 0.28, [0.28, 0.34, 0.32], "OPTIC_LOBE", "#6ce5d4"),
  ...paired("AL", "Antennal lobe", 1.73, -2.08, 1.0, [1.0, 0.94, 0.86], "CENTRAL_BRAIN", "#f38bbd"),
  ...paired("LH", "Lateral horn", 2.87, 1.23, -0.12, [0.88, 1.06, 0.94], "CENTRAL_BRAIN", "#ff9c66"),
  ...paired("AOTU", "Anterior optic tubercle", 2.95, 1.52, 0.86, [0.48, 0.67, 0.58], "CENTRAL_BRAIN", "#69d2e7"),
  ...paired("CA", "Mushroom body calyx", 2.02, 2.12, -0.72, [0.82, 0.67, 0.68], "MUSHROOM_BODY", "#ffc95c"),
  ...paired("PED", "Mushroom body pedunculus", 1.52, 1.03, -0.38, [0.29, 1.15, 0.34], "MUSHROOM_BODY", "#ffe285", "BRAIN", [0, 0, 0.25]),
  ...paired("VL", "Mushroom body vertical lobe", 1.34, 1.38, 0.48, [0.36, 1.12, 0.38], "MUSHROOM_BODY", "#ffd56a"),
  ...paired("ML", "Mushroom body medial lobe", 0.83, 0.42, 0.62, [0.76, 0.3, 0.38], "MUSHROOM_BODY", "#f7be56"),
  ...paired("SLP", "Superior lateral protocerebrum", 3.1, 2.05, -0.45, [1.02, 0.7, 1.0], "CENTRAL_BRAIN", "#5886c7"),
  ...paired("SIP", "Superior intermediate protocerebrum", 1.84, 2.42, -0.42, [0.8, 0.62, 0.92], "CENTRAL_BRAIN", "#786abf"),
  ...paired("SMP", "Superior medial protocerebrum", 0.72, 2.5, -0.38, [0.76, 0.64, 0.9], "CENTRAL_BRAIN", "#9b72c6"),
  ...paired("AVLP", "Anterior ventrolateral protocerebrum", 3.25, -0.55, 0.75, [0.94, 1.05, 0.92], "CENTRAL_BRAIN", "#4c9ac0"),
  ...paired("PVLP", "Posterior ventrolateral protocerebrum", 3.15, -0.4, -0.78, [0.9, 1.0, 0.84], "CENTRAL_BRAIN", "#506a9b"),
  ...paired("LAL", "Lateral accessory lobe", 1.35, -0.82, 0.56, [0.72, 0.63, 0.67], "CENTRAL_BRAIN", "#8c80ca"),
  ...paired("AMMC", "Antennal mechanosensory and motor center", 2.62, -1.65, -0.38, [0.66, 0.62, 0.72], "SEZ", "#4d87a3"),
  { abbreviation: "PB", name: "Protocerebral bridge", hemisphere: "MIDLINE", position: [0, 1.16, -1.04], scale: [1.42, 0.22, 0.24], category: "CENTRAL_COMPLEX", color: "#ecb55b", parentId: "CENTRAL_STRUCTURES" },
  { abbreviation: "FB", name: "Fan-shaped body", hemisphere: "MIDLINE", position: [0, 0.75, -0.45], scale: [1.12, 0.56, 0.26], category: "CENTRAL_COMPLEX", color: "#e9a94e", parentId: "CENTRAL_STRUCTURES" },
  { abbreviation: "EB", name: "Ellipsoid body", hemisphere: "MIDLINE", position: [0, 0.0, 0.03], scale: [0.72, 0.54, 0.24], category: "CENTRAL_COMPLEX", color: "#f3c768", parentId: "CENTRAL_STRUCTURES" },
  { abbreviation: "NO", name: "Noduli", hemisphere: "MIDLINE", position: [0, -0.62, -0.2], scale: [0.64, 0.28, 0.3], category: "CENTRAL_COMPLEX", color: "#d99f48", parentId: "CENTRAL_STRUCTURES" },
  { abbreviation: "GNG", name: "Gnathal ganglia", hemisphere: "MIDLINE", position: [0, -2.35, -0.28], scale: [1.88, 0.72, 0.86], category: "SEZ", color: "#6c7695", parentId: "CENTRAL_STRUCTURES" },
  { abbreviation: "SAD", name: "Saddle", hemisphere: "MIDLINE", position: [0, -1.46, -0.7], scale: [1.1, 0.34, 0.48], category: "SEZ", color: "#6c7191", parentId: "CENTRAL_STRUCTURES" },
  { abbreviation: "PRW", name: "Prow", hemisphere: "MIDLINE", position: [0, -1.58, 0.62], scale: [0.74, 0.45, 0.56], category: "SEZ", color: "#7c6f98", parentId: "CENTRAL_STRUCTURES" },
];

export const brainRegions: BrainRegion[] = seeds.map((seed) => ({
  id: seed.abbreviation,
  abbreviation: seed.abbreviation,
  name: seed.name,
  type: "NEUROPIL",
  entityType: "REGION",
  hemisphere: seed.hemisphere,
  region: seed.abbreviation,
  parentId: seed.parentId ?? "BRAIN",
  source: { ...FLYWIRE_SOURCE, sourceId: seed.abbreviation },
  position: seed.position,
  scale: seed.scale,
  rotation: seed.rotation,
  color: seed.color,
  category: seed.category,
  morphology: {
    representation: "PROCEDURAL_PROXY",
    primitive: "normalized ellipsoid",
  },
  connections: [],
  metadata: {
    nomenclature: "Ito et al. systematic insect brain nomenclature",
    sourceTraceability: "Name and abbreviation are source-supported; geometry is explicitly a proxy.",
    functionAnnotation: "Not supplied by the bundled source table.",
  },
}));

export const regionById = new Map(brainRegions.map((region) => [region.id, region]));