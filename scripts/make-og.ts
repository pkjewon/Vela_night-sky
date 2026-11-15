// 카톡·SNS 미리보기 사진(public/og-image.jpg, 1200x630)을 만든다.
// 미리보기 서버(npm run preview)가 켜진 상태에서:  npm run og
// seed를 고정한 여름밤(은하수가 잘 보이는 그믐) 하늘을 찍고 제목을 얹는다.
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const query = 't=2026-08-12T22:30%2B09:00&lat=37.76&lon=126.78&az=170&alt=32&fov=95&seed=7';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
await page.goto(`http://localhost:4173/Vela_night-sky/?${query}`);
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 30_000 });
await page.waitForFunction(() => document.documentElement.dataset.milkyway === 'ready', undefined, { timeout: 10_000 });
await page.waitForTimeout(600);
// 버튼 같은 화면 장치는 숨기고 제목을 얹는다
await page.addStyleTag({
  content: `#topbar,#bottombar,#toast,#ring,#info-card{display:none!important}
  #og-title{position:fixed;left:64px;bottom:56px;color:#fff;font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif;
    text-shadow:0 2px 18px rgba(0,0,0,.85)}
  #og-title h1{font-size:76px;margin:0;font-weight:800;letter-spacing:-1px}
  #og-title p{font-size:32px;margin:10px 0 0;opacity:.92}`,
});
await page.evaluate(() => {
  const div = document.createElement('div');
  div.id = 'og-title';
  div.innerHTML = '<h1>Vela</h1><p>폰을 하늘로 들면, 그 방향의 진짜 별이 보여요</p>';
  document.body.appendChild(div);
  // 제목과 겹치는 하늘 이름표는 숨긴다
  const box = div.getBoundingClientRect();
  for (const label of document.querySelectorAll<HTMLElement>('#labels .label')) {
    const r = label.getBoundingClientRect();
    if (r.right > box.left - 10 && r.left < box.right + 10 && r.bottom > box.top - 10 && r.top < box.bottom + 10) {
      label.style.visibility = 'hidden';
    }
  }
});
await page.waitForTimeout(200);
const png = await page.screenshot();
await browser.close();
const out = resolve(root, 'public/og-image.jpg');
await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(out);
console.log(`saved ${out}`);
