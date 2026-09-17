import { describe, it, expect } from 'vitest';
import {
  parseSentinelSetup, sentinelPublicBase, sentinelUrl, sentinelTimelineLink,
  sentinelClassOf, sentinelClassesOf, sentinelEventPlayTs,
  sentinelClipRuns, sentinelClipIndexFor, sentinelMergeDays, sentinelHumanBytes,
  sentinelStorageForecast, type SentinelStats, type SentinelClipsResponse,
} from '../src/index';

describe('setup / URLs', () => {
  it('accepts a bare host and assumes https', () => {
    expect(parseSentinelSetup('192.168.2.120:10443')).toEqual({ origin: 'https://192.168.2.120:10443', token: null });
  });
  it('extracts a token from a pasted embed URL', () => {
    const s = parseSentinelSetup('https://host:10443/endpoint/@local/sentinel-nvr/public/?token=abc&embed=1')!;
    expect(s.origin).toBe('https://host:10443');
    expect(s.token).toBe('abc');
  });
  it('rejects empty / unusable input', () => {
    expect(parseSentinelSetup('')).toBeNull();
    expect(parseSentinelSetup(null)).toBeNull();
    expect(parseSentinelSetup('   ')).toBeNull();
  });
  it('builds the public base and token query', () => {
    const base = sentinelPublicBase('https://host:10443');
    expect(base).toBe('https://host:10443/endpoint/@local/sentinel-nvr/public/');
    expect(sentinelUrl(base, 't k', 'api/stats')).toBe(base + 'api/stats?token=t%20k');
    expect(sentinelUrl(base, '', 'api/stats')).toBe(base + 'api/stats');
    expect(sentinelUrl(base, 'x', 'api/segment?id=1')).toContain('&token=x');
  });
  it('timeline deep link carries the at-fragment', () => {
    expect(sentinelTimelineLink('https://h', '33', 1000)).toContain('#/timeline/33?at=1000');
  });
});

describe('event classification', () => {
  it('primary class falls back to motion', () => {
    expect(sentinelClassOf({ classes: ['car'] })).toBe('car');
    expect(sentinelClassOf({ classes: ['spaceship'] })).toBe('motion');
    expect(sentinelClassOf({})).toBe('motion');
  });
  it('distinct classes in order, never empty', () => {
    expect(sentinelClassesOf({ classes: ['car', 'car', 'person'] })).toEqual(['car', 'person']);
    expect(sentinelClassesOf({ classes: [] })).toEqual(['motion']);
  });
  it('playback start: -2s with a sighting, else -3s', () => {
    expect(sentinelEventPlayTs({ startTs: 10_000, ts: 12_000 })).toBe(8_000);
    expect(sentinelEventPlayTs({ ts: 12_000 })).toBe(9_000);
  });
});

describe('timeline helpers', () => {
  const clips = [
    { id: 'a', startTime: 0, duration: 60_000 },
    { id: 'b', startTime: 60_500, duration: 60_000 },   // 500ms gap → same run
    { id: 'c', startTime: 200_000, duration: 60_000 },  // big gap → new run
  ];
  it('merges runs across small gaps only', () => {
    const runs = sentinelClipRuns(clips);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ s: 0, e: 120_500 });
    expect(runs[1]).toEqual({ s: 200_000, e: 260_000 });
  });
  it('finds the clip covering a timestamp', () => {
    expect(sentinelClipIndexFor(clips, 61_000)).toBe(1);
    expect(sentinelClipIndexFor(clips, 150_000)).toBe(-1);
  });
  it('merges per-day responses sorted', () => {
    const days: Record<number, SentinelClipsResponse> = {
      2: { clips: [{ id: 'y', startTime: 2 }], events: [{ id: 'e2', timestamp: 2, classes: [], score: 0, source: 'motion' }], motion: [[2, 3]], codecs: 'avc1' },
      1: { clips: [{ id: 'x', startTime: 1 }], events: [{ id: 'e1', timestamp: 1, classes: [], score: 0, source: 'motion' }], motion: [[1, 2]] },
    };
    const m = sentinelMergeDays(days);
    expect(m.clips.map(c => c.id)).toEqual(['x', 'y']);
    expect(m.oldestDay).toBe(1);
    expect(m.codecs).toBe('avc1');
  });
});

describe('humanBytes', () => {
  it('scales in binary steps', () => {
    expect(sentinelHumanBytes(0)).toEqual({ value: '0', unit: 'B' });
    expect(sentinelHumanBytes(1536)).toEqual({ value: '1.5', unit: 'KB' });
    expect(sentinelHumanBytes(5 * 1024 ** 3)).toEqual({ value: '5.0', unit: 'GB' });
  });
});

describe('storage forecast', () => {
  const base: SentinelStats = {
    cameras: 1, recording: 1, eventsToday: 0, segments: 100,
    bytes: 100 * 1e9, earliest: 1_700_000_000_000, retentionDays: 30,
    diskFree: 500 * 1e9, diskTotal: 1000 * 1e9, minFreeBytes: 50 * 1e9,
  };
  it('reports reachable when the archive already spans retention', () => {
    const now = base.earliest! + 30 * 24 * 3600 * 1000; // archive spans 30 days
    const f = sentinelStorageForecast(base, now);
    expect(f.ratePerDay).toBeGreaterThan(0);
    expect(f.status).toBe('reachable');
    expect(f.reserve).toBe(50 * 1e9);
  });
  it('is unknown with no rate yet', () => {
    const f = sentinelStorageForecast({ ...base, earliest: undefined }, 1000);
    expect(f.ratePerDay).toBe(0);
    expect(f.status).toBe('unknown');
  });
});
