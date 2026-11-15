// 연출(하늘색·은하수·별똥별·화질·이름표)의 순수 계산 부분 검사.
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { vecToAzAlt } from '../../src/astro/coords';
import { equatorialToGalactic, milkywayUV } from '../../src/astro/galactic';
import { METEOR_MIN_ALT, MeteorSchedule, meteorShape } from '../../src/render/meteor-math';
import { nextQualityLevel, QUALITY_LEVELS, QualityMonitor, SLOW_FRAME_MS } from '../../src/render/quality';
import { luminance, skyPalette, skyPhaseName } from '../../src/render/sky-color';
import { labelBox, layoutLabels, type LabelItem } from '../../src/ui/labels';

describe('시간에 따른 하늘색', () => {
  it('해가 낮아질수록 하늘이 어두워진다 (낮 → 박명 3단계 → 밤)', () => {
    const alts = [30, 5, 0, -3, -6, -9, -12, -15, -18, -40];
    const zenith = alts.map((a) => luminance(skyPalette(a).zenith));
    for (let i = 1; i < zenith.length; i++) expect(zenith[i]).toBeLessThanOrEqual(zenith[i - 1] + 1e-9);
    expect(zenith[0]).toBeGreaterThan(0.3);
    expect(zenith[zenith.length - 1]).toBeLessThan(0.02);
  });

  it('경계에서 색이 갑자기 바뀌지 않는다 (부드럽게 이어짐)', () => {
    let prev = skyPalette(15);
    for (let alt = 14.9; alt >= -20; alt -= 0.1) {
      const cur = skyPalette(alt);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(cur.zenith[k] - prev.zenith[k])).toBeLessThan(0.02);
        expect(Math.abs(cur.horizon[k] - prev.horizon[k])).toBeLessThan(0.02);
      }
      expect(Math.abs(cur.limitMag - prev.limitMag)).toBeLessThan(0.25);
      prev = cur;
    }
  });

  it('낮에는 별이 안 보이고, 어두워질수록 어두운 별까지 보인다', () => {
    expect(skyPalette(20).limitMag).toBeLessThan(-4); // 금성(-4.x)도 안 보임
    expect(skyPalette(-6).limitMag).toBeGreaterThan(0); // 가장 밝은 별들이 나타남
    expect(skyPalette(-6).limitMag).toBeLessThan(3);
    expect(skyPalette(-12).limitMag).toBeGreaterThan(4);
    expect(skyPalette(-18).limitMag).toBeCloseTo(6.5, 5);
    expect(skyPalette(-50).limitMag).toBeCloseTo(6.5, 5);
  });

  it('완전한 검정이 아니라 아주 어두운 남색', () => {
    const night = skyPalette(-40);
    expect(night.zenith[2]).toBeGreaterThan(night.zenith[0]); // 파란 기운
    expect(luminance(night.zenith)).toBeGreaterThan(0.005);
    expect(night.night).toBe(1);
    expect(night.sunDisc).toBe(0);
  });

  it('해 질 녘에는 해 쪽 지평선에 노을빛', () => {
    const dusk = skyPalette(-3);
    expect(dusk.glow[0]).toBeGreaterThan(dusk.glow[2]); // 붉은 기운
    expect(skyPalette(-25).glow).toEqual([0, 0, 0]);
  });

  it('은하수는 밤에만, 달이 밝으면 약해진다', () => {
    expect(skyPalette(-8).milky).toBe(0);
    expect(skyPalette(-30).milky).toBe(1);
    const fullMoon = skyPalette(-30, 50, 1);
    expect(fullMoon.milky).toBeLessThan(0.4);
    expect(fullMoon.limitMag).toBeLessThan(6);
    // 달이 지평선 아래면 영향 없음
    expect(skyPalette(-30, -20, 1).milky).toBe(1);
  });

  it('구간 이름', () => {
    expect(skyPhaseName(10)).toBe('낮');
    expect(skyPhaseName(-3)).toContain('시민박명');
    expect(skyPhaseName(-9)).toContain('항해박명');
    expect(skyPhaseName(-15)).toContain('천문박명');
    expect(skyPhaseName(-30)).toBe('밤');
  });
});

