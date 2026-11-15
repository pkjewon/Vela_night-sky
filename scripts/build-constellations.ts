// d3-celestial의 별자리 선(constellations.lines.json, BSD-3-Clause) → public/data/constellations.json
//
// 쓰는 법: raw/constellations.lines.json 을 내려받은 뒤 `npm run data:constellations`
//   (https://github.com/ofrohn/d3-celestial → data/constellations.lines.json)
//   stars.bin이 먼저 있어야 한다 (`npm run data:stars`).
//
// 원본은 선의 꼭짓점을 좌표(적경·적위)로 적어 두었다. 여기서는 꼭짓점마다 가장 가까운
// 실제 별을 찾아 "별 번호"로 바꾼다. 이렇게 하면 선이 항상 별에 정확히 닿고,
// 0.2° 안에 별이 없는 꼭짓점(데이터 오류)을 바로 찾아낼 수 있다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { angularSeparation, raDecToVec, type Vec3 } from '../src/astro/coords';
import { parseStars, starVec } from '../src/astro/stars';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_SNAP_DEG = 0.2;

interface Feature {
  id: string;
  properties: { rank: string };
  geometry: { type: string; coordinates: number[][][] };
}

function main() {
  const src = JSON.parse(readFileSync(resolve(ROOT, 'raw/constellations.lines.json'), 'utf8')) as {
    features: Feature[];
  };
  const file = readFileSync(resolve(ROOT, 'public/data/stars.bin'));
  const cat = parseStars(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

  const nearest = (v: Vec3): { index: number; sep: number } => {
    let best = -1;
    let bestDot = -2;
    const p = cat.positions;
    for (let i = 0; i < cat.count; i++) {
      const d = p[i * 3] * v[0] + p[i * 3 + 1] * v[1] + p[i * 3 + 2] * v[2];
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    }
    return { index: best, sep: angularSeparation(starVec(cat, best), v) };
  };

  // 뱀자리(Ser)는 머리·꼬리 두 덩어리로 나뉘어 있어서 같은 id를 합친다
  const merged = new Map<string, number[][][]>();
  const ranks = new Map<string, number>();
  for (const f of src.features) {
    ranks.set(f.id, Math.min(ranks.get(f.id) ?? 3, Number(f.properties.rank) || 3));
    if (f.geometry.type !== 'MultiLineString') throw new Error(`${f.id}: 예상 못 한 도형 ${f.geometry.type}`);
    merged.set(f.id, [...(merged.get(f.id) ?? []), ...f.geometry.coordinates]);
  }

  const misses: string[] = [];
  let maxSep = 0;
  const out = [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, lines]) => {
      const starLines = lines.map((line) =>
        line.map(([ra, dec]) => {
          const hit = nearest(raDecToVec(ra, dec));
          maxSep = Math.max(maxSep, hit.sep);
          if (hit.sep > MAX_SNAP_DEG) misses.push(`${id} (${ra}, ${dec}): 가장 가까운 별이 ${hit.sep.toFixed(3)}°`);
          return hit.index;
        }),
      );
      // 이름표 위치: 꼭짓점 별들의 평균 방향. 뱀자리는 두 덩어리 사이(뱀주인자리 한가운데)에
      // 놓이지 않게 꼭짓점이 가장 많은 선 하나만 쓴다.
      const basis = id === 'Ser' ? [starLines.reduce((a, b) => (b.length > a.length ? b : a))] : starLines;
      const unique = [...new Set(basis.flat())];
      const sum: Vec3 = [0, 0, 0];
      for (const i of unique) {
        const v = starVec(cat, i);
        sum[0] += v[0];
        sum[1] += v[1];
        sum[2] += v[2];
      }
      const len = Math.hypot(sum[0], sum[1], sum[2]);
      const label = sum.map((x) => Number((x / len).toFixed(5)));
      return { id, rank: ranks.get(id) ?? 3, lines: starLines, label };
    });

  if (misses.length > 0) {
    console.error(`별을 찾지 못한 꼭짓점 ${misses.length}개:\n` + misses.join('\n'));
    process.exit(1);
  }
  const license = readFileSync(resolve(ROOT, 'raw/d3-celestial-LICENSE'), 'utf8').split(/\r?\n/)[0];
  const json = {
    source: 'd3-celestial constellations.lines.json (BSD-3-Clause) — 꼭짓점을 HYG 별 번호로 바꿈',
    copyright: license,
    constellations: out,
  };
  writeFileSync(resolve(ROOT, 'public/data/constellations.json'), JSON.stringify(json));
  const segs = out.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.length - 1, 0), 0);
  console.log(`constellations.json: 별자리 ${out.length}개, 선분 ${segs}개, 꼭짓점-별 최대 거리 ${maxSep.toFixed(4)}°`);
}

main();
