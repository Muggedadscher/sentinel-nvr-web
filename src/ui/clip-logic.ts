/**
 * DOM-free rules of the clip download (camera page "Download clip"): the range an event gives, the range the info-bar
 * button proposes, the bounds, setting an edge, what the loaded recordings say about a range, and which way the finished
 * file reaches the viewer. The plugin cuts the clip (`api/export`, plugin with `features: ["export"]`).
 */
import { sentinelClipRuns, sentinelDuration, type SentinelClip, type SentinelEvent } from '../api';

/** Longest clip (the plugin answers 413 above it). */
export const CLIP_MAX_MS = 30 * 60_000;
/** Padding before and after an event. */
export const CLIP_PAD_MS = 5_000;
/** An event's range starts at most this long before its trigger — the plugin's START_LEAD_MS (events up to plugin 1.3.0
 *  carry the FIRST SIGHTING as `startTs`, for a long-parked car hours before the trigger). */
export const CLIP_LEAD_MS = 10_000;
/** The plugin cuts `to` to "now − 10 s" (the newest fragment is still being written). */
export const CLIP_LIVE_EDGE_MS = 10_000;
/** Info-bar proposal around the playback position (± this). */
export const CLIP_AROUND_MS = 30_000;
/** Info-bar proposal while live: the last minute. */
export const CLIP_LIVE_MS = 60_000;
/** Gaps shorter than this are no gap (the recording band draws them as one run, too). */
export const CLIP_GAP_MS = 2_000;
/** Largest file loaded into the page for "Share" / a Home-Screen app (a blob plus its File copy live in the tab). */
export const CLIP_SHARE_MAX = 100 * 1024 * 1024;
/** Status poll interval of a running export. */
export const CLIP_POLL_MS = 700;

export interface ClipRange {
  from: number;
  to: number;
}
export type ClipEdge = 'from' | 'to';

/**
 * Range of an event as a clip: from its start (never more than CLIP_LEAD_MS before the trigger) to its end (a running
 * event: now), each padded by CLIP_PAD_MS. Not `sentinelEventSpan`: that is undefined for events under 3 s and without
 * `endTs`, and takes the first sighting as the start.
 */
export function clipRangeForEvent(
  ev: Pick<SentinelEvent, 'timestamp' | 'startTs' | 'endTs' | 'open'>,
  now: number = Date.now(),
): ClipRange & { open: boolean } {
  const t = ev.timestamp;
  const start = Math.max(Math.min(ev.startTs ?? t, t), t - CLIP_LEAD_MS);
  const open = !!ev.open;
  const end = open ? Math.max(now, ev.endTs ?? t) : Math.max(ev.endTs ?? t, t);
  return { from: start - CLIP_PAD_MS, to: end + CLIP_PAD_MS, open };
}

/**
 * Keep a range inside what can be exported: not before the oldest recording (when known), not after "now − 10 s", and
 * (`cap`) at most CLIP_MAX_MS long (the end moves; an event's start matters more). For PROPOSALS — a range the viewer
 * set by hand is shown as it is, with hints (`clipHints`).
 */
export function clampClipRange(
  r: ClipRange,
  opts: { now: number; oldest?: number | undefined; cap?: boolean },
): ClipRange {
  const hi = opts.now - CLIP_LIVE_EDGE_MS;
  let from = r.from,
    to = r.to;
  if (opts.oldest != null && from < opts.oldest) from = opts.oldest;
  if (to > hi) to = hi;
  if (opts.cap !== false && to - from > CLIP_MAX_MS) to = from + CLIP_MAX_MS;
  if (to < from) from = to;
  return { from, to };
}

/**
 * What the info-bar button proposes: the event the playback position lies in (newest first), else the position
 * ± 30 s, live the last minute — then `clampClipRange`.
 */
export function clipProposal(s: {
  live: boolean;
  /** playback position (ms), null when unknown */
  playhead: number | null;
  now: number;
  events: readonly Pick<SentinelEvent, 'timestamp' | 'startTs' | 'endTs' | 'open'>[];
  oldest?: number | undefined;
}): ClipRange & { open: boolean } {
  const hi = s.now - CLIP_LIVE_EDGE_MS;
  if (s.live || s.playhead == null) {
    return { ...clampClipRange({ from: hi - CLIP_LIVE_MS, to: hi }, s), open: false };
  }
  const p = s.playhead;
  let hit: (ClipRange & { open: boolean }) | null = null;
  let hitTs = -Infinity;
  for (const e of s.events) {
    const r = clipRangeForEvent(e, s.now);
    if (p >= r.from && p <= r.to && e.timestamp > hitTs) {
      hit = r;
      hitTs = e.timestamp;
    }
  }
  if (hit) return { ...clampClipRange(hit, s), open: hit.open };
  return { ...clampClipRange({ from: p - CLIP_AROUND_MS, to: p + CLIP_AROUND_MS }, s), open: false };
}

/**
 * Move one edge to `ts`. An edge that passes the other swaps roles: the moving edge is now the other one (it keeps
 * following the line), so the range never turns upside down.
 */
export function clipSetEdge(r: ClipRange, edge: ClipEdge, ts: number): { range: ClipRange; edge: ClipEdge } {
  if (edge === 'from')
    return ts <= r.to ? { range: { from: ts, to: r.to }, edge } : { range: { from: r.to, to: ts }, edge: 'to' };
  return ts >= r.from ? { range: { from: r.from, to: ts }, edge } : { range: { from: ts, to: r.from }, edge: 'from' };
}

