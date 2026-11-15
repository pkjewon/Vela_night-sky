import { describe, expect, it } from 'vitest';
import { azAltToVec } from '../../src/astro/coords';
import {
  allBodies,
  BODY_NAMES_KO,
  bodyState,
  brightLimbAngle,
  findTonight,
  moonIsWaxing,
  moonPhase,
  moonPhaseName,
  PLANET_IDS,
  sunAltitude,
  tangentBasis,
} from '../../src/astro/solar-system';
import { parseTimeParam, toKST } from '../../src/astro/time';

const SEOUL = { lat: 37.5665, lon: 126.978 };

describe('달·행성', () => {
  it('수성~토성의 한글 이름', () => {
    expect(PLANET_IDS.map((id) => BODY_NAMES_KO[id])).toEqual(['수성', '금성', '화성', '목성', '토성']);
    expect(BODY_NAMES_KO.moon).toBe('달');
  });

  it('해·달·행성 7개가 모두 계산된다', () => {
    const bodies = allBodies(parseTimeParam('2026-12-14T22:00+09:00')!, SEOUL.lat, SEOUL.lon);
    expect(bodies).toHaveLength(7);
    for (const b of bodies) {
      expect(Number.isFinite(b.az) && Number.isFinite(b.alt) && Number.isFinite(b.mag)).toBe(true);
    }
    // 밤 10시에 해는 지평선 아래
    expect(bodies.find((b) => b.id === 'sun')!.alt).toBeLessThan(-18);
  });

  it('달의 거리는 약 36만~41만 km', () => {
    const moon = bodyState('moon', parseTimeParam('2026-12-14T22:00+09:00')!, SEOUL.lat, SEOUL.lon);
    const km = moon.distAU * 149_597_870.7;
    expect(km).toBeGreaterThan(356_000);
    expect(km).toBeLessThan(407_000);
  });
});

describe('달 위상', () => {
  it('보름·삭 날짜의 빛난 비율', () => {
    // 2026-03-03 개기월식(보름), 2026-08-12 개기일식(삭)
    expect(moonPhase(parseTimeParam('2026-03-03T20:30+09:00')!).fraction).toBeGreaterThan(0.99);
    expect(moonPhase(parseTimeParam('2026-08-13T02:40+09:00')!).fraction).toBeLessThan(0.01);
  });

  it('쉬운 말 이름', () => {
    expect(moonPhaseName(0.99, true)).toBe('보름달');
    expect(moonPhaseName(0.2, true)).toBe('초승달');
    expect(moonPhaseName(0.2, false)).toBe('그믐달');
    expect(moonPhaseName(0.5, true)).toContain('상현달');
    expect(moonPhaseName(0.5, false)).toContain('하현달');
  });

  it('삭 며칠 뒤에는 차오르는 중, 보름 며칠 뒤에는 기우는 중', () => {
    expect(moonIsWaxing(parseTimeParam('2026-08-16T21:00+09:00')!)).toBe(true);
    expect(moonIsWaxing(parseTimeParam('2026-03-07T21:00+09:00')!)).toBe(false);
  });
});

describe('달의 밝은 쪽 방향 (항상 해를 향한다)', () => {
  it('해가 달의 바로 아래(같은 방위, 지평선 아래)면 밝은 쪽은 아래(180°)', () => {
    expect(brightLimbAngle({ az: 250, alt: 20 }, { az: 250, alt: -10 })).toBeCloseTo(180, 3);
  });

  it('해가 달의 오른쪽(방위각이 큰 쪽)에 있으면 밝은 쪽은 오른쪽(약 90°)', () => {
    const a = brightLimbAngle({ az: 180, alt: 0 }, { az: 240, alt: 0 });
    expect(a).toBeCloseTo(90, 3);
  });

  it('해가 왼쪽에 있으면 밝은 쪽은 왼쪽(약 270°)', () => {
    expect(brightLimbAngle({ az: 180, alt: 0 }, { az: 120, alt: 0 })).toBeCloseTo(270, 3);
  });

  it('실제 초승달 저녁: 서쪽 하늘의 달은 해가 진 쪽(아래·오른쪽)이 밝다', () => {
    const t = parseTimeParam('2026-08-16T20:00+09:00')!;
    const moon = bodyState('moon', t, SEOUL.lat, SEOUL.lon);
    const sun = bodyState('sun', t, SEOUL.lat, SEOUL.lon);
    expect(moon.alt).toBeGreaterThan(0);
    expect(sun.alt).toBeLessThan(0);
    const angle = brightLimbAngle(moon, sun);
    // 해가 달보다 북서쪽 아래에 있으므로 밝은 쪽은 오른쪽 아래(90°~180°)
    expect(angle).toBeGreaterThan(90);
    expect(angle).toBeLessThan(180);
  });

  it('달을 바라볼 때의 위·오른쪽 벡터는 서로 수직', () => {
    const m = azAltToVec(200, 40);
    const { up, right } = tangentBasis(m);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(up, right)).toBeCloseTo(0, 9);
    expect(dot(up, m)).toBeCloseTo(0, 9);
    expect(dot(right, m)).toBeCloseTo(0, 9);
    expect(up[1]).toBeGreaterThan(0); // 위는 천정 쪽
  });
});

describe('"오늘 밤으로 보기"가 옮겨 가는 시각', () => {
  it('서울 낮 12시 → 같은 날 저녁, 해 고도 -18° (천문박명 끝)', () => {
    const noon = parseTimeParam('2026-12-14T12:00+09:00')!;
    const r = findTonight(noon, SEOUL.lat, SEOUL.lon);
    expect(r.kind).toBe('astronomical');
    expect(sunAltitude(r.date, SEOUL.lat, SEOUL.lon)).toBeCloseTo(-18, 1);
    const kst = toKST(r.date);
    expect([kst.month, kst.day]).toEqual([12, 14]);
    // 12월 서울의 천문박명 끝은 저녁 6시 40분~7시 무렵
    expect(kst.hour).toBeGreaterThanOrEqual(18);
    expect(kst.hour).toBeLessThanOrEqual(19);
  });

  it('여름에는 더 늦은 시각', () => {
    const r = findTonight(parseTimeParam('2026-06-21T12:00+09:00')!, SEOUL.lat, SEOUL.lon);
    expect(r.kind).toBe('astronomical');
    expect(toKST(r.date).hour).toBeGreaterThanOrEqual(21);
  });

  it('백야(여름 레이캬비크): 완전히 어두워지지 않아도 가장 어두운 시각을 돌려준다', () => {
    const from = new Date('2026-06-21T12:00:00Z');
    const r = findTonight(from, 64.1466, -21.9426);
    expect(r.kind).not.toBe('astronomical');
    expect(r.date.getTime()).toBeGreaterThan(from.getTime());
    expect(r.date.getTime() - from.getTime()).toBeLessThan(24 * 3600_000);
    expect(sunAltitude(r.date, 64.1466, -21.9426)).toBeLessThan(0);
  });
});
