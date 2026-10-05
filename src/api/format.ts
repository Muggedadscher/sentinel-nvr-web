/**
 * Locale-aware, translation-free formatting (Intl only). Word-dependent helpers
 * (relative time, "N days") live in @sentinel-nvr/ui, which owns the i18n dictionary.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM in the viewer's locale (24 h where the locale uses it). */
export function fmtTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(ts);
}

/**
 * Day in front of a time where "HH:MM" alone is ambiguous: '' on the viewer's today (and for a clock running a bit
 * ahead), the locale's word for yesterday ("gestern", "yesterday", "i går" — Intl, no dictionary key), else a short
 * numeric date ("3.10.", "10/3"). Calendar days of the viewer's time zone, so DST days (23/25 h) count as one day.
 */
export function fmtDayPrefix(ts: number, locale: string, now: number = Date.now()): string {
  const day = new Date(ts).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  if (day >= today) return '';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (day === y.getTime()) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).format(ts);
}

/** HH:MM:SS. */
export function fmtTimeSec(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ts);
}

/** "Mon 8 Sep" style day label. */
export function fmtDay(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(ts);
}

/** Month + year for a date-picker header. */
export function fmtMonthYear(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(ts);
}

/** Weekday short names (Monday first) for a date-picker grid. */
export function weekdayShorts(locale: string): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)));
}

/** HH:MM string for a <input type="time">. */
export function hhmmInput(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
