/**
 * Vertical timeline (Scrypted mechanics 1:1: fixed playhead at 35 %, native
 * scroll = scrub time-lapse, hold/release seeks, only the visible window is
 * rendered). Client, translate function and locale come from the SentinelUi context.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, ArrowUp } from 'lucide-react';
import {
  SENTINEL_DAY_MS as DAY,
  sentinelAddDays as addDays,
  sentinelWallMarks as wallMarks,
  sentinelWallSeconds as wallSec,
  sentinelClassOf as classOf,
  sentinelClipRuns,
  sentinelEventPlayTs as eventPlayTs,
  fmtDay as dayLabel,
  fmtTime,
  fmtTimeSec,
  type SentinelClip as Clip,
  type SentinelEvent as NvrEvent,
} from '../../api';
import { rlog } from '../../player';
import { useSentinelUi } from '../context';
import { EventBadges, classLabel } from './ClassBadge';

export interface ScrubHandlers {
  /** first touch/wheel of a gesture (freeze, scrub profile on) */
  begin: () => void;
  /** every scroll frame: centre, smoothed velocity (timeline-ms per wall-s), smoothed centre */
  move: (centerTs: number, vel: number, smoothTs: number) => void;
  /** release (pointer/touch up after a move): land on ts at 1× */
  seek: (ts: number) => void;
  /** brief hold (250 ms without movement) mid-gesture: slow the time-lapse to 1× at the current position; only a large
   *  drift becomes a seek — every seek shows ~2.4 s of stale stream before the new picture, so step-wise wheel scrolling
   *  with a seek per step made the picture run back and forth (user 23.09.) */
  hold: (centerTs: number) => void;
  /** gesture settled → back to auto-follow; the player lands exactly on centerTs if it drifted */
  idle: (centerTs: number) => void;
}
export interface TimelineProps {
  camId: string;
  /** continuous range: rangeStart = oldest loaded midnight, rangeEnd = end of today */
  rangeStart: number;
  rangeEnd: number;
  clips: Clip[];
  events: NvrEvent[];
  motion: [number, number][];
  live: boolean;
  playhead: () => number | null;
  following: () => boolean;
  filterOff: Record<string, boolean>;
  onEvent: (ev: NvrEvent) => void;
  onGoLive: () => void;
  scrub: ScrubHandlers;
  /** centre of the view moved (throttled) — the page loads neighbouring days and updates the date chip */
  onCenter: (ts: number) => void;
  /** imperative jump: scroll the centre to ts (date chip / picker) */
  jump: { ts: number; n: number } | null;
}
/**
 * Scrypted-style vertical timeline over SEVERAL days: newest at the top, the
 * FIXED centre line is the playhead; the content scrolls natively and simply
 * continues across midnight (day separators in the axis). Recording band,
 * motion stretches, class-coloured event markers with thumbnails, LIVE line.
 * Scrolling = scrub time-lapse (server-side rate from the scroll velocity): a
 * brief hold preview-seeks, the release lands on the centre at 1×, 700 ms of
 * silence hands control back to auto-follow. Only the visible window is
 * rendered (a fortnight of markers would otherwise be thousands of nodes).
 */
