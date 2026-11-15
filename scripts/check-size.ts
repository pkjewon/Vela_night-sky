// 내려받는 크기 검사 (npm run size, vite build 다음에 실행).
// - 첫 화면: 하늘이 처음 뜨기까지 받아야 하는 파일(html·js·css·별·별자리·이름) — 전송 크기(gzip) 1MB 이하
// - 전체: dist 폴더 전체 원본 크기 3MB 이하
// GitHub Pages는 html·js·css·json·bin을 gzip으로 압축해서 보내므로 첫 화면은 gzip 크기로 잰다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const FIRST_LIMIT = 1024 * 1024;
const TOTAL_LIMIT = 3 * 1024 * 1024;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files: string[];
try {
  files = walk(dist);
} catch {
  console.error('dist 폴더가 없어요. 먼저 vite build를 실행하세요.');
  process.exit(1);
}

const kb = (n: number) => `${(n / 1024).toFixed(1)}KB`;
const rel = (p: string) => relative(dist, p).split(sep).join('/');
// 첫 화면에 필요한 파일 (은하수 그림·아이콘·미리보기 사진은 나중에/필요할 때만 받는다)
const isFirst = (p: string) =>
  /^(index\.html|assets\/.*\.(js|css)|data\/(stars\.bin|constellations\.json|names-ko\.json|star-names\.json))$/.test(rel(p));

let total = 0;
let first = 0;
const rows: string[] = [];
for (const f of files.sort()) {
  const raw = statSync(f).size;
  total += raw;
  if (isFirst(f)) {
    const gz = gzipSync(readFileSync(f), { level: 9 }).byteLength;
    first += gz;
    rows.push(`  첫 화면  ${rel(f).padEnd(34)} ${kb(raw).padStart(9)}  (gzip ${kb(gz)})`);
  } else {
    rows.push(`  나중에   ${rel(f).padEnd(34)} ${kb(raw).padStart(9)}`);
  }
}
console.log(rows.join('\n'));
console.log(`첫 화면 전송 크기: ${kb(first)} / 한도 ${kb(FIRST_LIMIT)}`);
console.log(`전체 크기:        ${kb(total)} / 한도 ${kb(TOTAL_LIMIT)}`);
let ok = true;
if (first > FIRST_LIMIT) {
  console.error('✗ 첫 화면이 1MB를 넘어요');
  ok = false;
}
if (total > TOTAL_LIMIT) {
  console.error('✗ 전체가 3MB를 넘어요');
  ok = false;
}
if (!ok) process.exit(1);
console.log('✓ 크기 검사 통과');
