import { describe, expect, it } from 'vitest';
import { SENTINEL_DAY_MS as DAY } from '../../src/api';
import { dateChipNav, stageStatus } from '../../src/ui/camera-logic';

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
    expect(stageStatus({ live: true, label: 'liveWebrtc', playhead: null }, t, 'de-DE', false, now)).toBe('[nvr.player.liveWebrtc]');
  });
  it('recorded today: label · hh:mm:ss (no day)', () => {
    expect(stageStatus({ live: false, label: 'playing', playhead: now }, t, 'de-DE', false, now)).toBe('[nvr.player.playing] · 12:00:00');
  });
  it('recorded on another day: day prefix', () => {
    const s = stageStatus({ live: false, label: 'paused', playhead: now - DAY }, t, 'de-DE', false, now);
    expect(s.startsWith('[nvr.player.paused] · ')).toBe(true);
    expect(s.endsWith(' 12:00:00')).toBe(true);
    expect(s.length).toBeGreaterThan('[nvr.player.paused] · 12:00:00'.length);
  });
  it('load error wins over the player label', () => {
    expect(stageStatus({ live: true, label: 'live', playhead: null }, t, 'en', true, now)).toBe('[nvr.error.loadFailed]');
  });
});
