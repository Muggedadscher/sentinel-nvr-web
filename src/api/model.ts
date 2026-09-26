/**
 * Sentinel NVR — DOM-free data model + pure helpers.
 *
 * Mirrors the Sentinel NVR plugin's `docs/API.md` (the binding contract): types,
 * URL/setup parsing, event classification, the playback-start heuristic, the
 * storage forecast the status page computes, and the timeline clip-run merge.
 * No fetch/DOM here — the browser client lives in `client.ts`.
 */

// ---------------------------------------------------------------------------
// Types (docs/API.md §3)
// ---------------------------------------------------------------------------

/** UI classes of an event; anything unknown collapses to `motion`. */
export type SentinelEventClass = 'person' | 'car' | 'bike' | 'animal' | 'package' | 'motion';

export const SENTINEL_EVENT_CLASSES: readonly SentinelEventClass[] = [
  'person', 'car', 'bike', 'animal', 'package', 'motion',
];

export type SentinelBox = [number, number, number, number];

/** `api/cameras` entry. */
export interface SentinelCamera {
  id: string;
  name: string;
  recording: boolean;
  online: boolean;
  lastSegmentAt?: number;
  eventsToday: number;
  lastEventTs?: number;
  latestThumbId?: string;
  latestTs?: number;
  /** RFC-6381 codec string of the recordings (MSE). */
  codecs?: string;
}

/** `api/stats`. */
export interface SentinelStats {
  cameras: number;
  recording: number;
  eventsToday: number;
  segments: number;
  bytes: number;
  earliest?: number;
  retentionDays: number;
  diskFree: number;
  diskTotal: number;
  minFreeBytes: number;
  /** plugin ≥ 2026-09-26: storage root usable (storage guard); false = not recording, nothing deleted. */
  storageOk?: boolean;
  /** why not: 'marker' (share not mounted), 'missing', 'error', 'timeout' */
  storageProblem?: string;
}

/** `api/recent-events` entry (short form). */
export interface SentinelRecentEvent {
  camera: string;
  cameraName: string;
  ts: number;
  startTs?: number;
  classes: string[];
  score: number;
}

export interface SentinelEventBox {
  class: string;
  rawClass?: string;
  score: number;
  box: SentinelBox;
  nbox?: SentinelBox;
}

/** Full event (`api/clips.events`). */
export interface SentinelEvent {
  id: string;
  timestamp: number;
  startTs?: number;
  classes: string[];
  score: number;
  source: 'object' | 'motion';
  boxes?: SentinelEventBox[];
}

/** Recording segment (`api/clips.clips`). */
export interface SentinelClip {
  id: string;
  videoId?: string;
  thumbnailId?: string;
  startTime: number;
  duration?: number;
  event?: string;
  detectionClasses?: string[];
}

export interface SentinelClipsResponse {
  clips: SentinelClip[];
  events: SentinelEvent[];
  motion: [number, number][];
  codecs?: string;
}

export const SENTINEL_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Setup / URLs (docs/API.md §1)
// ---------------------------------------------------------------------------

/** Where the plugin lives below a Scrypted origin. */
export const SENTINEL_ENDPOINT_PATH = '/endpoint/@local/sentinel-nvr';

export interface SentinelSetup {
  /** Scrypted origin, e.g. `https://192.168.2.120:10443` (no trailing slash). */
  origin: string;
  /** Access token found in the pasted URL (`?token=`), if any. */
  token: string | null;
  /**
   * Reverse-proxy path prefix in front of Scrypted's `/endpoint/…` (e.g. `/scrypted` for
   * `https://proxy/scrypted/endpoint/@local/sentinel-nvr/public/`), `''` without one.
   * Only derived when the pasted URL contains `/endpoint/`. Since 0.10.0.
   */
  prefix: string;
}

