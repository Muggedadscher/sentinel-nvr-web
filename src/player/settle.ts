// DOM-free decision when a scrub gesture may hand the timeline back to the playhead (unit-testable without a browser).
//
// After a gesture the relay's servo is still steering onto the timeline centre, and the picture on screen (relay-pos)
// trails the servo by 1.3 s — at 3000× a fling of hours takes seconds. Handing the timeline back after a fixed 1.5 s
// made it jump to wherever the picture was at that moment and then chase it in 600-ms steps (user 30.09.2026;
// `follow-jump` telemetry with sinceIdle ≈ 1.5 s, up to 13 616 s). Worse, leaving scrub drops the server's target,
// so a far fling stopped short. The timeline stays parked until the picture plays at normal speed at the target.

/** "At the target": the servo stops within ±1.5 s of it (SERVO_DONE_MS), leaving key mode re-enters the nearest keyframe
 *  (± half a 4-s GOP), then it plays on at 1× until two polls have shown that. */
export const SETTLE_NEAR_MS = 5000;
/** "Normal speed" between the last two polls (poll jitter, keyframe re-entry). */
export const SETTLE_V_MIN = 0.5,
  SETTLE_V_MAX = 2;
/** Give up when the distance has not shrunk by SETTLE_PROGRESS_MS for this long (no footage at the target, polls stuck,
 *  server lost the target). */
export const SETTLE_STALL_MS = 3000;
export const SETTLE_PROGRESS_MS = 1000;
/** Hard cap, however slowly the picture still approaches. */
export const SETTLE_CAP_MS = 30_000;

export interface SettleTrack {
  t0: number;
  best: number;
  bestAt: number;
}

/** One relay-pos poll: picture on screen, when it was received, the server's current rate (null = not reported), and the
 *  poll before it (same command generation) for the speed. */
export interface SettleSample {
  pos: number;
  at: number;
  r: number | null;
  prev: { pos: number; at: number } | null;
}

export type SettleState = 'arrived' | 'wait' | 'giveup';

export function settleStart(pos: number, target: number, now: number): SettleTrack {
  return { t0: now, best: Math.abs(pos - target), bestAt: now };
}

/** One check against the gesture's final target. Updates `s`. */
export function settleStep(s: SettleTrack, x: SettleSample, target: number, now: number): SettleState {
  const d = Math.abs(x.pos - target);
  // arrived = the picture plays at normal speed near the target, and the server's servo has settled (rate 1). Position
  // alone is not enough: the servo occasionally overshoots (seen in the lab: 30 s past the target while running at −25×) —
  // handing back while the picture swept through the window froze the cursor there
  const v = x.prev && x.at > x.prev.at ? (x.pos - x.prev.pos) / (x.at - x.prev.at) : null;
  if (d <= SETTLE_NEAR_MS && (x.r == null || x.r === 1) && v != null && v >= SETTLE_V_MIN && v <= SETTLE_V_MAX)
    return 'arrived';
  if (d <= s.best - SETTLE_PROGRESS_MS) {
    s.best = d;
    s.bestAt = now;
  } else if (d > s.best) s.best = d; // moving away (overshoot): the way back counts as progress from here, the clock runs on
  if (now - s.t0 >= SETTLE_CAP_MS || now - s.bestAt >= SETTLE_STALL_MS) return 'giveup';
  return 'wait';
}
