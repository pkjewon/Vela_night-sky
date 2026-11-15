// 적도좌표(J2000) ↔ 은하좌표. 은하수 텍스처를 만들고 검사할 때 쓴다.
import { DEG, raDecToVec } from './coords';

// J2000 적도좌표 → 은하좌표 회전 행렬 (히파르코스 문서의 표준값)
const M = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

/** 적경·적위(도) → 은경 l(-180~180)·은위 b(도) */
export function equatorialToGalactic(raDeg: number, decDeg: number): { l: number; b: number } {
  const v = raDecToVec(raDeg, decDeg);
  const x = M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2];
  const y = M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2];
  const z = M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2];
  return { l: Math.atan2(y, x) / DEG, b: Math.asin(Math.max(-1, Math.min(1, z))) / DEG };
}

/** 은하수 텍스처(가로=적경 0→360°, 세로=적위 +90→-90°)에서의 위치 (0~1). */
export function milkywayUV(raDeg: number, decDeg: number): { u: number; v: number } {
  return { u: (((raDeg % 360) + 360) % 360) / 360, v: (90 - decDeg) / 180 };
}
