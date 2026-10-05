/** Clip download rules: event range, proposal, bounds, edges, coverage, hints, delivery way, errors, ambiguous times. */
import { describe, expect, it } from 'vitest';
import {
  CLIP_BLOB_MAX,
  CLIP_MAX_MS,
  CLIP_SHARE_MAX,
  clampClipRange,
  clipCoverage,
  clipErrorKind,
  clipHints,
  clipLength,
  clipProposal,
  clipRangeForEvent,
  clipSetEdge,
  clipWays,
  isCrossOrigin,
} from '../../src/ui/clip-logic';

const S = 1000,
  MIN = 60_000,
  H = 3600_000;
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const seg = (start: number, dur = MIN) => ({ id: `s${start}`, startTime: start, duration: dur });
/** one-minute segments covering [a, b) without gaps */
const segs = (a: number, b: number) => {
  const out = [];
  for (let t = a; t < b; t += MIN) out.push(seg(t, Math.min(MIN, b - t)));
  return out;
};

describe('clipRangeForEvent', () => {
  it('a short event (no span, < 3 s) still gets ±5 s', () => {
    const t = NOW - 10 * MIN;
    expect(clipRangeForEvent({ timestamp: t, startTs: t - 1 * S, endTs: t + 1 * S }, NOW)).toEqual({
      from: t - 6 * S,
      to: t + 6 * S,
      open: false,
    });
  });
  it('an event without endTs (server before 1.3.0) ends at its trigger + 5 s', () => {
    const t = NOW - 10 * MIN;
    expect(clipRangeForEvent({ timestamp: t }, NOW)).toEqual({ from: t - 5 * S, to: t + 5 * S, open: false });
  });
  it('an event before 1.3.0 whose startTs (first sighting) lies 2 h earlier starts at most 10 s before the trigger', () => {
    const t = NOW - 10 * MIN;
    const r = clipRangeForEvent({ timestamp: t, startTs: t - 2 * H, endTs: t + 20 * S }, NOW);
    expect(r.from).toBe(t - 10 * S - 5 * S);
    expect(r.to).toBe(t + 25 * S);
  });
  it('the movement phase (startTs ≤ 10 s before the trigger) is kept', () => {
    const t = NOW - 10 * MIN;
    expect(clipRangeForEvent({ timestamp: t, startTs: t - 4 * S, endTs: t + 30 * S }, NOW).from).toBe(t - 9 * S);
  });
  it('a running event reaches now (+5 s) and says so', () => {
    const t = NOW - 40 * S;
    expect(clipRangeForEvent({ timestamp: t, startTs: t - 2 * S, endTs: t + 10 * S, open: true }, NOW)).toEqual({
      from: t - 7 * S,
      to: NOW + 5 * S,
      open: true,
    });
  });
  it('a startTs after the trigger is ignored', () => {
    const t = NOW - 10 * MIN;
    expect(clipRangeForEvent({ timestamp: t, startTs: t + 3 * S }, NOW).from).toBe(t - 5 * S);
  });
});

describe('clampClipRange', () => {
  it('cuts the end to now − 10 s and the start to the oldest recording', () => {
    expect(clampClipRange({ from: NOW - 2 * MIN, to: NOW + 5 * S }, { now: NOW, oldest: NOW - MIN })).toEqual({
      from: NOW - MIN,
      to: NOW - 10 * S,
    });
  });
  it('caps a proposal at 30 min (the start stays), not a hand-made range', () => {
    const r = { from: NOW - 2 * H, to: NOW - H };
    expect(clampClipRange(r, { now: NOW })).toEqual({ from: r.from, to: r.from + CLIP_MAX_MS });
    expect(clampClipRange(r, { now: NOW, cap: false })).toEqual(r);
  });
  it('never turns upside down', () => {
    const r = clampClipRange({ from: NOW - 5 * S, to: NOW }, { now: NOW });
    expect(r.from).toBeLessThanOrEqual(r.to);
  });
});

