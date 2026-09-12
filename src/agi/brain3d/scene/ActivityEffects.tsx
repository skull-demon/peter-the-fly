import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { brain } from "../runtime";
import type { Vec3 } from "../types";

const pointAlong = (points: Vec3[], progress: number): Vec3 => {
  if (points.length < 2) return points[0] ?? [0, 0, 0];
  const scaled = Math.max(0, Math.min(0.999, progress)) * (points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = points[index];
  const b = points[Math.min(index + 1, points.length - 1)];
  return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local, a[2] + (b[2] - a[2]) * local];
};

export function SpikePulses() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const maximum = 96;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = brain.getStatus().simulationTime;
    const spikes = brain.getActiveSpikes(time, maximum);
    for (let index = 0; index < maximum; index += 1) {
      const spike = spikes[index];
      if (!spike) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        continue;
      }
      const neuron = brain.getNeuron(spike.neuron_id);
      if (!neuron) continue;
      const duration = spike.duration ?? 520;
      const progress = (time - spike.timestamp) / duration;
      const position = pointAlong(neuron.morphology.branches[0], progress);
      const envelope = Math.sin(progress * Math.PI);
      dummy.position.set(...position);
      dummy.scale.setScalar((0.08 + spike.intensity * 0.11) * (0.65 + envelope));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(spike.intensity > 0.78 ? "#fff5d6" : "#e59a44").multiplyScalar(1.8));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maximum]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial vertexColors transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

export function SynapsePulses() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const maximum = 48;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = brain.getStatus().simulationTime;
    const events = brain.getActiveSynapses(time, maximum);
    for (let index = 0; index < maximum; index += 1) {
      const event = events[index];
      if (!event) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        continue;
      }
      const source = brain.getNeuron(event.source);
      const target = brain.getNeuron(event.target);
      if (!source || !target) continue;
      const duration = event.duration ?? 820;
      const progress = Math.max(0, Math.min(1, (time - event.timestamp) / duration));
      const a = new THREE.Vector3(...source.position);
      const c = new THREE.Vector3(...target.position);
      const middle = a.clone().lerp(c, 0.5).add(new THREE.Vector3(0, 0.55 + a.distanceTo(c) * 0.07, 0.9));
      const curve = new THREE.QuadraticBezierCurve3(a, middle, c);
      const point = curve.getPoint(progress);
      dummy.position.copy(point);
      dummy.scale.setScalar(0.09 + (event.intensity ?? 0.7) * 0.12);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(event.weight < 0 ? "#b35b44" : "#f0c674").multiplyScalar(2));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maximum]} frustumCulled={false}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial vertexColors transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

export function PlasticityMarkers() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const maximum = 16;

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const status = brain.getStatus();
    const events = brain.getRecentEvents(220)
      .filter((event) => event.type === "plasticity" && status.simulationTime - event.timestamp < 5000)
      .slice(-maximum);
    for (let index = 0; index < maximum; index += 1) {
      const event = events[index];
      if (!event || event.type !== "plasticity") {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        continue;
      }
      const connection = brain.getConnection(event.connection);
      const source = connection ? brain.getNeuron(connection.source) : undefined;
      const target = connection ? brain.getNeuron(connection.target) : undefined;
      if (!source || !target) continue;
      dummy.position.set(
        (source.position[0] + target.position[0]) / 2,
        (source.position[1] + target.position[1]) / 2,
        (source.position[2] + target.position[2]) / 2,
      );
      dummy.rotation.set(Math.PI / 2, 0, clock.elapsedTime * 0.6 + index);
      const pulse = 1 + Math.sin(clock.elapsedTime * 3 + index) * 0.16;
      dummy.scale.setScalar((0.15 + Math.min(0.35, Math.abs(event.new_weight - event.old_weight) * 0.04)) * pulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(event.new_weight >= event.old_weight ? "#ffd66f" : "#df6f9e").multiplyScalar(1.4));
    }
    mesh.visible = status.mode === "PLASTICITY" || events.length > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maximum]} frustumCulled={false}>
      <torusGeometry args={[1, 0.08, 6, 22]} />
      <meshBasicMaterial vertexColors transparent opacity={0.82} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}