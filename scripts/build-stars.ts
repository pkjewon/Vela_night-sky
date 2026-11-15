// HYG v4.2 CSV → public/data/stars.bin + star-names.json
//
// 쓰는 법: raw/hyg_v42.csv.gz 를 내려받은 뒤 `npm run data:stars`
//   (https://codeberg.org/astronexus/hyg → data/hyg/OLDER/hyg_v42.csv.gz, CC BY-SA 4.0)
//
// stars.bin 형식 (little-endian):
//   헤더 16바이트: 'NSKY', 버전(uint32), 별 개수(uint32), 기준 연도(float32)
//   Float32 위치[3n]  J2000 적도좌표 단위벡터(고유운동을 기준 연도까지 반영)
//   Float32 거리[n]   광년, 0 = 모름
//   Uint32  HIP[n]    0 = 없음
//   Int16   등급×100[n]
//   Int16   색지수(B-V)×100[n], 32767 = 모름
//   Uint8   별자리 번호[n], 255 = 없음
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BV_UNKNOWN,
  CON_NONE,
  LIGHT_YEARS_PER_PARSEC,
  STAR_BYTES,
  STARS_HEADER_BYTES,
  STARS_MAGIC,
  STARS_VERSION,
  starVecWithMotion,
} from '../src/astro/stars';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAG_LIMIT = 6.5;
/** 고유운동을 이 연도까지 반영한다 (PROGRESS.md 2단계 참고). */
export const EPOCH_YEAR = 2026.5;

/** 따옴표를 지원하는 간단한 CSV 줄 분리. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

interface Row {
  hip: number;
  proper: string;
  bf: string;
  ra: number;
  dec: number;
  distPc: number;
  pmra: number;
  pmdec: number;
  mag: number;
  ci: number;
  con: string;
}

function main() {
  const csv = gunzipSync(readFileSync(resolve(ROOT, 'raw/hyg_v42.csv.gz'))).toString('utf8');
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`HYG에 ${name} 열이 없습니다`);
    return i;
  };
  const c = {
    id: col('id'),
    hip: col('hip'),
    bf: col('bf'),
    proper: col('proper'),
    ra: col('ra'),
    dec: col('dec'),
    dist: col('dist'),
    pmra: col('pmra'),
    pmdec: col('pmdec'),
    mag: col('mag'),
    ci: col('ci'),
    con: col('con'),
  };

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    if (f[c.id] === '0') continue; // 태양
    const mag = Number(f[c.mag]);
    if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
    rows.push({
      hip: f[c.hip] ? Number(f[c.hip]) : 0,
      proper: f[c.proper].trim(),
      bf: f[c.bf].trim().replace(/\s+/g, ' '),
      ra: Number(f[c.ra]) * 15,
      dec: Number(f[c.dec]),
      distPc: Number(f[c.dist]),
      pmra: Number(f[c.pmra]) || 0,
      pmdec: Number(f[c.pmdec]) || 0,
      mag,
      ci: f[c.ci] === '' ? NaN : Number(f[c.ci]),
      con: f[c.con].trim(),
    });
  }
  rows.sort((a, b) => a.mag - b.mag);

  const cons = [...new Set(rows.map((r) => r.con).filter((s) => s.length > 0))].sort();
  const n = rows.length;
  const buf = new ArrayBuffer(STARS_HEADER_BYTES + n * STAR_BYTES);
  const view = new DataView(buf);
  view.setUint32(0, STARS_MAGIC, true);
  view.setUint32(4, STARS_VERSION, true);
  view.setUint32(8, n, true);
  view.setFloat32(12, EPOCH_YEAR, true);

  const years = EPOCH_YEAR - 2000;
  let off = STARS_HEADER_BYTES;
  for (const r of rows) {
    const v = starVecWithMotion(r.ra, r.dec, r.pmra, r.pmdec, years);
    view.setFloat32(off, v[0], true);
    view.setFloat32(off + 4, v[1], true);
    view.setFloat32(off + 8, v[2], true);
    off += 12;
  }
  for (const r of rows) {
    // HYG는 거리를 모르면 100000pc로 적는다
    const known = r.distPc > 0 && r.distPc < 99999;
    view.setFloat32(off, known ? r.distPc * LIGHT_YEARS_PER_PARSEC : 0, true);
    off += 4;
  }
  for (const r of rows) {
    view.setUint32(off, r.hip, true);
    off += 4;
  }
  for (const r of rows) {
    view.setInt16(off, Math.round(r.mag * 100), true);
    off += 2;
  }
  for (const r of rows) {
    view.setInt16(off, Number.isFinite(r.ci) ? Math.max(-100, Math.min(400, Math.round(r.ci * 100))) : BV_UNKNOWN, true);
    off += 2;
  }
  for (const r of rows) {
    const idx = cons.indexOf(r.con);
    view.setUint8(off, idx < 0 ? CON_NONE : idx);
    off += 1;
  }

  // 이름: 고유 이름(영어)과 바이어/플램스티드 기호. 키는 별 번호(밝은 순).
  const proper: Record<string, string> = {};
  const bf: Record<string, string> = {};
  rows.forEach((r, i) => {
    if (r.proper) proper[i] = r.proper;
    if (r.bf) bf[i] = r.bf;
  });

  const outDir = resolve(ROOT, 'public/data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'stars.bin'), Buffer.from(buf));
  writeFileSync(resolve(outDir, 'star-names.json'), JSON.stringify({ cons, proper, bf }));
  console.log(`stars.bin: ${n}개, ${(buf.byteLength / 1024).toFixed(1)}KB, 별자리 약어 ${cons.length}개`);
  console.log(`가장 밝은 별: ${rows[0].proper} (${rows[0].mag}등급), 고유 이름 ${Object.keys(proper).length}개`);
}

main();
