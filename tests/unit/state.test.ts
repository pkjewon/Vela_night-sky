import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadCalibration,
  loadSettings,
  parseUrlParams,
  saveCalibration,
  saveSettings,
} from '../../src/state';
import { cityPlace, CITIES, DEFAULT_PLACE } from '../../src/input/location';
import { isKakaoInApp } from '../../src/ui/start-screen';
import { formatDebug, logError, recentErrors } from '../../src/ui/debug-panel';

/** localStorage 흉내 */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const brokenStorage = {
  getItem() {
    throw new Error('막힘');
  },
  setItem() {
    throw new Error('막힘');
  },
} as unknown as Storage;

describe('URL 파라미터', () => {
  it('t, lat, lon, az, alt, fov, aurora, seed, debug를 읽는다', () => {
    const p = parseUrlParams('?t=2026-12-14T22:00+09:00&lat=37.76&lon=126.78&az=140&alt=35&fov=60&aurora=1&seed=7&debug=1');
    expect(p.t?.toISOString()).toBe('2026-12-14T13:00:00.000Z');
    expect(p).toMatchObject({ lat: 37.76, lon: 126.78, az: 140, alt: 35, fov: 60, aurora: true, seed: 7, debug: '1' });
  });

  it('아무것도 없으면 전부 null', () => {
    expect(parseUrlParams('')).toEqual({
      t: null, lat: null, lon: null, az: null, alt: null, fov: null, aurora: null, seed: null, debug: null,
    });
  });

  it('범위를 벗어난 값은 자르고, 이상한 값은 무시한다', () => {
    const p = parseUrlParams('?fov=5&alt=200&lat=abc&az=-90&aurora=0&debug=table&seed=3.9');
    expect(p.fov).toBe(20);
    expect(p.alt).toBe(90);
    expect(p.lat).toBeNull();
    expect(p.az).toBe(270);
    expect(p.aurora).toBe(false);
    expect(p.debug).toBe('table');
    expect(p.seed).toBe(3);
    expect(parseUrlParams('?fov=500').fov).toBe(100);
  });

  it('같은 URL이면 같은 값', () => {
    const q = '?t=2026-08-12T23:00%2B09:00&lat=33.5&lon=126.5&az=180&alt=40&seed=11';
    expect(parseUrlParams(q)).toEqual(parseUrlParams(q));
  });
});

describe('설정 저장', () => {
  it('기본값: 오로라는 꺼짐, 나머지 연출은 켜짐', () => {
    const s = loadSettings({ aurora: null }, fakeStorage());
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.aurora).toBe(false);
    expect(s.lines && s.names && s.milkyway && s.twinkle && s.meteors).toBe(true);
  });

  it('저장한 설정은 다시 열어도 유지된다', () => {
    const storage = fakeStorage();
    saveSettings({ ...DEFAULT_SETTINGS, lines: false, aurora: true }, storage);
    const s = loadSettings({ aurora: null }, storage);
    expect(s.lines).toBe(false);
    expect(s.aurora).toBe(true);
    expect(s.meteors).toBe(true);
  });

  it('URL의 aurora가 저장된 값보다 우선', () => {
    const storage = fakeStorage();
    saveSettings({ ...DEFAULT_SETTINGS, aurora: false }, storage);
    expect(loadSettings({ aurora: true }, storage).aurora).toBe(true);
    saveSettings({ ...DEFAULT_SETTINGS, aurora: true }, storage);
    expect(loadSettings({ aurora: false }, storage).aurora).toBe(false);
  });

  it('저장소가 막혀 있거나 값이 깨져 있어도 멈추지 않는다', () => {
    expect(loadSettings({ aurora: null }, brokenStorage)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, brokenStorage)).not.toThrow();
    expect(loadSettings({ aurora: null }, fakeStorage({ 'night-sky:settings': '{깨진 값' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ aurora: null }, null)).toEqual(DEFAULT_SETTINGS);
    expect(loadCalibration(brokenStorage)).toBe(0);
    expect(() => saveCalibration(12, brokenStorage)).not.toThrow();
  });

  it('나침반 보정값은 다음에 열어도 유지된다', () => {
    const storage = fakeStorage();
    expect(loadCalibration(storage)).toBe(0);
    saveCalibration(-12.34, storage);
    expect(loadCalibration(storage)).toBeCloseTo(-12.3, 5);
  });

  it('기기에 저장하는 건 설정과 나침반 보정값뿐 (위치는 저장하지 않음)', () => {
    const storage = fakeStorage();
    saveSettings(DEFAULT_SETTINGS, storage);
    saveCalibration(5, storage);
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    expect(keys.sort()).toEqual(['night-sky:compass-offset', 'night-sky:settings']);
    expect(JSON.stringify(Object.fromEntries(keys.map((k) => [k, storage.getItem(k!)])))).not.toMatch(/lat|lon|위치/);
  });
});

describe('위치', () => {
  it('국내 10곳, 기본은 서울', () => {
    expect(CITIES).toHaveLength(10);
    expect(DEFAULT_PLACE.name).toBe('서울');
    expect(CITIES.map((c) => c.name)).toEqual(expect.arrayContaining(['서울', '부산', '제주']));
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThan(33);
      expect(c.lat).toBeLessThan(39);
      expect(c.lon).toBeGreaterThan(125);
      expect(c.lon).toBeLessThan(130);
    }
  });

  it('도시 이름으로 장소를 고른다', () => {
    expect(cityPlace('부산')).toMatchObject({ name: '부산', source: 'city' });
    expect(cityPlace('없는 도시')).toBeNull();
  });
});

describe('디버그·안내', () => {
  it('카카오톡 인앱 브라우저 구분', () => {
    expect(isKakaoInApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KAKAOTALK 11.2.0')).toBe(true);
    expect(isKakaoInApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false);
  });

  it('최근 오류는 5개까지만 남긴다', () => {
    for (let i = 0; i < 8; i++) logError(`오류 ${i}`);
    const errors = recentErrors();
    expect(errors).toHaveLength(5);
    expect(errors[0]).toContain('오류 7');
  });

  it('패널에 센서 값·FPS·오류가 나온다', () => {
    const text = formatDebug({
      fps: 58.6, quality: '높음', pixelRatio: 2, mode: '센서', viewAz: 123.4, viewAlt: 45.6, fov: 70,
      place: '서울', lat: 37.5665, lon: 126.978, time: '12월 14일 22:00', sunAlt: -40,
      sensor: { alpha: 12.3, beta: 91, gamma: -2, compassHeading: 350, compassAccuracy: 15, source: 'ios-compass', compassOffset: 4, screenAngle: 0 },
      totalOffset: -4.5, userOffset: 0, declination: -8.5, secure: true, userAgent: 'test',
    });
    expect(text).toContain('FPS 59');
    expect(text).toContain('alpha 12.3');
    expect(text).toContain('나침반 350.0°');
    expect(text).toContain('±15°');
    expect(text).toContain('방위 123.4°');
    expect(text).toContain('최근 오류');
  });
});
