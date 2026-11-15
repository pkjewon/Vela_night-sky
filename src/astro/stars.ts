// 별 목록(stars.bin) 읽기와 별 고르기. 화면과 무관한 순수 계산.
import { applyMat3, DEG, raDecToVec, type Mat3, type Vec3 } from './coords';

export const STARS_MAGIC = 0x594b534e; // 'NSKY' (little-endian)
export const STARS_VERSION = 1;
export const STARS_HEADER_BYTES = 16;
/** 별 하나가 차지하는 바이트: 위치 12 + 거리 4 + HIP 4 + 등급 2 + 색지수 2 + 별자리 1 */
export const STAR_BYTES = 25;
export const BV_UNKNOWN = 32767;
export const CON_NONE = 255;
export const LIGHT_YEARS_PER_PARSEC = 3.26156;

export interface StarCatalog {
  count: number;
  /** 고유운동을 반영한 기준 연도 */
  epochYear: number;
  /** J2000 적도좌표 단위벡터 (x,y,z) × count. 밝은 순 정렬 */
  positions: Float32Array;
  /** 거리(광년). 0 = 모름 */
  distLy: Float32Array;
  /** 히파르코스(HIP) 번호. 0 = 없음 */
  hip: Uint32Array;
  /** 겉보기 등급 */
  mag: Float32Array;
  /** 색지수 B-V. 모르면 NaN */
  bv: Float32Array;
  /** 별자리 번호(이름 목록의 순서). 255 = 없음 */
  con: Uint8Array;
}

/** stars.bin을 읽어 별 목록으로 바꾼다. 형식이 맞지 않으면 오류. */
export function parseStars(buffer: ArrayBuffer): StarCatalog {
  const view = new DataView(buffer);
  if (buffer.byteLength < STARS_HEADER_BYTES || view.getUint32(0, true) !== STARS_MAGIC) {
    throw new Error('stars.bin 형식이 아닙니다');
  }
  const version = view.getUint32(4, true);
  if (version !== STARS_VERSION) throw new Error(`stars.bin 버전이 다릅니다: ${version}`);
  const count = view.getUint32(8, true);
  const epochYear = view.getFloat32(12, true);
  if (buffer.byteLength < STARS_HEADER_BYTES + count * STAR_BYTES) throw new Error('stars.bin이 잘렸습니다');

  let off = STARS_HEADER_BYTES;
  const positions = new Float32Array(buffer.slice(off, off + count * 12));
  off += count * 12;
  const distLy = new Float32Array(buffer.slice(off, off + count * 4));
  off += count * 4;
  const hip = new Uint32Array(buffer.slice(off, off + count * 4));
  off += count * 4;
  const mag100 = new Int16Array(buffer.slice(off, off + count * 2));
  off += count * 2;
  const bv100 = new Int16Array(buffer.slice(off, off + count * 2));
  off += count * 2;
  const con = new Uint8Array(buffer.slice(off, off + count));

  const mag = new Float32Array(count);
  const bv = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    mag[i] = mag100[i] / 100;
    bv[i] = bv100[i] === BV_UNKNOWN ? NaN : bv100[i] / 100;
  }
  return { count, epochYear, positions, distLy, hip, mag, bv, con };
}

export function starVec(cat: StarCatalog, index: number): Vec3 {
  const o = index * 3;
  return [cat.positions[o], cat.positions[o + 1], cat.positions[o + 2]];
}

/**
 * J2000 좌표에 고유운동(별이 해마다 조금씩 움직이는 것)을 더한다.
 * pmra는 히파르코스 방식(μα·cosδ), 단위 mas/년.
 */
export function applyProperMotion(
  raDeg: number,
  decDeg: number,
  pmraMasYr: number,
  pmdecMasYr: number,
  years: number,
): { raDeg: number; decDeg: number } {
  const masToDeg = 1 / 3_600_000;
  const cosDec = Math.max(Math.cos(decDeg * DEG), 1e-6);
  return {
    raDeg: raDeg + ((pmraMasYr * masToDeg) / cosDec) * years,
    decDeg: decDeg + pmdecMasYr * masToDeg * years,
  };
}