/** Recording gaps (≥ CLIP_GAP_MS) inside [from, to] according to the loaded clips; `covered` = recorded ms in it. */
export function clipCoverage(
  clips: readonly SentinelClip[],
  r: ClipRange,
): { covered: number; gaps: [number, number][] } {
  const runs = sentinelClipRuns(clips as SentinelClip[], CLIP_GAP_MS).filter((x) => x.e > r.from && x.s < r.to);
  let covered = 0,
    cur = r.from;
  const gaps: [number, number][] = [];
  for (const x of runs) {
    const s = Math.max(x.s, r.from),
      e = Math.min(x.e, r.to);
    if (s - cur >= CLIP_GAP_MS) gaps.push([cur, s]);
    covered += Math.max(0, e - s);
    cur = Math.max(cur, e);
  }
  // a missing piece at the end counts only before the recorded edge (after it the plugin cuts — `endsAt`)
  if (runs.length && r.to - cur >= CLIP_GAP_MS) gaps.push([cur, r.to]);
  return { covered, gaps };
}

export interface ClipHints {
  tooLong: boolean;
  noRecording: boolean;
  gaps: boolean;
  /** the end is not recorded yet: the clip ends at this time (ms), else null */
  endsAt: number | null;
  /** "Create clip" may be pressed */
  canCreate: boolean;
}

/** Hints and the lock of "Create clip" for a range (the server checks again). */
export function clipHints(r: ClipRange, clips: readonly SentinelClip[], now: number): ClipHints {
  const tooLong = r.to - r.from > CLIP_MAX_MS;
  const hi = now - CLIP_LIVE_EDGE_MS;
  const endsAt = r.to > hi ? Math.max(r.from, hi) : null;
  const cov = clipCoverage(clips, { from: r.from, to: Math.min(r.to, hi) });
  const noRecording = cov.covered <= 0;
  return {
    tooLong,
    noRecording,
    gaps: !noRecording && cov.gaps.length > 0,
    endsAt,
    canCreate: !tooLong && !noRecording && r.to - r.from >= 1000 && r.from < hi,
  };
}

/** "Length 1:10" value: the range as m:ss (h:mm:ss from one hour). */
export function clipLength(r: ClipRange): string {
  return sentinelDuration(r.to - r.from);
}

/**
 * The wall time is ambiguous (the hour repeated when the clocks go back, 25-h day): the same hh:mm:ss lies one hour
 * earlier or later as well. The chips then add the UTC offset.
 */
export function clipTimeAmbiguous(ts: number): boolean {
  const wall = (x: number) => {
    const d = new Date(x);
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  };
  const w = wall(ts);
  return wall(ts - 3600_000) === w || wall(ts + 3600_000) === w;
}

/** hh:mm:ss of a chip, with the UTC offset ("GMT+2") when the wall time is ambiguous. */
export function fmtClipTime(ts: number, locale: string): string {
  const base = { hour: '2-digit', minute: '2-digit', second: '2-digit' } as const;
  if (!clipTimeAmbiguous(ts)) return new Intl.DateTimeFormat(locale, base).format(ts);
  try {
    return new Intl.DateTimeFormat(locale, { ...base, timeZoneName: 'shortOffset' }).format(ts);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...base, timeZoneName: 'short' }).format(ts);
  }
}

/**
 * How a finished clip reaches the viewer:
 * - `prefetch`: load the file into the page first (Share needs a fresh user gesture — a fetch after the tap is too late
 *   on WebKit — and a Home-Screen app saves from a blob like the snapshot);
 * - `share`: offer "Share" (`navigator.canShare({files})`), only with a prefetched file;
 * - `save`: 'link' = a link to `api/export-file` (Content-Disposition: attachment), 'blob' = the prefetched file through
 *   `<a download>` (Home-Screen app), 'safari' = too large for the page in a Home-Screen app: open the file in Safari.
 */
export interface ClipWays {
  prefetch: boolean;
  share: boolean;
  save: 'link' | 'blob' | 'safari';
}
export function clipWays(s: { bytes: number; canShareFiles: boolean; standalone: boolean }): ClipWays {
  const fits = s.bytes > 0 && s.bytes <= CLIP_SHARE_MAX;
  if (s.standalone)
    return fits
      ? { prefetch: true, share: s.canShareFiles, save: 'blob' }
      : { prefetch: false, share: false, save: 'safari' };
  if (fits && s.canShareFiles) return { prefetch: true, share: true, save: 'link' };
  return { prefetch: false, share: false, save: 'link' };
}

/** Texts of an export error (`SentinelHttpError` status/code, or the `error` of a failed job). */
export type ClipErrorKind =
  'busy' | 'noSpace' | 'noRecording' | 'tooLong' | 'streamChange' | 'oldServer' | 'expired' | 'failed';
export function clipErrorKind(status: number, code: string | undefined): ClipErrorKind {
  if (code === 'busy' || status === 429) return 'busy';
  if (code === 'no space' || status === 507) return 'noSpace';
  if (code === 'no recording') return 'noRecording';
  if (code === 'too long' || status === 413) return 'tooLong';
  if (code === 'stream change') return 'streamChange';
  if (code === 'unknown export') return 'expired';
  // an api/export that the server does not know: plain-text 404 of an older plugin
  if (status === 404 && !code) return 'oldServer';
  return 'failed';
}
