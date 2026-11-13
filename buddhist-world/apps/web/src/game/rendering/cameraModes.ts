export type CameraMode = "gameplay" | "cinematic" | "photo";

export interface CameraModeProfile {
  fov: number;
  minimumDistance: number;
  lookHeight: number;
  heightOffset: number;
  smoothing: number;
}

export const CAMERA_MODE_PROFILES: Record<CameraMode, CameraModeProfile> = {
  gameplay: { fov: 55, minimumDistance: 0, lookHeight: 0.9, heightOffset: 1.2, smoothing: 14 },
  cinematic: { fov: 46, minimumDistance: 9, lookHeight: 1.05, heightOffset: 1.65, smoothing: 8 },
  photo: { fov: 38, minimumDistance: 12, lookHeight: 1.1, heightOffset: 1.9, smoothing: 10 },
};

export function resolveCameraDistance(mode: CameraMode, userDistance: number): number {
  const minimum = CAMERA_MODE_PROFILES[mode].minimumDistance;
  return Math.max(minimum, Number.isFinite(userDistance) ? userDistance : minimum);
}
