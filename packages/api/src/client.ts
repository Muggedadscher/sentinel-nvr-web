/**
 * Browser client for the Sentinel NVR plugin's token-guarded `/public/` endpoint.
 *
 * The plugin sends permissive CORS on every answer (JSON, the 204 control replies,
 * api/segment incl. 206, api/livemse, images, errors) and answers OPTIONS, so a
 * cross-origin static SPA can talk to it directly with `?token=`. Media elements
 * may use crossOrigin="anonymous". Older builds (JSON-only CORS) degrade: control()
 * treats an unreadable reply as delivered; media fetches fall into the next fallback.
 */

import { sentinelPublicBase, sentinelEntryUrl, sentinelUrl } from './model';

export class SentinelClient {
  readonly origin: string;
  readonly token: string;
  readonly base: string;
  /** "Open Sentinel" target: public base without token → sign-in / 302 into the session. */
  readonly entryUrl: string;
  /** fetch() can read media bodies (segments, live fMP4): the plugin sends CORS on media. */
  readonly corsMedia = true;

  constructor(origin: string, token: string) {
    this.origin = origin;
    this.token = token;
    this.base = sentinelPublicBase(origin);
    this.entryUrl = sentinelEntryUrl(origin);
  }

  /** Cache key — a new client is built whenever origin/token change. */
  get key(): string {
    return `${this.origin} ${this.token}`;
  }

  url(path: string): string {
    return sentinelUrl(this.base, this.token, path);
  }

  /** JSON GET with a timeout (an unreachable host otherwise waits for the browser's TCP timeout). */
  async getJson<T>(path: string, signal?: AbortSignal, timeoutMs = 10_000): Promise<T> {
    const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
    if (signal) signals.push(signal);
    // AbortSignal.any is Chrome 116 / Safari 17.4+; older engines get the timeout signal alone.
    const combined = typeof AbortSignal.any === 'function' ? AbortSignal.any(signals) : signals[0]!;
    const r = await fetch(this.url(path), { cache: 'no-store', signal: combined });
    if (!r.ok) throw new SentinelHttpError(r.status, path);
    return (await r.json()) as T;
  }

  /**
   * Fire a control GET (204 = ok, 404 = session gone). Resolves `r.ok`. A rejected
   * fetch (network error, or an older plugin whose 204 lacks CORS headers — the
   * command was delivered either way) resolves true; dead sessions surface via relay-pos.
   */
  async control(path: string): Promise<boolean> {
    try {
      const r = await fetch(this.url(path), { cache: 'no-store' });
      return r.ok;
    } catch {
      return true;
    }
  }

  /** Text POST (client telemetry). Best effort, never throws. */
  postText(path: string, body: string): void {
    try {
      void fetch(this.url(path), { method: 'POST', body, keepalive: true }).catch(() => { /* telemetry only */ });
    } catch { /* ignore */ }
  }

  /** WebSocket signaling URL (the plugin's Engine.IO handler). */
  signalingUrl(cameraId: string, params: Record<string, string> = {}): string {
    const u = new URL(this.url(''));
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.hash = '';
    u.searchParams.set('camera', cameraId);
    u.searchParams.set('signaling', '1');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.href;
  }

  // ---- media URL helpers (all <img>/<video>-loadable) ----
  snapshotUrl(cameraId: string, bust?: number): string {
    return this.url(`api/snapshot?camera=${encodeURIComponent(cameraId)}`) + (bust != null ? `&_=${bust}` : '');
  }
  eventThumbUrl(cameraId: string, ts: number): string {
    return this.url(`api/evthumb?camera=${encodeURIComponent(cameraId)}&ts=${Math.round(ts)}`);
  }
  eventFrameUrl(cameraId: string, ts: number): string {
    return this.url(`api/evframe?camera=${encodeURIComponent(cameraId)}&ts=${Math.round(ts)}`);
  }
  segmentThumbUrl(thumbId: string): string {
    return this.url(`api/thumb?id=${encodeURIComponent(thumbId)}`);
  }
}

export class SentinelHttpError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`${status} ${path}`);
    this.name = 'SentinelHttpError';
    this.status = status;
  }
}
