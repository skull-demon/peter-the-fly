import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { dialTexture, woodTexture } from "./instrumentMaterials";
import { CurvedTube, LabelPlate, MACHINE_POSITION, Rod, Screw, type Point } from "./parts";

type Props = { active: boolean; motion: boolean };

function Gauge({ position, radius, label, active, motion }: Props & { position: Point; radius: number; label: string }) {
  const needle = useRef<THREE.Group>(null);
  const map = useMemo(() => dialTexture(label), [label]);
  useEffect(() => () => map.dispose(), [map]);
  useFrame(({ clock }) => {
    if (motion && needle.current) {
      const t = clock.elapsedTime;
      needle.current.rotation.z = -.50 + Math.sin(t * (active ? 7 : 1.3)) * (active ? .34 : .09) + Math.sin(t * 3.1) * .025;
    }
  });
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[radius + .035, radius + .035, .07, 64]} /><meshStandardMaterial color="#977c48" metalness={.8} roughness={.38} /></mesh>
      <mesh position={[0, 0, .041]}><circleGeometry args={[radius, 64]} /><meshStandardMaterial map={map} roughness={.77} /></mesh>
      <mesh position={[0, 0, .049]}><torusGeometry args={[radius + .012, .021, 10, 64]} /><meshStandardMaterial color="#b6a071" metalness={.85} roughness={.32} /></mesh>
      <group ref={needle} position={[0, -.02, .058]} rotation={[0, 0, -.5]}>
        <mesh position={[0, radius * .28, 0]}><boxGeometry args={[.008, radius * .72, .003]} /><meshStandardMaterial color="#3f3023" roughness={.55} /></mesh>
        <mesh position={[0, -.05, 0]}><boxGeometry args={[.015, .075, .004]} /><meshStandardMaterial color="#695238" /></mesh>
      </group>
      <mesh position={[0, -.02, .068]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.024, .025, .025, 16]} /><meshStandardMaterial color="#a28b5c" metalness={.75} roughness={.45} /></mesh>
      {[0, 2, 4].map((i) => <Screw key={i} position={[Math.cos(i / 6 * Math.PI * 2) * (radius + .017), Math.sin(i / 6 * Math.PI * 2) * (radius + .017), .069]} size={.012} />)}
    </group>
  );
}

function VacuumTube({ position, active, motion, index }: Props & { position: Point; index: number }) {
  const filament = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (filament.current && motion) filament.current.emissiveIntensity = (active ? .9 : .22) + Math.sin(clock.elapsedTime * 2 + index) * .08;
  });
  return (
    <group position={position}>
      <mesh position={[0, .035, 0]}><cylinderGeometry args={[.083, .088, .07, 20]} /><meshStandardMaterial color="#9c8556" roughness={.43} metalness={.8} /></mesh>
      <mesh position={[0, .25, 0]}><capsuleGeometry args={[.065, .29, 6, 16]} /><meshPhysicalMaterial color="#eee5ce" transparent opacity={.21} roughness={.16} metalness={.06} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <Rod from={[-.024, .07, 0]} to={[-.024, .40, 0]} radius={.004} color="#7d6b4a" /><Rod from={[.024, .07, 0]} to={[.024, .40, 0]} radius={.004} color="#7d6b4a" />
      <mesh position={[0, .25, .009]}><cylinderGeometry args={[.004, .004, .23, 6]} /><meshStandardMaterial ref={filament} color="#c19c61" emissive="#b9864a" emissiveIntensity={.25} /></mesh>
      <mesh position={[0, .43, 0]}><sphereGeometry args={[.012, 10, 8]} /><meshStandardMaterial color="#a18b68" metalness={.6} roughness={.4} /></mesh>
    </group>
  );
}

function Toggle({ position, label, on, motion }: { position: Point; label: string; on: boolean; motion: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.x = motion ? THREE.MathUtils.damp(ref.current.rotation.x, on ? -.45 : .45, 15, delta) : on ? -.45 : .45;
  });
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.045, .045, .018, 16]} /><meshStandardMaterial color="#a38a5a" metalness={.85} roughness={.38} /></mesh>
      <group ref={ref} rotation={[on ? -.45 : .45, 0, 0]}><Rod from={[0, 0, 0]} to={[0, .015, .135]} radius={.012} color="#bda877" /><mesh position={[0, .015, .137]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[.019, .043, 3, 10]} /><meshStandardMaterial color="#e4d8bb" roughness={.6} /></mesh></group>
      <LabelPlate position={[0, -.10, .007]} lines={[label]} width={.34} height={.061} paper />
    </group>
  );
}

