// Calendar-day arithmetic across the DST changes of 2026 (Europe/Berlin): 29.03. has 23 h, 25.10. has 25 h.
process.env.TZ = 'Europe/Berlin';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  sentinelAddDays as addDays, sentinelAtTime as atTime, sentinelDayEnd as dayEnd, sentinelDayOf as dayOf,
  sentinelMergeDays, sentinelWallMarks as wallMarks, sentinelWallSeconds,
} from '../../src/api';
import { dateChipNav } from '../../src/ui/camera-logic';

const H = 3600_000;
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min).getTime();

describe('time zone of this test file', () => {
  it('really is Europe/Berlin (else the DST cases below would test nothing)', () => {
    expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).toBe(-120); // CEST
    expect(new Date(2026, 9, 26, 12).getTimezoneOffset()).toBe(-60);  // CET
  });
});

describe('calendar days', () => {
  it('addDays lands on local midnight across both DST changes', () => {
    expect(addDays(d(2026, 10, 25), 1)).toBe(d(2026, 10, 26));
    expect(addDays(d(2026, 10, 25), 1) - d(2026, 10, 25)).toBe(25 * H);
    expect(addDays(d(2026, 3, 29), 1) - d(2026, 3, 29)).toBe(23 * H);
    expect(addDays(d(2026, 10, 26), -1)).toBe(d(2026, 10, 25));
    expect(addDays(d(2026, 10, 25, 13, 5), 0)).toBe(d(2026, 10, 25));
    // the old ±24 h: 25.10. + 24 h is 23:00 of the SAME day
    expect(dayOf(d(2026, 10, 25) + 24 * H)).toBe(d(2026, 10, 25));
  });
  it('dayEnd and atTime use the wall clock', () => {
    expect(dayEnd(d(2026, 10, 25, 9))).toBe(d(2026, 10, 26));
    expect(new Date(atTime(d(2026, 10, 25), 14, 0)).getHours()).toBe(14);
    expect(new Date(atTime(d(2026, 3, 29), 14, 30)).getHours()).toBe(14);
    // midnight + 14 h would be 13:00 on 25.10.
    expect(new Date(d(2026, 10, 25) + 14 * H).getHours()).toBe(13);
  });
  it('date chip arrows on the day after the change', () => {
    expect(dateChipNav(d(2026, 10, 26), d(2026, 10, 25), d(2026, 10, 27)).prevDisabled).toBe(false);
    expect(dateChipNav(d(2026, 10, 26), d(2026, 10, 26), d(2026, 10, 27)).prevDisabled).toBe(true);
    expect(dateChipNav(d(2026, 10, 26), d(2026, 10, 1), d(2026, 10, 26)).nextDisabled).toBe(true);
  });
});

describe('wall-clock marks (timeline axis)', () => {
  const hours = (ts: number[]) => ts.map((t) => new Date(t).getHours());
  it('a 3-h step marks 00/03/…/21 local time, also on the 25-h day', () => {
    expect(hours(wallMarks(d(2026, 9, 20), d(2026, 9, 21) - 1, 3 * H))).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    const oct25 = wallMarks(d(2026, 10, 25), d(2026, 10, 26) - 1, 3 * H);
    expect(hours(oct25)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(new Set(oct25).size).toBe(oct25.length);
  });
  it('the missing hour of 29.03. gets no mark, the order stays ascending', () => {
    const marks = wallMarks(d(2026, 3, 29), d(2026, 3, 30) - 1, H);
    expect(marks).toHaveLength(23);
    expect(hours(marks)).not.toContain(2);
    expect(marks.every((t, i) => i === 0 || t > marks[i - 1]!)).toBe(true);
  });
  it('fine steps inside a window, and label detection by wall seconds', () => {
    const from = d(2026, 10, 25, 14, 0), to = d(2026, 10, 25, 14, 3);
    const marks = wallMarks(from, to, 15_000);
    expect(marks).toHaveLength(13);
    expect(sentinelWallSeconds(marks[0]!) % 60).toBe(0);
  });
  it('bounded', () => {
    expect(wallMarks(d(2026, 1, 1), d(2027, 1, 1), 60_000, 100)).toHaveLength(100);
  });
});

describe('sentinelMergeDays', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps a clip, an event and a motion span that come with two days once', () => {
    const clip = { id: '33|seg-20261025-235930Z.mp4', startTime: d(2026, 10, 25, 23, 59), duration: 60_000 };
    const ev = { id: 'e1', timestamp: d(2026, 10, 25, 23, 59, ), classes: ['person'], score: 0.9, source: 'object' as const };
    const m = sentinelMergeDays({
      [d(2026, 10, 25)]: { clips: [clip], events: [ev], motion: [[d(2026, 10, 25, 23, 58), d(2026, 10, 26, 0, 1)]] },
      [d(2026, 10, 26)]: { clips: [clip], events: [ev], motion: [[d(2026, 10, 25, 23, 58), d(2026, 10, 26, 0, 1)], [d(2026, 10, 26, 0, 0), d(2026, 10, 26, 0, 3)]] },
    });
    expect(m.clips).toHaveLength(1);
    expect(m.events).toHaveLength(1);
    expect(m.motion).toEqual([[d(2026, 10, 25, 23, 58), d(2026, 10, 26, 0, 3)]]);
    expect(m.oldestDay).toBe(d(2026, 10, 25));
  });
});
