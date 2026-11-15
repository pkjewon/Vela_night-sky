// ESA Gaia 전천구 이미지 → public/textures/milkyway.webp (흐리게 가공한 은하수 텍스처)
//
// 원본: "Gaia's sky in colour – equirectangular projection"
//   https://sci.esa.int/web/gaia/-/60196-gaia-s-sky-in-colour-equirectangular-projection
//   Copyright: ESA/Gaia/DPAC, CC BY-SA 3.0 IGO
//   raw/gaia_allsky_2000x1000.png 로 내려받은 뒤 `npm run data:milkyway`
//
// 가공 내용 (가공본도 CC BY-SA 3.0 IGO):
//   1. 좌표계 바꾸기: 원본은 은하좌표(가운데가 은하 중심, 은경이 왼쪽으로 증가).
//      앱의 별과 같은 회전을 쓰도록 적도좌표(J2000)로 다시 그린다.
//      결과 이미지: 가로 = 적경 0°→360°(왼쪽→오른쪽), 세로 = 적위 +90°(위)→-90°(아래).
//   2. 점처럼 찍힌 밝은 별·성단이 앱의 별과 겹치지 않게 중간값 필터 + 흐림.
//   3. 어두운 배경을 0으로 내리고 전체를 어둡게, 색은 살짝만 남김.
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { equatorialToGalactic } from '../src/astro/galactic';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_W = 1024;
const OUT_H = 512;

async function main() {
  const src = sharp(resolve(ROOT, 'raw/gaia_allsky_2000x1000.png')).removeAlpha();
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const sample = (x: number, y: number, ch: number): number => {
    // 가로는 이어 붙고(360° 한 바퀴), 세로는 끝에서 멈춘다
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const px = (xx: number, yy: number) => {
      const cx = ((xx % W) + W) % W;
      const cy = Math.max(0, Math.min(H - 1, yy));
      return data[(cy * W + cx) * C + ch];
    };
    return (
      px(x0, y0) * (1 - fx) * (1 - fy) +
      px(x0 + 1, y0) * fx * (1 - fy) +
      px(x0, y0 + 1) * (1 - fx) * fy +
      px(x0 + 1, y0 + 1) * fx * fy
    );
  };

  const out = Buffer.alloc(OUT_W * OUT_H * 3);
  for (let y = 0; y < OUT_H; y++) {
    const dec = 90 - ((y + 0.5) / OUT_H) * 180;
    for (let x = 0; x < OUT_W; x++) {
      const ra = ((x + 0.5) / OUT_W) * 360;
      const { l, b } = equatorialToGalactic(ra, dec);
      // 원본: 가운데가 l=0, 왼쪽 끝이 l=+180, 오른쪽 끝이 l=-180
      const sx = ((180 - l) / 360) * W - 0.5;
      const sy = ((90 - b) / 180) * H - 0.5;
      const o = (y * OUT_W + x) * 3;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.round(sample(sx, sy, ch));
    }
  }

  const outPath = resolve(ROOT, 'public/textures/milkyway.webp');
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(out, { raw: { width: OUT_W, height: OUT_H, channels: 3 } })
    .median(5) // 점처럼 찍힌 별 지우기
    .blur(2.2) // 부드럽게
    .linear(1.25, -26) // 어두운 배경을 0으로
    .modulate({ saturation: 0.55, brightness: 0.9 })
    .webp({ quality: 72 })
    .toFile(outPath);
  console.log(`milkyway.webp: ${OUT_W}x${OUT_H}, ${(statSync(outPath).size / 1024).toFixed(1)}KB`);
}

main();
