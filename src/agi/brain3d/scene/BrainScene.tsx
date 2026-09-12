import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { brain } from "../runtime";
import { useBrainModelRevision } from "../hooks";
import { PlasticityMarkers, SpikePulses, SynapsePulses } from "./ActivityEffects";
import { ConnectionLayer, MacroTracts, SelectedConnection } from "./Connections";
import { NeuronLayer, SomaLayer } from "./NeuronLayer";
import { RegionLayer } from "./Regions";

function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const lastRequest = useRef(-1);
  const destination = useRef(new THREE.Vector3(...brain.getStatus().cameraRequest.position));
  const target = useRef(new THREE.Vector3(...brain.getStatus().cameraRequest.target));
  const interacting = useRef(false);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const request = brain.getStatus().cameraRequest;
    if (request.serial !== lastRequest.current) {
      lastRequest.current = request.serial;
      destination.current.set(...request.position);
      target.current.set(...request.target);
    }
    if (interacting.current) return;
    const lambda = 5.4;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, destination.current.x, lambda, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, destination.current.y, lambda, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, destination.current.z, lambda, delta);
    controls.target.x = THREE.MathUtils.damp(controls.target.x, target.current.x, lambda, delta);
    controls.target.y = THREE.MathUtils.damp(controls.target.y, target.current.y, lambda, delta);
    controls.target.z = THREE.MathUtils.damp(controls.target.z, target.current.z, lambda, delta);
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      minDistance={2.2}
      maxDistance={28}
      rotateSpeed={0.48}
      zoomSpeed={0.7}
      panSpeed={0.55}
      onStart={() => {
        interacting.current = true;
      }}
      onEnd={() => {
        interacting.current = false;
        destination.current.copy(camera.position);
        if (controlsRef.current) target.current.copy(controlsRef.current.target);
      }}
    />
  );
}

function FrameClock() {
  useFrame((_, delta) => brain.advance(Math.min(delta, 0.08)));
  return null;
}

function Atmosphere() {
  const geometry = useMemo(() => {
    const random = (() => {
      let seed = 7813;
      return () => {
        seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
        return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296;
      };
    })();
    const points = new Float32Array(900 * 3);
    for (let index = 0; index < 900; index += 1) {
      points[index * 3] = (random() - 0.5) * 18;
      points[index * 3 + 1] = (random() - 0.5) * 11;
      points[index * 3 + 2] = (random() - 0.5) * 9 - 1;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return buffer;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * 0.006; });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#6a8fa1" size={0.013} transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function BrainShell() {
  return (
    <group>
      <mesh position={[-1.95, 0.1, -0.12]} scale={[2.7, 3.15, 2.15]}>
        <icosahedronGeometry args={[1, 4]} />
        <meshPhysicalMaterial color="#193948" emissive="#102e3c" emissiveIntensity={0.18} transparent opacity={0.022} depthWrite={false} side={THREE.BackSide} />
      </mesh>
      <mesh position={[1.95, 0.1, -0.12]} scale={[2.7, 3.15, 2.15]}>
        <icosahedronGeometry args={[1, 4]} />
        <meshPhysicalMaterial color="#193948" emissive="#102e3c" emissiveIntensity={0.18} transparent opacity={0.022} depthWrite={false} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function ActivityEffects() {
  return (
    <>
      <SpikePulses />
      <SynapsePulses />
      <PlasticityMarkers />
    </>
  );
}

export function BrainScene() {
  const modelRevision = useBrainModelRevision();
  useEffect(() => () => {
    document.body.style.cursor = "default";
  }, []);

  return (
    <Canvas
      className="brain-canvas"
      dpr={[1, 1.65]}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      onPointerMissed={() => {
        brain.selectNeuron(null);
        brain.selectRegion(null);
      }}
    >
      <color attach="background" args={["#020607"]} />
      <fogExp2 attach="fog" args={["#020607", 0.027]} />
      <PerspectiveCamera makeDefault fov={38} near={0.05} far={80} position={[0, 0.25, 15.5]} />
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 5, 8]} color="#81dfdc" intensity={9} distance={24} decay={2} />
      <pointLight position={[-8, 1, 2]} color="#4f7cff" intensity={5} distance={18} decay={2} />
      <pointLight position={[8, -1, 1]} color="#c0649d" intensity={4} distance={18} decay={2} />
      <group key={modelRevision}>
        <BrainShell />
        <RegionLayer />
        <MacroTracts />
        <ConnectionLayer />
        <SelectedConnection />
        <NeuronLayer />
        <SomaLayer />
        <ActivityEffects />
      </group>
      <Atmosphere />
      <CameraRig />
      <FrameClock />
      <EffectComposer multisampling={0}>
        <Bloom intensity={1.05} luminanceThreshold={0.42} luminanceSmoothing={0.7} mipmapBlur />
        <Vignette offset={0.16} darkness={0.74} />
      </EffectComposer>
    </Canvas>
  );
}