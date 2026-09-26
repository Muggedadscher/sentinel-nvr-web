// DOM-free player decisions (unit-testable without a browser).

/** Recorded playback runs ~17 s behind real time (fragment flush + relay); a forward jump closer to "now" than this has no
 *  recording to land on yet. */
export const SKIP_LIVE_EDGE_MS = 20_000;

/**
 * Where a ±N-second jump goes: a timestamp, 'live' (a forward jump past the recording edge), or null (nothing to do:
 * forward while live). Backward from live starts at now − N.
 */
export function skipTarget(
  live: boolean,
  currentTs: number | null | undefined,
  ms: number,
  now: number,
): number | 'live' | null {
  if (live) return ms > 0 ? null : now + ms;
  const ts = (currentTs ?? now) + ms;
  if (ms > 0 && ts > now - SKIP_LIVE_EDGE_MS) return 'live';
  return ts;
}
