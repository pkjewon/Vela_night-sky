// 폰 센서 값(alpha/beta/gamma) → 카메라 회전값(쿼터니언). 순수 계산이라 단위 테스트로 검증한다.
//
// 시점은 "폰 뒷면이 향하는 방향"(뒷면 카메라가 보는 곳)이다.
// 각도 3개 대신 쿼터니언(숫자 4개로 된 회전값)으로 계산해서, 천정 쪽으로 들어도 화면이 빙빙 돌지 않는다.
//
// 좌표:
//   폰     : x=화면 오른쪽, y=화면 위쪽, z=화면에서 나오는 쪽
//   센서 기준(ENU): X=동, Y=북, Z=위
//   월드   : +X=동, +Y=천정, -Z=북 (CLAUDE.md)
import { DEG, mod360, vecToAzAlt, type AzAlt, type Vec3 } from '../astro/coords';

/** 쿼터니언 [x, y, z, w] */
export type Quat = [number, number, number, number];

export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const h = angleRad / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/** a 다음에 b가 아니라, 수학 표기 a·b (b를 먼저 적용하고 a를 적용). */
export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // v + 2w(q×v) + 2 q×(q×v)
  const cx = y * v[2] - z * v[1];
  const cy = z * v[0] - x * v[2];
  const cz = x * v[1] - y * v[0];
  const dx = y * cz - z * cy;
  const dy = z * cx - x * cz;
  const dz = x * cy - y * cx;
  return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)];
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/** 구면 보간: a에서 b로 t(0~1)만큼. 가까운 쪽으로 돈다. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (cos < 0) {
    cos = -cos;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (cos > 0.9995) {
    return quatNormalize([
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ]);
  }
  const omega = Math.acos(cos);
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb];
}

const X_AXIS: Vec3 = [1, 0, 0];
const Y_AXIS: Vec3 = [0, 1, 0];
const Z_AXIS: Vec3 = [0, 0, 1];
/** 센서 기준(ENU) → 월드: X축으로 -90° 돌리면 북(Y)이 -Z로, 위(Z)가 +Y로 간다 */
const ENU_TO_WORLD = quatFromAxisAngle(X_AXIS, -Math.PI / 2);

/**
 * deviceorientation 값 → 월드 기준 카메라 회전.
 * @param alpha Z축 회전(도). 절대값이면 0 = 폰 위쪽이 북, 반시계 방향으로 증가
 * @param beta X축 회전(도). 0 = 평평하게 눕힘, 90 = 똑바로 세움
 * @param gamma Y축 회전(도). 좌우 기울임
 * @param screenAngle 화면 회전(도). 세로 0, 가로 90/270
 */
export function deviceToCameraQuat(alpha: number, beta: number, gamma: number, screenAngle = 0): Quat {
  // W3C 규격: 회전 순서 Z(alpha) → X(beta) → Y(gamma)
  const qz = quatFromAxisAngle(Z_AXIS, alpha * DEG);
  const qx = quatFromAxisAngle(X_AXIS, beta * DEG);
  const qy = quatFromAxisAngle(Y_AXIS, gamma * DEG);
  const device = quatMul(quatMul(qz, qx), qy);
  // 화면이 돌아가 있으면(가로 모드) 그만큼 되돌린다
  const screen = quatFromAxisAngle(Z_AXIS, -screenAngle * DEG);
  return quatNormalize(quatMul(quatMul(ENU_TO_WORLD, device), screen));
}

/** 방위를 offsetDeg만큼 시계 방향(북→동)으로 돌린다. 나침반 보정에 쓴다. */
export function applyYaw(q: Quat, offsetDeg: number): Quat {
  return quatNormalize(quatMul(quatFromAxisAngle(Y_AXIS, -offsetDeg * DEG), q));
}

/** 카메라가 바라보는 방향(폰 뒷면 방향). */
export function cameraForward(q: Quat): Vec3 {
  return quatRotate(q, [0, 0, -1]);
}

export function cameraAzAlt(q: Quat): AzAlt {
  return vecToAzAlt(cameraForward(q));
}

/**
 * 폰 위쪽(화면의 위 가장자리)이 가리키는 방위(도)와, 그 값을 얼마나 믿을 수 있는지(0~1).
 * 아이폰의 webkitCompassHeading과 비교해 방위 보정값을 구할 때 쓴다.
 * 폰을 똑바로 세우면 위쪽이 하늘을 향해 방위가 정해지지 않으므로 신뢰도가 0에 가까워진다.
 */
export function topHeading(q: Quat): { heading: number; confidence: number } {
  const top = quatRotate(q, [0, 1, 0]);
  const horizontal = Math.hypot(top[0], top[2]);
  return { heading: mod360(Math.atan2(top[0], -top[2]) / DEG), confidence: horizontal };
}

/** 두 각도의 차이를 -180~180으로. 0°/360° 경계에서 튀지 않게 할 때 쓴다. */
export function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** 각도 a를 b 쪽으로 t(0~1)만큼 부드럽게 옮긴다(가까운 방향으로). */
export function angleLerp(a: number, b: number, t: number): number {
  return mod360(a + angleDiff(b, a) * t);
}

/**
 * 자기 편각(나침반의 북쪽과 진짜 북쪽의 차이, 도). 동쪽이 +.
 * 한국은 약 -8.5°(서쪽으로 8~9°)로 알려져 있어 그 값을 쓴다. 한국 밖은 0으로 둔다(보정 안 함).
 * 정밀한 세계 자기장 모델은 넣지 않았다 — 어긋나면 나침반 보정(드래그)으로 맞춘다.
 */
export function magneticDeclination(latDeg: number, lonDeg: number): number {
  const inKorea = latDeg >= 32.5 && latDeg <= 39.5 && lonDeg >= 123.5 && lonDeg <= 132;
  return inKorea ? -8.5 : 0;
}
