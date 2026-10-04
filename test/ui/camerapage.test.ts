import { describe, expect, it } from 'vitest';
import { SENTINEL_DAY_MS as DAY } from '../../src/api';
import {
  dateChipNav,
  eventsOnDay,
  GESTURE_STALE_MS,
  stageStatus,
  todayRefreshAllowed,
} from '../../src/ui/camera-logic';

const t = (k: string) => `[${k}]`;
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe('dateChipNav', () => {
  it('disables "next" on today and "prev" at the retention floor', () => {
    const today = day(2026, 9, 22);
    expect(dateChipNav(today, -Infinity, today)).toEqual({ prevDisabled: false, nextDisabled: true });
    expect(dateChipNav(today - DAY, -Infinity, today)).toEqual({ prevDisabled: false, nextDisabled: false });
    expect(dateChipNav(today - 2 * DAY, today - 2 * DAY, today)).toEqual({ prevDisabled: true, nextDisabled: false });
  });
});

describe('stageStatus', () => {
  const now = day(2026, 9, 22) + 12 * 3600e3;
  it('live: the translated label only', () => {
    expect(stageStatus({ live: true, label: 'liveWebrtc', playhead: null }, t, 'de-DE', false, now)).toBe(
      '[nvr.player.liveWebrtc]',
    );
  });
  it('recorded today: label · hh:mm:ss (no day)', () => {
    expect(stageStatus({ live: false, label: 'playing', playhead: now }, t, 'de-DE', false, now)).toBe(
      '[nvr.player.playing] · 12:00:00',
    );
  });
  it('recorded on another day: day prefix', () => {
    const s = stageStatus({ live: false, label: 'paused', playhead: now - DAY }, t, 'de-DE', false, now);
    expect(s.startsWith('[nvr.player.paused] · ')).toBe(true);
    expect(s.endsWith(' 12:00:00')).toBe(true);
    expect(s.length).toBeGreaterThan('[nvr.player.paused] · 12:00:00'.length);
  });
  it('load error wins over the player label', () => {
    expect(stageStatus({ live: true, label: 'live', playhead: null }, t, 'en', true, now)).toBe(
      '[nvr.error.loadFailed]',
    );
  });
});

describe('todayRefreshAllowed (15-s refresh of today)', () => {
  const now = 1_790_000_000_000;
  const base = { hidden: false, gestureAt: 0, settling: false, now };
  it('runs live, during playback and paused alike (the player state is not an input)', () => {
    expect(todayRefreshAllowed(base)).toBe(true);
  });
  it('waits while a timeline gesture runs', () => {
    expect(todayRefreshAllowed({ ...base, gestureAt: now - 200 })).toBe(false);
    expect(todayRefreshAllowed({ ...base, gestureAt: now - GESTURE_STALE_MS + 1 })).toBe(false);
  });
  it('a gesture that never ended stops blocking after GESTURE_STALE_MS', () => {
    expect(todayRefreshAllowed({ ...base, gestureAt: now - GESTURE_STALE_MS })).toBe(true);
  });
  it('waits while the last gesture settles on its target', () => {
    expect(todayRefreshAllowed({ ...base, settling: true })).toBe(false);
  });
  it('skips a hidden tab', () => {
    expect(todayRefreshAllowed({ ...base, hidden: true })).toBe(false);
  });
});

describe('eventsOnDay', () => {
  it('counts only the events of the given local day, midnight belongs to the new day', () => {
    const d = day(2026, 10, 4);
    const evs = [d - 1, d, d + 12 * 3600e3, day(2026, 10, 5) - 1, day(2026, 10, 5)].map((timestamp) => ({ timestamp }));
    expect(eventsOnDay(evs, d)).toBe(3);
    expect(eventsOnDay(evs, day(2026, 10, 3))).toBe(1);
    expect(eventsOnDay(evs, day(2026, 10, 5))).toBe(1);
    expect(eventsOnDay([], d)).toBe(0);
  });
  it('the 25-hour day at the end of daylight saving time is one day', () => {
    const d = day(2026, 10, 25);
    const evs = [d + 1000, d + 24.5 * 3600e3].map((timestamp) => ({ timestamp }));
    // in zones with DST the second event (00:30 + 24.5 h) is still on the 25th only if that day has 25 hours
    const long = day(2026, 10, 26) - d > DAY;
    expect(eventsOnDay(evs, d)).toBe(long ? 2 : 1);
  });
});