describe('은하수 텍스처 (Gaia 이미지 가공본)', () => {
  it('좌표 변환: 은하 중심은 궁수자리 방향, 은하 북극은 머리털자리 방향', () => {
    const center = equatorialToGalactic(266.405, -28.936);
    expect(Math.abs(center.l)).toBeLessThan(0.1);
    expect(Math.abs(center.b)).toBeLessThan(0.1);
    expect(equatorialToGalactic(192.859, 27.128).b).toBeGreaterThan(89.9);
  });

  it('실제 위치: 데네브·알타이르·궁수자리 쪽이 밝고 북두칠성 쪽은 어둡다', async () => {
    const path = resolve(__dirname, '../../public/textures/milkyway.webp');
    const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const brightness = (ra: number, dec: number): number => {
      // 주변 5x5 픽셀 평균
      const { u, v } = milkywayUV(ra, dec);
      const cx = Math.floor(u * info.width);
      const cy = Math.floor(v * info.height);
      let sum = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = (cx + dx + info.width) % info.width;
          const y = Math.max(0, Math.min(info.height - 1, cy + dy));
          const o = (y * info.width + x) * info.channels;
          sum += (data[o] + data[o + 1] + data[o + 2]) / 3;
          n++;
        }
      }
      return sum / n;
    };
    const deneb = brightness(310.36, 45.28);
    const altair = brightness(297.7, 8.87);
    const sagittarius = brightness(271.0, -27.0); // 궁수자리 은하수의 밝은 부분
    const dipper = brightness(183.9, 57.0); // 북두칠성(메그레즈)
    const galacticPole = brightness(192.86, 27.13);
    console.log(
      `은하수 밝기(0~255): 데네브 ${deneb.toFixed(0)}, 알타이르 ${altair.toFixed(0)}, 궁수 ${sagittarius.toFixed(0)}, 북두칠성 ${dipper.toFixed(0)}, 은하 북극 ${galacticPole.toFixed(0)}`,
    );
    expect(dipper).toBeLessThan(12);
    expect(galacticPole).toBeLessThan(12);
    expect(deneb).toBeGreaterThan(dipper + 25);
    expect(altair).toBeGreaterThan(dipper + 15);
    expect(sagittarius).toBeGreaterThan(deneb); // 궁수자리 쪽이 가장 진하다
    expect(info.width).toBeLessThanOrEqual(4096);
    expect(info.height).toBeLessThanOrEqual(2048);
  });
});

describe('별똥별', () => {
  it('같은 seed면 같은 별똥별, 다른 seed면 다른 별똥별', () => {
    const a = new MeteorSchedule(42);
    const b = new MeteorSchedule(42);
    const c = new MeteorSchedule(43);
    for (let i = 0; i < 5; i++) expect(a.get(i)).toEqual(b.get(i));
    expect(a.get(0)).not.toEqual(c.get(0));
  });

  it('평균 수십 초에 한 번', () => {
    const s = new MeteorSchedule(7);
    const n = 400;
    const mean = s.get(n - 1).start / n;
    expect(mean).toBeGreaterThan(15);
    expect(mean).toBeLessThan(45);
    for (let i = 1; i < n; i++) expect(s.get(i).start - s.get(i - 1).start).toBeGreaterThanOrEqual(6);
  });

  it('시작과 끝 모두 고도 20° 이상, 짧게 지나간다', () => {
    const s = new MeteorSchedule(99);
    let bright = 0;
    for (let i = 0; i < 300; i++) {
      const m = s.get(i);
      expect(vecToAzAlt(m.from).alt).toBeGreaterThanOrEqual(METEOR_MIN_ALT);
      expect(vecToAzAlt(m.to).alt).toBeGreaterThanOrEqual(METEOR_MIN_ALT - 1e-6);
      expect(m.duration).toBeGreaterThan(0.3);
      expect(m.duration).toBeLessThan(1.2);
      if (m.brightness > 1.5) bright++;
    }
    // 가끔 밝은 것
    expect(bright).toBeGreaterThan(5);
    expect(bright).toBeLessThan(80);
  });

  it('activeAt: 지나가는 동안에만 보인다', () => {
    const s = new MeteorSchedule(5);
    const m = s.get(2);
    expect(s.activeAt(m.start + m.duration / 2)).toEqual(m);
    expect(s.activeAt(m.start - 0.5)).toBeNull();
    expect(s.activeAt(0)).toBeNull();
  });

  it('모양: 길어졌다가 사라진다', () => {
    expect(meteorShape(0).fade).toBe(0);
    expect(meteorShape(1).fade).toBe(0);
    expect(meteorShape(0.5).fade).toBe(1);
    expect(meteorShape(0.5).head).toBeGreaterThan(meteorShape(0.5).tail);
  });
});

