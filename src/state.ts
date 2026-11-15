// 설정과 URL 파라미터.
//
// URL 파라미터 (같은 URL이면 같은 화면):
//   t      시각. 예: 2026-12-14T22:00+09:00 (시간대가 없으면 한국 시간). 주면 시간이 그 순간에 멈춘다
//   lat    위도(도)       lon  경도(도)
//   az     바라보는 방위각(도, 북=0 동=90)   alt  고도(도)   fov  시야각(도, 20~100)
//          az나 alt를 주면 시작 화면 없이 바로 드래그 모드로 그 방향을 본다
//   aurora 1이면 오로라 꿈 모드 켜짐, 0이면 꺼짐
//   seed   무작위 연출(반짝임·별똥별·오로라)을 고정하는 숫자. 주면 움직임이 멈춘 한 장면이 된다
//   debug  1이면 디버그 패널, table이면 천체 위치 표
import { parseTimeParam } from './astro/time';
import { FOV_MAX, FOV_MIN } from './astro/projection';

export interface UrlParams {
  t: Date | null;
  lat: number | null;
  lon: number | null;
  az: number | null;
  alt: number | null;
  fov: number | null;
  aurora: boolean | null;
  seed: number | null;
  debug: '1' | 'table' | null;
}

function num(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

export function parseUrlParams(search: string): UrlParams {
  const q = new URLSearchParams(search);
  const aurora = q.get('aurora');
  const debug = q.get('debug');
  const seed = num(q.get('seed'), 0, 2 ** 31 - 1);
  const az = num(q.get('az'), -3600, 3600);
  return {
    // URLSearchParams는 '+'를 공백으로 바꾼다. parseTimeParam이 그 경우도 처리한다
    t: parseTimeParam(q.get('t')),
    lat: num(q.get('lat'), -90, 90),
    lon: num(q.get('lon'), -180, 180),
    az: az === null ? null : ((az % 360) + 360) % 360,
    alt: num(q.get('alt'), -90, 90),
    fov: num(q.get('fov'), FOV_MIN, FOV_MAX),
    aurora: aurora === null ? null : aurora === '1' || aurora === 'true',
    seed: seed === null ? null : Math.floor(seed),
    debug: debug === '1' || debug === 'true' ? '1' : debug === 'table' ? 'table' : null,
  };
}

export interface Settings {
  /** 별자리 선 */
  lines: boolean;
  /** 별자리·행성 이름 */
  names: boolean;
  /** 은하수 */
  milkyway: boolean;
  /** 별 반짝임 */
  twinkle: boolean;
  /** 별똥별 */
  meteors: boolean;
  /** 오로라 꿈 모드 (상상 모드, 기본 꺼짐) */
  aurora: boolean;
  /** 폰 방향 센서로 둘러보기(끄면 드래그) */
  sensor: boolean;
  /** 자기 편각 보정(나침반 북쪽 → 진짜 북쪽) */
  declination: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lines: true,
  names: true,
  milkyway: true,
  twinkle: true,
  meteors: true,
  aurora: false,
  sensor: true,
  declination: true,
};

export type SettingKey = keyof Settings;

const SETTINGS_KEY = 'night-sky:settings';
const CALIBRATION_KEY = 'night-sky:compass-offset';

/** localStorage는 사생활 보호 모드 등에서 막혀 있을 수 있어서 항상 try/catch로 감싼다. */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 저장된 설정(없으면 기본값)에 URL 파라미터를 덮어쓴다. */
export function loadSettings(params: Pick<UrlParams, 'aurora'>, storage: Storage | null = safeStorage()): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
        if (typeof saved[key] === 'boolean') settings[key] = saved[key];
      }
    }
  } catch {
    /* 저장된 값이 깨졌으면 기본값 */
  }
  if (params.aurora !== null) settings.aurora = params.aurora;
  return settings;
}

export function saveSettings(settings: Settings, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 저장이 안 돼도 앱은 계속 동작 */
  }
}

/** 나침반 보정값(도). 기기에 저장하는 건 설정과 이 값뿐이다. */
export function loadCalibration(storage: Storage | null = safeStorage()): number {
  try {
    const n = Number(storage?.getItem(CALIBRATION_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveCalibration(offsetDeg: number, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(CALIBRATION_KEY, String(Math.round(offsetDeg * 10) / 10));
  } catch {
    /* 무시 */
  }
}
