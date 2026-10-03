import { describe, expect, it } from 'vitest';
import { SENTINEL_DAY_MS as DAY } from '../../src/api';
import { dateChipNav, GESTURE_STALE_MS, stageStatus, todayRefreshAllowed } from '../../src/ui/camera-logic';

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