/**
 * Turn whatever the user pastes into a clean Scrypted origin (+ token, when the
 * pasted string was Sentinel's embed URL). Accepts a bare host (`https://` is
 * assumed), the Scrypted root, the plugin's login/public path, or the embed
 * URL with `?token=…&embed=1`. Returns null for unusable input.
 */
export function parseSentinelSetup(input: string | null | undefined): SentinelSetup | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (!u.hostname) return null;
  const token = u.searchParams.get('token');
  const at = u.pathname.indexOf('/endpoint/');
  const prefix = at > 0 ? u.pathname.slice(0, at).replace(/\/+$/, '') : '';
  return { origin: u.origin, token: token && token.trim() ? token.trim() : null, prefix };
}

/** Token-guarded machine base (`…/public/`), always with a trailing slash; `prefix` = reverse-proxy path prefix. */
export function sentinelPublicBase(origin: string, prefix = ''): string {
  return `${origin.replace(/\/+$/, '')}${prefix.replace(/\/+$/, '')}${SENTINEL_ENDPOINT_PATH}/public/`;
}

/**
 * Human base behind the Scrypted login (`…/sentinel-nvr/`). NOT a link target:
 * without a session Scrypted answers "Not Authorized" here. Humans enter via
 * `sentinelEntryUrl` (the public base without a token shows Sentinel's sign-in
 * page, or redirects straight here when a session exists).
 */
