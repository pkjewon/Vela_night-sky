// e2e 테스트 공통 도구.
// 화면 좌표는 앱의 렌더러와 "따로" 계산한다(src/astro의 순수 계산만 사용).
// 그래서 계산과 화면이 어긋나면 테스트가 잡아낸다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { equatorialToWorldMatrix, eqVecToAzAlt, type AzAlt } from '../../src/astro/coords';
import { projectAzAlt, type View } from '../../src/astro/projection';
import { bodyState, type BodyId } from '../../src/astro/solar-system';
import { findByHip, parseStars, starVec } from '../../src/astro/stars';
import { parseTimeParam } from '../../src/astro/time';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const file = readFileSync(resolve(ROOT, 'public/data/stars.bin'));
export const catalog = parseStars(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

export const PAJU = { lat: 37.76, lon: 126.78 };
export const HIP = { betelgeuse: 27989, rigel: 24436, sirius: 32349, alnilam: 26311, aldebaran: 21421 };

export interface Scene {
  t: string;
  lat: number;
  lon: number;
  az: number;
  alt: number;
  fov: number;
}

/** 고정 장면: 2026-12-14 22:00 (한국 시간), 파주, 오리온자리 방향(삼태성 가운데 별 알닐람을 계산해서 정함). */
export function orionScene(): Scene {
  const t = '2026-12-14T22:00+09:00';
  const p = starAzAlt(HIP.alnilam, t, PAJU.lat, PAJU.lon);
  return { t, ...PAJU, az: Math.round(p.az), alt: Math.round(p.alt), fov: 70 };
}

export function starAzAlt(hip: number, t: string, lat: number, lon: number): AzAlt {
  const date = parseTimeParam(t)!;
  const m = equatorialToWorldMatrix(date, lat, lon);
  const index = findByHip(catalog, hip);
  if (index < 0) throw new Error(`HIP ${hip} 없음`);
  return eqVecToAzAlt(m, starVec(catalog, index));
}

export function bodyAzAlt(id: BodyId, t: string, lat: number, lon: number) {
  return bodyState(id, parseTimeParam(t)!, lat, lon);
}

/** 장면에서 방위각·고도가 화면 어디에 찍혀야 하는지(CSS 픽셀, 굴절 반영). */
export function screenPos(scene: Scene, size: { width: number; height: number }, p: AzAlt) {
  const view: View = { az: scene.az, alt: scene.alt, fov: scene.fov };
  return projectAzAlt(view, size.width, size.height, p, true);
}

export function sceneQuery(scene: Partial<Scene>, extra: Record<string, string | number> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...scene, ...extra })) q.set(k, String(v));
  return `?${q.toString()}`;
}

export async function gotoSky(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
}

export async function waitMilkyWay(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.milkyway === 'ready');
}

/** 앱 내부 상태(자동 테스트용 창구). */
export async function snapshot(page: Page) {
  return page.evaluate(() => window.__nightSky!.snapshot());
}

export interface Shot {
  data: Buffer;
  width: number;
  height: number;
  /** 스크린샷 픽셀 / CSS 픽셀 */
  scale: number;
}

export async function takeShot(page: Page): Promise<Shot> {
  const png = await page.screenshot();
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const viewport = page.viewportSize()!;
  return { data, width: info.width, height: info.height, scale: info.width / viewport.width };
}

/** (x, y) CSS 픽셀 주변 radius 안에서 가장 밝은 픽셀의 밝기(0~255). */
export function maxBrightness(shot: Shot, x: number, y: number, radius = 4): number {
  const cx = Math.round(x * shot.scale);
  const cy = Math.round(y * shot.scale);
  const r = Math.round(radius * shot.scale);
  let max = 0;
  for (let py = Math.max(0, cy - r); py <= Math.min(shot.height - 1, cy + r); py++) {
    for (let px = Math.max(0, cx - r); px <= Math.min(shot.width - 1, cx + r); px++) {
      const o = (py * shot.width + px) * 3;
      max = Math.max(max, (shot.data[o] + shot.data[o + 1] + shot.data[o + 2]) / 3);
    }
  }
  return max;
}

/** 사각 영역의 평균 밝기(0~255)와 평균 색. */
export function averageColor(shot: Shot, x: number, y: number, w: number, h: number) {
  const x0 = Math.round(x * shot.scale);
  const y0 = Math.round(y * shot.scale);
  const x1 = Math.min(shot.width, Math.round((x + w) * shot.scale));
  const y1 = Math.min(shot.height, Math.round((y + h) * shot.scale));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const o = (py * shot.width + px) * 3;
      r += shot.data[o];
      g += shot.data[o + 1];
      b += shot.data[o + 2];
      n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n, brightness: (r + g + b) / (3 * n) };
}

/** 처리되지 않은 오류가 없었는지. */
export async function expectNoErrors(page: Page): Promise<void> {
  expect((await snapshot(page)).errors).toEqual([]);
}

/** 단계별 스크린샷 저장 위치 */
export function shotPath(stage: number, name: string, project: string): string {
  return resolve(ROOT, `docs/screenshots/stage-${stage}/${name}-${project}.jpg`);
}