describe('clipProposal (info-bar button)', () => {
  const ev = { timestamp: NOW - 30 * MIN, startTs: NOW - 30 * MIN - 3 * S, endTs: NOW - 30 * MIN + 20 * S };
  it('live: the last minute up to now − 10 s', () => {
    expect(clipProposal({ live: true, playhead: null, now: NOW, events: [ev] })).toEqual({
      from: NOW - 70 * S,
      to: NOW - 10 * S,
      open: false,
    });
  });
  it('playback inside an event: that event', () => {
    const r = clipProposal({ live: false, playhead: ev.timestamp + 5 * S, now: NOW, events: [ev] });
    expect(r).toEqual({ ...clipRangeForEvent(ev, NOW), open: false });
  });
  it('playback outside events: position ± 30 s', () => {
    const p = NOW - 2 * H;
    expect(clipProposal({ live: false, playhead: p, now: NOW, events: [ev] })).toEqual({
      from: p - 30 * S,
      to: p + 30 * S,
      open: false,
    });
  });
  it('overlapping events: the newest one that contains the position', () => {
    const a = { timestamp: NOW - 10 * MIN, endTs: NOW - 10 * MIN + 20 * S };
    const b = { timestamp: NOW - 10 * MIN + 15 * S, endTs: NOW - 10 * MIN + 40 * S };
    const r = clipProposal({ live: false, playhead: NOW - 10 * MIN + 16 * S, now: NOW, events: [a, b] });
    expect(r.from).toBe(clipRangeForEvent(b, NOW).from);
  });
  it('near now: ±30 s is cut at now − 10 s; at the archive start at the oldest recording', () => {
    expect(clipProposal({ live: false, playhead: NOW - 20 * S, now: NOW, events: [] }).to).toBe(NOW - 10 * S);
    const old = NOW - 3 * H;
    expect(clipProposal({ live: false, playhead: old + 5 * S, now: NOW, events: [], oldest: old }).from).toBe(old);
  });
});

describe('clipSetEdge', () => {
  const r = { from: 100 * S, to: 200 * S };
  it('moves one edge', () => {
    expect(clipSetEdge(r, 'from', 120 * S)).toEqual({ range: { from: 120 * S, to: 200 * S }, edge: 'from' });
    expect(clipSetEdge(r, 'to', 150 * S)).toEqual({ range: { from: 100 * S, to: 150 * S }, edge: 'to' });
  });
  it('passing the other edge swaps the roles', () => {
    expect(clipSetEdge(r, 'from', 250 * S)).toEqual({ range: { from: 200 * S, to: 250 * S }, edge: 'to' });
    expect(clipSetEdge(r, 'to', 50 * S)).toEqual({ range: { from: 50 * S, to: 100 * S }, edge: 'from' });
  });
});

describe('clipCoverage / clipHints', () => {
  const day = NOW - 3 * H;
  it('no gap in a continuous recording; a 30-s hole is one', () => {
    const clips = segs(day, day + 10 * MIN);
    expect(clipCoverage(clips, { from: day + MIN, to: day + 5 * MIN })).toEqual({ covered: 4 * MIN, gaps: [] });
    const holed = [...segs(day, day + 2 * MIN), ...segs(day + 2 * MIN + 30 * S, day + 5 * MIN)];
    const c = clipCoverage(holed, { from: day + MIN, to: day + 4 * MIN });
    expect(c.gaps).toEqual([[day + 2 * MIN, day + 2 * MIN + 30 * S]]);
    expect(c.covered).toBe(3 * MIN - 30 * S);
  });
  it('a hole of 1 s is no gap (the band draws one run, too)', () => {
    const clips = [seg(day, MIN - S), seg(day + MIN)];
    expect(clipCoverage(clips, { from: day, to: day + 2 * MIN }).gaps).toEqual([]);
  });
  it('hints: too long, no recording, gaps, end not recorded yet', () => {
    const clips = segs(day, NOW);
    expect(clipHints({ from: day, to: day + 31 * MIN }, clips, NOW)).toMatchObject({ tooLong: true, canCreate: false });
    expect(clipHints({ from: day - 2 * H, to: day - H }, clips, NOW)).toMatchObject({
      noRecording: true,
      canCreate: false,
    });
    const holed = [...segs(day, day + 2 * MIN), ...segs(day + 3 * MIN, day + 5 * MIN)];
    expect(clipHints({ from: day + MIN, to: day + 4 * MIN }, holed, NOW)).toMatchObject({
      gaps: true,
      canCreate: true,
    });
    const h = clipHints({ from: NOW - MIN, to: NOW + 5 * S }, clips, NOW);
    expect(h).toMatchObject({ endsAt: NOW - 10 * S, canCreate: true, tooLong: false });
  });
  it('exactly 30 min may be created', () => {
    expect(clipHints({ from: day, to: day + CLIP_MAX_MS }, segs(day, NOW), NOW).canCreate).toBe(true);
  });
  it('length as m:ss', () => {
    expect(clipLength({ from: 0, to: 88 * S })).toBe('1:28');
    expect(clipLength({ from: 0, to: 30 * MIN })).toBe('30:00');
  });
});

