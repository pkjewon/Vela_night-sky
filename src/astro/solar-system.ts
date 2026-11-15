// 해·달·행성의 위치·밝기·달 위상 (astronomy-engine).
import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MakeTime,
  Observer,
  SearchAltitude,
  SearchHourAngle,
} from 'astronomy-engine';
import { azAltToVec, DEG, type AzAlt, type Vec3 } from './coords';

export type BodyId = 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';

export const BODY_IDS: BodyId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
export const PLANET_IDS: BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

export const BODY_NAMES_KO: Record<BodyId, string> = {
  sun: '해',
  moon: '달',
  mercury: '수성',
  venus: '금성',
  mars: '화성',
  jupiter: '목성',
  saturn: '토성',
};

const BODY_MAP: Record<BodyId, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
};

/** 1 천문단위(AU)를 빛이 가는 데 걸리는 시간(분). */
const LIGHT_MINUTES_PER_AU = 8.316746;

export interface BodyState extends AzAlt {
  id: BodyId;
  /** 겉보기 밝기(등급). 작을수록 밝다. */
  mag: number;
  /** 관측자로부터의 거리(AU) */
  distAU: number;
  /** 빛이 오는 데 걸리는 시간(분) */
  lightMinutes: number;
}

/**
 * 관측자 위치에서 본 천체의 방위각·고도 (대기 굴절 없음).
 * 달은 가까워서 보는 위치에 따라 최대 1°쯤 달라지므로 관측자 위치 보정(topocentric)을 한다.
 */
export function bodyState(id: BodyId, date: Date, latDeg: number, lonDeg: number): BodyState {
  const time = MakeTime(date);
  const observer = new Observer(latDeg, lonDeg, 0);
  const eq = Equator(BODY_MAP[id], time, observer, true, true);
  const hor = Horizon(time, observer, eq.ra, eq.dec);
  const illum = Illumination(BODY_MAP[id], time);
  return {
    id,
    az: hor.azimuth,
    alt: hor.altitude,
    mag: illum.mag,
    distAU: eq.dist,
    lightMinutes: eq.dist * LIGHT_MINUTES_PER_AU,
  };
}

export function allBodies(date: Date, latDeg: number, lonDeg: number): BodyState[] {
  return BODY_IDS.map((id) => bodyState(id, date, latDeg, lonDeg));
}

export function sunAltitude(date: Date, latDeg: number, lonDeg: number): number {
  return bodyState('sun', date, latDeg, lonDeg).alt;
}

export interface MoonPhase {
  /** 빛나는 부분의 비율 0(삭)~1(보름) */
  fraction: number;
  /** 위상각(도): 0=보름, 180=삭 */
  phaseAngle: number;
}

export function moonPhase(date: Date): MoonPhase {
  const illum = Illumination(Body.Moon, MakeTime(date));
  return { fraction: illum.phase_fraction, phaseAngle: illum.phase_angle };
}

/** 쉬운 말로 된 달 모양 이름. */
export function moonPhaseName(fraction: number, waxing: boolean): string {
  if (fraction < 0.03) return '삭 (거의 안 보임)';
  if (fraction > 0.97) return '보름달';
  if (fraction < 0.35) return waxing ? '초승달' : '그믐달';
  if (fraction < 0.65) return waxing ? '상현달 (반달)' : '하현달 (반달)';
  return waxing ? '차오르는 달' : '기우는 달';
}

/** 달이 차오르는 중인지(몇 시간 뒤 더 밝아지는지). */
export function moonIsWaxing(date: Date): boolean {
  const later = new Date(date.getTime() + 6 * 3600_000);
  return moonPhase(later).fraction > moonPhase(date).fraction;
}

/**
 * 달의 밝은 쪽이 향하는 방향.
 * 달을 정면으로 바라볼 때 "천정 쪽(위)"을 0°로 하고 화면 오른쪽(시계 방향)으로 잰 각도(도).
 * 밝은 쪽은 항상 해를 향한다: 달에서 해 쪽으로 가는 하늘 위의 방향을 구한다.
 */
export function brightLimbAngle(moon: AzAlt, sun: AzAlt): number {
  const m = azAltToVec(moon.az, moon.alt);
  const s = azAltToVec(sun.az, sun.alt);
  const { up, right } = tangentBasis(m);
  // 해 방향을 달의 접평면(하늘에 붙은 평면)에 내린다
  const d = dot(s, m);
  const t: Vec3 = [s[0] - d * m[0], s[1] - d * m[1], s[2] - d * m[2]];
  return (((Math.atan2(dot(t, right), dot(t, up)) / DEG) % 360) + 360) % 360;
}

/** 방향 m을 바라볼 때 화면의 위(천정 쪽)·오른쪽 벡터. */
export function tangentBasis(m: Vec3): { up: Vec3; right: Vec3 } {
  // 천정을 바로 보고 있으면 "위"가 정해지지 않으므로 북쪽을 위로 삼는다
  let ref: Vec3 = [0, 1, 0];
  if (Math.abs(m[1]) > 0.9999) ref = [0, 0, -1];
  const d = dot(ref, m);
  let up: Vec3 = [ref[0] - d * m[0], ref[1] - d * m[1], ref[2] - d * m[2]];
  const len = Math.hypot(up[0], up[1], up[2]) || 1;
  up = [up[0] / len, up[1] / len, up[2] / len];
  // 화면 오른쪽 = 앞(m) × 위
  const right: Vec3 = [m[1] * up[2] - m[2] * up[1], m[2] * up[0] - m[0] * up[2], m[0] * up[1] - m[1] * up[0]];
  return { up, right };
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export interface TonightResult {
  date: Date;
  /** 어떤 기준으로 찾았는지: 천문박명 끝(-18°), 더 밝은 박명, 또는 해가 가장 낮은 때 */
  kind: 'astronomical' | 'nautical' | 'civil' | 'lowest';
}

/**
 * "오늘 밤으로 보기": 지금부터 가장 가까운, 하늘이 충분히 어두워지는 시각.
 * 보통은 천문박명이 끝나는 때(해 고도 -18°). 백야처럼 그만큼 어두워지지 않는 곳에서는
 * -12°, -6° 순으로 낮추고, 그것도 없으면 해가 가장 낮은 시각을 돌려준다.
 */
export function findTonight(from: Date, latDeg: number, lonDeg: number): TonightResult {
  const observer = new Observer(latDeg, lonDeg, 0);
  const start = MakeTime(from);
  const steps: Array<[number, TonightResult['kind']]> = [
    [-18, 'astronomical'],
    [-12, 'nautical'],
    [-6, 'civil'],
  ];
  for (const [altitude, kind] of steps) {
    const hit = SearchAltitude(Body.Sun, observer, -1, start, 1, altitude);
    if (hit) return { date: hit.date, kind };
  }
  const lowest = SearchHourAngle(Body.Sun, observer, 12, start);
  return { date: lowest.time.date, kind: 'lowest' };
}
