import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { CurvedTube, FLY_POSITION, LabelPlate, Rod, Screw, type Point } from "./parts";
import { neuronNotes, woodTexture } from "./instrumentMaterials";

export function Table() {
  const wood = useMemo(woodTexture, []);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <group>
      <RoundedBox args={[6.6, .22, 3.45]} position={[0, -.12, .05]} radius={.06} smoothness={3} receiveShadow castShadow><meshStandardMaterial color="#e6dbc2" roughness={.79} /></RoundedBox>
      <RoundedBox args={[6.5, .50, 3.32]} position={[0, -.46, .05]} radius={.03} smoothness={2} castShadow><meshStandardMaterial map={wood} roughness={.7} /></RoundedBox>
      {[-1.6, 1.6].map((x) => <group key={x}><RoundedBox args={[3.02, .34, .035]} position={[x, -.45, 1.73]} radius={.018} smoothness={2}><meshStandardMaterial color="#d8ccb0" roughness={.75} /></RoundedBox><CurvedTube points={[[x - .15, -.46, 1.765], [x - .13, -.41, 1.82], [x + .13, -.41, 1.82], [x + .15, -.46, 1.765]]} color="#a28957" radius={.022} /></group>)}
      <group position={[FLY_POSITION[0], 0, FLY_POSITION[2]]}>
        <RoundedBox args={[1.24, .125, .84]} position={[0, .266, 0]} radius={.036} smoothness={3} castShadow receiveShadow><meshStandardMaterial color="#f0e5cc" roughness={.57} metalness={.07} /></RoundedBox>
        <mesh position={[0, .199, 0]}><boxGeometry args={[1.17, .028, .78]} /><meshStandardMaterial color="#bfa26a" roughness={.42} metalness={.8} /></mesh>
        {[-.50, .50].flatMap((x) => [-.29, .29].map((z) => <mesh key={`${x}-${z}`} position={[x, .108, z]} castShadow><cylinderGeometry args={[.033, .044, .18, 14]} /><meshStandardMaterial color="#b19b70" metalness={.8} roughness={.4} /></mesh>))}
        <LabelPlate position={[0, .27, .429]} lines={["PLEASE DO NOT DISTURB THE FLY"]} width={.93} height={.066} paper />
        <Rod from={[-.51, .325, -.25]} to={[-.51, .52, -.25]} radius={.010} color="#a59165" /><Rod from={[.50, .325, .27]} to={[.50, .44, .27]} radius={.010} color="#a59165" />
        <mesh position={[-.51, .526, -.25]}><sphereGeometry args={[.018, 10, 8]} /><meshStandardMaterial color="#b8a275" roughness={.45} metalness={.7} /></mesh>
      </group>
    </group>
  );
}

function TaskLamp() {
  return (
    <group position={[-2.52, 0, -.67]}>
      <mesh position={[0, .06, 0]} castShadow><cylinderGeometry args={[.32, .38, .10, 36]} /><meshStandardMaterial color="#ad9662" roughness={.4} metalness={.8} /></mesh>
      <mesh position={[0, .12, 0]}><cylinderGeometry args={[.19, .29, .035, 32]} /><meshStandardMaterial color="#c1aa78" roughness={.37} metalness={.8} /></mesh>
      <Rod from={[0, .13, 0]} to={[0, 1.53, 0]} radius={.035} color="#a58e5c" />
      <Rod from={[-.07, 1.50, 0]} to={[.48, 2.03, 0]} radius={.023} color="#ad9565" /><Rod from={[.02, 1.47, 0]} to={[.56, 2.02, 0]} radius={.023} color="#ad9565" />
      <Rod from={[.50, 2.02, 0]} to={[.88, 1.85, .06]} radius={.03} color="#ad9565" />
      {[[0, 1.51, 0], [.52, 2.02, 0]].map((p, i) => <mesh key={i} position={p as Point} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.065, .065, .08, 20]} /><meshStandardMaterial color="#b29a68" roughness={.4} metalness={.8} /></mesh>)}
      <group position={[.91, 1.65, .06]} rotation={[0, 0, -.12]}>
        <mesh castShadow><cylinderGeometry args={[.067, .285, .34, 40, 1, true]} /><meshStandardMaterial color="#e9dfc8" metalness={.12} roughness={.55} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, -.17, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.285, .012, 10, 40]} /><meshStandardMaterial color="#ac9462" roughness={.4} metalness={.8} /></mesh>
        <mesh position={[0, -.09, 0]}><sphereGeometry args={[.047, 14, 10]} /><meshStandardMaterial color="#f1e5c6" emissive="#b6a06c" emissiveIntensity={.25} /></mesh>
      </group>
    </group>
  );
}