describe('자동 화질 조절', () => {
  it('느리면 한 단계씩 낮추고, 빠르면 그대로', () => {
    expect(nextQualityLevel(0, 16)).toBe(0);
    expect(nextQualityLevel(0, SLOW_FRAME_MS + 1)).toBe(1);
    expect(nextQualityLevel(1, 40)).toBe(2);
    expect(nextQualityLevel(QUALITY_LEVELS.length - 1, 100)).toBe(QUALITY_LEVELS.length - 1);
  });

  it('해상도 배율 2 → 1.5 → 1 순서로 낮아지고, 마지막에 은하수·오로라를 줄인다', () => {
    expect(QUALITY_LEVELS.map((q) => q.maxPixelRatio)).toEqual([2, 1.5, 1, 1]);
    expect(QUALITY_LEVELS[0].maxPixelRatio).toBeLessThanOrEqual(2);
    expect(QUALITY_LEVELS[2].milkyWay).toBe(true);
    expect(QUALITY_LEVELS[3].milkyWay).toBe(false);
    expect(QUALITY_LEVELS[3].auroraDetail).toBe(0);
  });

  it('측정기: 계속 느리면 끝까지 내려가고, 빠르면 내려가지 않는다', () => {
    const slow = new QualityMonitor();
    let changes = 0;
    for (let i = 0; i < 1000; i++) if (slow.push(40)) changes++;
    expect(slow.level).toBe(QUALITY_LEVELS.length - 1);
    expect(changes).toBe(QUALITY_LEVELS.length - 1);

    const fast = new QualityMonitor();
    for (let i = 0; i < 1000; i++) expect(fast.push(16.7)).toBe(false);
    expect(fast.level).toBe(0);
  });

  it('탭 전환으로 생긴 아주 긴 프레임은 무시한다', () => {
    const q = new QualityMonitor();
    for (let i = 0; i < 200; i++) q.push(i % 20 === 0 ? 3000 : 16);
    expect(q.level).toBe(0);
  });
});

describe('이름표 배치', () => {
  const item = (text: string, x: number, y: number, priority: number): LabelItem => ({
    text,
    x,
    y,
    kind: 'constellation',
    priority,
  });

  it('겹치면 덜 중요한 이름을 숨긴다', () => {
    const out = layoutLabels(
      [item('오리온자리', 100, 100, 3), item('외뿔소자리', 110, 104, 5), item('토끼자리', 300, 300, 4)],
      800,
      600,
    );
    expect(out.map((l) => l.text)).toEqual(['오리온자리', '토끼자리']);
  });

  it('남은 이름표끼리는 겹치지 않는다', () => {
    const items: LabelItem[] = [];
    for (let i = 0; i < 80; i++) items.push(item(`별자리${i}`, (i * 37) % 400, (i * 91) % 300, i % 5));
    const out = layoutLabels(items, 400, 300);
    expect(out.length).toBeGreaterThan(3);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = labelBox(out[i]);
        const b = labelBox(out[j]);
        expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false);
      }
    }
  });

  it('화면 밖 이름표는 뺀다', () => {
    expect(layoutLabels([item('밖', -200, 100, 1), item('안', 100, 100, 1)], 400, 300).map((l) => l.text)).toEqual(['안']);
  });
});
