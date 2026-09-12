import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ELECTRODES, FLY_POSITION, FLY_SCALE, Rod, type Point } from "./parts";

type Props = { active: boolean; motion: boolean };

/* ------------------------------------------------------------------ */
/* WING                                                               */
/* ------------------------------------------------------------------ */
function Wing({ side, active, motion }: Props & { side: number }) {
  const ref = useRef<THREE.Group>(null);
  const { wing, veins } = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(.28, .18, .9, .45, 1.24, .36);
    shape.bezierCurveTo(1.61, .24, 1.40, .08, .99, .025);
    shape.bezierCurveTo(.60, -.055, .20, -.045, 0, 0);
    const wing = new THREE.ShapeGeometry(shape, 28);
    wing.rotateX(-Math.PI / 2);
    wing.scale(-1, 1, -side);
    const lines = [
      [0, 0, 1.37, .21], [.03, .02, 1.22, .34], [.08, .00, 1.12, .05],
      [.31, .09, .42, .20], [.60, .095, .66, .29], [.86, .13, .96, .34],
      [.47, .048, .55, -.01], [.90, .14, 1.05, .08],
    ];
    const data = lines.flatMap(([x, z, xx, zz]) => [-x, .002, z * side, -xx, .002, zz * side]);
    const veins = new THREE.BufferGeometry();
    veins.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
    return { wing, veins };
  }, [side]);
  useEffect(() => () => { wing.dispose(); veins.dispose(); }, [wing, veins]);

  useFrame(({ clock }) => {
    if (!motion || !ref.current) return;
    const t = clock.elapsedTime;

    // rapid wing-beat oscillator: a constant micro-tremor at rest,
    // a full visible beat when the specimen is "thinking"
    const beatFreq = active ? 42 : 30;
    const beatAmp = active ? 0.34 : 0.045;
    const flap = Math.sin(t * beatFreq) * beatAmp;

    // occasional wing-flick at rest: quick open and careful re-fold
    const flickPeriod = 7.6 + (side > 0 ? 0.9 : 0);
    const fp = (t + (side > 0 ? 0.4 : 0)) % flickPeriod;
    const flick = !active && fp < 1.0 ? Math.pow(Math.sin((fp / 1.0) * Math.PI), 3) * 0.5 : 0;

    // stroke-plane rocking (fore / aft tilt), phase-shifted per side
    const stroke =
      (active ? 0.15 : 0.025) * Math.sin(t * beatFreq * 0.5 + (side > 0 ? 0 : Math.PI));
    const sway = active ? Math.sin(t * beatFreq * 0.25) * 0.05 : 0;

    ref.current.rotation.set(
      -stroke,
      side * -0.10 + sway,
      0.045 + flap + flick,
    );
    // high-frequency positional buzz, subtle so it reads as muscle vibration
    ref.current.position.y = 0.17 + Math.sin(t * beatFreq * 2) * (active ? 0.004 : 0.001);
  });

  return (
    <group ref={ref} position={[.03, .17, side * .13]} rotation={[0, side * -.10, .045]}>
      <mesh geometry={wing}><meshPhysicalMaterial color="#e7dfc9" transparent opacity={.45} roughness={.23} metalness={.03} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <lineSegments geometry={veins}><lineBasicMaterial color="#74684f" transparent opacity={.55} /></lineSegments>
      <lineSegments><edgesGeometry args={[wing]} /><lineBasicMaterial color="#796e5a" transparent opacity={.45} /></lineSegments>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* SURFACE DETAILS                                                    */
/* ------------------------------------------------------------------ */
function Bristles() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 105; i++) {
      const a = i * 2.399963, h = (i + .5) / 105 * 1.7 - .55;
      const b = Math.sqrt(1 - Math.min(.99, h * h));
      const x = Math.cos(a) * b * .30, y = h * .25, z = Math.sin(a) * b * .235;
      points.push(x, y, z, x * 1.10, y * 1.15 + .01, z * 1.15);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#302c22" /></lineSegments>;
}

function CompoundEye({ side, active = false }: { side: number; active?: boolean }) {
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);
  useFrame(({ clock }) => {
    // during real translation the optic lobe lights up behind the lens
    if (mat.current) {
      mat.current.emissiveIntensity = active
        ? 0.45 + Math.sin(clock.elapsedTime * 7.3) * 0.28
        : 0;
    }
  });
  const map = useMemo(() => {
    const el = document.createElement("canvas"); el.width = el.height = 128;
    const ctx = el.getContext("2d")!;
    ctx.fillStyle = "#795148"; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 130; y += 5) for (let x = 0; x < 132; x += 5) {
      ctx.fillStyle = "#4e332a";
      ctx.beginPath(); ctx.arc(x + (y % 10 ? 2.5 : 0), y, 1.65, 0, Math.PI * 2); ctx.fill();
    }
    const texture = new THREE.CanvasTexture(el); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return <mesh position={[.51, .035, side * .145]} scale={[.15, .19, .115]} castShadow><sphereGeometry args={[1, 32, 24]} /><meshPhysicalMaterial ref={mat} map={map} roughness={.5} clearcoat={.23} metalness={.05} emissive="#b9864a" emissiveIntensity={0} /></mesh>;
}