function Coffee({ motion }: { motion: boolean }) {
  const steamRef = useRef<THREE.Group>(null);
  const cup = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(.068, .019), new THREE.Vector2(.090, .026), new THREE.Vector2(.123, .15), new THREE.Vector2(.139, .28),
    new THREE.Vector2(.132, .288), new THREE.Vector2(.125, .28), new THREE.Vector2(.110, .15), new THREE.Vector2(.078, .035),
  ], 40), []);
  useEffect(() => () => cup.dispose(), [cup]);
  useFrame(({ clock }) => { if (motion && steamRef.current) { steamRef.current.position.y = .31 + (clock.elapsedTime * .025 % .10); steamRef.current.rotation.y = Math.sin(clock.elapsedTime * .4) * .2; } });
  return (
    <group position={[-2.38, .018, 1.07]}>
      <mesh position={[0, .009, 0]}><cylinderGeometry args={[.216, .185, .02, 36]} /><meshStandardMaterial color="#e8dfcb" roughness={.55} /></mesh>
      <mesh geometry={cup} castShadow><meshPhysicalMaterial color="#eee4cd" roughness={.4} clearcoat={.2} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, .245, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.129, 32]} /><meshStandardMaterial color="#4b3020" roughness={.22} /></mesh>
      <mesh position={[.159, .157, 0]}><torusGeometry args={[.077, .016, 10, 28, Math.PI * 1.60]} /><meshStandardMaterial color="#e8dec8" roughness={.4} /></mesh>
      <mesh position={[0, .284, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[.135, .004, 6, 36]} /><meshStandardMaterial color="#b39b6d" metalness={.75} roughness={.4} /></mesh>
      <group ref={steamRef} position={[0, .31, 0]}><CurvedTube points={[[0, 0, 0], [-.018, .045, 0], [.010, .095, 0], [-.007, .16, 0]]} radius={.004} color="#e5dfd2" opacity={.18} /></group>
    </group>
  );
}

function Notes() {
  const map = useMemo(neuronNotes, []);
  useEffect(() => () => map.dispose(), [map]);
  return <>
    <group position={[.18, .03, 1.08]} rotation={[-Math.PI / 2, 0, -.20]}>
      <RoundedBox args={[.90, 1.15, .025]} radius={.013} smoothness={2}><meshStandardMaterial color="#ad9570" roughness={.85} /></RoundedBox>
      <mesh position={[0, -.025, .018]}><planeGeometry args={[.79, 1.025]} /><meshStandardMaterial map={map} roughness={.95} /></mesh>
      <mesh position={[0, .514, .039]}><boxGeometry args={[.24, .10, .023]} /><meshStandardMaterial color="#a18e60" roughness={.4} metalness={.83} /></mesh>
      <Screw position={[0, .51, .056]} size={.022} />
      <Rod from={[-.3, -.42, .036]} to={[.31, .27, .036]} radius={.013} color="#82654a" metalness={.05} />
    </group>
    <mesh position={[-2.62, .004, .40]} rotation={[-Math.PI / 2, 0, .15]}><planeGeometry args={[.94, 1.03]} /><meshStandardMaterial map={map} roughness={.9} /></mesh>
    <mesh position={[2.24, .008, .88]} rotation={[-Math.PI / 2, 0, -.29]}><planeGeometry args={[1.1, .95]} /><meshStandardMaterial map={map} roughness={.9} /></mesh>
  </>;
}

function Bottle({ position, scale = 1 }: { position: Point; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh position={[0, .21, 0]} castShadow><cylinderGeometry args={[.102, .116, .34, 28]} /><meshPhysicalMaterial color="#88532d" transparent opacity={.61} roughness={.26} metalness={.05} /></mesh>
    <mesh position={[0, .405, 0]}><cylinderGeometry args={[.083, .078, .052, 24]} /><meshStandardMaterial color="#9c8351" roughness={.44} metalness={.7} /></mesh>
    <mesh position={[0, .035, 0]}><cylinderGeometry args={[.117, .106, .036, 24]} /><meshStandardMaterial color="#86532f" roughness={.4} /></mesh>
    <LabelPlate position={[0, .23, .102]} lines={["M. DOMESTICA", "SPECIMEN 001"]} width={.16} height={.14} paper />
  </group>;
}

function Magnifier() {
  return <group position={[2.35, .055, 1.15]} rotation={[-Math.PI / 2, 0, -.55]}>
    <mesh><torusGeometry args={[.19, .014, 10, 40]} /><meshStandardMaterial color="#aa9564" roughness={.32} metalness={.85} /></mesh>
    <mesh><circleGeometry args={[.182, 40]} /><meshPhysicalMaterial color="#dfe0c9" transparent opacity={.23} roughness={.1} metalness={.06} side={THREE.DoubleSide} /></mesh>
    <Rod from={[0, -.18, 0]} to={[0, -.57, 0]} radius={.03} color="#aa9564" /><Rod from={[0, -.35, 0]} to={[0, -.63, 0]} radius={.037} color="#6d5136" metalness={.1} />
  </group>;
}

export function Artifacts({ motion }: { motion: boolean }) {
  return <group><TaskLamp /><Coffee motion={motion} /><Notes /><Bottle position={[2.8, 0, .80]} /><Bottle position={[2.68, 0, -.78]} scale={.73} /><Magnifier /></group>;
}

export function Backdrop() {
  return <group><mesh position={[0, 2, -3.5]} receiveShadow><planeGeometry args={[30, 16]} /><meshStandardMaterial color="#ece3d1" roughness={1} /></mesh><mesh position={[0, -1.10, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#e4d9c3" roughness={1} /></mesh></group>;
}