// 2단계: 별이 계산한 자리에 실제로 찍히는가, 드래그·확대, URL로 시점 고정.
import { expect, test } from '@playwright/test';
import {
  expectNoErrors,
  gotoSky,
  HIP,
  maxBrightness,
  orionScene,
  sceneQuery,
  screenPos,
  snapshot,
  starAzAlt,
  takeShot,
} from './helpers';

const scene = orionScene();

test.describe('별이 실제 위치에 그려진다', () => {
  test('베텔게우스·리겔·시리우스가 계산한 화면 위치에 밝은 점으로 찍힌다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene, { seed: 1 }));
    // 선·이름·은하수가 검사에 섞이지 않게 끈다
    await page.evaluate(() => {
      for (const key of ['lines', 'names', 'milkyway', 'meteors']) {
        const input = document.querySelector<HTMLInputElement>(`input[data-setting="${key}"]`)!;
        input.checked = false;
        input.dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(300);
    const shot = await takeShot(page);
    const size = page.viewportSize()!;

    for (const [name, hip] of Object.entries({ 베텔게우스: HIP.betelgeuse, 리겔: HIP.rigel, 시리우스: HIP.sirius })) {
      const p = screenPos(scene, size, starAzAlt(hip, scene.t, scene.lat, scene.lon));
      if (!p.visible) continue; // 세로 화면에서는 일부가 화면 밖일 수 있다
      const brightness = maxBrightness(shot, p.x, p.y, 3);
      expect(brightness, `${name} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`).toBeGreaterThan(170);
    }
    // 베텔게우스와 리겔은 두 화면 크기 모두에서 보여야 한다
    for (const hip of [HIP.betelgeuse, HIP.rigel]) {
      expect(screenPos(scene, size, starAzAlt(hip, scene.t, scene.lat, scene.lon)).visible).toBe(true);
    }

    // 별이 없는 곳은 어둡다: 계산 위치에서 옆으로 떨어진 곳과 비교
    const rigel = screenPos(scene, size, starAzAlt(HIP.rigel, scene.t, scene.lat, scene.lon));
    expect(maxBrightness(shot, rigel.x + 14, rigel.y + 14, 2)).toBeLessThan(120);
    await expectNoErrors(page);
  });

  test('별이 한 픽셀이라도 어긋나면 잡힌다: 다른 시각의 위치에는 밝은 점이 없다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene, { seed: 1 }));
    await page.evaluate(() => {
      for (const key of ['lines', 'names', 'milkyway', 'meteors']) {
        const input = document.querySelector<HTMLInputElement>(`input[data-setting="${key}"]`)!;
        input.checked = false;
        input.dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(300);
    const shot = await takeShot(page);
    const size = page.viewportSize()!;
    // 20분 뒤의 리겔 위치(하늘이 5°쯤 돈다)는 지금 화면에서 비어 있어야 한다
    const later = screenPos(scene, size, starAzAlt(HIP.rigel, '2026-12-14T22:20+09:00', scene.lat, scene.lon));
    expect(maxBrightness(shot, later.x, later.y, 3)).toBeLessThan(150);
  });
});

test.describe('둘러보기', () => {
  test('URL의 az·alt·fov·t·lat·lon이 그대로 적용된다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const s = await snapshot(page);
    expect(s.view.az).toBeCloseTo(scene.az, 3);
    expect(s.view.alt).toBeCloseTo(scene.alt, 3);
    expect(s.view.fov).toBe(70);
    expect(s.time).toBe('2026-12-14T13:00:00.000Z');
    expect(s.place.lat).toBe(scene.lat);
    expect(s.place.lon).toBe(scene.lon);
    expect(s.mode).toBe('drag');
    expect(s.starCount).toBeGreaterThan(8500);
    // 시작 화면 없이 바로 하늘
    await expect(page.locator('#start')).toBeHidden();
  });

  test('드래그하면 하늘이 손을 따라 돈다 (오른쪽으로 끌면 방위각이 줄어든다)', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    const cx = size.width / 2;
    const cy = size.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 6 });
    await page.mouse.up();
    const s = await snapshot(page);
    expect(s.view.az).toBeLessThan(scene.az - 1);
    expect(s.view.alt).toBeGreaterThan(scene.alt + 1);
  });

  test('위아래 한계: 아무리 끌어도 천정 너머로 뒤집히지 않는다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(size.width / 2, size.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(size.width / 2, size.height * 0.8, { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(800);
    expect((await snapshot(page)).view.alt).toBeLessThanOrEqual(90);
    expect((await snapshot(page)).view.alt).toBeGreaterThan(80);
  });

  test('휠로 확대·축소, 시야각은 20~100° 안에서', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await snapshot(page)).view.fov).toBeLessThan(60);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -600);
    await expect.poll(async () => (await snapshot(page)).view.fov).toBe(20);
    for (let i = 0; i < 16; i++) await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await snapshot(page)).view.fov).toBe(100);
  });

  test('같은 URL이면 같은 화면 (seed 고정)', async ({ page }) => {
    const query = sceneQuery(scene, { seed: 5 });
    await gotoSky(page, query);
    await page.waitForTimeout(500);
    const a = await takeShot(page);
    await gotoSky(page, query);
    await page.waitForTimeout(500);
    const b = await takeShot(page);
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 12) diff++;
    // 은하수 그림이 늦게 뜨는 차이 등을 감안해 0.5% 미만이면 같은 화면으로 본다
    expect(diff / a.data.length).toBeLessThan(0.005);
  });
});
