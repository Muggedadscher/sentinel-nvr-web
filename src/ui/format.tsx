/** Word-dependent formatters (need `t`). Intl-only ones live in ../api. */
import type { TFn } from './i18n';
import { sentinelHumanBytes } from '../api';

/** "just now / 5 min ago / 2 h ago / 3 d ago" */
export function fmtRelative(ts: number, t: TFn, nowMs = Date.now()): string {
  const s = Math.max(0, (nowMs - ts) / 1000);
  if (s < 60) return t('nvr.time.justNow');
  if (s < 3600) return t('nvr.time.minAgo', { n: Math.round(s / 60) });
  if (s < 86400) return t('nvr.time.hAgo', { n: Math.round(s / 3600) });
  return t('nvr.time.dAgo', { n: Math.round(s / 86400) });
}
/** "<1 day" / "1 day" / "12 days" */
export function fmtDays(d: number, t: TFn): string {
  if (d < 1) return t('nvr.time.lessThanDay');
  const n = Math.round(d);
  return t('nvr.time.days', { count: n });
}
/** "7.7 GB" */
export function humanBytes(b: number): string { const h = sentinelHumanBytes(b); return `${h.value} ${h.unit}`; }
