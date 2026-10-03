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
