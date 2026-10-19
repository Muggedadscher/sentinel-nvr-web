// DOM-free player decisions (unit-testable without a browser).

/**
 * Carry a position in the clip list across a refresh of that list. The page refreshes today's clips every 15 s, also during
 * playback, and loads further days while the timeline scrolls: both change the merged list (clips added in front, the
 * oldest dropped by retention), so a plain index would point at a different clip afterwards. The same clip (by id) keeps
 * its place; if it is gone, the position follows its predecessor; if both are gone, the index stays as it was.
 * `idx` may be `prev.length` (MSE: everything fed, waiting for newer clips).
 */
export function carryClipIndex(prev: readonly { id: string }[], next: readonly { id: string }[], idx: number): number {
  if (idx < 0 || prev === next) return idx;
  const at = (i: number) => (i >= 0 && i < prev.length ? next.findIndex((c) => c.id === prev[i]!.id) : -1);
  const own = at(idx);
  if (own >= 0) return own;
  const before = at(idx - 1);
  if (before >= 0) return before + 1;
  return idx;
}

/** Gaps up to this long between two recordings count as no gap: a jump into one plays the next recording. */
export const GAP_SNAP_MS = 2000;

/**
 * The clip a jump to `ts` plays: the one that covers it, else the next one when it starts at most `GAP_SNAP_MS` later.
 * Consecutive segments are not seamless: the recorder leaves 30–1350 ms between many of them (496 gaps in one lab day),
 * and a click, ±15 s or an event landing in one showed "no recording" instead of playing on. The server's feeder
 * (`clipIndexAt`) also starts at the next segment. -1 = nothing recorded there.
 */
export function clipAt(clips: readonly { startTime: number; duration?: number }[], ts: number): number {
  let next = -1;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]!;
    if (ts >= c.startTime && ts < c.startTime + (c.duration || 60000)) return i;
    if (c.startTime > ts && c.startTime - ts <= GAP_SNAP_MS && (next < 0 || c.startTime < clips[next]!.startTime))
      next = i;
  }
  return next;
}
