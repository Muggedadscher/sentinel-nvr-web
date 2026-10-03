import { describe, it, expect } from 'vitest';
import { carryClipIndex } from '../../src/player/clips';

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
