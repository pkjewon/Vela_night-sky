// 5단계: 시작 화면, 방향·위치 허용, 센서 모드, 나침반 보정, 대체 동작.
import { expect, test, type Page } from '@playwright/test';
import { gotoSky, snapshot } from './helpers';

/** 가짜 방향 센서 이벤트를 계속 보낸다. */
async function feedSensor(page: Page, event: Record<string, unknown>, type = 'deviceorientationabsolute') {
  await page.evaluate(
    ({ event, type }) => {
      const w = window as unknown as { __feed?: ReturnType<typeof setInterval> };
      clearInterval(w.__feed);
      w.__feed = setInterval(() => {
        const e = new Event(type);
        Object.assign(e, event);
        window.dispatchEvent(e);
      }, 30);
    },
    { event, type },
  );
}

test.describe('시작 화면', () => {
  test('버튼 하나와 위치 안내 한 줄이 있다', async ({ page }) => {
    await gotoSky(page);
    await expect(page.locator('#start')).toBeVisible();
    await expect(page.locator('#start h1')).toHaveText('진짜 밤하늘');
    await expect(page.locator('#start button')).toHaveCount(1);
    await expect(page.locator('#btn-start')).toHaveText('하늘 보기 시작');
    await expect(page.locator('#start .privacy')).toHaveText('위치는 내 폰 안에서만 쓰이고 어디에도 저장되지 않아요');
    // 버튼은 손가락 크기(44px) 이상
    const box = (await page.locator('#btn-start').boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('허용을 모두 거부해도 서울 기준 드래그 모드로 하늘이 뜬다 (오류 화면 없음)', async ({ page }) => {
    // 아이폰처럼 허용 창이 있는 기기에서 방향을 거부한 경우
    await page.addInitScript(() => {
      (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission = () =>
        Promise.resolve('denied');
    });
    await gotoSky(page);
    await page.locator('#btn-start').click();
    await expect(page.locator('#start')).toBeHidden();
    await expect(page.locator('#fallback')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).place.name).toBe('서울');
    const s = await snapshot(page);
    expect(s.mode).toBe('drag');
    expect(s.running).toBe(true);
    await expect(page.locator('#place')).toHaveText('서울 기준');
    await expect(page.locator('#btn-mode')).toHaveText('드래그 모드');
    await expect(page.locator('#toast')).toContainText('손가락으로 둘러보는 모드');
    await expect(page.locator('#toast')).toContainText('서울 기준');
    expect(s.errors).toEqual([]);
  });

  test('허용 요청은 버튼을 누른 그 순간(다른 비동기 작업보다 먼저) 일어난다', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __order: string[] };
      w.__order = [];
      (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission = () => {
        // 사용자 동작이 아직 살아 있는지 기록
        w.__order.push(`orientation:${navigator.userActivation?.isActive ?? 'unknown'}`);
        return Promise.resolve('denied');
      };
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args) => {
        w.__order.push('location');
        return original(...args);
      };
    });
    await gotoSky(page);
    await page.locator('#btn-start').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __order: string[] }).__order.length)).toBe(2);
    const order = await page.evaluate(() => (window as unknown as { __order: string[] }).__order);
    // 방향 먼저, 이어서 위치
    expect(order[0]).toMatch(/^orientation:(true|unknown)$/);
    expect(order[1]).toBe('location');
  });
});

test.describe('위치', () => {
  test.use({ geolocation: { latitude: 35.1796, longitude: 129.0756 }, permissions: ['geolocation'] });

  test('GPS를 허용하면 내 위치 기준', async ({ page }) => {
    await gotoSky(page);
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).place.source).toBe('gps');
    const s = await snapshot(page);
    expect(s.place.lat).toBeCloseTo(35.1796, 3);
    expect(s.place.lon).toBeCloseTo(129.0756, 3);
    await expect(page.locator('#place')).toHaveText('내 위치');
  });
});

