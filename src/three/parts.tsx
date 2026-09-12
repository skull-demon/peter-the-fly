import { useEffect, useMemo } from "react";
import { CatmullRomCurve3, Quaternion, TubeGeometry, Vector3 } from "three";
import { labelTexture } from "./instrumentMaterials";

export type Point = [number, number, number];
export const FLY_POSITION: Point = [-1.37, .488, .64];
export const FLY_SCALE = .27;
export const MACHINE_POSITION: Point = [1.12, .02, -.30];
export const ELECTRODES: Point[] = [[.52, .34, .10], [.49, .32, -.10], [.55, .30, -.01]];
export const toFlyWorld = (p: Point): Point => p.map((value, i) => FLY_POSITION[i] + value * FLY_SCALE) as Point;

export function Rod({ from, to, radius = .012, color = "#9a704b", metalness = .7, endRadius }: { from: Point; to: Point; radius?: number; color?: string; metalness?: number; endRadius?: number }) {
  const { middle, quaternion, length } = useMemo(() => {
    const a = new Vector3(...from), b = new Vector3(...to);
    const direction = b.clone().sub(a);
    return { middle: a.clone().add(b).multiplyScalar(.5), quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()), length: direction.length() };
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);
  return <mesh position={middle} quaternion={quaternion} castShadow><cylinderGeometry args={[endRadius ?? radius, radius, length, 8]} /><meshStandardMaterial color={color} metalness={metalness} roughness={.44} /></mesh>;
}

export function CurvedTube({ points, radius = .012, color = "#996647", opacity = 1 }: { points: Point[]; radius?: number; color?: string; opacity?: number }) {
  const geometry = useMemo(() => new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 72, radius, 7, false), [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow><meshStandardMaterial color={color} roughness={.38} metalness={opacity < 1 ? .05 : .8} transparent={opacity < 1} opacity={opacity} /></mesh>;
}

export function Screw({ position, size = .022 }: { position: Point; size?: number }) {
  return <group position={position}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[size, size, .016, 14]} /><meshStandardMaterial color="#a58d61" metalness={.85} roughness={.43} /></mesh><mesh position={[0, 0, .01]} rotation={[0, 0, .4]}><boxGeometry args={[size * 1.5, .004, .002]} /><meshStandardMaterial color="#5b4730" /></mesh></group>;
}

export function LabelPlate({ position, lines, width = .85, height = .15, paper = false, rotation = 0 }: { position: Point; lines: string[]; width?: number; height?: number; paper?: boolean; rotation?: number }) {
  const text = lines.join("|");
  const map = useMemo(() => labelTexture(text.split("|"), paper), [text, paper]);
  useEffect(() => () => map.dispose(), [map]);
  return <group position={position} rotation={[0, 0, rotation]}><mesh><boxGeometry args={[width + .022, height + .022, .015]} /><meshStandardMaterial color={paper ? "#d2bea0" : "#ae925c"} roughness={.5} metalness={paper ? 0 : .75} /></mesh><mesh position={[0, 0, .009]}><planeGeometry args={[width, height]} /><meshStandardMaterial map={map} roughness={.67} metalness={paper ? 0 : .35} /></mesh>{!paper && [-1, 1].map((s) => <Screw key={s} position={[s * (width / 2 - .032), 0, .017]} size={.012} />)}</group>;
}