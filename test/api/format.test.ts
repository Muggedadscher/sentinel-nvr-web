import { describe, it, expect } from 'vitest';
import { weekdayShorts, fmtMonthYear, hhmmInput } from '../../src/api';

describe('format (locale, TZ-independent bits)', () => {
  it('weekdayShorts returns 7 entries starting Monday', () => {
    const w = weekdayShorts('en-US');
    expect(w).toHaveLength(7);
    expect(w[0]!.toLowerCase()).toContain('mon');
  });
  it('fmtMonthYear uses the locale month name', () => {
    // 2026-06-15T12:00 local — mid-month avoids any TZ date rollover
    const ts = new Date(2026, 5, 15, 12, 0).getTime();
    expect(fmtMonthYear(ts, 'en-US')).toBe('June 2026');
  });
  it('hhmmInput pads to HH:MM', () => {
    const ts = new Date(2026, 5, 15, 9, 5).getTime();
    expect(hhmmInput(ts)).toBe('09:05');
  });
});
