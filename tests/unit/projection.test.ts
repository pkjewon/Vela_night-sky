import { Refraction } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { angularSeparation, azAltToVec, refractionDeg, vecToAzAlt } from '../../src/astro/coords';
import {
  clampView,
  pixelsToDegrees,
  projectAzAlt,
  projectVec,
  unproject,
  unrefract,
  verticalFov,
  type View,
} from '../../src/astro/projection';

describe('좌표 규칙', () => {
  it('북=0° → -Z, 동=90° → +X, 천정 → +Y', () => {
    expect(azAltToVec(0, 0)).toEqual([0, 0, -1]);
    const east = azAltToVec(90, 0);
    expect(east[0]).toBeCloseTo(1);
    expect(east[2]).toBeCloseTo(0);
    expect(azAltToVec(123, 90)[1]).toBeCloseTo(1);
    const south = azAltToVec(180, 0);
    expect(south[2]).toBeCloseTo(1);
  });

  it('방위각·고도 ↔ 벡터는 서로 되돌린다', () => {
    for (const [az, alt] of [
      [0, 0],
      [45, 30],
      [200, 75],
      [359, -5],
    ]) {
      const p = vecToAzAlt(azAltToVec(az, alt));
      expect(p.az).toBeCloseTo(az, 6);
      expect(p.alt).toBeCloseTo(alt, 6);
    }
  });
});

describe('대기 굴절', () => {
  it('astronomy-engine의 normal 모드와 같은 값', () => {
    for (const alt of [-2, -0.5, 0, 1, 5, 10, 30, 60, 89]) {
      expect(refractionDeg(alt)).toBeCloseTo(Refraction('normal', alt), 6);
    }
  });

  it('지평선에서 약 0.5°, 높이 올라갈수록 작아진다', () => {
    expect(refractionDeg(0)).toBeGreaterThan(0.4);
    expect(refractionDeg(0)).toBeLessThan(0.6);
    expect(refractionDeg(45)).toBeLessThan(0.02);
    expect(refractionDeg(10)).toBeGreaterThan(refractionDeg(20));
  });

  it('unrefract는 굴절을 되돌린다 (0.01° 이내)', () => {
    for (const alt of [0.5, 2, 10, 40]) {
      const apparent = azAltToVec(77, alt + refractionDeg(alt));
      expect(angularSeparation(unrefract(apparent), azAltToVec(77, alt))).toBeLessThan(0.01);
    }
  });
});

describe('화면 투영', () => {
  const view: View = { az: 140, alt: 35, fov: 70 };

  it('바라보는 방향은 화면 한가운데', () => {
    const p = projectAzAlt(view, 1280, 720, { az: 140, alt: 35 }, false);
    expect(p.x).toBeCloseTo(640, 3);
    expect(p.y).toBeCloseTo(360, 3);
    expect(p.visible).toBe(true);
  });

  it('동쪽(방위각이 큰 쪽)은 화면 오른쪽, 높은 쪽은 화면 위', () => {
    const right = projectAzAlt(view, 1280, 720, { az: 150, alt: 35 }, false);
    const up = projectAzAlt(view, 1280, 720, { az: 140, alt: 45 }, false);
    expect(right.x).toBeGreaterThan(640);
    expect(up.y).toBeLessThan(360);
  });

  it('뒤쪽은 보이지 않는다', () => {
    expect(projectAzAlt(view, 1280, 720, { az: 320, alt: -35 }, false).visible).toBe(false);
  });

  it('시야각은 화면의 긴 쪽 기준: 가로 화면이면 좌우 끝이 fov/2', () => {
    const v: View = { az: 0, alt: 0, fov: 70 };
    const edge = projectVec(v, 1280, 720, azAltToVec(35, 0));
    expect(edge.x).toBeCloseTo(1280, 0);
    // 세로 화면이면 위아래 끝이 fov/2
    expect(verticalFov(70, 390, 844)).toBe(70);
    expect(verticalFov(70, 1280, 720)).toBeLessThan(70);
  });

  it('unproject는 project를 되돌린다', () => {
    for (const [x, y] of [
      [100, 80],
      [640, 360],
      [1200, 700],
    ]) {
      const dir = unproject(view, 1280, 720, x, y);
      const p = projectVec(view, 1280, 720, dir);
      expect(p.x).toBeCloseTo(x, 4);
      expect(p.y).toBeCloseTo(y, 4);
    }
  });

  it('손가락 반지름 22px은 넓게 볼수록 큰 각도', () => {
    const wide = pixelsToDegrees({ az: 0, alt: 0, fov: 100 }, 390, 844, 22);
    const narrow = pixelsToDegrees({ az: 0, alt: 0, fov: 20 }, 390, 844, 22);
    expect(wide).toBeGreaterThan(narrow * 3);
    expect(narrow).toBeGreaterThan(0.3);
  });

  it('시야각 20~100°, 고도 한계로 자른다', () => {
    expect(clampView({ az: 370, alt: 120, fov: 5 })).toEqual({ az: 10, alt: 89.9, fov: 20 });
    expect(clampView({ az: -10, alt: -80, fov: 500 })).toEqual({ az: 350, alt: -10, fov: 100 });
  });
});
