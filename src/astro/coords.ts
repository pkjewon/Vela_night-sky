// 좌표 변환: 별 목록의 좌표(J2000 적도좌표) → 지금 내 하늘(지평좌표).
//
// 좌표 규칙 (CLAUDE.md):
//   방위각 az: 북=0°, 동=90°, 남=180°, 서=270°
//   고도 alt: 지평선=0°, 천정=90°
//   월드(Three.js)  : +X=동, +Y=천정, -Z=북
//   적도좌표 벡터   : x=cos(dec)cos(ra), y=cos(dec)sin(ra), z=sin(dec)
import { MakeTime, Observer, Rotation_EQJ_HOR, RotateVector, Vector } from 'astronomy-engine';

export const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];
/** 3x3 행렬, 행 우선(row-major). world = M · eqj */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface AzAlt {
  /** 방위각(도). 북=0, 동=90 */
  az: number;
  /** 고도(도). 지평선=0, 천정=90 */
  alt: number;
}

export function mod360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 적경(도)·적위(도) → 단위벡터 */
export function raDecToVec(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const c = Math.cos(dec);
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
}

/** 방위각·고도 → 월드 단위벡터 (+X 동, +Y 천정, -Z 북) */
export function azAltToVec(azDeg: number, altDeg: number): Vec3 {
  const az = azDeg * DEG;
  const alt = altDeg * DEG;
  const c = Math.cos(alt);
  return [c * Math.sin(az), Math.sin(alt), -c * Math.cos(az)];
}

/** 월드 벡터 → 방위각·고도 */
export function vecToAzAlt(v: Vec3): AzAlt {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const alt = Math.asin(Math.max(-1, Math.min(1, v[1] / len))) / DEG;
  const az = mod360(Math.atan2(v[0], -v[2]) / DEG);
  return { az, alt };
}

export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function transposeMat3(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/**
 * J2000 적도좌표 → 월드(지평) 회전 행렬.
 * 세차·장동(지구 자전축의 느린 흔들림)과 지구 자전이 모두 들어 있다(astronomy-engine).
 * 별 전체에 이 행렬 하나만 곱하면 된다.
 */
export function equatorialToWorldMatrix(date: Date, latDeg: number, lonDeg: number): Mat3 {
  const time = MakeTime(date);
  const observer = new Observer(latDeg, lonDeg, 0);
  const rot = Rotation_EQJ_HOR(time, observer);
  // astronomy-engine의 지평 벡터: x=북, y=서, z=천정 → 월드: X=동(-서), Y=천정, Z=-북
  const col = (x: number, y: number, z: number): Vec3 => {
    const h = RotateVector(rot, new Vector(x, y, z, time));
    return [-h.y, h.z, -h.x];
  };
  const cx = col(1, 0, 0);
  const cy = col(0, 1, 0);
  const cz = col(0, 0, 1);
  return [cx[0], cy[0], cz[0], cx[1], cy[1], cz[1], cx[2], cy[2], cz[2]];
}

/** 적도좌표 단위벡터의 방위각·고도 (대기 굴절 없음). */
export function eqVecToAzAlt(m: Mat3, eq: Vec3): AzAlt {
  return vecToAzAlt(applyMat3(m, eq));
}

/**
 * 대기 굴절: 지평선 근처 천체가 실제보다 높게 보이는 정도(도).
 * astronomy-engine의 'normal' 모드와 같은 식(Bennett). 셰이더(common.glsl)에도 같은 식이 있다.
 */
export function refractionDeg(altDeg: number): number {
  if (altDeg < -90 || altDeg > 90) return 0;
  const hd = Math.max(altDeg, -1);
  let refr = 1.02 / Math.tan((hd + 10.3 / (hd + 5.11)) * DEG) / 60;
  if (altDeg < -1) refr *= (altDeg + 90) / 89;
  return refr;
}

/** 두 방향 사이의 각도(도). */
export function angularSeparation(a: Vec3, b: Vec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(cx, cy, cz), dot) / DEG;
}

/** 방위각·고도 두 점 사이의 각도(도). */
export function azAltSeparation(a: AzAlt, b: AzAlt): number {
  return angularSeparation(azAltToVec(a.az, a.alt), azAltToVec(b.az, b.alt));
}