/* ------------------------------------------------------------------ */
/* FLY                                                                */
/* ------------------------------------------------------------------ */
export default function Fly({ active, motion }: Props) {
  const abdomenRef = useRef<THREE.Group>(null);
  const thoraxRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Group>(null);
  const antennaL = useRef<THREE.Group>(null);
  const antennaR = useRef<THREE.Group>(null);
  const proboscisRef = useRef<THREE.Group>(null);
  const haltereL = useRef<THREE.Group>(null);
  const haltereR = useRef<THREE.Group>(null);
  const legRefs = useRef<(THREE.Group | null)[]>([]);

  const abdomenGeometry = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(.02, -.46), new THREE.Vector2(.10, -.38), new THREE.Vector2(.16, -.25),
    new THREE.Vector2(.21, -.09), new THREE.Vector2(.23, .07), new THREE.Vector2(.21, .23), new THREE.Vector2(.14, .37),
  ], 36), []);
  useEffect(() => () => abdomenGeometry.dispose(), [abdomenGeometry]);

  useFrame(({ clock }) => {
    if (!motion) return;
    const t = clock.elapsedTime;

    // breathing: slow abdomen pulse, quickened while translating
    if (abdomenRef.current) {
      const breath = 1 + Math.sin(t * (active ? 5.2 : 2.1)) * (active ? 0.022 : 0.014);
      abdomenRef.current.scale.set(1, breath, 1);
    }
    // thorax micro-pulse
    if (thoraxRef.current) {
      const p = 1 + Math.sin(t * (active ? 7.5 : 0)) * 0.012;
      thoraxRef.current.scale.set(.32 * p, .25, .24);
    }

    // head scanning: slow sweeps with an occasional quick dart
    const dart = Math.pow(Math.max(0, Math.sin(t * 0.45 + 1.2)), 42) * 0.11;
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.5) * 0.07 + Math.sin(t * 0.23) * 0.05 + dart;
      headRef.current.rotation.x = Math.sin(t * 0.34) * 0.045;
      headRef.current.rotation.z = Math.sin(t * 0.72) * 0.03;
    }

    // antennae tremor
    if (antennaL.current) {
      antennaL.current.rotation.z = 0.5 + Math.sin(t * 11.3) * 0.07 + (active ? Math.sin(t * 29) * 0.05 : 0);
      antennaL.current.rotation.x = Math.sin(t * 6.8) * 0.05;
    }
    if (antennaR.current) {
      antennaR.current.rotation.z = 0.5 + Math.cos(t * 10.7) * 0.07 + (active ? Math.cos(t * 27) * 0.05 : 0);
      antennaR.current.rotation.x = Math.cos(t * 6.2) * 0.05;
    }

    // proboscis dabs the platform occasionally
    const dp = (t + 3.8) % 9.6;
    const dab = dp < 1.2 ? Math.sin((dp / 1.2) * Math.PI) : 0;
    if (proboscisRef.current) proboscisRef.current.rotation.z = -0.7 - dab * 0.32;

    // halteres: tiny gyroscopic organs, oscillating at wing frequency
    const haltereBeat = Math.sin(t * (active ? 58 : 34)) * 0.5;
    if (haltereL.current) haltereL.current.rotation.x = haltereBeat;
    if (haltereR.current) haltereR.current.rotation.x = -haltereBeat;

    // legs: idle micro-twitches
    legRefs.current.forEach((leg, i) => {
      if (!leg) return;
      const phase = i * 2.31;
      const twitch = Math.pow(Math.max(0, Math.sin(t * 1.55 + phase)), 50) * 0.1;
      leg.rotation.x = twitch * (i % 2 ? -1 : 1);
      leg.rotation.z = 0;
      leg.rotation.y = 0;
    });

    // front-leg grooming: every ~11s one leg lifts toward the mouthparts
    const gPhase = (t + 4.6) % 11.2;
    const groom = gPhase < 1.4 ? Math.sin((gPhase / 1.4) * Math.PI) : 0;
    if (legRefs.current[2]) {
      legRefs.current[2].rotation.z = groom * 0.5;
      legRefs.current[2].rotation.y = -groom * 0.35;
    }
    if (legRefs.current[5]) {
      legRefs.current[5].rotation.z = groom * 0.5;
      legRefs.current[5].rotation.y = groom * 0.35;
    }
  });

  const legs = [-1, 1].flatMap((side) => [-1, 0, 1].map((index) => {
    const root: Point = [index * .19, -.08, side * .14];
    const knee: Point = [index * .43, -.24, side * .35];
    const ankle: Point = [index * .69, -.53, side * .58];
    const toe: Point = [index * .76 + .03, -.59, side * .65];
    return { root, knee, ankle, toe, id: `${side}-${index}` };
  }));

  return (
    <group position={FLY_POSITION} scale={FLY_SCALE}>
      <group ref={abdomenRef} position={[-.43, -.02, 0]}>
        <mesh geometry={abdomenGeometry} rotation={[0, 0, -Math.PI / 2]} castShadow><meshPhysicalMaterial color="#39362d" roughness={.6} metalness={.14} clearcoat={.15} /></mesh>
        {[[-.25, .164], [-.09, .217], [.075, .232], [.23, .212]].map(([x, r]) => <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[r, .007, 5, 32]} /><meshStandardMaterial color="#171a15" roughness={.8} /></mesh>)}
      </group>

      <mesh ref={thoraxRef} scale={[.32, .25, .24]} castShadow><sphereGeometry args={[1, 36, 28]} /><meshPhysicalMaterial color="#393930" roughness={.57} metalness={.15} /></mesh>
      {[-.11, -.035, .045, .12].map((z) => <mesh key={z} position={[-.01, .217, z]} rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[.016, .33, 3, 8]} /><meshStandardMaterial color="#22251f" roughness={.7} /></mesh>)}
      <Bristles />

      {/* neck */}
      <Rod from={[.24, 0, 0]} to={[.43, .015, 0]} radius={.066} color="#25251c" metalness={.15} />

      {/* head (pivot at the neck) */}
      <group ref={headRef} position={[.38, .03, 0]}>
        <mesh position={[.46, .025, 0]} scale={[.185, .18, .215]} castShadow><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#302d24" roughness={.65} /></mesh>
        <CompoundEye side={-1} active={active} /><CompoundEye side={1} active={active} />
        <group ref={antennaL} position={[.57, .045, .03]}>
          <Rod from={[0, 0, 0]} to={[.20, .075, .045]} radius={.009} endRadius={.003} color="#2f2c22" metalness={0} />
        </group>
        <group ref={antennaR} position={[.57, .045, -.03]}>
          <Rod from={[0, 0, 0]} to={[.17, .085, -.06]} radius={.009} endRadius={.003} color="#2f2c22" metalness={0} />
        </group>
        <group ref={proboscisRef} position={[.61, -.04, 0]}>
          <Rod from={[0, 0, 0]} to={[.05, -.15, 0]} radius={.025} endRadius={.020} color="#42392c" metalness={0} />
        </group>
        {/* electrodes move with the head so the leads stay believable */}
        {ELECTRODES.map((end, i) => <group key={i}><Rod from={[end[0], .15, end[2]]} to={end} radius={.006} color="#bba275" /><mesh position={end}><sphereGeometry args={[.012, 10, 8]} /><meshStandardMaterial color="#b89b61" roughness={.5} metalness={.75} /></mesh></group>)}
      </group>

      {/* legs */}
      {legs.map((leg, i) => <group key={leg.id} ref={(el) => { legRefs.current[i] = el; }}><Rod from={leg.root} to={leg.knee} radius={.016} endRadius={.012} color="#27271e" metalness={.12} /><Rod from={leg.knee} to={leg.ankle} radius={.010} endRadius={.006} color="#27271e" metalness={.12} /><Rod from={leg.ankle} to={leg.toe} radius={.0045} color="#27271e" metalness={0} /></group>)}

      <Wing side={1} active={active} motion={motion} /><Wing side={-1} active={active} motion={motion} />

      {/* halteres — the fly's gyroscopic balancing organs, beating like tiny wings */}
      <group ref={haltereL} position={[-.05, .13, .10]}>
        <Rod from={[0, 0, 0]} to={[-.09, .045, .02]} radius={.005} endRadius={.003} color="#27271e" metalness={.1} />
        <mesh position={[-.10, .05, .02]}><sphereGeometry args={[.014, 8, 8]} /><meshStandardMaterial color="#2b2b22" roughness={.6} /></mesh>
      </group>
      <group ref={haltereR} position={[-.05, .13, -.10]}>
        <Rod from={[0, 0, 0]} to={[-.09, .045, -.02]} radius={.005} endRadius={.003} color="#27271e" metalness={.1} />
        <mesh position={[-.10, .05, -.02]}><sphereGeometry args={[.014, 8, 8]} /><meshStandardMaterial color="#2b2b22" roughness={.6} /></mesh>
      </group>
    </group>
  );
}