export function sentinelLoginBase(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${SENTINEL_ENDPOINT_PATH}/`;
}

/** Where a human opens Sentinel's own UI: the public base WITHOUT a token (sign-in page / 302 into the session). */
export function sentinelEntryUrl(origin: string): string {
  return sentinelPublicBase(origin);
}

/**
 * Absolute URL for an API/media path below the public base, with the token as
 * a query parameter (a `GET` with a query token is a CORS "simple request" —
 * the `x-sentinel-token` header would force a preflight the plugin does not
 * answer; `<img>`/`<video>` sources need the query form anyway).
 */
export function sentinelUrl(base: string, token: string, path: string): string {
  const u = base + path;
  if (!token) return u;
  return `${u}${u.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

/**
 * Deep link into Sentinel's own web UI for a camera timeline — via the entry
 * URL (sign-in or 302 into the session; browsers carry the `#` fragment across
 * the redirect).
 */
export function sentinelTimelineLink(origin: string, cameraId: string, atMs?: number): string {
  const q = atMs ? `?at=${Math.round(atMs)}` : '';
  return `${sentinelEntryUrl(origin)}#/timeline/${encodeURIComponent(cameraId)}${q}`;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function isKnownClass(k: string): k is SentinelEventClass {
  return (SENTINEL_EVENT_CLASSES as readonly string[]).includes(k);
}

/** Primary class of an event (first known class, else `motion`). */
export function sentinelClassOf(ev: { classes?: string[] | undefined }): SentinelEventClass {
  const k = ev.classes?.[0];
  return k !== undefined && isKnownClass(k) ? k : 'motion';
}

/** Distinct known classes of an event, in order — never empty. */
export function sentinelClassesOf(ev: { classes?: string[] | undefined }): SentinelEventClass[] {
  const out: SentinelEventClass[] = [];
  for (const k of ev.classes ?? []) {
    const c: SentinelEventClass = isKnownClass(k) ? k : 'motion';
    if (!out.includes(c)) out.push(c);
  }
  return out.length ? out : [sentinelClassOf(ev)];
}

/**
 * Where playback starts for an event: 2 s before the first sighting when the
 * detector recorded one, else 3 s before the trigger (docs/API.md §3.3).
 */
export function sentinelEventPlayTs(ev: { timestamp?: number; ts?: number; startTs?: number }): number {
  const ts = ev.startTs || ev.ts || ev.timestamp || 0;
  return ev.startTs ? ts - 2000 : ts - 3000;
}

// ---------------------------------------------------------------------------
// Storage forecast (docs/API.md §3.2 — the same maths the Sentinel status page uses)
// ---------------------------------------------------------------------------

export type SentinelStorageStatus = 'unknown' | 'unreachable' | 'reachable' | 'filling';

export interface SentinelStorageForecast {
  /** Days spanned by the archive (earliest segment → now). */
  spanDays: number;
  /** Bytes recorded per day (0 until at least an hour of footage exists). */
  ratePerDay: number;
  /** Free-space guard reserve, clamped to the disk size. */
  reserve: number;
  /** Free bytes above the reserve. */
  usableFree: number;
  /** Bytes available for recordings = archive + usable free. */
  capacity: number;
  /** Days the archive can grow to at the current rate (0 = unknown). */
  fitsDays: number;
  /** Days until the reserve is reached (0 = unknown). */
  fillsInDays: number;
  /** The disk is effectively full (free ≤ 2 % above the reserve) → steady-state eviction. */
  steady: boolean;
  /** Bytes used by something other than recordings. */
  other: number;
  /** Which forecast message applies. */
  status: SentinelStorageStatus;
}

export function sentinelStorageForecast(st: SentinelStats, nowMs: number = Date.now()): SentinelStorageForecast {
  const spanDays = st.earliest ? Math.max(0, (nowMs - st.earliest) / SENTINEL_DAY_MS) : 0;
  const ratePerDay = spanDays >= 1 / 24 ? st.bytes / Math.max(spanDays, 1 / 24) : 0;
  const reserve = Math.min(st.minFreeBytes || 0, st.diskTotal);
  const usableFree = Math.max(0, st.diskFree - reserve);
  const capacity = st.bytes + usableFree;
  const fitsDays = ratePerDay ? capacity / ratePerDay : 0;
  const fillsInDays = ratePerDay ? usableFree / ratePerDay : 0;
  const steady = usableFree < 0.02 * st.diskTotal;
  const other = Math.max(0, st.diskTotal - st.diskFree - st.bytes);
  let status: SentinelStorageStatus = 'unknown';
  if (ratePerDay) {
    if (fitsDays < st.retentionDays * 0.95) status = 'unreachable';
    else if (steady || spanDays >= st.retentionDays) status = 'reachable';
    else status = 'filling';
  }
  return { spanDays, ratePerDay, reserve, usableFree, capacity, fitsDays, fillsInDays, steady, other, status };
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

export interface SentinelRun { s: number; e: number }

/**
 * Contiguous recording runs: segments whose gap is ≤ `gapMs` (2 s) are drawn as
 * ONE band (otherwise every 60-s segment boundary shows a notch).
 */
export function sentinelClipRuns(clips: SentinelClip[], gapMs = 2000): SentinelRun[] {
  const out: SentinelRun[] = [];
  let cur: SentinelRun | null = null;
  for (const c of clips) {
    const e = c.startTime + (c.duration || 0);
    if (cur && c.startTime - cur.e <= gapMs) cur.e = Math.max(cur.e, e);
    else { cur = { s: c.startTime, e }; out.push(cur); }
  }
  return out;
}

/** Index of the clip covering `ts` (60 s assumed when a duration is missing), −1 if none. */
export function sentinelClipIndexFor(clips: SentinelClip[], ts: number): number {
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]!;
    if (ts >= c.startTime && ts < c.startTime + (c.duration || 60000)) return i;
  }
  return -1;
}

/** Local-midnight start of the day containing `ts`. */
export function sentinelDayOf(ts: number): number {
  return new Date(ts).setHours(0, 0, 0, 0);
}

// Calendar-day arithmetic. A local day is 23 or 25 hours long on DST change days, so
// "day ± 24 h" lands an hour off midnight there (a second key for the same day, requests
// shifted by an hour, "next day" staying on the same date). Always step calendar days:

/** Local midnight `n` calendar days from the day of `ts`. */
export function sentinelAddDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** End of the local day of `ts` (= next local midnight). */
export function sentinelDayEnd(ts: number): number {
  return sentinelAddDays(ts, 1);
}

/** Wall-clock time h:m on the local day of `ts` (not `midnight + h·3600 s`, which is an hour off on DST days). */
export function sentinelAtTime(ts: number, h: number, m: number, s = 0): number {
  const d = new Date(ts);
  d.setHours(h, m, s, 0);
  return d.getTime();
}

/**
 * Timestamps of local wall-clock marks every `step` ms (a divisor of a day: 15 s … 6 h) within [from, to],
 * ascending: a 3-h step marks 00:00/03:00/06:00 local time in every time zone (UTC-aligned steps showed
 * 02:00/05:00/08:00 in CEST). On DST days a mark that does not exist is skipped, a repeated hour marked once.
 */
export function sentinelWallMarks(from: number, to: number, step: number, max = 8000): number[] {
  const stepSec = Math.max(1, Math.round(step / 1000));
  const out: number[] = [];
  for (let day = sentinelDayOf(from); day <= to && out.length < max; day = sentinelAddDays(day, 1)) {
    const end = sentinelDayEnd(day);
    const regular = end - day === SENTINEL_DAY_MS;
    // only the marks near the window (+1 h slack on DST days)
    const k0 = Math.max(0, Math.floor((from - day - 3600_000) / (stepSec * 1000)));
    const k1 = Math.min(Math.floor(86400 / stepSec), Math.ceil((to - day + 3600_000) / (stepSec * 1000)));
    for (let k = k0; k <= k1 && out.length < max; k++) {
      const sec = k * stepSec;
      if (sec >= 86400) break;
      let t: number;
      if (regular) t = day + sec * 1000;
      else {
        const d = new Date(day);
        d.setHours(Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60, 0);
        // a wall time that does not exist (spring gap) normalises to another hour: skip it
        if (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() !== sec) continue;
        t = d.getTime();
      }
      if (t >= from && t <= to && (!out.length || t > out[out.length - 1]!)) out.push(t);
    }
  }
  return out;
}

/** Local wall-clock seconds since midnight (for "is this mark on a label step?"). */
export function sentinelWallSeconds(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/**
 * Merge per-day clip responses into one sorted, continuous data set. A clip or motion span that
 * crosses midnight comes with both days — kept once (by id / by interval).
 */
export function sentinelMergeDays(days: Record<number, SentinelClipsResponse>): {
  clips: SentinelClip[]; events: SentinelEvent[]; motion: [number, number][]; codecs: string | null; oldestDay: number | null;
} {
  const keys = Object.keys(days).map(Number).sort((a, b) => a - b);
  const clips = new Map<string, SentinelClip>(), events = new Map<string, SentinelEvent>();
  const motionRaw: [number, number][] = [];
  let codecs: string | null = null;
  for (const k of keys) {
    const d = days[k]!;
    for (const c of d.clips) clips.set(c.id, c);
    for (const e of d.events) events.set(e.id || `${e.timestamp}`, e);
    motionRaw.push(...d.motion);
    if (d.codecs) codecs = d.codecs;
  }
  motionRaw.sort((a, b) => a[0] - b[0]);
  const motion: [number, number][] = [];
  for (const m of motionRaw) {
    const last = motion[motion.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else motion.push([m[0], m[1]]);
  }
  return {
    clips: [...clips.values()].sort((a, b) => a.startTime - b.startTime),
    events: [...events.values()].sort((a, b) => a.timestamp - b.timestamp),
    motion,
    codecs,
    oldestDay: keys.length ? keys[0]! : null,
  };
}

/** Human-readable byte size split into value + unit (binary steps). */
export function sentinelHumanBytes(b: number): { value: string; unit: string } {
  if (!b || b <= 0) return { value: '0', unit: 'B' };
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return { value: (b / Math.pow(1024, i)).toFixed(i ? 1 : 0), unit: u[i]! };
}
