// 시점(어디를 얼마나 넓게 보는지)과 화면 좌표 사이의 계산. Three.js 없이 순수 수학.
// 렌더러와 따로 계산해서, e2e 테스트가 "계산한 자리에 실제로 별이 찍혔는가"를 검사할 수 있다.
import { azAltToVec, DEG, refractionDeg, vecToAzAlt, type AzAlt, type Vec3 } from './coords';

export interface View {
  /** 화면 가운데의 방위각(도) */
  az: number;
  /** 화면 가운데의 고도(도) */
  alt: number;
  /** 시야각(도): 화면의 긴 쪽 방향으로 보이는 각도. 20~100 */
  fov: number;
}

export const FOV_MIN = 20;
export const FOV_MAX = 100;
export const ALT_MIN = -10;
export const ALT_MAX = 89.9;

export function clampView(v: View): View {
  return {
    az: ((v.az % 360) + 360) % 360,
    alt: Math.max(ALT_MIN, Math.min(ALT_MAX, v.alt)),
    fov: Math.max(FOV_MIN, Math.min(FOV_MAX, v.fov)),
  };
}

/** 시야각(긴 쪽 기준)을 세로 시야각(도)으로 바꾼다. Three.js 카메라는 세로 기준이라 필요. */
export function verticalFov(fovDeg: number, width: number, height: number): number {
  if (height >= width) return fovDeg;
  const half = Math.atan(Math.tan((fovDeg * DEG) / 2) * (height / width));
  return (2 * half) / DEG;
}

export interface CameraBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

/** 드래그 모드 카메라: (az, alt)를 바라보고 화면 위쪽이 천정을 향한다. */
export function cameraBasis(view: View): CameraBasis {
  const forward = azAltToVec(view.az, view.alt);
  const a = view.az * DEG;
  const right: Vec3 = [Math.cos(a), 0, Math.sin(a)];
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** 카메라 앞쪽에 있고 화면 안에 들어오는지 */
  visible: boolean;
}

/** 월드 방향 → 화면 픽셀 좌표(CSS 픽셀, 왼쪽 위가 0,0). */
export function projectVec(view: View, width: number, height: number, v: Vec3): ScreenPoint {
  const { forward, right, up } = cameraBasis(view);
  const z = v[0] * forward[0] + v[1] * forward[1] + v[2] * forward[2];
  const x = v[0] * right[0] + v[1] * right[1] + v[2] * right[2];
  const y = v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
  if (z <= 1e-6) return { x: NaN, y: NaN, visible: false };
  const t = Math.tan((verticalFov(view.fov, width, height) * DEG) / 2);
  const ny = y / z / t;
  const nx = x / z / (t * (width / height));
  const sx = (nx * 0.5 + 0.5) * width;
  const sy = (0.5 - ny * 0.5) * height;
  return { x: sx, y: sy, visible: Math.abs(nx) <= 1 && Math.abs(ny) <= 1 };
}

/** 방위각·고도 → 화면 좌표. refract=true면 화면처럼 대기 굴절만큼 올려서 계산. */
export function projectAzAlt(view: View, width: number, height: number, p: AzAlt, refract = true): ScreenPoint {
  const alt = refract ? p.alt + refractionDeg(p.alt) : p.alt;
  return projectVec(view, width, height, azAltToVec(p.az, alt));
}

/** 화면 좌표 → 월드 방향 단위벡터. */
export function unproject(view: View, width: number, height: number, sx: number, sy: number): Vec3 {
  const { forward, right, up } = cameraBasis(view);
  const t = Math.tan((verticalFov(view.fov, width, height) * DEG) / 2);
  const nx = (sx / width) * 2 - 1;
  const ny = 1 - (sy / height) * 2;
  const x = nx * t * (width / height);
  const y = ny * t;
  const v: Vec3 = [
    forward[0] + right[0] * x + up[0] * y,
    forward[1] + right[1] * x + up[1] * y,
    forward[2] + right[2] * x + up[2] * y,
  ];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** 화면에서 pixels 픽셀이 화면 가운데에서 몇 도인지. 손가락 크기 → 각도 변환에 쓴다. */
export function pixelsToDegrees(view: View, width: number, height: number, pixels: number): number {
  const t = Math.tan((verticalFov(view.fov, width, height) * DEG) / 2);
  return Math.atan((pixels / (height / 2)) * t) / DEG;
}

/**
 * 화면에 보이는(굴절로 올라간) 방향을 실제 방향으로 되돌린다.
 * 별을 고를 때: 누른 곳은 굴절된 위치이므로, 별 목록과 비교하려면 굴절을 빼야 한다.
 */
export function unrefract(v: Vec3): Vec3 {
  const p = vecToAzAlt(v);
  // 굴절은 작아서 한 번만 빼도 충분하다(지평선 근처 오차 0.01° 미만)
  let alt = p.alt - refractionDeg(p.alt);
  alt = p.alt - refractionDeg(alt);
  return azAltToVec(p.az, alt);
}
