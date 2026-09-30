import { describe, it, expect } from 'vitest';
import {
  settleStart,
  settleStep,
  SETTLE_NEAR_MS,
  SETTLE_CAP_MS,
  SETTLE_STALL_MS,
  type SettleSample,
} from '../../src/player/settle';

const T = 1_790_000_000_000; // gesture target
const NOW = 1_790_100_000_000;
const H = 3_600_000;
/** a poll at `at` showing `pos`, with the poll 600 ms before at `prevPos` */
const poll = (pos: number, at: number, prevPos: number | null, r: number | null = 1): SettleSample => ({
  pos,
  at,
  r,
  prev: prevPos == null ? null : { pos: prevPos, at: at - 600 },
});

describe('settleStep (timeline stays parked until the picture plays normally at the target)', () => {
  it('arrived: near the target, servo settled (r = 1), picture advancing at ~1×', () => {
    const s = settleStart(T + H, T, NOW);
    expect(settleStep(s, poll(T + 1900, NOW + 600, T + 1300), T, NOW + 600)).toBe('arrived');
    const b = settleStart(T - H, T, NOW);
    expect(settleStep(b, poll(T - 900, NOW + 600, T - 1500), T, NOW + 600)).toBe('arrived');
  });
  it('waits while the picture still sweeps in (lagging display) even though the server already reports 1×', () => {
    const s = settleStart(T + 150_000, T, NOW);
    expect(settleStep(s, poll(T + 51_500, NOW + 600, T + 147_000), T, NOW + 600)).toBe('wait');
    expect(settleStep(s, poll(T + 9_100, NOW + 1200, T + 51_500), T, NOW + 1200)).toBe('wait');
    expect(settleStep(s, poll(T + 2_500, NOW + 1800, T + 9_100), T, NOW + 1800)).toBe('wait'); // in range, still −11×
    expect(settleStep(s, poll(T + 3_100, NOW + 2400, T + 2_500), T, NOW + 2400)).toBe('arrived');
  });
  it('waits while the servo is not at 1× (overshoot passing through the window)', () => {
    const s = settleStart(T + 21_000, T, NOW);
    // picture sweeps through +1.7 s at a moderate speed, but the server reports −25×
    expect(settleStep(s, poll(T + 1_700, NOW + 600, T + 2_300, -25), T, NOW + 600)).toBe('wait');
  });
  it('an overshoot does not count as a stall: the way back is progress', () => {
    const s = settleStart(T + 21_000, T, NOW);
    expect(settleStep(s, poll(T + 1_700, NOW + 600, T + 21_000, -25), T, NOW + 600)).toBe('wait');
    expect(settleStep(s, poll(T - 21_000, NOW + 1200, T + 1_700, -25), T, NOW + 1200)).toBe('wait');
    expect(settleStep(s, poll(T - 31_000, NOW + 1800, T - 21_000, 77), T, NOW + 1800)).toBe('wait');
    expect(settleStep(s, poll(T - 12_000, NOW + 2400, T - 31_000, 1), T, NOW + 2400)).toBe('wait');
    expect(settleStep(s, poll(T - 3_000, NOW + 3000, T - 12_000, 1), T, NOW + 3000)).toBe('wait');
    expect(settleStep(s, poll(T - 1_000, NOW + 3600, T - 3_000, 1), T, NOW + 3600)).toBe('wait'); // 3.3× — still settling
    expect(settleStep(s, poll(T - 400, NOW + 4200, T - 1_000, 1), T, NOW + 4200)).toBe('arrived');
  });
  it('needs two polls to judge the speed', () => {
    const s = settleStart(T + 1000, T, NOW);
    expect(settleStep(s, poll(T + 1000, NOW, null), T, NOW)).toBe('wait');
  });
  it('servers without a rate in relay-pos: position and speed alone', () => {
    const s = settleStart(T + H, T, NOW);
    expect(settleStep(s, poll(T + 1900, NOW + 600, T + 1300, null), T, NOW + 600)).toBe('arrived');
  });
  it('playing normally but far off the target is not arrived (target in a recording gap, target lost)', () => {
    const s = settleStart(T + 60_000, T, NOW);
    expect(settleStep(s, poll(T + SETTLE_NEAR_MS + 600, NOW + 600, T + SETTLE_NEAR_MS), T, NOW + 600)).toBe('wait');
  });
  it('gives up when the distance stops shrinking — standing still or drifting away', () => {
    const s = settleStart(T + H, T, NOW);
    expect(settleStep(s, poll(T + H, NOW + SETTLE_STALL_MS - 1, T + H, 1), T, NOW + SETTLE_STALL_MS - 1)).toBe('wait');
    expect(settleStep(s, poll(T + H - 500, NOW + SETTLE_STALL_MS, T + H), T, NOW + SETTLE_STALL_MS)).toBe('giveup'); // < 1 s
    const a = settleStart(T + 60_000, T, NOW);
    expect(settleStep(a, poll(T + 62_000, NOW + 2000, T + 61_400), T, NOW + 2000)).toBe('wait');
    expect(settleStep(a, poll(T + 63_000, NOW + SETTLE_STALL_MS, T + 62_400), T, NOW + SETTLE_STALL_MS)).toBe('giveup');
  });
  it('progress resets the stall clock', () => {
    const s = settleStart(T + H, T, NOW);
    expect(settleStep(s, poll(T + H - 60_000, NOW + 2000, T + H, 3000), T, NOW + 2000)).toBe('wait');
    expect(settleStep(s, poll(T + H - 60_000, NOW + 4999, T + H - 60_000, 3000), T, NOW + 4999)).toBe('wait');
    expect(settleStep(s, poll(T + H - 60_000, NOW + 5000, T + H - 60_000, 3000), T, NOW + 5000)).toBe('giveup');
  });
  it('hard cap even while still approaching', () => {
    const s = settleStart(T + 100 * H, T, NOW);
    let pos = T + 100 * H,
      st = 'wait';
    for (let t = 600; t <= SETTLE_CAP_MS; t += 600) {
      const prev = pos;
      pos -= 3000 * 600; // 3000× at most
      st = settleStep(s, poll(pos, NOW + t, prev, -3000), T, NOW + t);
      if (st !== 'wait') break;
    }
    expect(st).toBe('giveup');
  });
});
