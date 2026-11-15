// 개발용: 미리보기 서버(npm run preview)가 켜진 상태에서 스크린샷 한 장을 찍는다.
//   npx tsx scripts/shot.ts "<쿼리 문자열>" <저장 경로> [가로] [세로] [배율]
import { chromium } from '@playwright/test';

async function main() {
  const [query = '', out = 'shot.png', w = '1280', h = '720', dpr = '1'] = process.argv.slice(2);
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: Number(w), height: Number(h) },
    deviceScaleFactor: Number(dpr),
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:4173/night-sky/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 30_000 });
  await page
    .waitForFunction(() => document.documentElement.dataset.milkyway === 'ready', undefined, { timeout: 8000 })
    .catch(() => console.log('은하수 텍스처 대기 시간 초과'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: out });
  await browser.close();
  console.log(`saved ${out}`);
}

main();
