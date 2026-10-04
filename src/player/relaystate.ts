// DOM-free decisions of the PlayerController's relay session (unit-testable without a browser): which relay-pos answers
// count, and when a failing relay is retried or handed over to MSE.

/** A relay-pos answer within PRE_SWAP_MS after a seek that is further than PRE_SWAP_DIST_MS from the seek target still
 *  shows the old position (the new one has not crossed the pipeline yet) — ignored, else the playhead jumps back. */
export const PRE_SWAP_MS = 2500;
export const PRE_SWAP_DIST_MS = 5000;

/** `stale` = other session or answered across a seek/rate change (command generation, cmdSeq), `pre-swap` = old position
 *  right after a seek, `position` = use it, `dead` = the server lost the session (t ≤ 0), `ignore` = no usable answer. */
export type PosVerdict = 'stale' | 'pre-swap' | 'position' | 'dead' | 'ignore';

/** One relay-pos answer. `fresh` = same session and same command generation as when the poll was sent. */
export function relayPosVerdict(
  d: { t?: any } | null | undefined,
  fresh: boolean,
  now: number,
  seekAt: number,
  seekTarget: number,
): PosVerdict {
  if (!fresh) return 'stale';
  if (d && d.t > 0 && now - seekAt < PRE_SWAP_MS && Math.abs(d.t - seekTarget) > PRE_SWAP_DIST_MS) return 'pre-swap';
  if (d && d.t > 0) return 'position';
  if (d && d.t <= 0) return 'dead';
  return 'ignore';
}

/** `t ≤ 0` this many polls in a row = the session is gone → recover. */
export const DEAD_POLLS = 3;
/** A failing relay is rebuilt this many times (transient WS/ICE hiccups); the next failure falls back to MSE for the rest
 *  of this camera. A presented frame resets the count. */
export const RELAY_RETRIES = 2;

/** After counting failure number `n` (1-based) of this relay: retry it, or fall back to MSE. */
export function relayFailure(n: number): 'retry' | 'mse' {
  return n <= RELAY_RETRIES ? 'retry' : 'mse';
}
