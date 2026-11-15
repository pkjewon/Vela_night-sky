// 디버그 패널(?debug=1). 아이폰 사파리의 개발자 도구는 Mac에서만 열리므로,
// Windows에서 개발할 때는 이 패널이 폰에서 난 일을 볼 수 있는 유일한 수단이다.
import type { SensorReading } from '../input/orientation';

const MAX_ERRORS = 5;
const errors: string[] = [];

/** 최근 오류를 기록한다. 패널을 켜지 않아도 항상 모은다. */
export function logError(message: string): void {
  const time = new Date().toTimeString().slice(0, 8);
  errors.unshift(`${time} ${message}`.slice(0, 160));
  if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS;
}

export function recentErrors(): string[] {
  return [...errors];
}

/** 처리되지 않은 오류를 모두 기록한다(흰 화면 대신 패널에 남게). */
export function installErrorLog(): void {
  window.addEventListener('error', (e) => logError(e.message || '알 수 없는 오류'));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | string | undefined;
    logError(typeof reason === 'string' ? reason : (reason?.message ?? '처리되지 않은 오류'));
  });
}

export interface DebugInfo {
  fps: number;
  quality: string;
  pixelRatio: number;
  mode: string;
  viewAz: number;
  viewAlt: number;
  fov: number;
  place: string;
  lat: number;
  lon: number;
  time: string;
  sunAlt: number;
  sensor: SensorReading;
  totalOffset: number;
  userOffset: number;
  declination: number;
  secure: boolean;
  userAgent: string;
}

const f = (n: number | null, digits = 1) => (n === null || Number.isNaN(n) ? '—' : n.toFixed(digits));

export function formatDebug(d: DebugInfo): string {
  const s = d.sensor;
  return [
    `FPS ${f(d.fps, 0)} · 화질 ${d.quality} (배율 ${f(d.pixelRatio, 2)})`,
    `모드 ${d.mode} · 시점 방위 ${f(d.viewAz)}° 고도 ${f(d.viewAlt)}° 시야 ${f(d.fov, 0)}°`,
    `센서 alpha ${f(s.alpha)} beta ${f(s.beta)} gamma ${f(s.gamma)} 화면 ${s.screenAngle}°`,
    `나침반 ${f(s.compassHeading)}° 정확도 ±${f(s.compassAccuracy, 0)}° (${s.source})`,
    `보정 합계 ${f(d.totalOffset)}° = 나침반 ${f(s.compassOffset)} + 편각 ${f(d.declination)} + 손 ${f(d.userOffset)}`,
    `${d.place} ${f(d.lat, 3)}, ${f(d.lon, 3)} · ${d.time} · 해 고도 ${f(d.sunAlt)}°`,
    `https ${d.secure ? '예' : '아니오'} · ${d.userAgent.slice(0, 70)}`,
    ...(errors.length ? ['최근 오류:', ...errors.map((e) => ` ${e}`)] : ['오류 없음']),
  ].join('\n');
}

export class DebugPanel {
  private readonly root = document.getElementById('debug')!;
  private last = 0;

  constructor(readonly enabled: boolean) {
    this.root.hidden = !enabled;
  }

  /** 1초에 4번쯤만 다시 쓴다. */
  update(now: number, info: () => DebugInfo): void {
    if (!this.enabled || now - this.last < 250) return;
    this.last = now;
    this.root.textContent = formatDebug(info());
  }
}