export function VerticalTimeline(p: TimelineProps) {
  const { client, t, locale } = useSentinelUi();
  const hhmm = (ts: number) => fmtTime(ts, locale),
    hhmmss = (ts: number) => fmtTimeSec(ts, locale),
    dayLbl = (ts: number) => dayLabel(ts, locale);
  const scroll = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(600);
  const [px, setPx] = useState(0); // px per ms
  const [, tick] = useState(0);
  const VT = useRef({
    user: 0,
    down: false,
    moved: false,
    previewing: false,
    vel: 0,
    smooth: null as number | null,
    lastC: null as { ts: number; at: number } | null,
    holdT: 0,
    relT: 0,
    lastCenterCb: 0,
    selfAt: 0,
    lastJumpLog: 0,
    idleAt: 0,
    selfTop: -1,
    backoffUntil: 0,
    lastForeignLog: 0,
    touching: false,
  });
  useEffect(() => {
    const el = scroll.current!;
    const ro = new ResizeObserver(() => setVh(el.clientHeight || 600));
    ro.observe(el);
    setVh(el.clientHeight || 600);
    return () => ro.disconnect();
  }, []);
  const minPx = vh / (3 * DAY),
    maxPx = vh / (2 * 60 * 1000);
  useEffect(() => {
    if (!px && vh) setPx(vh / (2 * 3600 * 1000));
  }, [vh, px]);
  // the playhead sits at 35 % of the viewport (Scrypted: 241 px of 687), not centred: more past below, a little future above
  const HEAD = 0.35;
  const PAD = Math.ceil(vh * HEAD),
    PAD_BOT = Math.ceil(vh * (1 - HEAD));
  const span = p.rangeEnd - p.rangeStart;
  const yFor = (ts: number) => PAD + (p.rangeEnd - ts) * px;
  const tsForY = (y: number) => p.rangeEnd - (y - PAD) / px;
  const centerTs = () => tsForY((scroll.current?.scrollTop || 0) + vh * HEAD);
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const setTop = (el: HTMLDivElement, top: number, why: string) => {
    const v = VT.current;
    v.selfAt = Date.now();
    el.scrollTop = top;
    v.selfTop = el.scrollTop;
    if (Math.abs(el.scrollTop - top) > 1.5) {
      // the browser refused (iOS during touch/momentum, or out of range) → don't retry every 100 ms
      v.backoffUntil = Date.now() + 400;
      if (Date.now() - v.lastForeignLog > 2000) {
        v.lastForeignLog = Date.now();
        rlog('follow-stuck', {
          why,
          want: Math.round(top),
          got: Math.round(el.scrollTop),
          max: el.scrollHeight - el.clientHeight,
          ch: el.clientHeight,
          vh,
          touching: v.touching,
          vis: document.visibilityState,
        });
      }
    }
  };
  const scrollCenter = (ts: number, why = 'follow') => {
    const el = scroll.current;
    if (!el) return;
    if (Date.now() < VT.current.backoffUntil) return;
    const top = yFor(ts) - vh * HEAD;
    if (Math.abs(el.scrollTop - top) > 0.5) setTop(el, top, why);
  };
  // initial position: "now"; imperative jumps from the page
  const init = useRef(false);
  useEffect(() => {
    if (!px || init.current) return;
    init.current = true;
    scrollCenter(Date.now());
  }, [px]);
  const prevEnd = useRef(p.rangeEnd);
  useEffect(() => {
    const d = p.rangeEnd - prevEnd.current;
    prevEnd.current = p.rangeEnd;
    const el = scroll.current;
    if (d && el && px) setTop(el, el.scrollTop + d * px, 'range');
  }, [p.rangeEnd, px]);
  useEffect(() => {
    if (p.jump && px) scrollCenter(p.jump.ts, 'jump');
  }, [p.jump?.n, px]);
  useEffect(() => {
    const on = () => {
      VT.current.touching = true;
    };
    const off = () => {
      VT.current.touching = false;
    };
    document.addEventListener('touchstart', on, { passive: true });
    document.addEventListener('touchend', off);
    document.addEventListener('touchcancel', off);
    return () => {
      document.removeEventListener('touchstart', on);
      document.removeEventListener('touchend', off);
      document.removeEventListener('touchcancel', off);
    };
  }, []);
  // auto-follow (live: now; playback: playhead) while the user is not interacting; re-render the centre time.
  // Registered ONCE; the tick reads the current render's values through a ref (re-registering the interval and the
  // listeners below on every render — every 100 ms — was pure churn, and wheel events could fall into the gap).
  const followTick = () => {
    const v = VT.current;
    if (!v.user) {
      const ts = p.live ? Date.now() : p.following() ? p.playhead() : null;
      if (ts != null) {
        // diagnostics: a follow step that moves the centre by > 3 s AND > 1.5 px is a visible jump — log why (user report "springt vor
        // und zurück"); the pixel floor keeps Safari's integer scrollTop at day zoom (1 px ≈ 12 s) out of the log
        const cur = centerTs();
        const d = ts - cur;
        if (Math.abs(d) > 3000 && Math.abs(d * px) > 1.5 && Date.now() - v.lastJumpLog > 1000) {
          v.lastJumpLog = Date.now();
          rlog('follow-jump', {
            dSec: Math.round(d / 100) / 10,
            live: p.live,
            sinceIdle: v.idleAt ? Date.now() - v.idleAt : -1,
            px: Math.round(px * 1e6) / 1e6,
          });
        }
        scrollCenter(ts);
      }
    }
    notifyCenter();
    tick((n) => n + 1);
  };
  const followRef = useRef(followTick);
  followRef.current = followTick;
  useEffect(() => {
    const t = setInterval(() => followRef.current(), 100);
    return () => clearInterval(t);
  }, []);
  const notifyCenter = () => {
    const v = VT.current;
    if (Date.now() - v.lastCenterCb < 400) return;
    v.lastCenterCb = Date.now();
    p.onCenter(clamp(centerTs(), p.rangeStart, p.rangeEnd - 1));
  };
  const scrubSeek = (ts?: number) => {
    const v = VT.current;
    v.previewing = true;
    p.scrub.seek(clamp(ts ?? centerTs(), p.rangeStart, p.rangeEnd - 1));
  };
  const userIdle = () => {
    VT.current.user = 0;
    VT.current.idleAt = Date.now();
    p.scrub.idle(clamp(centerTs(), p.rangeStart, p.rangeEnd - 1));
  };
  const scrubHold = () => {
    const v = VT.current;
    v.previewing = true;
    p.scrub.hold(clamp(centerTs(), p.rangeStart, p.rangeEnd - 1));
  };
  const markUser = () => {
    const v = VT.current;
    if (!v.user) {
      v.vel = 0;
      v.smooth = null;
      v.lastC = null;
      p.scrub.begin();
    }
    v.user = Date.now();
    v.previewing = false;
    v.moved = false;
  };
  const release = () => {
    const v = VT.current;
    if (!v.user) return;
    v.down = false;
    clearTimeout(v.holdT);
    if (v.moved) scrubSeek();
    clearTimeout(v.relT);
    v.relT = window.setTimeout(userIdle, 250);
  };
  const releaseRef = useRef(release);
  releaseRef.current = release;
  useEffect(() => {
    const h = () => releaseRef.current();
    for (const n of ['pointerup', 'pointercancel', 'touchend']) window.addEventListener(n, h);
    return () => {
      for (const n of ['pointerup', 'pointercancel', 'touchend']) window.removeEventListener(n, h);
    };
  }, []);
  const onScroll = () => {
    const v = VT.current;
    const el = scroll.current!;
    if (!v.user) {
      // our own follow/compensation scroll lands exactly where we put it; anything else is the user
      // (a touch we did not see, scrollbar drag, momentum after a missed touchend) → treat it as a gesture instead of fighting it
      if (Math.abs(el.scrollTop - v.selfTop) <= 1.5 || Date.now() - v.selfAt < 80) return;
      if (Date.now() - v.lastForeignLog > 2000) {
        v.lastForeignLog = Date.now();
        rlog('foreign-scroll', {
          d: Math.round(el.scrollTop - v.selfTop),
          touching: v.touching,
          live: p.live,
          vis: document.visibilityState,
        });
      }
      markUser();
      v.down = v.touching;
    } else if (Date.now() - v.selfAt < 80 && Math.abs(el.scrollTop - v.selfTop) <= 1.5) {
      v.lastC = { ts: centerTs(), at: Date.now() };
      return;
    } // range-end compensation, not the user
    v.user = Date.now();
    v.moved = true;
    if (v.previewing) {
      v.previewing = false;
      p.scrub.begin();
    }
    const now = Date.now(),
      c = centerTs();
    if (v.lastC) {
      const dt = Math.max(16, now - v.lastC.at);
      v.vel = 0.7 * v.vel + 0.3 * (((c - v.lastC.ts) / dt) * 1000);
    }
    v.lastC = { ts: c, at: now };
    v.smooth = v.smooth == null ? c : v.smooth + 0.45 * (c - v.smooth);
    p.scrub.move(c, v.vel, v.smooth);
    notifyCenter();
    tick((n) => n + 1);
    clearTimeout(v.holdT);
    v.holdT = window.setTimeout(() => scrubHold(), 250);
    clearTimeout(v.relT);
    v.relT = window.setTimeout(() => {
      if (!v.down) userIdle();
    }, 700);
  };
  // wheel: plain = native scroll (scrub), ctrl = zoom around the pointer (non-passive listener → preventDefault works)
  const onWheel = (e: globalThis.WheelEvent) => {
    const el = scroll.current!;
    if (!e.ctrlKey) {
      markUser();
      return;
    }
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const y = e.clientY - r.top;
    applyZoom(px * Math.exp(-e.deltaY * 0.002), tsForY(el.scrollTop + y), y);
  };
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const el = scroll.current!;
    const h = (e: globalThis.WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  const applyZoom = (npx: number, anchor: number, anchorY: number) => {
    const c = clamp(npx, minPx, maxPx);
    setPx(c);
    requestAnimationFrame(() => {
      const el = scroll.current;
      if (el) setTop(el, PAD + (p.rangeEnd - anchor) * c - anchorY, 'zoom');
    });
  };
  const zoomStep = (f: number) => {
    const a = p.live ? Date.now() : (p.playhead() ?? centerTs());
    applyZoom(px * f, a, vh * HEAD);
  };

  const runs = useMemo(() => sentinelClipRuns(p.clips), [p.clips]);
  const vis = useMemo(
    () =>
      p.events
        .filter((e) => !p.filterOff[classOf(e)])
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp),
    [p.events, p.filterOff],
  );
  // visible window (plus one screen each side) — everything else is not rendered
  const top = scroll.current?.scrollTop || 0;
  const winStart = tsForY(top + 2 * vh),
    winEnd = tsForY(top - vh);
  const inWin = (a: number, b = a) => b >= winStart && a <= winEnd;
  const steps = [60000, 300000, 600000, 900000, 1800000, 3600000, 7200000, 10800000, 21600000];
  const step = steps.find((s) => s >= 70 / px) ?? steps[steps.length - 1]!;
  // the ruler runs to the very top of the content (through the future headroom above LIVE), not just to rangeEnd
  // px is 0 until the first layout pass → tsForY() would be Infinity and the loops unbounded
  const topTs = px > 0 ? tsForY(0) : p.rangeEnd;
  // labels, ruler ticks and midnight separators on LOCAL wall-clock positions (calendar days, not ±24 h: DST days are 23/25 h)
  const axisEnd = Math.min(topTs, winEnd),
    axisStart = Math.max(p.rangeStart, winStart);
  const axis = axisEnd >= axisStart ? wallMarks(axisStart, axisEnd, step, 2000) : [];
  const q = step / 4;
  const ticks = q * px >= 3 && axisEnd >= axisStart ? wallMarks(axisStart, axisEnd, q, 8000) : [];
  const stepSec = Math.round(step / 1000);
  const midnights: number[] = [];
  for (let t = addDays(axisStart, 0); t <= axisEnd && midnights.length < 400; t = addDays(t, 1))
    if (t > p.rangeStart) midnights.push(t);
  let lastThumbY = -1e9;
  const thumbGap = (window.innerWidth < 900 ? 63 : 77) + 6;
  const now = Date.now();
  // the centre label shows what the view shows: the scroll centre while the user scrubs or the view is not following
  // (paused, scrub settling), else the playhead the view follows
  const viewCenter = clamp(centerTs(), p.rangeStart, p.rangeEnd - 1);
  const center = VT.current.user || !p.following() ? viewCenter : p.live ? now : (p.playhead() ?? viewCenter);
  const centerIsToday = new Date(center).toDateString() === new Date().toDateString();
  const down = () => {
    VT.current.down = true;
    markUser();
  };
  return (
    <div className="nvr-vtl vtl-wrap">
      <div className="vtl-scroll" ref={scroll} onScroll={onScroll} onPointerDown={down} onTouchStart={down}>
        <div className="vtl-content" style={{ height: span * px + PAD + PAD_BOT }}>
          <div className="vtl-daybg" style={{ top: 0, height: span * px + PAD }} />
          {/* ruler (Scrypted's tile): a tick every quarter step — short / medium at the half / long at the label — exact per tick, only the visible window */}
          {ticks.map((t) => {
            const w = wallSec(t);
            return (
              <div
                key={'t' + t}
                className={'vtick' + (w % stepSec === 0 ? ' vtick--l' : w % (stepSec / 2) === 0 ? ' vtick--m' : '')}
                style={{ top: yFor(t) }}
              />
            );
          })}
          {axis.map((t) => (
            <div key={t} className="vaxis nvr-data" style={{ top: yFor(t) }}>
              {hhmm(t)}
            </div>
          ))}
          {midnights.map((t) => (
            <div key={'d' + t} className="vday" style={{ top: yFor(t) }}>
              <span className="nvr-data">{dayLbl(t)}</span>
            </div>
          ))}
          {runs.map(
            (r, i) =>
              inWin(r.s, r.e) && (
                <div key={i} className="vseg" style={{ top: yFor(r.e), height: Math.max(2, (r.e - r.s) * px) }} />
              ),
          )}
          {p.motion.map(
            (m, i) =>
              inWin(m[0], m[1]) && (
                <div key={i} className="vmot" style={{ top: yFor(m[1]), height: Math.max(4, (m[1] - m[0]) * px) }} />
              ),
          )}
          {vis.map((ev) => {
            if (!inWin(ev.timestamp)) return null;
            const y = yFor(ev.timestamp);
            const k = classOf(ev);
            const thumb = y - lastThumbY >= thumbGap && px > vh / (8 * 3600 * 1000);
            if (thumb) lastThumbY = y;
            return (
              <div key={ev.id}>
                <button
                  className={'vev' + (thumb ? '' : ' vev--minor')}
                  style={{ top: y, background: `var(--nvr-c-${k})` }}
                  onClick={() => p.onEvent(ev)}
                  aria-label={`${classLabel(t, k)} ${hhmmss(ev.timestamp)}`}
                  title={hhmmss(eventPlayTs(ev))}
                />
                {thumb && (
                  <>
                    <div className="vlink" style={{ top: y }}>
                      <span className="vlink-badges">
                        <EventBadges ev={ev} t={t} />
                      </span>
                      <i />
                    </div>
                    <button className="vthumb" style={{ top: y }} onClick={() => p.onEvent(ev)}>
                      <img src={client.eventThumbUrl(p.camId, ev.timestamp)} alt="" loading="lazy" />
                      <span className="tt nvr-data">{hhmmss(ev.timestamp)}</span>
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {inWin(now) && (
            <>
              <div className="vlive-line" style={{ top: yFor(now) }} />
              <button className="vlive-chip" style={{ top: yFor(now) }} onClick={p.onGoLive}>
                {t('nvr.live')}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="vcenter">
        <span className="vcenter-t nvr-data" data-ts={Math.round(center)}>
          {centerIsToday ? '' : dayLbl(center) + ' '}
          {hhmmss(center)}
        </span>
      </div>
      <div className="vtl-zoom">
        <button type="button" className="tool" onClick={() => zoomStep(1.7)} aria-label={t('nvr.timeline.zoomIn')}>
          <Plus size={16} />
        </button>
        <button type="button" className="tool" onClick={() => zoomStep(1 / 1.7)} aria-label={t('nvr.timeline.zoomOut')}>
          <Minus size={16} />
        </button>
      </div>
      {!p.live && (
        <button type="button" className="livejump" onClick={p.onGoLive}>
          <ArrowUp size={14} /> {t('nvr.live')}
        </button>
      )}
    </div>
  );
}
