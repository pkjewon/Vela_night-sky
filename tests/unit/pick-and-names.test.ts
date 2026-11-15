import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { azAltToVec, type Mat3 } from '../../src/astro/coords';
import { parseDesignation, starLabel, type KoreanNames, type StarNames } from '../../src/astro/names';
import { brightnessWords, distanceWords, findByHip, parseStars, pickStar, type StarCatalog } from '../../src/astro/stars';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 테스트용 별 목록: 좌표를 월드 방위각·고도로 직접 준다(회전은 단위행렬). 밝은 순으로 넣을 것. */
function fakeCatalog(stars: Array<{ az: number; alt: number; mag: number }>): StarCatalog {
  const n = stars.length;
  const positions = new Float32Array(n * 3);
  stars.forEach((s, i) => positions.set(azAltToVec(s.az, s.alt), i * 3));
  return {
    count: n,
    epochYear: 2026.5,
    positions,
    distLy: new Float32Array(n),
    hip: new Uint32Array(n),
    mag: new Float32Array(stars.map((s) => s.mag)),
    bv: new Float32Array(n),
    con: new Uint8Array(n),
  };
}

describe('별 고르기', () => {
  it('손가락 반경 안의 가장 가까운 별', () => {
    const cat = fakeCatalog([
      { az: 100, alt: 30, mag: 3 },
      { az: 102, alt: 30, mag: 3 },
    ]);
    const hit = pickStar(cat, IDENTITY, { dir: azAltToVec(101.6, 30), radiusDeg: 2, limitMag: 6.5 });
    expect(hit).toBe(1);
  });

  it('반경 밖이면 아무것도 고르지 않는다', () => {
    const cat = fakeCatalog([{ az: 100, alt: 30, mag: 1 }]);
    expect(pickStar(cat, IDENTITY, { dir: azAltToVec(110, 30), radiusDeg: 2, limitMag: 6.5 })).toBe(-1);
  });

  it('거리가 비슷하면 밝은 별이 이긴다', () => {
    const cat = fakeCatalog([
      { az: 100.9, alt: 30, mag: 0.5 }, // 조금 더 멀지만 훨씬 밝다
      { az: 99.3, alt: 30, mag: 5.5 },
    ]);
    expect(pickStar(cat, IDENTITY, { dir: azAltToVec(100, 30), radiusDeg: 2, limitMag: 6.5 })).toBe(0);
  });

  it('아주 가까운 어두운 별은 먼 밝은 별보다 우선', () => {
    const cat = fakeCatalog([
      { az: 101.9, alt: 30, mag: 2 },
      { az: 100.05, alt: 30, mag: 4 },
    ]);
    expect(pickStar(cat, IDENTITY, { dir: azAltToVec(100, 30), radiusDeg: 2, limitMag: 6.5 })).toBe(1);
  });

  it('지금 안 보이는 어두운 별(하늘이 밝을 때)과 지평선 아래 별은 고르지 않는다', () => {
    const cat = fakeCatalog([
      { az: 100, alt: -5, mag: 1 },
      { az: 50, alt: 30, mag: 5 },
    ]);
    expect(pickStar(cat, IDENTITY, { dir: azAltToVec(100, -5), radiusDeg: 2, limitMag: 6.5 })).toBe(-1);
    expect(pickStar(cat, IDENTITY, { dir: azAltToVec(50, 30), radiusDeg: 2, limitMag: 3 })).toBe(-1);
    expect(pickStar(cat, IDENTITY, { dir: azAltToVec(50, 30), radiusDeg: 2, limitMag: 6 })).toBe(1);
  });
});

describe('쉬운 말 표현', () => {
  it('밝기', () => {
    expect(brightnessWords(-1.4)).toContain('아주 밝음');
    expect(brightnessWords(0.5)).toContain('아주 밝음');
    expect(brightnessWords(2.3)).toContain('도시에서도 보임');
    expect(brightnessWords(6.2)).toContain('아주 어두움');
  });

  it('거리', () => {
    expect(distanceWords(8.6)).toBe('약 8.6광년');
    expect(distanceWords(548)).toBe('약 550광년');
    expect(distanceWords(2600)).toBe('약 2,600광년');
    expect(distanceWords(0)).toBe('거리 모름');
  });
});

describe('별 이름', () => {
  const dir = resolve(__dirname, '../../public/data');
  const names = JSON.parse(readFileSync(resolve(dir, 'star-names.json'), 'utf8')) as StarNames;
  const ko = JSON.parse(readFileSync(resolve(dir, 'names-ko.json'), 'utf8')) as KoreanNames;
  const file = readFileSync(resolve(dir, 'stars.bin'));
  const cat = parseStars(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
  const label = (hip: number) => {
    const i = findByHip(cat, hip);
    return starLabel(i, cat.con[i], cat.hip[i], names, ko);
  };

  it('바이어·플램스티드 기호 풀기', () => {
    expect(parseDesignation('58Alp Ori')).toEqual({ flamsteed: 58, greek: 'α', greekIndex: null, con: 'Ori' });
    expect(parseDesignation('Alp1Cen')).toEqual({ flamsteed: null, greek: 'α', greekIndex: 1, con: 'Cen' });
    expect(parseDesignation('21    And')).toEqual({ flamsteed: 21, greek: null, greekIndex: null, con: 'And' });
    expect(parseDesignation('???')).toBeNull();
  });

  it('베텔게우스 · 오리온자리', () => {
    expect(label(27989)).toEqual({ name: '베텔게우스', constellation: '오리온자리' });
  });

  it('북극성, 직녀성, 견우성', () => {
    expect(label(11767).name).toContain('북극성');
    expect(label(91262).name).toContain('직녀성');
    expect(label(97649).name).toContain('견우성');
  });

  it('한글 이름이 없는 별은 지어내지 않고 영어·기호로', () => {
    // 한글 표에 없는 고유 이름은 영어 그대로
    const english = Object.entries(names.proper).find(([, p]) => !(p in ko.stars))!;
    const i = Number(english[0]);
    expect(starLabel(i, cat.con[i], cat.hip[i], names, ko).name).toBe(english[1]);
    // 고유 이름이 없으면 "별자리 + 그리스 글자"
    const bayer = Object.keys(names.bf).find((k) => !(k in names.proper) && /[A-Za-z]{3}\s*\d?\s*[A-Za-z]{3}$/.test(names.bf[k]))!;
    const j = Number(bayer);
    expect(starLabel(j, cat.con[j], cat.hip[j], names, ko).name).toMatch(/자리 [α-ω]\d?별$/);
  });

  it('밝은 별 50개 이상에 한글 이름이 있고, 모두 실제 별 목록에 있다', () => {
    const properSet = new Set(Object.values(names.proper));
    const missing = Object.keys(ko.stars).filter((p) => !properSet.has(p));
    expect(missing).toEqual([]);
    expect(Object.keys(ko.stars).length).toBeGreaterThanOrEqual(50);
  });
});