function Knob({ position, radius = .085 }: { position: Point; radius?: number }) {
  return <group position={position}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[radius, radius * .85, .075, 32]} /><meshStandardMaterial color="#51362a" roughness={.45} metalness={.08} /></mesh>{Array.from({ length: 22 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 11) * radius, Math.sin(i * Math.PI / 11) * radius, 0]}><sphereGeometry args={[.006, 4, 4]} /><meshStandardMaterial color="#694835" roughness={.65} /></mesh>)}<mesh position={[0, radius * .53, .039]}><boxGeometry args={[.007, radius * .43, .002]} /><meshStandardMaterial color="#d6c29a" /></mesh></group>;
}

export default function Machine({ active, motion }: Props) {
  const wood = useMemo(woodTexture, []);
  const wheel = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const copperCoils = useMemo(() => [-1, 1].map((side) => Array.from({ length: 241 }, (_, i): Point => {
    const a = i / 240 * Math.PI * 12;
    return [-1.10 + Math.sin(a) * .12, (side === 1 ? 1.58 : .89) + i / 240 * .45, .12 + Math.cos(a) * .12];
  })), []);
  useEffect(() => () => wood.dispose(), [wood]);
  useFrame(({ clock }, delta) => {
    if (!motion) return;
    if (wheel.current) wheel.current.rotation.z -= delta * (active ? 1.1 : .13);
    if (lamp.current) lamp.current.emissiveIntensity = active ? .45 + Math.sin(clock.elapsedTime * 5) * .15 : .1;
  });

  return (
    <group position={MACHINE_POSITION}>
      <RoundedBox args={[2.04, 2.55, 1.2]} radius={.055} smoothness={3} position={[0, 1.45, 0]} castShadow receiveShadow><meshStandardMaterial map={wood} roughness={.62} metalness={.05} /></RoundedBox>
      <RoundedBox args={[1.82, 2.33, .045]} radius={.03} smoothness={3} position={[0, 1.45, .617]} castShadow><meshStandardMaterial color="#e6ddc4" roughness={.65} metalness={.15} /></RoundedBox>
      {[-.884, .884].map((x) => <mesh key={x} position={[x, 1.45, .646]}><boxGeometry args={[.010, 2.27, .008]} /><meshStandardMaterial color="#a59874" metalness={.6} roughness={.5} /></mesh>)}
      {[.327, 2.573].map((y) => <mesh key={y} position={[0, y, .646]}><boxGeometry args={[1.77, .012, .008]} /><meshStandardMaterial color="#a59874" metalness={.6} roughness={.5} /></mesh>)}
      {[-.86, .86].flatMap((x) => [.37, 1.15, 2.53].map((y) => <Screw key={`${x}-${y}`} position={[x, y, .655]} />))}
      <LabelPlate position={[0, 2.45, .660]} lines={["NEURAL TRANSLATION UNIT"]} width={1.15} height={.14} />
      <Gauge position={[-.42, 1.99, .653]} radius={.315} label="Brain activity" active={active} motion={motion} />
      <Gauge position={[.42, 1.98, .653]} radius={.28} label="Signal strength" active={active} motion={motion} />
      <LabelPlate position={[0, 1.54, .66]} lines={["FLYBRAIN LABORATORIES", "VERY EXPERIMENTAL"]} width={.74} height={.14} />
      <Toggle position={[-.43, 1.18, .67]} label="THINK" on motion={motion} />
      <Toggle position={[.40, 1.18, .67]} label="MAKE HIM TALK" on={active} motion={motion} />
      <Knob position={[-.68, .77, .696]} radius={.105} /><Knob position={[.68, .77, .696]} radius={.105} />
      <Knob position={[-.65, 1.43, .695]} radius={.06} /><Knob position={[.68, .40, .695]} radius={.07} />
      <mesh position={[0, .78, .68]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.282, .282, .025, 56]} /><meshStandardMaterial color="#51442d" roughness={.6} metalness={.5} /></mesh>
      <group ref={wheel} position={[0, .78, .71]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.255, .255, .044, 56]} /><meshStandardMaterial color="#b19b68" roughness={.44} metalness={.83} /></mesh>
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 4) * .175, Math.sin(i * Math.PI / 4) * .175, .024]}><circleGeometry args={[.036, 14]} /><meshStandardMaterial color="#51402c" roughness={.8} /></mesh>)}
        <mesh position={[0, 0, .03]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.049, .049, .068, 20]} /><meshStandardMaterial color="#8c7548" metalness={.8} roughness={.4} /></mesh>
        <Screw position={[0, .19, .028]} size={.014} />
      </group>
      <LabelPlate position={[0, .385, .668]} lines={["LEXICAL SEQUENCER / 01"]} width={.77} height={.086} paper />
      {[-.18, 0, .18].map((x, i) => <group key={x} position={[x, 1.32, .674]}><mesh><torusGeometry args={[.029, .008, 8, 18]} /><meshStandardMaterial color="#a28d58" roughness={.4} metalness={.8} /></mesh><mesh><sphereGeometry args={[.023, 12, 10]} /><meshStandardMaterial ref={i === 1 ? lamp : undefined} color={i === 2 ? "#737c57" : "#b38a51"} emissive="#9b733c" emissiveIntensity={.1} roughness={.25} /></mesh></group>)}
      {[-.77, -.49, -.21, .29, .56, .82].map((x, i) => <VacuumTube key={x} position={[x, 2.745, -.02]} active={active} motion={motion} index={i} />)}
      <CurvedTube points={[[-.21, 2.77, -.22], [-.20, 2.97, -.22], [.05, 3.025, -.22], [.28, 2.98, -.22], [.29, 2.77, -.22]]} radius={.036} color="#947c4e" />
      {copperCoils.map((points, i) => <CurvedTube key={i} points={points} radius={.014} />)}
      {[.58, .81, 1.04].map((y) => <group key={y} position={[-1.033, y, .20]} rotation={[0, -Math.PI / 2, 0]}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.041, .041, .085, 14]} /><meshStandardMaterial color="#a79058" metalness={.78} roughness={.42} /></mesh><mesh position={[0, 0, .05]}><torusGeometry args={[.027, .007, 6, 14]} /><meshStandardMaterial color="#55412e" /></mesh></group>)}
      <group position={[1.045, 1.57, .04]} rotation={[0, Math.PI / 2, 0]}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.065, .065, .08, 18]} /><meshStandardMaterial color="#927746" metalness={.8} roughness={.44} /></mesh><mesh position={[0, 0, .041]}><circleGeometry args={[.035, 16]} /><meshStandardMaterial color="#42382c" /></mesh></group>
      <group position={[1.059, .76, -.10]} rotation={[0, Math.PI / 2, 0]}><mesh><torusGeometry args={[.14, .018, 8, 32]} /><meshStandardMaterial color="#9e8656" metalness={.8} roughness={.4} /></mesh>{[0, 1, 2].map((i) => <mesh key={i} rotation={[0, 0, i * Math.PI / 3]}><boxGeometry args={[.28, .013, .014]} /><meshStandardMaterial color="#9e8656" metalness={.8} roughness={.4} /></mesh>)}</group>
      {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[1.024, .40 + i * .07, -.31]}><boxGeometry args={[.015, .018, .35]} /><meshStandardMaterial color="#35281d" roughness={.8} /></mesh>)}
      <RoundedBox args={[2.21, .13, 1.35]} position={[0, .17, 0]} radius={.025} smoothness={2} castShadow><meshStandardMaterial map={wood} roughness={.55} /></RoundedBox>
      {[-.84, .84].flatMap((x) => [-.40, .40].map((z) => <mesh key={`${x}-${z}`} position={[x, .059, z]}><cylinderGeometry args={[.079, .092, .112, 16]} /><meshStandardMaterial color="#5b4630" roughness={.58} metalness={.22} /></mesh>))}
    </group>
  );
}