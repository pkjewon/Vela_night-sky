// 별똥별이 언제·어디에 나타날지 정하는 순수 계산. seed가 같으면 항상 같은 별똥별.
import { azAltToVec, DEG, vecToAzAlt, type Vec3 } from '../astro/coords';

export interface Meteor {
  /** 나타나는 시각(애니메이션 초) */
  start: number;
  /** 보이는 시간(초) */
  duration: number;
  /** 시작·끝 방향(월드 단위벡터). 둘 다 고도 20° 이상 */
  from: Vec3;
  to: Vec3;
  /** 밝기 배율. 가끔(약 10%) 밝은 것 */
  brightness: number;
}

export const METEOR_MIN_ALT = 20;
/** 평균 간격(초): "평균 수십 초에 한 번" */
export const METEOR_MEAN_GAP = 28;
const METEOR_MIN_GAP = 6;

/** 작은 난수 발생기(mulberry32). seed가 같으면 같은 수열. */
export function makeRng(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const cx = axis[1] * v[2] - axis[2] * v[1];
  const cy = axis[2] * v[0] - axis[0] * v[2];
  const cz = axis[0] * v[1] - axis[1] * v[0];
  return [
    v[0] * c + cx * s + axis[0] * d * (1 - c),
    v[1] * c + cy * s + axis[1] * d * (1 - c),
    v[2] * c + cz * s + axis[2] * d * (1 - c),
  ];
}

/** index번째 별똥별. previousStart는 바로 앞 별똥별의 시작 시각. */
function makeMeteor(seed: number, index: number, previousStart: number): Meteor {
  const rng = makeRng(seed * 7919 + index * 104729 + 1);
  // 간격: 지수분포(무작위로 띄엄띄엄) + 최소 간격
  const gap = METEOR_MIN_GAP + -Math.log(1 - rng() * 0.999) * (METEOR_MEAN_GAP - METEOR_MIN_GAP);
  const start = previousStart + gap;
  const duration = 0.45 + rng() * 0.6;
  const brightness = rng() < 0.1 ? 1.7 : 0.55 + rng() * 0.5;
  const az = rng() * 360;
  // 고도 28°~85° 사이에서 시작 (하늘 넓이에 비례하도록 sin을 고르게)
  const sinLo = Math.sin(28 * DEG);
  const alt = Math.asin(sinLo + rng() * (Math.sin(85 * DEG) - sinLo)) / DEG;
  const from = azAltToVec(az, alt);
  const length = (7 + rng() * 14) * DEG;

  // 진행 방향을 몇 번 골라 보고, 끝점도 고도 20° 이상인 것을 쓴다
  let to = from;
  for (let attempt = 0; attempt < 12; attempt++) {
    const heading = rng() * Math.PI * 2;
    // from에 수직인 축을 하나 잡아 heading만큼 돌린 뒤, 그 축으로 length만큼 회전
    const ref: Vec3 = Math.abs(from[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    let axis: Vec3 = [
      from[1] * ref[2] - from[2] * ref[1],
      from[2] * ref[0] - from[0] * ref[2],
      from[0] * ref[1] - from[1] * ref[0],
    ];
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    axis = [axis[0] / len, axis[1] / len, axis[2] / len];
    axis = rotateAround(axis, from, heading);
    to = rotateAround(from, axis, length);
    if (vecToAzAlt(to).alt >= METEOR_MIN_ALT) break;
    to = from;
  }
  if (to === from) to = azAltToVec(az + 8, alt); // 못 찾으면 옆으로 짧게
  return { start, duration, from, to, brightness };
}

/** seed로 정해지는 별똥별 수열을 필요한 만큼 만들어 두고 찾아 준다. */
export class MeteorSchedule {
  private readonly list: Meteor[] = [];

  constructor(private readonly seed: number) {}

  get(index: number): Meteor {
    while (this.list.length <= index) {
      const prev = this.list.length > 0 ? this.list[this.list.length - 1].start : 0;
      this.list.push(makeMeteor(this.seed, this.list.length, prev));
    }
    return this.list[index];
  }

  /** time(초)에 보이는 별똥별. 없으면 null. */
  activeAt(time: number): Meteor | null {
    for (let i = 0; ; i++) {
      const m = this.get(i);
      if (time < m.start) return null;
      if (time <= m.start + m.duration) return m;
      if (i > 100000) return null;
    }
  }
}

/** 진행률 0~1에서 별똥별의 머리·꼬리 끝 위치(0~1, 경로 위). 짧게 길어졌다 사라진다. */
export function meteorShape(progress: number): { head: number; tail: number; fade: number } {
  const p = Math.max(0, Math.min(1, progress));
  const head = p;
  const tail = Math.max(0, p - 0.45);
  // 처음엔 빠르게 밝아지고 끝에서 사라진다
  const fade = Math.min(1, p * 6) * Math.min(1, (1 - p) * 3.5);
  return { head, tail, fade };
}
