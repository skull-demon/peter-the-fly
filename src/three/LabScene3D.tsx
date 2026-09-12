import { Component, Suspense, useEffect, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import Fly from "./Fly";
import Machine from "./Machine";
import Wiring from "./Wiring";
import { Artifacts, Backdrop, Table } from "./Environment";

type Props = { active: boolean; motion: boolean };

function CameraFit() {
  const { camera, size } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.min(size.width / 7.65, size.height / 5.3);
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);
  return null;
}

function Fallback() {
  return <div className="webgl-fallback"><img src="/images/flybrain-bench.jpg" alt="FlyBrain tabletop apparatus" /><p>The orbit view needs WebGL. The laboratory and chat are still available.</p></div>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}

export default function LabScene3D({ active, motion }: Props) {
  return (
    <SceneBoundary>
      <Canvas
        orthographic
        shadows
        dpr={[1, 1.65]}
        camera={{ position: [4.3, 3.55, 7.8], zoom: 90, near: .1, far: 45 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        fallback={<Fallback />}
      >
        <color attach="background" args={["#e9dfcd"]} />
        <fog attach="fog" args={["#e9dfcd", 14, 29]} />
        <CameraFit />
        <ambientLight color="#f7f0de" intensity={.8} />
        <hemisphereLight color="#fff9ed" groundColor="#b0a184" intensity={1.0} />
        <directionalLight
          color="#fff2d9" position={[-3.8, 7, 5]} intensity={2.1} castShadow
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-5} shadow-camera-right={5}
          shadow-camera-top={5} shadow-camera-bottom={-5} shadow-bias={-.0002} shadow-normalBias={.018}
        />
        <directionalLight color="#f0e6cc" position={[5, 3, -2]} intensity={.55} />
        <Suspense fallback={null}>
          <Table />
          <Fly active={active} motion={motion} />
          <Machine active={active} motion={motion} />
          <Wiring active={active} motion={motion} />
          <Artifacts motion={motion} />
          <Backdrop />
          <ContactShadows position={[0, -1.085, 0]} scale={15} opacity={.27} far={5} blur={2.4} resolution={256} frames={1} color="#66543c" />
          <Environment resolution={128} frames={1}>
            <color attach="background" args={["#d6cbb6"]} />
            <Lightformer color="#fff5df" intensity={2.1} position={[-4, 5, 3]} scale={[5, 5, 1]} target={[0, 0, 0]} />
            <Lightformer color="#f2e7ce" intensity={1.1} position={[3, 2, 4]} scale={[3, 4, 1]} target={[0, 0, 0]} />
            <Lightformer color="#bfa981" intensity={.55} position={[0, 1, -4]} scale={[6, 3, 1]} target={[0, 0, 0]} />
          </Environment>
        </Suspense>
        <OrbitControls makeDefault target={[0, 1.1, .05]} minZoom={20} maxZoom={300} enablePan={false} minPolarAngle={Math.PI * .14} maxPolarAngle={Math.PI * .48} minAzimuthAngle={-.65} maxAzimuthAngle={1.05} enableDamping dampingFactor={.09} />
      </Canvas>
    </SceneBoundary>
  );
}