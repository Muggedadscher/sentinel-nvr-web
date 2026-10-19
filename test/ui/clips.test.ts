import { describe, it, expect } from 'vitest';
import { carryClipIndex, clipAt, GAP_SNAP_MS } from '../../src/player/clips';

const L = (...ids: string[]) => ids.map((id) => ({ id }));

describe('carryClipIndex (clip list refreshed during playback)', () => {
  it('same list or no position: unchanged', () => {
    const a = L('a', 'b');
    expect(carryClipIndex(a, a, 1)).toBe(1);
    expect(carryClipIndex(a, L('a', 'b', 'c'), -1)).toBe(-1);
  });
  it('clips appended at the live edge: the index stays', () => {
    expect(carryClipIndex(L('a', 'b', 'c'), L('a', 'b', 'c', 'd'), 1)).toBe(1);
  });
  it('an older day loaded in front: the index moves with its clip', () => {
    expect(carryClipIndex(L('c', 'd'), L('a', 'b', 'c', 'd'), 1)).toBe(3);
  });
  it('the oldest clips dropped by retention: the index moves back with its clip', () => {
    expect(carryClipIndex(L('a', 'b', 'c', 'd'), L('c', 'd', 'e'), 2)).toBe(0);
  });
  it('everything fed (index = length): follows the last fed clip, new clips come next', () => {
    expect(carryClipIndex(L('a', 'b'), L('a', 'b', 'c'), 2)).toBe(2);
    expect(carryClipIndex(L('a', 'b'), L('x', 'a', 'b', 'c'), 2)).toBe(3);
  });
  it('the clip itself is gone: the one after its predecessor', () => {
    expect(carryClipIndex(L('a', 'b', 'c'), L('a', 'c'), 1)).toBe(1);
  });
  it('neither the clip nor its predecessor is known: unchanged', () => {
    expect(carryClipIndex(L('a', 'b'), L('x', 'y', 'z'), 1)).toBe(1);
  });
});

describe('clipAt (the clip a jump plays)', () => {
  const T = 1_790_000_000_000;
  // lab 19.10.2026: consecutive segments 51:403 → 51:500 lie 0.89 s apart
  const clips = [
    { startTime: T, duration: 59_110 },
    { startTime: T + 60_000, duration: 60_000 },
    { startTime: T + 300_000, duration: 60_000 }, // after a real outage of 3 min
  ];
  it('inside a clip: that clip', () => {
    expect(clipAt(clips, T)).toBe(0);
    expect(clipAt(clips, T + 59_000)).toBe(0);
    expect(clipAt(clips, T + 60_000)).toBe(1);
  });
  it('in a small gap between two segments: the next one, not "no recording"', () => {
    expect(clipAt(clips, T + 59_110)).toBe(1);
    expect(clipAt(clips, T + 59_500)).toBe(1);
    expect(clipAt(clips, T + 300_000 - GAP_SNAP_MS)).toBe(2); // up to GAP_SNAP_MS before a start
  });
  it('in a real outage, before the first or after the last recording: none', () => {
    expect(clipAt(clips, T + 200_000)).toBe(-1);
    expect(clipAt(clips, T + 300_000 - GAP_SNAP_MS - 1)).toBe(-1);
    expect(clipAt(clips, T + 360_000)).toBe(-1);
    expect(clipAt(clips, T - 5_000)).toBe(-1);
    expect(clipAt([], T)).toBe(-1);
  });
  it('a clip without a duration counts as 60 s; the earliest following start wins in any order', () => {
    expect(clipAt([{ startTime: T }], T + 59_999)).toBe(0);
    expect(clipAt([clips[2]!, clips[1]!, clips[0]!], T + 59_500)).toBe(1);
  });
});
