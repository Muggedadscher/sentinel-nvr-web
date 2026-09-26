/** DOM-free logic of the camera page (testable without a browser). */
import { sentinelAddDays as addDays, sentinelDayOf as dayOf, fmtDay, fmtTimeSec } from '../api';
import type { PlayerState } from '../player/controller';
import type { TFn } from './i18n';

/** Date-chip arrows: yesterday exists down to the retention floor, tomorrow never past today. */
export function dateChipNav(
  centerDay: number,
  oldestAllowed: number,
  today: number = dayOf(Date.now()),
): { prevDisabled: boolean; nextDisabled: boolean } {
  return { prevDisabled: addDays(centerDay, -1) < oldestAllowed, nextDisabled: centerDay >= today };
}

/** Info-bar status: label, plus " · [day ]hh:mm:ss" of the playhead while not live. Recorded playback on the
 *  MSE / native fallback (relay failed twice) says so — no time-lapse scrubbing there, full-res segments. */
export function stageStatus(
  ps: Pick<PlayerState, 'live' | 'label' | 'playhead'> & Partial<Pick<PlayerState, 'transport'>>,
  t: TFn,
  locale: string,
  loadError = false,
  now: number = Date.now(),
): string {
  let label = loadError ? t('nvr.error.loadFailed') : ps.label ? t(`nvr.player.${ps.label}`) : '';
  if (!ps.live && !loadError && label && (ps.transport === 'mse' || ps.transport === 'native'))
    label += ` (${t('nvr.player.fallbackMode')})`;
  if (ps.live || ps.playhead == null) return label;
  const day = dayOf(ps.playhead) === dayOf(now) ? '' : fmtDay(ps.playhead, locale) + ' ';
  return `${label} · ${day}${fmtTimeSec(ps.playhead, locale)}`;
}

/** Keyboard shortcuts of the camera page apply? Not with modifiers (Ctrl+P prints), not in form fields or
 *  editable content, not for keys another handler already took, and SPACE never on a focused button/link
 *  (it activates the button — the global handler used to swallow it and toggle playback instead). */
export function shouldHandleKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'defaultPrevented' | 'target'>,
): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  if (!el || typeof el !== 'object') return true;
  if (el.isContentEditable) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return false;
  if (e.key === ' ' && (tag === 'button' || tag === 'a' || tag === 'summary' || el.getAttribute?.('role') === 'button'))
    return false;
  return true;
}
