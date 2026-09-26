import { describe, it, expect } from 'vitest';
import { skipTarget, SKIP_LIVE_EDGE_MS } from '../../src/player/skip';

const NOW = 1_790_000_000_000;

describe('skipTarget (±15 s buttons, arrow keys)', () => {
  it('live: back starts at now − N, forward does nothing', () => {
    expect(skipTarget(true, null, -15_000, NOW)).toBe(NOW - 15_000);
    expect(skipTarget(true, null, 15_000, NOW)).toBeNull();
  });
  it('recording: plain jumps in both directions', () => {
    expect(skipTarget(false, NOW - 3_600_000, 15_000, NOW)).toBe(NOW - 3_600_000 + 15_000);
    expect(skipTarget(false, NOW - 3_600_000, -15_000, NOW)).toBe(NOW - 3_600_000 - 15_000);
  });
  it('forward past the recording edge goes live instead of landing on nothing', () => {
    expect(skipTarget(false, NOW - 15_000, 15_000, NOW)).toBe('live');
    expect(skipTarget(false, NOW - SKIP_LIVE_EDGE_MS - 15_000 - 1, 15_000, NOW)).toBe(NOW - SKIP_LIVE_EDGE_MS - 1);
  });
  it('backward near the edge stays a jump', () => {
    expect(skipTarget(false, NOW - 10_000, -15_000, NOW)).toBe(NOW - 25_000);
  });
  it('no position yet: relative to now', () => {
    expect(skipTarget(false, null, -60_000, NOW)).toBe(NOW - 60_000);
  });
});
