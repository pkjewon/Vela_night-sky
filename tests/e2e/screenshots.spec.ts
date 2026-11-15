// 단계별 확인용 스크린샷을 docs/screenshots/stage-N/에 남긴다 (사람이 눈으로 보는 용도).
// 모든 장면은 시각·장소·seed를 고정해서 매번 같은 그림이 나온다.
import { expect, test, type Page } from '@playwright/test';
import { bodyAzAlt, gotoSky, HIP, orionScene, PAJU, sceneQuery, screenPos, shotPath, snapshot, starAzAlt, waitMilkyWay } from './helpers';

const scene = orionScene();

async function save(page: Page, stage: number, name: string, project: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(stage, name, project), type: 'jpeg', quality: 80 });
}

test.describe('단계별 스크린샷', () => {
  test('2단계: 오리온자리 주변 별', async ({ page }, info) => {
    await gotoSky(page, sceneQuery(scene, { seed: 1 }));
    await waitMilkyWay(page);
    await save(page, 2, 'orion', info.project.name);
  });

  test('3단계: 베텔게우스 정보 카드와 별자리 이름', async ({ page }, info) => {
    await gotoSky(page, sceneQuery(scene, { seed: 1 }));
    const p = screenPos(scene, page.viewportSize()!, starAzAlt(HIP.betelgeuse, scene.t, scene.lat, scene.lon));
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('#info-card')).toBeVisible();
    await save(page, 3, 'betelgeuse-card', info.project.name);
  });

  test('4단계: 낮·해 질 녘·박명·밤 하늘색', async ({ page }, info) => {
    const look = { ...PAJU, az: 230, alt: 20, fov: 90 };
    for (const [name, t] of [
      ['1-day', '2026-12-14T12:30+09:00'],
      ['2-sunset', '2026-12-14T17:20+09:00'],
      ['3-civil-twilight', '2026-12-14T17:40+09:00'],
      ['4-nautical-twilight', '2026-12-14T18:10+09:00'],
      ['5-night', '2026-12-14T23:00+09:00'],
    ]) {
      await gotoSky(page, sceneQuery({ ...look, t }, { seed: 1 }));
      await save(page, 4, name, info.project.name);
    }
  });

  test('4단계: 달 모양 (보름·초승·하현) 확대', async ({ page }, info) => {
    for (const [name, t] of [
      ['moon-full', '2026-11-24T23:00+09:00'],
      ['moon-crescent', '2026-12-12T18:30+09:00'],
      ['moon-last-quarter', '2026-12-31T05:00+09:00'],
    ]) {
      const m = bodyAzAlt('moon', t, PAJU.lat, PAJU.lon);
      await gotoSky(page, sceneQuery({ t, ...PAJU, az: Number(m.az.toFixed(2)), alt: Number(m.alt.toFixed(2)), fov: 20 }, { seed: 1 }));
      await save(page, 4, name, info.project.name);
    }
  });

  test('5단계: 시작 화면', async ({ page }, info) => {
    await gotoSky(page);
    await expect(page.locator('#start')).toBeVisible();
    await save(page, 5, 'start', info.project.name);
  });

  test('6단계: 은하수 켜고 끄기 (여름·겨울)', async ({ page }, info) => {
    const summer = { t: '2026-08-12T22:30+09:00', ...PAJU, az: 170, alt: 35, fov: 95 };
    const winter = { t: '2026-12-14T23:00+09:00', ...PAJU, az: 120, alt: 45, fov: 95 };
    await gotoSky(page, sceneQuery(summer, { seed: 1 }));
    await waitMilkyWay(page);
    await save(page, 6, 'summer-milkyway-on', info.project.name);
    await page.evaluate(() => localStorage.setItem('night-sky:settings', JSON.stringify({ milkyway: false })));
    await gotoSky(page, sceneQuery(summer, { seed: 1 }));
    await save(page, 6, 'summer-milkyway-off', info.project.name);
    await page.evaluate(() => localStorage.removeItem('night-sky:settings'));
    await gotoSky(page, sceneQuery(winter, { seed: 1 }));
    await waitMilkyWay(page);
    await save(page, 6, 'winter-milkyway-on', info.project.name);
  });

  test('7단계: 오로라 꿈 모드·별똥별·설정 패널', async ({ page }, info) => {
    await gotoSky(page, sceneQuery({ t: '2026-12-14T23:00+09:00', ...PAJU, az: 0, alt: 20, fov: 90 }, { aurora: 1, seed: 4 }));
    await save(page, 7, 'aurora', info.project.name);
    // 별똥별이 하늘 어디에 있는지 물어본 뒤 그쪽을 보고 다시 연다 (seed가 같으면 같은 별똥별)
    await gotoSky(page, sceneQuery(scene, { seed: 12 }));
    await expect.poll(async () => (await snapshot(page)).meteorAzAlt).not.toBeNull();
    const m = (await snapshot(page)).meteorAzAlt!;
    const meteorView = { ...scene, az: Number(m.az.toFixed(1)), alt: Number(Math.min(80, m.alt).toFixed(1)), fov: 60 };
    await gotoSky(page, sceneQuery(meteorView, { seed: 12 }));
    await save(page, 7, 'meteor', info.project.name);
    await gotoSky(page, sceneQuery(scene, { seed: 12 }));
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings')).toBeVisible();
    await save(page, 7, 'settings', info.project.name);
  });

  test('8단계: 디버그 화면과 WebGL 안내 화면', async ({ page }, info) => {
    await gotoSky(page, sceneQuery(scene, { debug: 1, seed: 1 }));
    await save(page, 8, 'debug', info.project.name);
    await page.goto(`./${sceneQuery({ t: scene.t, ...PAJU }, { debug: 'table' })}`);
    await save(page, 8, 'debug-table', info.project.name);
  });

  test('8단계: WebGL을 못 쓰는 브라우저', async ({ page }, info) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith('webgl')) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof original;
    });
    await page.goto('./');
    await expect(page.locator('#fallback')).toBeVisible();
    await save(page, 8, 'no-webgl', info.project.name);
  });
});
