// 폰 센서 값 → 시점. 기본 자세에서 계산된 시점이 맞는지.
// beta: 0=평평하게 눕힘(화면이 위), 90=똑바로 세움, 180=화면이 아래(뒷면이 하늘)
// alpha: 반시계 방향으로 증가. 폰 위쪽이 북=0, 서=90, 남=180, 동=270
import { describe, expect, it } from 'vitest';
import { azAltSeparation } from '../../src/astro/coords';
import {
  angleDiff,
  angleLerp,
  applyYaw,
  cameraAzAlt,
  deviceToCameraQuat,
  magneticDeclination,
  quatRotate,
  quatSlerp,
  topHeading,
} from '../../src/input/orientation-math';

function expectView(q: ReturnType<typeof deviceToCameraQuat>, az: number, alt: number) {
  const p = cameraAzAlt(q);
  expect(azAltSeparation(p, { az, alt }), `시점 방위 ${p.az.toFixed(2)}° 고도 ${p.alt.toFixed(2)}°`).toBeLessThan(0.001);
}

describe('센서 값 → 시점 (폰 뒷면이 향하는 방향)', () => {
  it('폰을 세워 북쪽 수평을 보면 방위 0° 고도 0°', () => {
    expectView(deviceToCameraQuat(0, 90, 0), 0, 0);
  });

  it('동쪽 수평 → 방위 90°', () => {
    expectView(deviceToCameraQuat(270, 90, 0), 90, 0);
  });

  it('남쪽·서쪽 수평', () => {
    expectView(deviceToCameraQuat(180, 90, 0), 180, 0);
    expectView(deviceToCameraQuat(90, 90, 0), 270, 0);
  });

  it('북쪽으로 45° 올려다보면 고도 45°', () => {
    expectView(deviceToCameraQuat(0, 135, 0), 0, 45);
  });

  it('머리 위 천정: 고도 90°', () => {
    const p = cameraAzAlt(deviceToCameraQuat(0, 180, 0));
    expect(p.alt).toBeCloseTo(90, 4);
    // 방향을 바꿔도 천정은 천정
    expect(cameraAzAlt(deviceToCameraQuat(123, 180, 0)).alt).toBeCloseTo(90, 4);
  });

  it('바닥에 눕히면 땅을 본다 (고도 -90°)', () => {
    expect(cameraAzAlt(deviceToCameraQuat(40, 0, 0)).alt).toBeCloseTo(-90, 4);
  });

  it('세워서 북쪽을 볼 때 화면 위쪽은 천정, 오른쪽은 동쪽', () => {
    const q = deviceToCameraQuat(0, 90, 0);
    const up = quatRotate(q, [0, 1, 0]);
    const right = quatRotate(q, [1, 0, 0]);
    expect(up[1]).toBeCloseTo(1, 6);
    expect(right[0]).toBeCloseTo(1, 6);
  });

  it('가로 화면(왼쪽으로 90° 돌림): 북쪽 수평을 보고 화면 위쪽이 천정', () => {
    // 폰을 세운 채 반시계로 90° 돌려 가로로 쥔 자세: 폰의 오른쪽 가장자리(x)가 하늘을 향한다.
    // W3C 각도로는 alpha=90, beta=0, gamma=-90이고 화면 회전값(screen.orientation.angle)은 90.
    const q = deviceToCameraQuat(90, 0, -90, 90);
    expectView(q, 0, 0);
    const up = quatRotate(q, [0, 1, 0]);
    expect(up[1]).toBeCloseTo(1, 5);
  });

  it('천정 근처에서도 값이 튀지 않는다: 조금씩 기울이면 시점도 조금씩 움직인다', () => {
    let prev = cameraAzAlt(deviceToCameraQuat(30, 170, 0));
    for (let beta = 171; beta <= 190; beta++) {
      const cur = cameraAzAlt(deviceToCameraQuat(30, beta, 0));
      expect(azAltSeparation(prev, cur)).toBeLessThan(1.01);
      prev = cur;
    }
  });
});

describe('나침반 보정', () => {
  it('applyYaw: +90°면 북쪽을 보던 시점이 동쪽으로', () => {
    expectView(applyYaw(deviceToCameraQuat(0, 90, 0), 90), 90, 0);
    expectView(applyYaw(deviceToCameraQuat(0, 135, 0), -30), 330, 45);
  });

  it('보정은 고도를 바꾸지 않는다', () => {
    const q = deviceToCameraQuat(200, 120, 10);
    expect(cameraAzAlt(applyYaw(q, 57)).alt).toBeCloseTo(cameraAzAlt(q).alt, 6);
  });

  it('폰 위쪽이 가리키는 방위: 평평하게 눕히면 또렷, 세우면 불확실', () => {
    const flatNorth = topHeading(deviceToCameraQuat(0, 0, 0));
    expect(flatNorth.heading).toBeCloseTo(0, 4);
    expect(flatNorth.confidence).toBeCloseTo(1, 4);
    const flatEast = topHeading(deviceToCameraQuat(270, 0, 0));
    expect(flatEast.heading).toBeCloseTo(90, 4);
    expect(topHeading(deviceToCameraQuat(0, 90, 0)).confidence).toBeLessThan(0.01);
  });

  it('0°/360° 경계에서 튀지 않는다', () => {
    expect(angleDiff(5, 355)).toBe(10);
    expect(angleDiff(355, 5)).toBe(-10);
    expect(angleLerp(355, 5, 0.5)).toBeCloseTo(0, 6);
    expect(angleLerp(5, 355, 0.5)).toBeCloseTo(0, 6);
  });

  it('구면 보간: 중간값은 두 시점의 가운데', () => {
    const a = deviceToCameraQuat(0, 90, 0);
    const b = deviceToCameraQuat(300, 90, 0); // 방위 60°
    expectView(quatSlerp(a, b, 0.5), 30, 0);
    expectView(quatSlerp(a, b, 0), 0, 0);
    expectView(quatSlerp(a, b, 1), 60, 0);
  });

  it('자기 편각: 한국은 서쪽으로 약 8~9°, 그 밖은 보정하지 않음', () => {
    expect(magneticDeclination(37.5665, 126.978)).toBeCloseTo(-8.5, 1);
    expect(magneticDeclination(33.5, 126.5)).toBeLessThan(0);
    expect(magneticDeclination(-33.87, 151.21)).toBe(0);
  });
});
