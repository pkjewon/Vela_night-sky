import { describe, expect, it } from 'vitest';
import { fromKST, parseTimeParam, toKST, toKSTIso, yearsSinceJ2000 } from '../../src/astro/time';

describe('시간 변환 (KST ↔ UTC)', () => {
  it('한국 시간 22:00은 세계시 13:00', () => {
    const d = parseTimeParam('2026-12-14T22:00+09:00');
    expect(d?.toISOString()).toBe('2026-12-14T13:00:00.000Z');
  });

  it("URL에서 '+'가 공백으로 바뀌어도 해석한다", () => {
    const d = parseTimeParam('2026-12-14T22:00 09:00');
    expect(d?.toISOString()).toBe('2026-12-14T13:00:00.000Z');
  });

  it('시간대가 없으면 한국 시간으로 본다', () => {
    expect(parseTimeParam('2026-12-14T22:00')?.toISOString()).toBe('2026-12-14T13:00:00.000Z');
    expect(parseTimeParam('2026-12-14')?.toISOString()).toBe('2026-12-13T15:00:00.000Z');
  });

  it('Z(세계시)와 음수 시간대', () => {
    expect(parseTimeParam('2026-06-21T15:00:00Z')?.toISOString()).toBe('2026-06-21T15:00:00.000Z');
    expect(parseTimeParam('2026-06-21T10:00-05:00')?.toISOString()).toBe('2026-06-21T15:00:00.000Z');
  });

  it('이상한 값은 null', () => {
    expect(parseTimeParam('')).toBeNull();
    expect(parseTimeParam('내일')).toBeNull();
    expect(parseTimeParam(null)).toBeNull();
  });

  it('자정을 넘는 날짜 바뀜: 세계시 15:30 → 한국 다음 날 00:30', () => {
    const p = toKST(new Date('2026-12-31T15:30:00Z'));
    expect(p).toEqual({ year: 2027, month: 1, day: 1, hour: 0, minute: 30 });
  });

  it('fromKST와 toKST는 서로 되돌린다', () => {
    const d = fromKST(2026, 3, 1, 5, 45);
    expect(d.toISOString()).toBe('2026-02-28T20:45:00.000Z');
    expect(toKST(d)).toEqual({ year: 2026, month: 3, day: 1, hour: 5, minute: 45 });
    expect(toKSTIso(d)).toBe('2026-03-01T05:45+09:00');
    expect(parseTimeParam(toKSTIso(d))?.getTime()).toBe(d.getTime());
  });

  it('J2000부터 지난 햇수', () => {
    expect(yearsSinceJ2000(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(0, 6);
    expect(yearsSinceJ2000(new Date('2026-07-02T12:00:00Z'))).toBeCloseTo(26.5, 1);
  });
});
