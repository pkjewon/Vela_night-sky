// 4단계: 시간에 따른 하늘색, "오늘 밤으로 보기".
import { expect, test } from '@playwright/test';
import { averageColor, gotoSky, PAJU, sceneQuery, snapshot, takeShot } from './helpers';
import { findTonight, sunAltitude } from '../../src/astro/solar-system';
import { parseTimeParam } from '../../src/astro/time';

const look = { ...PAJU, az: 180, alt: 45, fov: 70 };

test.describe('시간에 따른 하늘색', () => {
  test('낮은 파랗고 밝고, 해 질 녘·밤으로 갈수록 어두워진다', async ({ page }) => {
    const brightness: number[] = [];
    const colors: Array<{ r: number; g: number; b: number }> = [];
    for (const t of ['2026-12-14T12:30+09:00', '2026-12-14T17:35+09:00', '2026-12-14T18:10+09:00', '2026-12-14T23:00+09:00']) {
      await gotoSky(page, sceneQuery({ ...look, t }, { seed: 1 }));
      await page.waitForTimeout(200);
      const shot = await takeShot(page);
      const size = page.viewportSize()!;
      // 화면 위쪽 가운데의 하늘
      const c = averageColor(shot, size.width * 0.3, size.height * 0.12, size.width * 0.4, size.height * 0.1);
      brightness.push(c.brightness);
      colors.push(c);
    }
    expect(brightness[0]).toBeGreaterThan(110); // 낮
    expect(colors[0].b).toBeGreaterThan(colors[0].r + 40); // 파란 하늘
    expect(brightness[1]).toBeLessThan(brightness[0]);
    expect(brightness[2]).toBeLessThan(brightness[1]);
    expect(brightness[3]).toBeLessThan(brightness[2]);
    expect(brightness[3]).toBeLessThan(20); // 밤
    expect(colors[3].b).toBeGreaterThanOrEqual(colors[3].r); // 검정이 아니라 어두운 남색
  });

  test('낮에는 별이 안 보이고 밤에는 6.5등급까지 보인다', async ({ page }) => {
    await gotoSky(page, sceneQuery({ ...look, t: '2026-12-14T12:30+09:00' }));
    expect((await snapshot(page)).limitMag).toBeLessThan(-4);
    await gotoSky(page, sceneQuery({ ...look, t: '2026-12-14T23:00+09:00' }));
    const night = await snapshot(page);
    expect(night.night).toBe(1);
    expect(night.limitMag).toBeGreaterThan(5);
  });
});

test.describe('오늘 밤으로 보기', () => {
  test('낮에 열면 버튼이 보이고, 누르면 천문박명이 끝나는 시각으로 옮겨 간다', async ({ page }) => {
    const t = '2026-12-14T12:30+09:00';
    await gotoSky(page, sceneQuery({ ...look, t }));
    const button = page.locator('#btn-tonight');
    await expect(button).toBeVisible();
    await expect(button).toHaveText('오늘 밤으로 보기');
    await expect(page.locator('#btn-now')).toBeHidden();
    expect((await snapshot(page)).sunAlt).toBeGreaterThan(0);

    await button.click();
    const after = await snapshot(page);
    // 앱이 옮겨 간 시각 = 따로 계산한 "해가 -18°가 되는 때"
    const expected = findTonight(parseTimeParam(t)!, PAJU.lat, PAJU.lon).date;
    expect(Math.abs(new Date(after.time).getTime() - expected.getTime())).toBeLessThan(1000);
    expect(sunAltitude(new Date(after.time), PAJU.lat, PAJU.lon)).toBeCloseTo(-18, 1);
    expect(after.sunAlt).toBeCloseTo(-18, 1);
    expect(after.night).toBeGreaterThan(0.95);
    await expect(button).toBeHidden();
    await expect(page.locator('#clock')).toContainText('오늘 밤');

    // "지금으로 돌아가기"
    const back = page.locator('#btn-now');
    await expect(back).toBeVisible();
    await back.click();
    expect((await snapshot(page)).time).toBe(parseTimeParam(t)!.toISOString());
    await expect(button).toBeVisible();
  });

  test('해 질 녘(해 고도 -6°보다 높을 때)에도 버튼이 보인다', async ({ page }) => {
    await gotoSky(page, sceneQuery({ ...look, t: '2026-12-14T17:30+09:00' }));
    const s = await snapshot(page);
    expect(s.sunAlt).toBeLessThan(0);
    expect(s.sunAlt).toBeGreaterThan(-6);
    await expect(page.locator('#btn-tonight')).toBeVisible();
  });

  test('밤에는 버튼이 없다', async ({ page }) => {
    await gotoSky(page, sceneQuery({ ...look, t: '2026-12-14T23:00+09:00' }));
    await expect(page.locator('#btn-tonight')).toBeHidden();
    await expect(page.locator('#btn-now')).toBeHidden();
  });

  test('시간을 고정하지 않으면 지금 시각의 하늘이 뜬다', async ({ page }) => {
    await gotoSky(page, sceneQuery({ az: 180, alt: 40 }));
    const s = await snapshot(page);
    expect(Math.abs(new Date(s.time).getTime() - Date.now())).toBeLessThan(15_000);
    expect(s.place.name).toBe('서울');
    await expect(page.locator('#place')).toHaveText('서울 기준');
  });
});
