import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { brain } from "../runtime";
import type { BrainRegion } from "../types";

const labeledRegions = new Set(["ME_L", "ME_R", "LO_L", "LO_R", "AL_L", "AL_R", "CA_L", "CA_R", "PB", "FB", "EB", "GNG", "LH_L", "LH_R"]);

function RegionObject({ region }: { region: BrainRegion }) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLButtonElement>(null);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    if (!material || !mesh) return;
    const status = brain.getStatus();
    const activity = brain.getRegionActivity(region.id);
    const selected = status.selectedRegionId === region.id;
    const regionMode = status.mode === "REGION_ACTIVITY";
    material.opacity = status.showRegions ? (regionMode ? 0.1 + activity * 0.26 : selected ? 0.28 : 0.055) : 0;
    material.emissiveIntensity = 0.12 + activity * 2.8 + (selected ? 0.8 : 0);
    material.roughness = 0.34;
    mesh.scale.set(
      region.scale[0] * (1 + activity * 0.025 * Math.sin(clock.elapsedTime * 4.2)),
      region.scale[1] * (1 + activity * 0.025 * Math.sin(clock.elapsedTime * 4.2)),
      region.scale[2] * (1 + activity * 0.025 * Math.sin(clock.elapsedTime * 4.2)),
    );
    mesh.visible = status.showRegions;
    if (labelRef.current) {
      labelRef.current.style.opacity = status.showLabels ? "1" : "0";
      labelRef.current.style.pointerEvents = status.showLabels ? "auto" : "none";
      labelRef.current.dataset.active = String(status.selectedRegionId === region.id);
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={region.position}
        rotation={region.rotation}
        scale={region.scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          brain.selectRegion(region.id);
        }}
      >
        <icosahedronGeometry args={[1, 3]} />
        <meshPhysicalMaterial
          ref={materialRef}
          color={region.color}
          emissive={region.color}
          emissiveIntensity={0.15}
          transparent
          opacity={0.06}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {labeledRegions.has(region.id) && (
        <Html position={[region.position[0], region.position[1] + region.scale[1] * 0.7, region.position[2]]} center distanceFactor={10} zIndexRange={[2, 0]} occlude={false}>
          <button
            ref={labelRef}
            className="region-label"
            data-active={brain.getStatus().selectedRegionId === region.id}
            onClick={(event) => {
              event.stopPropagation();
              brain.focusRegion(region.id);
            }}
          >
            <span>{region.abbreviation.replace(/_[LR]$/, "")}</span>
            <i>{region.hemisphere === "MIDLINE" ? "M" : region.hemisphere[0]}</i>
          </button>
        </Html>
      )}
    </group>
  );
}

export function RegionLayer() {
  return (
    <group>
      {brain.getModel().regions.map((region) => <RegionObject key={region.id} region={region} />)}
    </group>
  );
}