export function starVecWithMotion(
  raDeg: number,
  decDeg: number,
  pmraMasYr: number,
  pmdecMasYr: number,
  years: number,
): Vec3 {
  const p = applyProperMotion(raDeg, decDeg, pmraMasYr, pmdecMasYr, years);
  return raDecToVec(p.raDeg, p.decDeg);
}

export interface PickOptions {
  /** 누른 방향(월드 벡터, 굴절 보정 전 방향이어야 함) */
  dir: Vec3;
  /** 허용 반경(도). 손가락 크기(약 44px)를 지금 시야각에서 각도로 바꾼 값 */
  radiusDeg: number;
  /** 이 등급보다 어두운 별은 고르지 않는다(화면에 안 보이는 별) */
  limitMag: number;
}

/** 밝기 우선 가중치: 반경의 이 비율만큼을 1등급 차이로 친다. */
const MAG_WEIGHT = 0.2;

/**
 * 누른 지점에서 가장 가까운 별을 고른다. 거리가 비슷하면 밝은 별이 이긴다.
 * 점수 = (각거리 / 허용 반경) + 0.1 × 등급 → 가장 작은 별.
 * 지평선 아래 별은 고르지 않는다. 없으면 -1.
 */
export function pickStar(cat: StarCatalog, m: Mat3, opts: PickOptions): number {
  // 누른 방향을 적도좌표로 되돌리면 별마다 행렬을 곱하지 않아도 된다 (회전행렬의 역 = 전치)
  const d = opts.dir;
  const ex = m[0] * d[0] + m[3] * d[1] + m[6] * d[2];
  const ey = m[1] * d[0] + m[4] * d[1] + m[7] * d[2];
  const ez = m[2] * d[0] + m[5] * d[1] + m[8] * d[2];
  const cosR = Math.cos(opts.radiusDeg * DEG);
  const p = cat.positions;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < cat.count; i++) {
    const mag = cat.mag[i];
    if (mag > opts.limitMag) break; // 밝은 순이라 여기서 끝내도 된다
    const o = i * 3;
    const dotv = p[o] * ex + p[o + 1] * ey + p[o + 2] * ez;
    if (dotv < cosR) continue;
    // 지평선 아래 제외
    const worldY = m[3] * p[o] + m[4] * p[o + 1] + m[5] * p[o + 2];
    if (worldY < -0.01) continue;
    const dist = Math.acos(Math.min(1, dotv)) / DEG;
    const score = dist / opts.radiusDeg + MAG_WEIGHT * mag;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** 등급을 쉬운 말로. */
export function brightnessWords(mag: number): string {
  if (mag < 0) return '아주 밝음 · 하늘에서 손꼽히는 별';
  if (mag < 1.5) return '아주 밝음 · 도시에서도 또렷함';
  if (mag < 3) return '밝음 · 도시에서도 보임';
  if (mag < 4.5) return '보통 · 교외에서 잘 보임';
  if (mag < 5.5) return '어두움 · 시골 하늘에서 보임';
  return '아주 어두움 · 깜깜한 곳에서 겨우 보임';
}

/** 거리를 쉬운 말로 ("약 550광년"). */
export function distanceWords(ly: number): string {
  if (!(ly > 0)) return '거리 모름';
  if (ly < 10) return `약 ${ly.toFixed(1)}광년`;
  if (ly < 100) return `약 ${Math.round(ly)}광년`;
  if (ly < 1000) return `약 ${Math.round(ly / 10) * 10}광년`;
  return `약 ${(Math.round(ly / 100) * 100).toLocaleString('ko-KR')}광년`;
}

/** 별의 월드 방향(굴절 없음). */
export function starWorldVec(cat: StarCatalog, m: Mat3, index: number): Vec3 {
  return applyMat3(m, starVec(cat, index));
}

/** HIP 번호로 별 찾기. 같은 번호가 여럿이면 가장 밝은 것. 없으면 -1. */
export function findByHip(cat: StarCatalog, hip: number): number {
  for (let i = 0; i < cat.count; i++) if (cat.hip[i] === hip) return i;
  return -1;
}
