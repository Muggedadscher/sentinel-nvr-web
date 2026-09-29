import { describe, it, expect } from 'vitest';
import {
  parseSentinelSetup,
  sentinelPublicBase,
  sentinelUrl,
  sentinelTimelineLink,
  sentinelClassOf,
  sentinelClassesOf,
  sentinelEventHidden,
  sentinelEventPlayTs,
  sentinelEventSpan,
  sentinelDuration,
  sentinelClipRuns,
  sentinelClipIndexFor,
  sentinelMergeDays,
  sentinelHumanBytes,
  sentinelStorageForecast,
  type SentinelStats,
  type SentinelClipsResponse,
} from '../../src/api';

describe('setup / URLs', () => {
  it('accepts a bare host and assumes https', () => {
    expect(parseSentinelSetup('192.0.2.10:10443')).toEqual({
      origin: 'https://192.0.2.10:10443',
      token: null,
      prefix: '',
    });
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
  it('distinct classes by priority, never empty', () => {
    expect(sentinelClassesOf({ classes: ['car', 'car', 'person'] })).toEqual(['person', 'car']);
    expect(sentinelClassesOf({ classes: ['animal', 'bike', 'person'] })).toEqual(['person', 'animal', 'bike']);
    expect(sentinelClassesOf({ classes: [] })).toEqual(['motion']);
  });
  it('primary class by priority, also for alphabetical events of older servers', () => {
    expect(sentinelClassOf({ classes: ['car', 'person'] })).toBe('person'); // cyclist
    expect(sentinelClassOf({ classes: ['animal', 'person'] })).toBe('person');
  });
  it('a filter hides an event only when all its classes are off', () => {
    const cyclist = { classes: ['car', 'person'] };
    expect(sentinelEventHidden(cyclist, { car: true })).toBe(false);
    expect(sentinelEventHidden(cyclist, { car: true, person: true })).toBe(true);
    expect(sentinelEventHidden({ classes: ['car'] }, { car: true })).toBe(true);
  });
  it('playback start: -2s with a sighting, else -3s', () => {
    expect(sentinelEventPlayTs({ startTs: 10_000, ts: 12_000 })).toBe(8_000);
    expect(sentinelEventPlayTs({ ts: 12_000 })).toBe(9_000);
  });
});

describe('timeline helpers', () => {
  const clips = [
    { id: 'a', startTime: 0, duration: 60_000 },
    { id: 'b', startTime: 60_500, duration: 60_000 }, // 500ms gap → same run
    { id: 'c', startTime: 200_000, duration: 60_000 }, // big gap → new run
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
      2: {
        clips: [{ id: 'y', startTime: 2 }],
        events: [{ id: 'e2', timestamp: 2, classes: [], score: 0, source: 'motion' }],
        motion: [[2, 3]],
        codecs: 'avc1',
      },
      1: {
        clips: [{ id: 'x', startTime: 1 }],
        events: [{ id: 'e1', timestamp: 1, classes: [], score: 0, source: 'motion' }],
        motion: [[1, 2]],
      },
    };
    const m = sentinelMergeDays(days);
    expect(m.clips.map((c) => c.id)).toEqual(['x', 'y']);
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
    cameras: 1,
    recording: 1,
    eventsToday: 0,
    segments: 100,
    bytes: 100 * 1e9,
    earliest: 1_700_000_000_000,
    retentionDays: 30,
    diskFree: 500 * 1e9,
    diskTotal: 1000 * 1e9,
    minFreeBytes: 50 * 1e9,
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

describe('SentinelClient base override', () => {
  it('defaults to the public base and accepts a custom base (proxy prefix / login path)', async () => {
    const { SentinelClient } = await import('../../src/api');
    const a = new SentinelClient('https://h:1', 't');
    expect(a.base).toBe('https://h:1/endpoint/@local/sentinel-nvr/public/');
    const b = new SentinelClient('https://h:1', '', { base: 'https://h:1/scrypted/endpoint/@local/sentinel-nvr' });
    expect(b.base).toBe('https://h:1/scrypted/endpoint/@local/sentinel-nvr/');
    expect(b.url('api/stats')).toBe('https://h:1/scrypted/endpoint/@local/sentinel-nvr/api/stats');
    expect(b.signalingUrl('33')).toBe('wss://h:1/scrypted/endpoint/@local/sentinel-nvr/?camera=33&signaling=1');
  });
  it('snapshot URL: optional width before the cache buster', async () => {
    const { SentinelClient } = await import('../../src/api');
    const b = new SentinelClient('https://h:1', '', { base: 'https://h:1/endpoint/@local/sentinel-nvr' });
    expect(b.snapshotUrl('33')).toBe('https://h:1/endpoint/@local/sentinel-nvr/api/snapshot?camera=33');
    expect(b.snapshotUrl('33', 5, 640)).toBe(
      'https://h:1/endpoint/@local/sentinel-nvr/api/snapshot?camera=33&w=640&_=5',
    );
  });
});

describe('reverse-proxy prefix (0.10.0)', () => {
  it('is the path in front of /endpoint/, empty without one', () => {
    expect(parseSentinelSetup('https://proxy.example/scrypted/endpoint/@local/sentinel-nvr/public/?token=t')).toEqual({
      origin: 'https://proxy.example',
      token: 't',
      prefix: '/scrypted',
    });
    expect(parseSentinelSetup('https://host:10443/endpoint/@local/sentinel-nvr/')!.prefix).toBe('');
    expect(parseSentinelSetup('https://host:10443/some/page')!.prefix).toBe('');
  });
  it('goes into the public base', () => {
    expect(sentinelPublicBase('https://proxy.example', '/scrypted/')).toBe(
      'https://proxy.example/scrypted/endpoint/@local/sentinel-nvr/public/',
    );
    expect(sentinelPublicBase('https://h:10443')).toBe('https://h:10443/endpoint/@local/sentinel-nvr/public/');
  });
});

describe('event as a time span (plugin ≥ 1.3.0)', () => {
  const T = 1_790_000_000_000;
  it('spans from the first sighting to the last movement; short events and old servers have none', () => {
    expect(sentinelEventSpan({ timestamp: T, startTs: T - 2000, endTs: T + 40000 })).toEqual({
      start: T - 2000,
      end: T + 40000,
      open: false,
    });
    expect(sentinelEventSpan({ timestamp: T, startTs: T - 1000, endTs: T + 1000 })).toBeUndefined();
    expect(sentinelEventSpan({ timestamp: T, startTs: T - 1000 })).toBeUndefined();
  });
  it('a running event reaches up to now', () => {
    expect(sentinelEventSpan({ timestamp: T, startTs: T - 1000, endTs: T + 5000, open: true }, T + 60000)).toEqual({
      start: T - 1000,
      end: T + 60000,
      open: true,
    });
  });
  it('formats a duration as m:ss or h:mm:ss', () => {
    expect(sentinelDuration(42000)).toBe('0:42');
    expect(sentinelDuration(185000)).toBe('3:05');
    expect(sentinelDuration(3723000)).toBe('1:02:03');
  });
});
