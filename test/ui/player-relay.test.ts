import { describe, it, expect } from 'vitest';
import {
  avoidWidth,
  isMarkerFrame,
  LIFT_FADE_MS,
  LIFT_FRAMES,
  MARK_CAP_MS,
  seekLift,
  STILL_CAP_MS,
  SWAP_MS,
} from '../../src/player/stills';
import {
  DEAD_POLLS,
  PRE_SWAP_DIST_MS,
  PRE_SWAP_MS,
  RELAY_RETRIES,
  relayFailure,
  relayPosVerdict,
} from '../../src/player/relaystate';

const NOW = 1_790_000_000_000;

describe('still-picture rules', () => {
  it('timings: timer lift after 2.6 s, marker cap 12 s, new-session cap 90 s, 2 frames + 120 ms fade', () => {
    expect(SWAP_MS).toBe(2600);
    expect(MARK_CAP_MS).toBe(12000);
    expect(STILL_CAP_MS).toBe(90000);
    expect(LIFT_FRAMES).toBe(2);
    expect(LIFT_FADE_MS).toBe(120);
    // the timer path (server without markers) must end before the marker safety net, the new-session cap is the longest
    expect(SWAP_MS).toBeLessThan(MARK_CAP_MS);
    expect(MARK_CAP_MS).toBeLessThan(STILL_CAP_MS);
  });

  it('only a frame of exactly the marker width lifts a pending jump still', () => {
    expect(isMarkerFrame(true, 1264, 1264)).toBe(true);
    expect(isMarkerFrame(true, 1264, 1280)).toBe(false); // the old position still plays
    expect(isMarkerFrame(false, 1264, 1264)).toBe(false); // nothing pending
    expect(isMarkerFrame(true, 0, 1280)).toBe(false); // seek not answered yet / server without markers
    expect(isMarkerFrame(true, 0, 0)).toBe(false);
  });

  it('seek answer: marker width → wait for it (or lift now if already shown), no marker → timer', () => {
    expect(seekLift(1264, 1280)).toBe('marker');
    expect(seekLift(1264, 0)).toBe('marker');
    expect(seekLift(1264, 1264)).toBe('now'); // the new width arrived before the answer
    expect(seekLift(0, 1280)).toBe('timer');
    expect(seekLift(0, 0)).toBe('timer');
  });

  it('a marked seek asks the server to avoid the visible width', () => {
    expect(avoidWidth(1264, 1280)).toBe(1264); // last presented frame wins
    expect(avoidWidth(0, 1280)).toBe(1280); // no frame callback yet: the element
    expect(avoidWidth(0, 0)).toBe(0);
  });
});

describe('relay-pos answers', () => {
  const seekAt = NOW - 1000,
    seekTarget = NOW - 3_600_000;

  it('an answer from another session or across a seek/rate change is stale, whatever it says', () => {
    expect(relayPosVerdict({ t: seekTarget }, false, NOW, seekAt, seekTarget)).toBe('stale');
    expect(relayPosVerdict({ t: -1 }, false, NOW, seekAt, seekTarget)).toBe('stale');
    expect(relayPosVerdict(null, false, NOW, seekAt, seekTarget)).toBe('stale');
  });

  it('right after a seek, a position far from the target is the old picture (pre-swap) and ignored', () => {
    expect(relayPosVerdict({ t: seekTarget - 60_000 }, true, NOW, seekAt, seekTarget)).toBe('pre-swap');
    expect(relayPosVerdict({ t: seekTarget + PRE_SWAP_DIST_MS + 1 }, true, NOW, seekAt, seekTarget)).toBe('pre-swap');
    // near the target it counts
    expect(relayPosVerdict({ t: seekTarget + PRE_SWAP_DIST_MS }, true, NOW, seekAt, seekTarget)).toBe('position');
    expect(relayPosVerdict({ t: seekTarget - 2000 }, true, NOW, seekAt, seekTarget)).toBe('position');
  });

  it('after PRE_SWAP_MS every position counts again', () => {
    const far = { t: seekTarget - 60_000 };
    expect(relayPosVerdict(far, true, seekAt + PRE_SWAP_MS - 1, seekAt, seekTarget)).toBe('pre-swap');
    expect(relayPosVerdict(far, true, seekAt + PRE_SWAP_MS, seekAt, seekTarget)).toBe('position');
    expect(relayPosVerdict(far, true, NOW, 0, 0)).toBe('position'); // never sought
  });

  it('t ≤ 0 = session gone on the server; missing answers are ignored', () => {
    expect(relayPosVerdict({ t: -1 }, true, NOW, seekAt, seekTarget)).toBe('dead');
    expect(relayPosVerdict({ t: 0 }, true, NOW, seekAt, seekTarget)).toBe('dead');
    expect(relayPosVerdict(null, true, NOW, seekAt, seekTarget)).toBe('ignore');
    expect(relayPosVerdict(undefined, true, NOW, seekAt, seekTarget)).toBe('ignore');
    expect(relayPosVerdict({}, true, NOW, seekAt, seekTarget)).toBe('ignore');
    expect(DEAD_POLLS).toBe(3);
  });
});

describe('relay recovery', () => {
  it('two retries, the third failure falls back to MSE', () => {
    expect(RELAY_RETRIES).toBe(2);
    expect(relayFailure(1)).toBe('retry');
    expect(relayFailure(2)).toBe('retry');
    expect(relayFailure(3)).toBe('mse');
    expect(relayFailure(4)).toBe('mse');
  });

  it('both controller paths (watchdog recover, failed start) reach MSE on the third failure in a row', () => {
    // mirrors relayRecover / recFallbackMse: the recover path hands over to the fallback path, which counts once more
    let n = 0;
    const log: string[] = [];
    const fallback = () => {
      n++;
      log.push(relayFailure(n) === 'retry' ? 'retry' : 'mse');
    };
    const recover = () => {
      n++;
      if (relayFailure(n) === 'mse') {
        n--;
        fallback();
      } else log.push('restart');
    };
    recover();
    fallback();
    recover();
    expect(log).toEqual(['restart', 'retry', 'mse']);
    n = 0;
    log.length = 0;
    fallback();
    fallback();
    fallback();
    expect(log).toEqual(['retry', 'retry', 'mse']);
  });
});
