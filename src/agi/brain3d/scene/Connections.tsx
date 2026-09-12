import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { brain } from "../runtime";

export function ConnectionLayer() {
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const geometry = useMemo(() => {
    const points: number[] = [];
    brain.getModel().connections.forEach((connection) => {
      const source = brain.getNeuron(connection.source);
      const target = brain.getNeuron(connection.target);
      if (!source || !target) return;
      points.push(...source.position, ...target.position);
    });
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return buffer;
  }, [brain.getModel()]);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) return;
    const mode = brain.getStatus().mode;
    material.opacity = mode === "CONNECTIVITY" || mode === "PATH_TRACING" ? 0.34 + Math.sin(clock.elapsedTime * 1.5) * 0.04 : 0.055;
  });

  return (
    <lineSegments
      geometry={geometry}
      onPointerDown={(event) => {
        event.stopPropagation();
        const connectionIndex = Math.min(brain.getModel().connections.length - 1, Math.floor((event.index ?? 0) / 2));
        const connection = brain.getModel().connections[connectionIndex];
        if (connection) brain.selectConnection(connection.id);
      }}
    >
      <lineBasicMaterial ref={materialRef} color="#f2bb75" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

export function SelectedConnection() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    return buffer;
  }, []);

  useFrame(({ clock }) => {
    const line = lineRef.current;
    if (!line) return;
    const selectedId = brain.getStatus().selectedConnectionId;
    const connection = selectedId ? brain.getConnection(selectedId) : undefined;
    const source = connection ? brain.getNeuron(connection.source) : undefined;
    const target = connection ? brain.getNeuron(connection.target) : undefined;
    line.visible = Boolean(source && target);
    if (!source || !target) return;
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, ...source.position);
    positions.setXYZ(1, ...target.position);
    positions.needsUpdate = true;
    const material = line.material as THREE.LineBasicMaterial;
    material.opacity = 0.72 + Math.sin(clock.elapsedTime * 4) * 0.16;
  });

  return (
    <lineSegments ref={lineRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#fff1a8" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

export function MacroTracts() {
  const curves = useMemo(() => {
    const pairs = [
      [[-6.2, 0.2, 0.1], [-3.1, 0.6, 0.3], [-0.2, 0.1, -0.1]],
      [[6.2, 0.2, 0.1], [3.1, 0.6, 0.3], [0.2, 0.1, -0.1]],
      [[-2.8, -1.8, 0.8], [-1.8, 0.4, 0.1], [-0.8, 2.1, -0.6]],
      [[2.8, -1.8, 0.8], [1.8, 0.4, 0.1], [0.8, 2.1, -0.6]],
      [[-4.9, -0.8, -0.6], [-2.6, -0.2, -0.5], [0, -1.7, -0.3]],
      [[4.9, -0.8, -0.6], [2.6, -0.2, -0.5], [0, -1.7, -0.3]],
    ];
    return pairs.map((points) => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))));
  }, []);

  return (
    <group>
      {curves.map((curve, index) => (
        <mesh key={index}>
          <tubeGeometry args={[curve, 42, 0.018, 4, false]} />
          <meshBasicMaterial color={index < 2 ? "#5bc8d2" : "#8d7bc7"} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}