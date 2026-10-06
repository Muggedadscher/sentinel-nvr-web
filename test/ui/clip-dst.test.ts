// The 25-h day (Europe/Berlin, 25.10.2026): 02:00–03:00 exists twice — the clip chips add the UTC offset there.
process.env.TZ = 'Europe/Berlin';
import { describe, expect, it } from 'vitest';
import { clipTimeAmbiguous, fmtClipTime } from '../../src/ui/clip-logic';

const H = 3600_000;
// 25.10.2026 00:30 UTC = 02:30 CEST (first 02:30), 01:30 UTC = 02:30 CET (second 02:30)
const first = Date.UTC(2026, 9, 25, 0, 30);
const second = Date.UTC(2026, 9, 25, 1, 30);

describe('clip times on the 25-h day', () => {
  it('time zone of this file really is Europe/Berlin', () => {
    expect(new Date(first).getHours()).toBe(2);
    expect(new Date(second).getHours()).toBe(2);
  });
  it('both 02:30 are ambiguous, 01:30 and 03:30 are not', () => {
    expect(clipTimeAmbiguous(first)).toBe(true);
    expect(clipTimeAmbiguous(second)).toBe(true);
    expect(clipTimeAmbiguous(first - H)).toBe(false);
    expect(clipTimeAmbiguous(second + H)).toBe(false);
    // the spring change (29.03.: 02:00 → 03:00) repeats nothing
    expect(clipTimeAmbiguous(Date.UTC(2026, 2, 29, 1, 30))).toBe(false);
  });
  it('the chips tell the two 02:30 apart by their offset; normal times stay plain', () => {
    const a = fmtClipTime(first, 'de-DE'),
      b = fmtClipTime(second, 'de-DE');
    expect(a).not.toBe(b);
    expect(a).toContain('02:30:00');
    expect(a).toMatch(/\+2/);
    expect(b).toMatch(/\+1/);
    expect(fmtClipTime(first - H, 'de-DE')).toBe('01:30:00');
  });
});
