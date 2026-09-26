/**
 * Client telemetry → the plugin's `api/clientlog` → its server log as `[client]`
 * lines (phones have no console; this is how playback problems on a device get
 * diagnosed). `brand` tags which host emitted the line (e.g. 'sentinel', 'hapulse').
 */

import type { SentinelClient } from '../api';

let brand = 'web';

let client: SentinelClient | null = null;

export function setRlogClient(c: SentinelClient | null, b?: string): void {
  client = c;
  if (b) brand = b;
}

/** Rate limit (the server accepts 120 lines/min for ALL clients): 20 lines per minute per page, the same tag at most
 *  once per 5 s — a blocked autoplay logged 'play-fail' on every 600-ms poll. Dropped lines are counted and reported
 *  with the next line that goes out. */
const PER_MIN = 20, SAME_TAG_MS = 5000;
let sent: number[] = [];
const lastByTag = new Map<string, number>();
let dropped = 0;

export function rlog(tag: string, data?: Record<string, unknown>): void {
  if (!client) return;
  const now = Date.now();
  sent = sent.filter((t) => now - t < 60_000);
  if (sent.length >= PER_MIN || now - (lastByTag.get(tag) ?? -Infinity) < SAME_TAG_MS) { dropped++; return; }
  sent.push(now); lastByTag.set(tag, now);
  if (dropped) { data = { ...(data ?? {}), dropped }; dropped = 0; }
  let line: string;
  try {
    line = JSON.stringify({ tag, b: brand, d: data ?? null, ua: navigator.userAgent.slice(0, 80) });
  } catch {
    line = JSON.stringify({ tag, b: brand });
  }
  client.postText('api/clientlog', line);
}
