// 8·9단계: 안 될 때의 대체 동작, 배터리, 디버그, 공유 미리보기, 출처.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { gotoSky, orionScene, ROOT, sceneQuery, snapshot } from './helpers';

const scene = orionScene();

test.describe('안 될 때도 흰 화면 없이', () => {
  test('WebGL을 못 쓰는 브라우저: 안내 화면과 다시 시도 버튼', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof original;
    });
    await page.goto('./');
    const fallback = page.locator('#fallback');
    await expect(fallback).toBeVisible();
    await expect(page.locator('#fallback-title')).toContainText('하늘을 그릴 수 없어요');
    await expect(page.locator('#fallback-text')).toContainText('다른 브라우저');
    await expect(page.locator('#btn-retry')).toBeVisible();
    await expect(page.locator('#start')).toBeHidden();
    // 배경이 흰색이 아니다
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('별 데이터를 못 받으면 안내 화면, 다시 시도하면 하늘이 뜬다', async ({ page }) => {
    let fail = true;
    await page.route('**/data/stars.bin', (route) => (fail ? route.abort() : route.continue()));
    await page.goto(`./${sceneQuery(scene)}`);
    await expect(page.locator('#fallback')).toBeVisible();
    await expect(page.locator('#fallback-title')).toHaveText('별 데이터를 불러오지 못했어요');

    fail = false;
    await page.locator('#btn-retry').click();
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await expect(page.locator('#fallback')).toBeHidden();
    expect((await snapshot(page)).starCount).toBeGreaterThan(8500);
  });

  test('은하수 그림을 못 받아도 별은 그대로 보인다', async ({ page }) => {
    await page.route('**/textures/milkyway.webp', (route) => route.abort());
    await gotoSky(page, sceneQuery(scene));
    await page.waitForTimeout(500);
    await expect(page.locator('#fallback')).toBeHidden();
    const s = await snapshot(page);
    expect(s.running).toBe(true);
    expect(s.starCount).toBeGreaterThan(8500);
  });

  test('저장소(localStorage)가 막혀 있어도 열린다', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('막힘');
        },
      });
    });
    await gotoSky(page, sceneQuery(scene));
    expect((await snapshot(page)).running).toBe(true);
    await page.locator('#btn-settings').click();
    await page.locator('input[data-setting="lines"]').click();
    expect((await snapshot(page)).settings.lines).toBe(false);
  });
});

test.describe('배터리', () => {
  test('탭이 숨겨지면 그리기를 멈추고, 돌아오면 다시 그린다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    expect((await snapshot(page)).running).toBe(true);
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    expect((await snapshot(page)).running).toBe(false);
    await setHidden(false);
    expect((await snapshot(page)).running).toBe(true);
  });
});

test.describe('디버그', () => {
  test('?debug=1: 센서 값·FPS·시점·오류가 화면에 나온다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene, { debug: 1 }));
    const panel = page.locator('#debug');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('FPS');
    await expect(panel).toContainText('alpha');
    await expect(panel).toContainText('나침반');
    await expect(panel).toContainText(`방위 ${scene.az.toFixed(1)}°`);
    await expect(panel).toContainText('오류 없음');
    // 오류가 나면 패널에 남는다
    await page.evaluate(() => setTimeout(() => {
      throw new Error('테스트용 오류');
    }, 0));
    await expect(panel).toContainText('테스트용 오류');
  });

  test('평소에는 디버그 패널이 없다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    await expect(page.locator('#debug')).toBeHidden();
  });

  test('?debug=table: 지평선 위 밝은 별과 행성의 방위각·고도 표', async ({ page }) => {
    await page.goto(`./${sceneQuery({ t: scene.t, lat: scene.lat, lon: scene.lon }, { debug: 'table' })}`);
    const table = page.locator('#table table');
    await expect(table).toBeVisible();
    const rows = await table.locator('tr').count();
    expect(rows).toBeGreaterThanOrEqual(21); // 제목 줄 + 별 20개 (+ 떠 있는 달·행성)
    await expect(table).toContainText('시리우스');
    await expect(table).toContainText('베텔게우스');
    await expect(page.locator('#table')).toContainText('방위각');
  });
});

test.describe('공유와 출처', () => {
  test('카톡 미리보기 카드용 태그(제목·설명·1200x630 사진)가 있다', async ({ page }) => {
    await page.goto('./');
    const meta = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute('content');
    expect(await meta('og:title')).toContain('Vela');
    expect((await meta('og:description'))!.length).toBeGreaterThan(10);
    expect(await meta('og:image')).toBe('https://pkjewon.github.io/Vela_night-sky/og-image.jpg');
    expect(await meta('og:url')).toBe('https://pkjewon.github.io/Vela_night-sky/');
    expect(await meta('og:image:width')).toBe('1200');
    expect(await meta('og:image:height')).toBe('630');
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBeTruthy();
    await expect(page).toHaveTitle('Vela');
    // 사진·아이콘 파일이 실제로 있다
    for (const path of ['og-image.jpg', 'favicon.svg', 'apple-touch-icon.png']) {
      const res = await page.request.get(`./${path}`);
      expect(res.ok(), path).toBe(true);
    }
  });

  test('og-image는 1200x630 JPEG', async () => {
    const buf = readFileSync(resolve(ROOT, 'public/og-image.jpg'));
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
    expect(buf.byteLength).toBeLessThan(400 * 1024);
  });

  test('ⓘ 화면에 데이터·라이브러리 출처가 모두 있고, 오로라는 상상 모드라고 적혀 있다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    await page.locator('#btn-about').click();
    const about = page.locator('#about');
    await expect(about).toBeVisible();
    for (const text of [
      'HYG Database v4.2',
      'CC BY-SA 4.0',
      'd3-celestial',
      'Olaf Frohn',
      'BSD-3-Clause',
      'ESA/Gaia/DPAC',
      'CC BY-SA 3.0 IGO',
      'Astronomy Engine',
      'Three.js',
      'MIT',
      '한국천문학회',
      '오로라는 상상 모드',
      '어디에도 보내거나 저장하지 않아요',
    ]) {
      await expect(about).toContainText(text);
    }
    await page.locator('#about-close').click();
    await expect(about).toBeHidden();
  });

  test('아래쪽 버튼이 화면 안에 있고 손가락 크기 이상이다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    for (const id of ['btn-mode', 'btn-settings', 'btn-about']) {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.height, id).toBeGreaterThanOrEqual(44);
      expect(box.width, id).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height, id).toBeLessThanOrEqual(size.height);
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(size.width);
    }
  });
});
