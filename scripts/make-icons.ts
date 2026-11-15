// favicon.svg로 아이폰 홈 화면 아이콘(apple-touch-icon.png, 180x180)을 만든다.
//   npx tsx scripts/make-icons.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
// 아이폰은 모서리를 알아서 둥글게 깎으므로 둥근 모서리 없이 꽉 채운다
const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8').replace('rx="14"', 'rx="0"');
await sharp(Buffer.from(svg), { density: 400 })
  .resize(180, 180)
  .flatten({ background: '#070b1c' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(root, 'public/apple-touch-icon.png'));
console.log('public/apple-touch-icon.png');
