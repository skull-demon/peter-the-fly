import type { Hemisphere, Morphology, Neuron, SourceReference, Vec3 } from "../types";

type SwcNode = {
  id: number;
  type: number;
  position: Vec3;
  radius: number;
  parent: number;
};

export interface SwcNeuronMetadata {
  id: string;
  name?: string;
  cellType?: string;
  hemisphere?: Hemisphere;
  region?: string;
  neurotransmitter?: Neuron["neurotransmitter"];
  source: SourceReference;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface SwcDisplayTransform {
  scale?: number;
  offset?: Vec3;
}

export const parseSwcNeuron = (swc: string, input: SwcNeuronMetadata, transform: SwcDisplayTransform = {}): Neuron => {
  const scale = transform.scale ?? 1;
  const offset = transform.offset ?? [0, 0, 0];
  const nodes = new Map<number, SwcNode>();
  swc.split(/\r?\n/).forEach((line, lineIndex) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const columns = clean.split(/\s+/).map(Number);
    if (columns.length < 7 || columns.some((value) => !Number.isFinite(value))) throw new Error(`Invalid SWC row at line ${lineIndex + 1}`);
    nodes.set(columns[0], {
      id: columns[0],
      type: columns[1],
      position: [columns[2] * scale + offset[0], columns[3] * scale + offset[1], columns[4] * scale + offset[2]],
      radius: columns[5] * scale,
      parent: columns[6],
    });
  });
  if (!nodes.size) throw new Error("SWC input contains no nodes.");

  const children = new Map<number, number[]>();
  nodes.forEach((node) => {
    if (node.parent < 0 || !nodes.has(node.parent)) return;
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node.id);
    children.set(node.parent, siblings);
  });

  const branches: Vec3[][] = [];
  nodes.forEach((node) => {
    if (node.parent < 0) return;
    const parent = nodes.get(node.parent);
    if (parent) branches.push([parent.position, node.position]);
  });
  const soma = [...nodes.values()].find((node) => node.type === 1) ?? [...nodes.values()][0];
  const totalLength = branches.reduce((sum, branch) => sum + Math.hypot(
    branch[1][0] - branch[0][0],
    branch[1][1] - branch[0][1],
    branch[1][2] - branch[0][2],
  ), 0);
  const morphology: Morphology = {
    branches,
    somaRadius: Math.max(0.01, soma.radius),
    totalLength,
    nodeCount: nodes.size,
    representation: "SKELETON",
  };

  return {
    id: input.id,
    name: input.name ?? `UNKNOWN_${input.id}`,
    type: "NEURON",
    entityType: "NEURON",
    hemisphere: input.hemisphere ?? "UNKNOWN",
    region: input.region ?? `UNKNOWN_REGION_${input.id}`,
    source: input.source,
    position: soma.position,
    morphology,
    connections: [],
    metadata: input.metadata ?? {},
    cellType: input.cellType ?? "UNKNOWN",
    neurotransmitter: input.neurotransmitter ?? "UNKNOWN",
    color: input.color ?? "#78cfc7",
  };
};