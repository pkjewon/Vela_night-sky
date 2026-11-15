// 시간 다루기: URL의 t 파라미터 해석, 한국 시간(KST) 표시.
// 내부에서는 항상 JS Date(= 세계시 UTC 기준 밀리초)를 쓴다.

const KST_OFFSET_MIN = 9 * 60;

/**
 * URL의 t 값을 Date로 바꾼다.
 * - "2026-12-14T22:00+09:00" 같은 ISO 형식
 * - URL에서 '+'가 공백으로 바뀐 "2026-12-14T22:00 09:00"도 허용
 * - 시간대가 없으면 한국 시간(KST)으로 본다
 * 해석할 수 없으면 null.
 */
export function parseTimeParam(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  let s = raw.trim();
  // "...T22:00 09:00" → "...T22:00+09:00"
  s = s.replace(/ (\d{2}:?\d{2})$/, '+$1');
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', sec = '00', tz] = m;
  let offsetMin = KST_OFFSET_MIN;
  if (tz) {
    if (tz.toUpperCase() === 'Z') offsetMin = 0;
    else {
      const sign = tz[0] === '-' ? -1 : 1;
      const digits = tz.slice(1).replace(':', '');
      offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    }
  }
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)) - offsetMin * 60_000;
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface ClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** UTC 시각을 한국 시간(KST, UTC+9)의 연·월·일·시·분으로 바꾼다. */
export function toKST(date: Date): ClockParts {
  const shifted = new Date(date.getTime() + KST_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 한국 시간의 연·월·일·시·분을 UTC Date로 바꾼다. */
export function fromKST(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MIN * 60_000);
}

/** URL에 넣을 수 있는 KST ISO 문자열 (예: 2026-12-14T22:00+09:00). */
export function toKSTIso(date: Date): string {
  const p = toKST(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}+09:00`;
}

/** 화면 표시용: "12월 14일 22:00" (보는 사람 기기의 시간대 기준). */
export function formatLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** J2000.0(2000-01-01 12:00)부터 지난 율리우스년 수. 고유운동 계산용이라 UTC/TT 차이는 무시. */
export function yearsSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86_400_000);
}
