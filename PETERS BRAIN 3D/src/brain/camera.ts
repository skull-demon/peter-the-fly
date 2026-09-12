import type { CameraPreset, Vec3 } from "./types";

export const CAMERA_PRESETS: Record<CameraPreset, { position: Vec3; target: Vec3 }> = {
  WHOLE_BRAIN: { position: [0, 0.25, 15.5], target: [0, 0, 0] },
  CENTRAL_BRAIN: { position: [0, 0.2, 9], target: [0, 0.15, 0] },
  LEFT_OPTIC_LOBE: { position: [-5.15, 0.15, 6], target: [-5.15, 0.15, 0] },
  RIGHT_OPTIC_LOBE: { position: [5.15, 0.15, 6], target: [5.15, 0.15, 0] },
  CENTRAL_COMPLEX: { position: [0, 0.25, 5.2], target: [0, 0.3, -0.25] },
  MUSHROOM_BODY: { position: [0, 1.4, 8], target: [0, 1.1, -0.1] },
  VISUAL_SYSTEM: { position: [0, 0.15, 17], target: [0, 0.15, 0] },
  TOP: { position: [0, 15, 0.01], target: [0, 0, 0] },
  FRONT: { position: [0, 0.25, 15.5], target: [0, 0, 0] },
  SIDE: { position: [15.5, 0.25, 0], target: [0, 0, 0] },
  ISOMETRIC: { position: [10.5, 7.4, 11.5], target: [0, 0, 0] },
};