test.describe('센서 모드', () => {
  // 요즘 크롬에도 허용 요청 함수가 있어서, 사용자가 "허용"을 누른 것으로 흉내 낸다.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission = () =>
        Promise.resolve('granted');
    });
  });

  test('가짜 센서: 동쪽으로 45° 올려다보면 화면도 그쪽을 본다', async ({ page }) => {
    // 진짜 북쪽 보정(편각)을 꺼서 센서 값 그대로 확인
    await page.addInitScript(() => localStorage.setItem('night-sky:settings', JSON.stringify({ declination: false })));
    await gotoSky(page);
    // 폰 위쪽이 동쪽(alpha=270), 뒤로 45° 젖힘(beta=135)
    await feedSensor(page, { alpha: 270, beta: 135, gamma: 0, absolute: true });
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 10_000 }).toBe('sensor');
    await expect(page.locator('#btn-mode')).toHaveText('폰 방향 모드');
    await expect
      .poll(async () => {
        const v = (await snapshot(page)).view;
        return Math.hypot(v.az - 90, v.alt - 45);
      })
      .toBeLessThan(0.5);

    // 폰을 남쪽 수평으로 돌리면 따라온다
    await feedSensor(page, { alpha: 180, beta: 90, gamma: 0, absolute: true });
    await expect
      .poll(async () => {
        const v = (await snapshot(page)).view;
        return Math.hypot(v.az - 180, v.alt - 0);
      })
      .toBeLessThan(0.5);
  });

  test('한국에서는 나침반 북쪽을 진짜 북쪽으로 보정한다 (약 -8.5°)', async ({ page }) => {
    await gotoSky(page);
    await feedSensor(page, { alpha: 270, beta: 135, gamma: 0, absolute: true });
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 10_000 }).toBe('sensor');
    await expect.poll(async () => Math.abs((await snapshot(page)).view.az - 81.5)).toBeLessThan(0.5);
  });

  test('아이폰 방식: 나침반 값(webkitCompassHeading)으로 방위를 맞춘다', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('night-sky:settings', JSON.stringify({ declination: false })));
    await gotoSky(page);
    // alpha는 기준이 임의(100)이고, 나침반은 폰 위쪽이 방위 30°를 가리킨다고 알려준다.
    // 폰을 45° 기울였으므로 뒷면은 그 방위의 아래쪽(고도 -45°)을 본다.
    await feedSensor(page, { alpha: 100, beta: 45, gamma: 0, webkitCompassHeading: 30, webkitCompassAccuracy: 10 }, 'deviceorientation');
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 10_000 }).toBe('sensor');
    await expect
      .poll(async () => {
        const v = (await snapshot(page)).view;
        return Math.hypot(v.az - 30, v.alt + 45);
      })
      .toBeLessThan(0.6);
  });

  test('나침반 보정: 센서 모드에서 좌우로 드래그하면 방위가 옮겨지고, 다시 열어도 유지된다', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('night-sky:settings')) {
        localStorage.setItem('night-sky:settings', JSON.stringify({ declination: false }));
      }
    });
    await gotoSky(page);
    await feedSensor(page, { alpha: 0, beta: 90, gamma: 0, absolute: true });
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 10_000 }).toBe('sensor');
    await expect.poll(async () => Math.abs((await snapshot(page)).view.az)).toBeLessThan(0.5);

    const size = page.viewportSize()!;
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.down();
    await page.mouse.move(size.width / 2 - 80, size.height / 2, { steps: 8 });
    await page.mouse.up();
    const offset = (await snapshot(page)).userOffset;
    // 왼쪽으로 끌면 하늘이 왼쪽으로 = 시점은 오른쪽(방위각 증가)
    expect(offset).toBeGreaterThan(3);
    await expect.poll(async () => Math.abs((await snapshot(page)).view.az - offset)).toBeLessThan(0.5);
    await expect(page.locator('#toast')).toContainText('나침반 보정');

    await page.waitForTimeout(600); // 저장을 기다린다
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    expect((await snapshot(page)).userOffset).toBeCloseTo(offset, 0);

    // 설정에서 초기화
    await page.locator('#btn-start').click();
    await page.locator('#btn-settings').click();
    await page.locator('#calib-reset').click();
    expect((await snapshot(page)).userOffset).toBe(0);
  });

  test('센서/드래그 전환 버튼: 센서로 보던 방향 그대로 드래그 모드로 이어진다', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('night-sky:settings', JSON.stringify({ declination: false })));
    await gotoSky(page);
    await feedSensor(page, { alpha: 270, beta: 120, gamma: 0, absolute: true });
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 10_000 }).toBe('sensor');
    await expect.poll(async () => Math.abs((await snapshot(page)).view.alt - 30)).toBeLessThan(0.5);

    await page.locator('#btn-mode').click();
    let s = await snapshot(page);
    expect(s.mode).toBe('drag');
    expect(s.view.az).toBeCloseTo(90, 0);
    expect(s.view.alt).toBeCloseTo(30, 0);
    await expect(page.locator('#btn-mode')).toHaveText('드래그 모드');

    await page.locator('#btn-mode').click();
    await expect.poll(async () => (await snapshot(page)).mode, { timeout: 10_000 }).toBe('sensor');
    s = await snapshot(page);
    expect(s.settings.sensor).toBe(true);
  });

  test('센서가 없으면(컴퓨터) 조용히 드래그 모드', async ({ page }) => {
    await gotoSky(page);
    await page.locator('#btn-start').click();
    await page.waitForTimeout(2200);
    const s = await snapshot(page);
    expect(s.mode).toBe('drag');
    expect(s.running).toBe(true);
    await expect(page.locator('#fallback')).toBeHidden();
  });
});
