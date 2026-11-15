// 위치: GPS를 허용하면 내 위치, 거부·실패하면 서울 기준 + 도시 선택.
// 위치는 이 기기 안에서 계산에만 쓰고, 어디에도 보내거나 저장하지 않는다.

export interface Place {
  name: string;
  lat: number;
  lon: number;
  /** 어떻게 정해졌는지 */
  source: 'gps' | 'city' | 'url' | 'default';
}

export interface City {
  name: string;
  lat: number;
  lon: number;
}

/** 국내 10곳 */
export const CITIES: City[] = [
  { name: '서울', lat: 37.5665, lon: 126.978 },
  { name: '부산', lat: 35.1796, lon: 129.0756 },
  { name: '인천', lat: 37.4563, lon: 126.7052 },
  { name: '대구', lat: 35.8714, lon: 128.6014 },
  { name: '대전', lat: 36.3504, lon: 127.3845 },
  { name: '광주', lat: 35.1595, lon: 126.8526 },
  { name: '울산', lat: 35.5384, lon: 129.3114 },
  { name: '춘천', lat: 37.8813, lon: 127.7298 },
  { name: '강릉', lat: 37.7519, lon: 128.8761 },
  { name: '제주', lat: 33.4996, lon: 126.5312 },
];

export const DEFAULT_PLACE: Place = { name: '서울', lat: CITIES[0].lat, lon: CITIES[0].lon, source: 'default' };

export function cityPlace(name: string): Place | null {
  const c = CITIES.find((x) => x.name === name);
  return c ? { name: c.name, lat: c.lat, lon: c.lon, source: 'city' } : null;
}

export type LocationResult = { ok: true; place: Place } | { ok: false; reason: 'unsupported' | 'denied' | 'failed' };

/** GPS 위치를 한 번 요청한다. 허용 창이 뜬다. 실패해도 오류를 던지지 않는다. */
export function requestLocation(timeoutMs = 10_000): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    let done = false;
    const finish = (r: LocationResult) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    // 일부 인앱 브라우저는 허용 창도, 실패 응답도 없이 멈춘다 → 직접 시간 제한을 둔다
    const timer = setTimeout(() => finish({ ok: false, reason: 'failed' }), timeoutMs + 1500);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish({
            ok: true,
            place: { name: '내 위치', lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'gps' },
          });
        },
        (err) => {
          clearTimeout(timer);
          finish({ ok: false, reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'failed' });
        },
        // 하늘은 수십 km 차이로는 거의 안 달라지므로 정밀 위치는 필요 없다(배터리 절약)
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
      );
    } catch {
      clearTimeout(timer);
      finish({ ok: false, reason: 'failed' });
    }
  });
}
