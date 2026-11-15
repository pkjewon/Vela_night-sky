// 3·4단계: 별·행성·달을 누르면 정보 카드, 별자리 이름이 겹치지 않음.
import { expect, test } from '@playwright/test';
import { bodyAzAlt, gotoSky, HIP, orionScene, PAJU, sceneQuery, screenPos, snapshot, starAzAlt, type Scene } from './helpers';
import { PLANET_IDS, BODY_NAMES_KO } from '../../src/astro/solar-system';

const scene = orionScene();

test.describe('정보 카드', () => {
  test('베텔게우스를 누르면 이름·별자리·밝기·거리가 나온다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    const p = screenPos(scene, size, starAzAlt(HIP.betelgeuse, scene.t, scene.lat, scene.lon));
    await page.mouse.click(p.x, p.y);
    const card = page.locator('#info-card');
    await expect(card).toBeVisible();
    await expect(page.locator('#info-name')).toHaveText('베텔게우스');
    await expect(page.locator('#info-sub')).toHaveText('오리온자리');
    await expect(page.locator('#info-bright')).toContainText('아주 밝음');
    await expect(page.locator('#info-dist')).toHaveText(/약 [\d,]+광년/);
    // 고른 별에 고리 표시
    const ring = page.locator('#ring');
    await expect(ring).toBeVisible();
    const box = (await ring.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - p.x)).toBeLessThan(3);
    expect(Math.abs(box.y + box.height / 2 - p.y)).toBeLessThan(3);
  });

  test('손가락 크기만큼 빗나가도(18px) 가까운 밝은 별이 골라진다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    const p = screenPos(scene, size, starAzAlt(HIP.rigel, scene.t, scene.lat, scene.lon));
    await page.mouse.click(p.x + 13, p.y - 12);
    await expect(page.locator('#info-name')).toHaveText('리겔');
    await expect(page.locator('#info-sub')).toHaveText('오리온자리');
  });

  test('닫기 버튼으로 카드와 고리가 사라진다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    const p = screenPos(scene, size, starAzAlt(HIP.betelgeuse, scene.t, scene.lat, scene.lon));
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('#info-card')).toBeVisible();
    await page.locator('#info-close').click();
    await expect(page.locator('#info-card')).toBeHidden();
    await expect(page.locator('#ring')).toBeHidden();
  });

  test('드래그는 탭으로 치지 않는다 (카드가 뜨지 않음)', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    const size = page.viewportSize()!;
    const p = screenPos(scene, size, starAzAlt(HIP.betelgeuse, scene.t, scene.lat, scene.lon));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y + 10, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('#info-card')).toBeHidden();
  });

  test('행성을 누르면 한글 이름 카드가 나온다', async ({ page }) => {
    // 그날 밤 하늘에 높이 떠 있는 가장 밝은 행성을 계산해서 고른다
    const t = scene.t;
    const up = PLANET_IDS.map((id) => bodyAzAlt(id, t, PAJU.lat, PAJU.lon))
      .filter((b) => b.alt > 15)
      .sort((a, b) => a.mag - b.mag);
    expect(up.length, '이 시각에 보이는 행성이 있어야 한다').toBeGreaterThan(0);
    const planet = up[0];
    const s: Scene = { t, ...PAJU, az: Math.round(planet.az), alt: Math.round(planet.alt), fov: 60 };
    await gotoSky(page, sceneQuery(s));
    const p = screenPos(s, page.viewportSize()!, planet);
    await page.mouse.click(p.x + 5, p.y + 5);
    await expect(page.locator('#info-name')).toHaveText(BODY_NAMES_KO[planet.id]);
    await expect(page.locator('#info-sub')).toHaveText('태양계 행성');
    await expect(page.locator('#info-dist')).toContainText('빛으로 약');
    // 행성 이름표도 하늘에 있다
    expect((await snapshot(page)).labels.map((l) => l.text)).toContain(BODY_NAMES_KO[planet.id]);
  });

  test('달을 누르면 달 모양과 거리가 나온다', async ({ page }) => {
    // 2026-12-20 저녁: 상현 무렵의 달이 남쪽 하늘에 떠 있다 (위치는 계산해서 정한다)
    const t = '2026-12-20T20:00+09:00';
    const moon = bodyAzAlt('moon', t, PAJU.lat, PAJU.lon);
    expect(moon.alt).toBeGreaterThan(10);
    const s: Scene = { t, ...PAJU, az: Math.round(moon.az), alt: Math.round(moon.alt), fov: 40 };
    await gotoSky(page, sceneQuery(s));
    const p = screenPos(s, page.viewportSize()!, moon);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('#info-name')).toHaveText('달');
    await expect(page.locator('#info-bright')).toContainText('빛나는 부분');
    await expect(page.locator('#info-dist')).toContainText('km');
  });
});

test.describe('별자리 이름', () => {
  test('한글 이름이 보이고 서로 겹치지 않는다', async ({ page }) => {
    await gotoSky(page, sceneQuery(scene));
    await page.waitForTimeout(300);
    const labels = await page.locator('#labels .label:visible').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent ?? '', x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
      }),
    );
    const texts = labels.map((l) => l.text);
    expect(texts).toContain('오리온자리');
    expect(texts.filter((t) => t.endsWith('자리')).length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
        expect(overlap, `${a.text} ↔ ${b.text}`).toBe(false);
      }
    }
  });

  test('넓게 볼수록 이름이 줄어든다', async ({ page }) => {
    await gotoSky(page, sceneQuery({ ...scene, fov: 100 }));
    const wide = (await snapshot(page)).labels.filter((l) => l.kind === 'constellation').length;
    expect(wide).toBeGreaterThan(0);
    // 화면에 이름이 너무 많지 않다
    expect(wide).toBeLessThan(26);
  });

  test('지평선에 동서남북 글자', async ({ page }) => {
    await gotoSky(page, sceneQuery({ ...scene, az: 180, alt: 10, fov: 100 }));
    const texts = (await snapshot(page)).labels.filter((l) => l.kind === 'cardinal').map((l) => l.text);
    expect(texts).toContain('남');
  });
});
