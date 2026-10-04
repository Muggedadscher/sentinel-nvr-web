/**
 * Event markers that would overlap on the vertical timeline become ONE marker with a count (DOM-free, tested in
 * test/ui/timeline-groups.test.tsx). At the start scale (2 h per screen) a minute is ~5 px, the markers are 9 / 6 px
 * tall: events a minute or two apart lay on top of each other, the stack showed one marker and a tap opened the oldest
 * (drawn last). A tap on a group zooms into it instead (user 04.10.2026).
 */
import { SENTINEL_CLASS_PRIORITY, sentinelClassOf, type SentinelEvent, type SentinelEventClass } from '../api';

/** markers closer than this (px, centre to centre) form a group; the group marker is 14 px tall, so two groups never touch */
export const GROUP_PX = 14;
/** a tap zooms so the group fills this share of the viewport height */
export const GROUP_FILL = 0.5;
/** at least one zoom-button step per tap */
export const GROUP_MIN_STEP = 1.7;

export interface EventGroup {
  /** newest first, like the timeline draws them */
  events: SentinelEvent[];
  newest: SentinelEvent;
  oldest: SentinelEvent;
  /** most important class of all members (a person among cars colours the group like a person) */
  cls: SentinelEventClass;
}

/**
 * Groups events (sorted newest first) whose markers would be closer than `gapPx` at `px` pixels per ms. A group is
 * anchored at its newest event: a member lies less than `gapPx` below it, the next group starts at least `gapPx` below
 * it — the group marker sits at the newest event, so neighbouring markers never overlap and a long chain of events
 * does not melt into one group. Without a scale (px = 0, before the first layout) every event stands alone.
 */
export function groupEvents(eventsNewestFirst: SentinelEvent[], px: number, gapPx = GROUP_PX): EventGroup[] {
  const out: EventGroup[] = [];
  let cur: EventGroup | null = null;
  for (const ev of eventsNewestFirst) {
    if (cur && px > 0 && (cur.newest.timestamp - ev.timestamp) * px < gapPx) {
      cur.events.push(ev);
      cur.oldest = ev;
      continue;
    }
    cur = { events: [ev], newest: ev, oldest: ev, cls: 'motion' };
    out.push(cur);
  }
  for (const g of out) g.cls = groupClass(g.events);
  return out;
}

function groupClass(events: SentinelEvent[]): SentinelEventClass {
  let best = SENTINEL_CLASS_PRIORITY.length;
  for (const ev of events) {
    const i = SENTINEL_CLASS_PRIORITY.indexOf(sentinelClassOf(ev));
    if (i < best) best = i;
  }
  return SENTINEL_CLASS_PRIORITY[best] ?? 'motion';
}

/**
 * Scale after a tap on a group: its time span fills GROUP_FILL of the viewport, at least one zoom step, at most the
 * finest scale. `null` when the timeline is already at the finest scale — the events are seconds apart and no zoom
 * separates them.
 */
export function groupZoomPx(g: EventGroup, px: number, vh: number, maxPx: number): number | null {
  if (!(px > 0) || px >= maxPx * 0.999) return null;
  const span = g.newest.timestamp - g.oldest.timestamp;
  const want = span > 0 ? (vh * GROUP_FILL) / span : maxPx;
  return Math.min(maxPx, Math.max(want, px * GROUP_MIN_STEP));
}

/** Text on the group marker: the count, two digits at most. */
export function groupCountLabel(n: number): string {
  return n > 99 ? '99+' : String(n);
}
