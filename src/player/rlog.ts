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

export function rlog(tag: string, data?: Record<string, unknown>): void {
  if (!client) return;
  let line: string;
  try {
    line = JSON.stringify({ tag, b: brand, d: data ?? null, ua: navigator.userAgent.slice(0, 80) });
  } catch {
    line = JSON.stringify({ tag, b: brand });
  }
  client.postText('api/clientlog', line);
}
