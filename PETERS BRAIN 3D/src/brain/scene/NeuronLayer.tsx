import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { brain } from "../runtime";

type PackedMorphology = {
  geometry: THREE.BufferGeometry;
  segmentNeuron: Uint32Array;
};

const packMorphologies = (): PackedMorphology => {
  const neurons = brain.getModel().neurons;
  let segmentCount = 0;
  neurons.forEach((neuron) => neuron.morphology.branches.forEach((branch) => { segmentCount += Math.max(0, branch.length - 1); }));
  const positions = new Float32Array(segmentCount * 6);
  const colors = new Float32Array(segmentCount * 6);
  const segmentNeuron = new Uint32Array(segmentCount);
  let segment = 0;

  neurons.forEach((neuron, neuronIndex) => {
    const base = new THREE.Color(neuron.color).multiplyScalar(0.52);
    neuron.morphology.branches.forEach((branch) => {
      for (let index = 1; index < branch.length; index += 1) {
        const previous = branch[index - 1];
        const current = branch[index];
        const offset = segment * 6;
        positions.set([...previous, ...current], offset);
        colors.set([base.r, base.g, base.b, base.r, base.g, base.b], offset);
        segmentNeuron[segment] = neuronIndex;
        segment += 1;
      }
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("color", colorAttribute);
  geometry.computeBoundingSphere();
  return { geometry, segmentNeuron };
};

export function NeuronLayer() {
  const packed = useMemo(packMorphologies, [brain.getModel()]);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const lastColorUpdate = useRef(0);
  const { camera } = useThree();

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    if (elapsed - lastColorUpdate.current < 0.04) return;
    lastColorUpdate.current = elapsed;
    const model = brain.getModel();
    const status = brain.getStatus();
    const selectedId = status.selectedNeuronId;
    const isolatedId = status.isolatedNeuronId;
    const activity = brain.getActivityFrame();
    const path = new Set(brain.getHighlightedPath());
    const colors = packed.geometry.getAttribute("color") as THREE.BufferAttribute;
    const colorArray = colors.array as Float32Array;
    const dimByDistance = camera.position.distanceTo(new THREE.Vector3()) > 18 ? 0.55 : 1;

    for (let segment = 0; segment < packed.segmentNeuron.length; segment += 1) {
      const neuron = model.neurons[packed.segmentNeuron[segment]];
      const level = activity.get(neuron.id) ?? 0;
      const selected = neuron.id === selectedId;
      const onPath = path.has(neuron.id);
      const hidden = isolatedId !== null && neuron.id !== isolatedId;
      const base = new THREE.Color(neuron.color);
      let brightness = (status.mode === "STRUCTURAL" ? 0.42 : 0.28) * dimByDistance;
      if (status.mode === "REGION_ACTIVITY") brightness = 0.12;
      if (status.mode === "CONNECTIVITY") brightness = 0.18;
      if (onPath) base.set("#ffb55f");
      if (selected) base.set("#fff4c6");
      if (level > 0) base.lerp(new THREE.Color("#f7fff5"), Math.min(0.82, level));
      brightness += level * 1.8 + (onPath ? 0.85 : 0) + (selected ? 1.25 : 0);
      if (hidden) brightness = 0.008;
      const offset = segment * 6;
      for (let vertex = 0; vertex < 2; vertex += 1) {
        const colorOffset = offset + vertex * 3;
        colorArray[colorOffset] = base.r * brightness;
        colorArray[colorOffset + 1] = base.g * brightness;
        colorArray[colorOffset + 2] = base.b * brightness;
      }
    }
    colors.needsUpdate = true;
    if (materialRef.current) {
      materialRef.current.opacity = status.mode === "STRUCTURAL" ? 0.72 : 0.82;
    }
  });

  return (
    <lineSegments
      geometry={packed.geometry}
      frustumCulled
      onPointerDown={(event) => {
        event.stopPropagation();
        const rawIndex = event.index ?? 0;
        const segment = Math.min(packed.segmentNeuron.length - 1, Math.floor(rawIndex / 2));
        const neuron = brain.getModel().neurons[packed.segmentNeuron[segment]];
        if (neuron) brain.selectNeuron(neuron.id);
      }}
    >
      <lineBasicMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={0.78}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

export function SomaLayer() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const model = brain.getModel();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => model.neurons.map((neuron) => new THREE.Color(neuron.color)), [model]);
  const { camera } = useThree();

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const activity = brain.getActivityFrame();
    const status = brain.getStatus();
    const showSomas = status.mode === "SINGLE_NEURON" || camera.position.distanceTo(new THREE.Vector3()) < 13;
    model.neurons.forEach((neuron, index) => {
      const active = activity.get(neuron.id) ?? 0;
      const selected = neuron.id === status.selectedNeuronId;
      const hidden = status.isolatedNeuronId !== null && neuron.id !== status.isolatedNeuronId;
      const scale = hidden ? 0 : (selected ? 2.25 : 0.8 + active * 1.7) * (showSomas ? 1 : 0.4);
      dummy.position.set(...neuron.position);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const color = selected ? new THREE.Color("#fff2b6") : colors[index].clone().lerp(new THREE.Color("white"), active * 0.8);
      mesh.setColorAt(index, color.multiplyScalar(0.7 + active * 1.4));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, model.neurons.length]}
      frustumCulled
      onPointerDown={(event) => {
        event.stopPropagation();
        const neuron = event.instanceId === undefined ? undefined : model.neurons[event.instanceId];
        if (neuron) brain.selectNeuron(neuron.id);
      }}
    >
      <sphereGeometry args={[0.055, 7, 7]} />
      <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.82} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}