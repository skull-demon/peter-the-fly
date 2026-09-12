import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ELECTRODES, MACHINE_POSITION, toFlyWorld, type Point } from "./parts";

type Props = { active: boolean; motion: boolean };

function SignalWire({ points, color, active, motion, phase = 0, radius = .006 }: Props & { points: Point[]; color: string; phase?: number; radius?: number }) {
  const dots = useRef<THREE.Group>(null);
  const { curve, geometry } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return { curve, geometry: new THREE.TubeGeometry(curve, 110, radius, 7, false) };
  }, [points, radius]);
  const currentPoint = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!motion || !dots.current) return;
    dots.current.children.forEach((dot, index) => {
      const t = (clock.elapsedTime * (active ? .36 : .10) + phase + index / 2) % 1;
      curve.getPointAt(t, currentPoint);
      dot.position.copy(currentPoint);
      dot.scale.setScalar(.6 + Math.sin(t * Math.PI) * .4);
    });
  });
  return <group><mesh geometry={geometry} castShadow><meshStandardMaterial color={color} roughness={.5} metalness={.8} /></mesh>{motion && <group ref={dots}>{[0, 1].map((i) => <mesh key={i}><sphereGeometry args={[radius * 1.65, 8, 6]} /><meshBasicMaterial color="#cfb27c" /></mesh>)}</group>}</group>;
}

export default function Wiring({ active, motion }: Props) {
  const wires = useMemo(() => ELECTRODES.map((electrode, i) => {
    const start = toFlyWorld(electrode);
    return [start, [start[0] + .12, start[1] + .11 + i * .065, start[2]], [-.7, .25 + i * .052, .61 + i * .055], [-.20, .28 + i * .05, .22], [MACHINE_POSITION[0] - 1.085, .60 + i * .23, -.10]] as Point[];
  }), []);
  const output = useMemo<Point[]>(() => [[2.215, 1.59, -.26], [2.61, 1.50, -.26], [2.83, .79, -.12], [3.10, .17, .38], [3.48, .12, .49]], []);
  return <group>{wires.map((points, i) => <SignalWire key={i} points={points} color={i === 1 ? "#8e815d" : "#a66f47"} active={active} motion={motion} phase={i * .23} />)}<SignalWire points={output} color="#62523b" active={active} motion={motion} radius={.018} /></group>;
}