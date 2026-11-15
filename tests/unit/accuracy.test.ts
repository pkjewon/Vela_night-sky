// 정확도 테스트: 우리 계산(astronomy-engine) vs 정답지(Skyfield + JPL DE421).
// 허용 오차(PRD 7장): 별·행성·해 0.05°, 달 0.1°, 달 빛난 비율 1%p. 굴절 없이 비교.
// 이 숫자를 늘려서 통과시키지 말 것. 틀리면 원인을 찾아 고친다.
import { describe, expect, it } from 'vitest';
import reference from '../fixtures/reference.json';
import { azAltSeparation, equatorialToWorldMatrix, eqVecToAzAlt } from '../../src/astro/coords';
import { bodyState, moonPhase, type BodyId } from '../../src/astro/solar-system';
import { starVecWithMotion } from '../../src/astro/stars';
import { yearsSinceJ2000 } from '../../src/astro/time';

const STAR_TOLERANCE = 0.05;
const BODY_TOLERANCE = 0.05;
const MOON_TOLERANCE = 0.1;
const FRACTION_TOLERANCE = 0.01;
const MIN_ALT = 5; // PRD F1: 고도 5° 이상에서 비교 (전체 최대 오차는 따로 출력)

interface Miss {
  what: string;
  where: string;
  when: string;
  error: number;
}

function label(c: (typeof reference.cases)[number]) {
  return { where: reference.locations[c.loc].name, when: reference.times[c.time] };
}

describe('정답지(Skyfield) 대비 정확도', () => {
  it('정답지가 5개 장소 × 6개 시각 × 별 20개를 담고 있다', () => {
    expect(reference.locations).toHaveLength(5);
    expect(reference.times).toHaveLength(6);
    expect(reference.stars).toHaveLength(20);
    expect(reference.cases).toHaveLength(30);
  });

  it(`밝은 별 20개: 고도 ${MIN_ALT}° 이상에서 ${STAR_TOLERANCE}° 이내`, () => {
    const misses: Miss[] = [];
    let maxAbove = 0;
    let maxAll = 0;
    let compared = 0;
    for (const c of reference.cases) {
      const loc = reference.locations[c.loc];
      const date = new Date(reference.times[c.time]);
      const m = equatorialToWorldMatrix(date, loc.lat, loc.lon);
      const years = yearsSinceJ2000(date);
      reference.stars.forEach((s, i) => {
        const eq = starVecWithMotion(s.ra_deg, s.dec_deg, s.pmra, s.pmdec, years);
        const ours = eqVecToAzAlt(m, eq);
        const [az, alt] = c.stars[i];
        const err = azAltSeparation(ours, { az, alt });
        maxAll = Math.max(maxAll, err);
        if (alt < MIN_ALT) return;
        compared++;
        maxAbove = Math.max(maxAbove, err);
        if (err > STAR_TOLERANCE) misses.push({ what: s.name, ...label(c), error: err });
      });
    }
    console.log(`별 최대 오차: 고도 ${MIN_ALT}° 이상 ${maxAbove.toFixed(4)}° (${compared}건), 전체 ${maxAll.toFixed(4)}°`);
    expect(misses, JSON.stringify(misses, null, 1)).toEqual([]);
    expect(compared).toBeGreaterThan(200);
  });

  const bodies: Array<[BodyId, number]> = [
    ['sun', BODY_TOLERANCE],
    ['mercury', BODY_TOLERANCE],
    ['venus', BODY_TOLERANCE],
    ['mars', BODY_TOLERANCE],
    ['jupiter', BODY_TOLERANCE],
    ['saturn', BODY_TOLERANCE],
    ['moon', MOON_TOLERANCE],
  ];
  for (const [id, tolerance] of bodies) {
    it(`${id}: 모든 장소·시각에서 ${tolerance}° 이내`, () => {
      const misses: Miss[] = [];
      let max = 0;
      for (const c of reference.cases) {
        const loc = reference.locations[c.loc];
        const date = new Date(reference.times[c.time]);
        const ours = bodyState(id, date, loc.lat, loc.lon);
        const [az, alt] = (c.bodies as Record<string, number[]>)[id];
        const err = azAltSeparation(ours, { az, alt });
        max = Math.max(max, err);
        if (err > tolerance) misses.push({ what: id, ...label(c), error: err });
      }
      console.log(`${id} 최대 오차: ${max.toFixed(4)}°`);
      expect(misses, JSON.stringify(misses, null, 1)).toEqual([]);
    });
  }

  it(`달의 빛난 비율: ${FRACTION_TOLERANCE * 100}%p 이내`, () => {
    let max = 0;
    for (const c of reference.cases) {
      const date = new Date(reference.times[c.time]);
      const err = Math.abs(moonPhase(date).fraction - c.moonFraction);
      max = Math.max(max, err);
    }
    console.log(`달 빛난 비율 최대 오차: ${(max * 100).toFixed(3)}%p`);
    expect(max).toBeLessThanOrEqual(FRACTION_TOLERANCE);
  });
});
