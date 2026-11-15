// 별자리 데이터 검사: 88개 전부, 한글 이름, 선의 꼭짓점이 실제 별과 일치(0.2° 이내).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { angularSeparation, raDecToVec } from '../../src/astro/coords';
import type { KoreanNames, StarNames } from '../../src/astro/names';
import { parseStars, starVec } from '../../src/astro/stars';
import type { ConstellationFile } from '../../src/render/constellations';
// d3-celestial 원본(BSD-3-Clause, tests/fixtures/d3-celestial.LICENSE)
import original from '../fixtures/d3-celestial.constellations.lines.json';

const dir = resolve(__dirname, '../../public/data');
const data = JSON.parse(readFileSync(resolve(dir, 'constellations.json'), 'utf8')) as ConstellationFile;
const names = JSON.parse(readFileSync(resolve(dir, 'star-names.json'), 'utf8')) as StarNames;
const ko = JSON.parse(readFileSync(resolve(dir, 'names-ko.json'), 'utf8')) as KoreanNames;
const file = readFileSync(resolve(dir, 'stars.bin'));
const cat = parseStars(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

describe('별자리 선·이름', () => {
  it('88개 별자리 전부에 선이 있다', () => {
    expect(data.constellations).toHaveLength(88);
    expect(new Set(data.constellations.map((c) => c.id)).size).toBe(88);
    for (const c of data.constellations) {
      expect(c.lines.length, c.id).toBeGreaterThan(0);
      for (const line of c.lines) expect(line.length, c.id).toBeGreaterThanOrEqual(2);
    }
    // 별 목록의 별자리 약어와 같은 88개
    expect([...data.constellations.map((c) => c.id)].sort()).toEqual([...names.cons].sort());
  });

  it('88개 전부 한글 이름이 있고 서로 다르다', () => {
    const koNames = data.constellations.map((c) => ko.constellations[c.id]);
    for (const [i, n] of koNames.entries()) {
      expect(n, data.constellations[i].id).toMatch(/^[가-힣]+자리$/);
    }
    expect(new Set(koNames).size).toBe(88);
    expect(Object.keys(ko.constellations)).toHaveLength(88);
    expect(ko.constellations.Ori).toBe('오리온자리');
    expect(ko.constellations.UMa).toBe('큰곰자리');
  });

  it('원본 선의 꼭짓점마다 실제 별이 0.2° 안에 있다', () => {
    // 원본(좌표)과 가공본(별 번호)을 같은 순서로 맞춰 비교한다
    const originalLines = new Map<string, number[][][]>();
    for (const f of original.features) {
      originalLines.set(f.id, [...(originalLines.get(f.id) ?? []), ...(f.geometry.coordinates as number[][][])]);
    }
    let max = 0;
    let vertices = 0;
    const bad: string[] = [];
    for (const c of data.constellations) {
      const src = originalLines.get(c.id)!;
      expect(src.length, c.id).toBe(c.lines.length);
      src.forEach((line, li) => {
        expect(line.length).toBe(c.lines[li].length);
        line.forEach(([ra, dec], vi) => {
          const sep = angularSeparation(raDecToVec(ra, dec), starVec(cat, c.lines[li][vi]));
          max = Math.max(max, sep);
          vertices++;
          if (sep > 0.2) bad.push(`${c.id} (${ra}, ${dec}) ${sep.toFixed(3)}°`);
        });
      });
    }
    console.log(`별자리 선 꼭짓점 ${vertices}개, 별과의 최대 거리 ${max.toFixed(4)}°`);
    expect(bad).toEqual([]);
  });

  it('이름표 위치는 그 별자리의 별들 근처', () => {
    for (const c of data.constellations) {
      expect(Math.hypot(...c.label)).toBeCloseTo(1, 3);
      const nearest = Math.min(...c.lines.flat().map((i) => angularSeparation(c.label, starVec(cat, i))));
      expect(nearest, c.id).toBeLessThan(25);
    }
  });

  it('오리온자리 선에 베텔게우스와 리겔이 들어 있다', () => {
    const ori = data.constellations.find((c) => c.id === 'Ori')!;
    const hips = new Set(ori.lines.flat().map((i) => cat.hip[i]));
    expect(hips.has(27989)).toBe(true);
    expect(hips.has(24436)).toBe(true);
  });
});
