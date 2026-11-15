// stars.bin 데이터 검사: 개수, 가장 밝은 별, 정답지 좌표와 일치, 파일 크기.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import reference from '../fixtures/reference.json';
import { angularSeparation } from '../../src/astro/coords';
import { findByHip, parseStars, starVec, starVecWithMotion } from '../../src/astro/stars';

const binPath = resolve(__dirname, '../../public/data/stars.bin');
const names = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/star-names.json'), 'utf8')) as {
  cons: string[];
  proper: Record<string, string>;
  bf: Record<string, string>;
};
const file = readFileSync(binPath);
const cat = parseStars(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

describe('별 데이터 (HYG v4.2 → stars.bin)', () => {
  it('파일 크기 300KB 이하', () => {
    expect(statSync(binPath).size).toBeLessThanOrEqual(300 * 1024);
  });

  it('6.5등급까지 약 9,000개', () => {
    expect(cat.count).toBeGreaterThan(8500);
    expect(cat.count).toBeLessThan(9500);
    expect(Math.max(...cat.mag)).toBeLessThanOrEqual(6.5);
  });

  it('밝은 순으로 정렬되어 있고 시리우스가 가장 밝은 항성', () => {
    for (let i = 1; i < cat.count; i++) expect(cat.mag[i]).toBeGreaterThanOrEqual(cat.mag[i - 1]);
    expect(names.proper['0']).toBe('Sirius');
    expect(cat.hip[0]).toBe(32349);
    expect(cat.mag[0]).toBeLessThan(-1.4);
  });

  it('모든 위치가 단위벡터', () => {
    for (let i = 0; i < cat.count; i++) {
      const v = starVec(cat, i);
      expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 5);
    }
  });

  it('별자리 약어 88개, 거의 모든 별에 별자리가 있음', () => {
    expect(names.cons).toHaveLength(88);
    const none = cat.con.reduce((n, c) => n + (c === 255 ? 1 : 0), 0);
    expect(none).toBeLessThan(cat.count * 0.01);
  });

  it('정답지의 별 20개가 같은 좌표로 들어 있다 (0.001° 이내)', () => {
    const years = cat.epochYear - 2000;
    for (const s of reference.stars) {
      const i = findByHip(cat, s.hip);
      expect(i, `${s.name} (HIP ${s.hip})`).toBeGreaterThanOrEqual(0);
      const expected = starVecWithMotion(s.ra_deg, s.dec_deg, s.pmra, s.pmdec, years);
      expect(angularSeparation(starVec(cat, i), expected), s.name).toBeLessThan(0.001);
    }
  });

  it('베텔게우스·리겔·북극성에 이름과 거리가 있다', () => {
    for (const [hip, name] of [
      [27989, 'Betelgeuse'],
      [24436, 'Rigel'],
      [11767, 'Polaris'],
    ] as const) {
      const i = findByHip(cat, hip);
      expect(names.proper[String(i)]).toBe(name);
      expect(cat.distLy[i]).toBeGreaterThan(100);
    }
  });
});
