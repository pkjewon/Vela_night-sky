// 7단계: 설정 패널, 오로라 꿈 모드, 별똥별, URL 파라미터.
import { expect, test, type Page } from '@playwright/test';
import { averageColor, gotoSky, orionScene, PAJU, sceneQuery, snapshot, takeShot } from './helpers';

const scene = orionScene();
const north = { t: '2026-12-14T23:00+09:00', ...PAJU, az: 0, alt: 25, fov: 90 };

async function openSettings(page: Page) {
  await page.locator('#btn-settings').click();
  await expect(page.locator('#settings')).toBeVisible();
}

const toggle = (page: Page, key: string) => page.locator(`input[data-setting="${key}"]`);

test.describe('설정 패널', () => {
  test('7개 항목이 있고 화면 아래쪽에 있다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    await openSettings(page);
    for (const key of ['lines', 'names', 'milkyway', 'twinkle', 'meteors', 'aurora', 'sensor']) {
      await expect(toggle(page, key)).toBeVisible();
    }
    const size = page.viewportSize()!;
    const box = (await page.locator('#settings').boundingBox())!;
    // 한 손으로 닿는 화면 아래쪽: 시트의 아래 끝이 화면 바닥
    expect(box.y + box.height).toBeGreaterThan(size.height - 2);
    expect(box.y).toBeGreaterThan(size.height * 0.15);
    // 스위치는 손가락으로 누를 만한 크기(줄 높이 44px 이상)
    const row = (await page.locator('#settings .row').first().boundingBox())!;
    expect(row.height).toBeGreaterThanOrEqual(44);
  });

  test('기본값: 오로라만 꺼져 있다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const s = (await snapshot(page)).settings;
    expect(s).toMatchObject({ lines: true, names: true, milkyway: true, twinkle: true, meteors: true, aurora: false });
    await expect(page.locator('#aurora-badge')).toBeHidden();
  });

  test('토글을 끄면 바로 적용되고, 새로고침 뒤에도 유지된다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    await openSettings(page);
    for (const key of ['lines', 'names', 'milkyway', 'twinkle', 'meteors']) {
      await toggle(page, key).click();
      expect((await snapshot(page)).settings[key as 'lines']).toBe(false);
    }
    // 이름을 끄면 별자리 이름표가 사라진다 (동서남북은 남는다)
    await expect.poll(async () => (await snapshot(page)).labels.filter((l) => l.kind === 'constellation').length).toBe(0);

    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    const s = (await snapshot(page)).settings;
    expect(s).toMatchObject({ lines: false, names: false, milkyway: false, twinkle: false, meteors: false });
    await openSettings(page);
    await expect(toggle(page, 'lines')).not.toBeChecked();
    await expect(toggle(page, 'aurora')).not.toBeChecked();
  });

  test('별자리 선을 끄면 화면에서 선이 사라진다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene, { seed: 2 }));
    await page.waitForTimeout(300);
    const before = await takeShot(page);
    await openSettings(page);
    await toggle(page, 'lines').click();
    await page.locator('#settings-close').click();
    await page.waitForTimeout(300);
    const after = await takeShot(page);
    // 화면 위쪽 절반(설정 버튼과 무관한 영역)에서 달라진 픽셀이 있어야 한다
    let changed = 0;
    const half = Math.floor(before.height / 2) * before.width * 3;
    for (let i = 0; i < half; i++) if (Math.abs(before.data[i] - after.data[i]) > 10) changed++;
    expect(changed).toBeGreaterThan(200);
  });

  test('도시를 고르면 그 도시 기준 하늘로 바뀐다', async ({ page }) => {
    await gotoSky(page, sceneQuery({ az: 180, alt: 40, t: scene.t }));
    await openSettings(page);
    await expect(page.locator('#city-select option')).toHaveCount(11); // 내 위치 + 국내 10곳
    await page.locator('#city-select').selectOption('제주');
    const s = await snapshot(page);
    expect(s.place.name).toBe('제주');
    expect(s.place.lat).toBeCloseTo(33.4996, 3);
    await expect(page.locator('#place')).toHaveText('제주 기준');
  });
});

test.describe('오로라 꿈 모드', () => {
  test('켜면 북쪽 낮은 하늘에 초록빛 커튼 + 상상 모드 표시', async ({ page }) => {
    await gotoSky(page, sceneQuery(north, { seed: 4 }));
    await page.waitForTimeout(300);
    const size = page.viewportSize()!;
    const region = [size.width * 0.2, size.height * 0.25, size.width * 0.6, size.height * 0.35] as const;
    const before = averageColor(await takeShot(page), ...region);

    await openSettings(page);
    await toggle(page, 'aurora').click();
    await page.locator('#settings-close').click();
    const badge = page.locator('#aurora-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('오로라 꿈 모드');
    await expect(badge).toContainText('한국에선 거의 볼 수 없는 상상 모드');
    await page.waitForTimeout(400);
    const after = averageColor(await takeShot(page), ...region);
    // 초록빛이 더해진다
    expect(after.g).toBeGreaterThan(before.g + 6);
    expect(after.g - before.g).toBeGreaterThan(after.r - before.r);

    // 다시 끄면 표시도 사라진다
    await openSettings(page);
    await toggle(page, 'aurora').click();
    await expect(badge).toBeHidden();
  });

  test('?aurora=1 링크로 열면 켜진 채로 열린다', async ({ page }) => {
    await gotoSky(page, sceneQuery(north, { aurora: 1, seed: 4 }));
    expect((await snapshot(page)).settings.aurora).toBe(true);
    await expect(page.locator('#aurora-badge')).toBeVisible();
    await openSettings(page);
    await expect(toggle(page, 'aurora')).toBeChecked();
  });

  test('시작 화면이 있는 공유 링크(?aurora=1)에서도 시작 후 상상 모드 표시가 보인다', async ({ page }) => {
    await gotoSky(page, '?aurora=1');
    await expect(page.locator('#start')).toBeVisible();
    await page.locator('#btn-start').click();
    await expect(page.locator('#aurora-badge')).toContainText('상상 모드');
  });
});

test.describe('별똥별', () => {
  test('seed를 고정하면 같은 별똥별이 보이고, 끄면 사라진다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene, { seed: 12 }));
    await expect.poll(async () => (await snapshot(page)).meteorVisible).toBe(true);
    await openSettings(page);
    await toggle(page, 'meteors').click();
    await expect.poll(async () => (await snapshot(page)).meteorVisible).toBe(false);
  });

  test('낮에는 별똥별이 없다', async ({ page }) => {
    await gotoSky(page, sceneQuery({ ...scene, t: '2026-12-14T12:00+09:00' }, { seed: 12 }));
    await page.waitForTimeout(300);
    expect((await snapshot(page)).meteorVisible).toBe(false);
  });
});
