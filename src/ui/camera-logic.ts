/** DOM-free logic of the camera page (testable without a browser). */
import { sentinelAddDays as addDays, sentinelDayOf as dayOf, fmtDay, fmtTimeSec } from '../api';
import type { PlayerState } from '../player/controller';
import type { TFn } from './i18n';

/** Date-chip arrows: yesterday exists down to the retention floor, tomorrow never past today. */
export function dateChipNav(centerDay: number, oldestAllowed: number, today: number = dayOf(Date.now())): { prevDisabled: boolean; nextDisabled: boolean } {
  return { prevDisabled: addDays(centerDay, -1) < oldestAllowed, nextDisabled: centerDay >= today };
}

/** Info-bar status: label, plus " · [day ]hh:mm:ss" of the playhead while not live. */
export function stageStatus(ps: Pick<PlayerState, 'live' | 'label' | 'playhead'>, t: TFn, locale: string, loadError = false, now: number = Date.now()): string {
  const label = loadError ? t('nvr.error.loadFailed') : ps.label ? t(`nvr.player.${ps.label}`) : '';
  if (ps.live || ps.playhead == null) return label;
  const day = dayOf(ps.playhead) === dayOf(now) ? '' : fmtDay(ps.playhead, locale) + ' ';
  return `${label} · ${day}${fmtTimeSec(ps.playhead, locale)}`;
}