describe('clipWays (how the file reaches the viewer)', () => {
  const small = 20 * 1024 * 1024,
    big = CLIP_SHARE_MAX + 1;
  it('desktop / Android without file sharing: a link (Content-Disposition), nothing loaded into the page', () => {
    expect(clipWays({ bytes: small, canShareFiles: false, standalone: false })).toEqual({
      prefetch: false,
      share: false,
      save: 'link',
    });
  });
  it('Safari / Android with file sharing: prefetch for Share, save via the link', () => {
    expect(clipWays({ bytes: small, canShareFiles: true, standalone: false })).toEqual({
      prefetch: true,
      share: true,
      save: 'link',
    });
  });
  it('above 100 MB no Share (a blob of that size lives in the tab)', () => {
    expect(clipWays({ bytes: big, canShareFiles: true, standalone: false })).toEqual({
      prefetch: false,
      share: false,
      save: 'link',
    });
  });
  it('Home-Screen app: blob + <a download>, Share when possible; too large → Safari', () => {
    expect(clipWays({ bytes: small, canShareFiles: true, standalone: true })).toEqual({
      prefetch: true,
      share: true,
      save: 'blob',
    });
    expect(clipWays({ bytes: small, canShareFiles: false, standalone: true }).save).toBe('blob');
    expect(clipWays({ bytes: big, canShareFiles: true, standalone: true })).toEqual({
      prefetch: false,
      share: false,
      save: 'safari',
    });
  });
});

describe('clipWays on another origin (package inside a host such as HAPulse)', () => {
  const MB = 1024 * 1024;
  it('up to 200 MB the file is loaded to save it (download is ignored across origins); Share only up to 100 MB', () => {
    expect(clipWays({ bytes: 20 * MB, canShareFiles: false, standalone: false, crossOrigin: true })).toEqual({
      prefetch: true,
      share: false,
      save: 'blob',
    });
    expect(clipWays({ bytes: 20 * MB, canShareFiles: true, standalone: false, crossOrigin: true }).share).toBe(true);
    expect(clipWays({ bytes: 150 * MB, canShareFiles: true, standalone: false, crossOrigin: true })).toEqual({
      prefetch: true,
      share: false,
      save: 'blob',
    });
    expect(clipWays({ bytes: CLIP_BLOB_MAX, canShareFiles: false, standalone: false, crossOrigin: true }).save).toBe(
      'blob',
    );
  });
  it('above 200 MB or unknown size: a new tab, never the same tab', () => {
    for (const bytes of [CLIP_BLOB_MAX + 1, 0])
      expect(clipWays({ bytes, canShareFiles: true, standalone: false, crossOrigin: true })).toEqual({
        prefetch: false,
        share: false,
        save: 'tab',
      });
  });
  it('a Home-Screen app keeps its own rule (blob up to 100 MB, else Safari)', () => {
    expect(clipWays({ bytes: 150 * MB, canShareFiles: true, standalone: true, crossOrigin: true }).save).toBe('safari');
  });
  it('isCrossOrigin', () => {
    const base = 'https://hapulse.example/nvr/33';
    expect(isCrossOrigin('https://nvr.example/api/export-file?id=1', base)).toBe(true);
    expect(isCrossOrigin('/endpoint/@local/sentinel-nvr/api/export-file?id=1', base)).toBe(false);
    expect(isCrossOrigin('api/export-file?id=1', base)).toBe(false);
    expect(isCrossOrigin('https://hapulse.example:8443/x', base)).toBe(true);
  });
});

describe('clipErrorKind', () => {
  it('maps the server errors', () => {
    expect(clipErrorKind(429, 'busy')).toBe('busy');
    expect(clipErrorKind(507, 'no space')).toBe('noSpace');
    expect(clipErrorKind(404, 'no recording')).toBe('noRecording');
    expect(clipErrorKind(413, 'too long')).toBe('tooLong');
    expect(clipErrorKind(409, 'stream change')).toBe('streamChange');
    expect(clipErrorKind(404, 'unknown export')).toBe('expired');
    expect(clipErrorKind(404, 'unknown camera')).toBe('failed');
    expect(clipErrorKind(404, undefined)).toBe('oldServer');
    expect(clipErrorKind(503, 'storage')).toBe('failed');
    expect(clipErrorKind(0, undefined)).toBe('failed');
  });
});
