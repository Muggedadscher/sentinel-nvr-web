/**
 * The cameras and the latest events in the style "Glas" (from 0.21.0; before, HAPulse's own `NvrHomeGlas`, `NvrStrip`
 * and `HomeSnapshot`, docs/GLAS-DESIGN.md §7.15 there): per camera a large snapshot with a clear capsule on top
 * (recording dot, name, state) and today's events at the bottom, several cameras side by side to swipe; then the latest
 * events as a strip of pictures, each opening the camera at that moment. From 900 px with a pointer that can hover, a
 * round glass button at each end of a strip scrolls it. Looks in `glas.css` (`.nvr-gl*`, only under
 * `:root[data-style='glas']`); a host shows these only in Glas.
 *
 * - `GlassNvr`: cameras and events as one body (HAPulse's Home card).
 * - `GlassSections`: the overview's sections with their titles, cameras first (`.nvr-gl-page`; inside `.nvr-overview`
 *   the cameras are a grid instead of a strip).
 *
 * A camera tile is the button that carries `data-nvr-camera`; its picture box (`.nvr-camtile__pic`) is its direct child
 * and the scrolling row an ancestor — a host's transition between the tile and the camera page finds it there. Opening
 * goes through the host (`nav.openCamera`): a tile with the camera alone, an event with its moment.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Camera, Cctv, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import {
  fmtDayPrefix,
  fmtTime,
  sentinelEventPlayTs,
  sentinelRecordingState,
  type SentinelCamera,
  type SentinelRecentEvent,
} from '../../api';
import { useSentinelUi } from '../context';
import { fmtRelative } from '../format';
import { drawLastTileSnapshot, hasLastTileSnapshot, rememberTileSnapshot } from '../snapshot-cache';
import { eventLabel } from './ClassBadge';
import { tileSnapshotWidth } from './CameraGrid';

const RETRY_MS = 30_000;

/** The snapshots' refresh: `tick` changes every `ms` while the page is visible (a new snapshot URL), `retry` every
 *  30 s — a tile whose snapshot failed tries it again then. */
function useSnapshotTick(ms: number): { tick: number; retry: number } {
  const [tick, setTick] = useState(() => Date.now());
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setTick(Date.now());
      setCount((n) => n + 1);
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return { tick, retry: Math.floor((count * ms) / RETRY_MS) };
}

/** The live snapshot, else the newest segment thumbnail, else a camera symbol. A failed snapshot is tried again in the
 *  background (every 30 s): the tile keeps its fallback until one has loaded — no broken picture in between. The box
 *  shows the camera's last picture at once until its own snapshot is decoded. */
function GlassSnapshot({ cam, tick, retry }: { cam: SentinelCamera; tick: number; retry: number }) {
  const { client } = useSentinelUi();
  const src = client.snapshotUrl(cam.id, tick, tileSnapshotWidth());
  const fallback = cam.latestThumbId ? client.segmentThumbUrl(cam.latestThumbId) : null;
  const [failed, setFailed] = useState(0);
  const now = useRef({ failed, src });
  now.current = { failed, src };
  useEffect(() => {
    if (now.current.failed === 0) return undefined;
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => setFailed(0);
    probe.src = now.current.src;
    return () => {
      probe.onload = null;
    };
  }, [retry]);
  const [last, setLast] = useState(() => hasLastTileSnapshot(cam.id));
  const drawLast = useCallback(
    (canvas: HTMLCanvasElement | null) => void (canvas && drawLastTileSnapshot(cam.id, canvas)),
    [cam.id],
  );
  const url = failed === 0 ? src : failed === 1 && fallback ? fallback : null;
  return url ? (
    <span className="nvr-camtile__pic">
      {last && <canvas className="nvr-camtile__img nvr-camtile__img--last" ref={drawLast} aria-hidden="true" />}
      <img
        className="nvr-camtile__img"
        src={url}
        alt=""
        crossOrigin="anonymous"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (failed === 0) rememberTileSnapshot(cam.id, img);
          if (!last) return;
          // the last picture goes once this one can be shown without a gap
          const drop = () => setLast(false);
          if (typeof img.decode === 'function') img.decode().then(drop, drop);
          else drop();
        }}
        onError={() => {
          // the placeholder comes next: the last picture goes with it
          if (failed > 0 || !fallback) setLast(false);
          setFailed((f) => Math.min(2, f + 1));
        }}
      />
    </span>
  ) : (
    <span className="nvr-camtile__placeholder" aria-hidden="true">
      <Camera size={22} strokeWidth={1.5} />
    </span>
  );
}

/** A strip with a round glass button at each end that can scroll that way (pointer only: `tabIndex -1`, hidden from
 *  screen readers; with the keyboard, focus scrolls each item into view). */
function GlassStrip<T extends HTMLElement>({
  className,
  count,
  children,
}: {
  className: string;
  /** Changes with the strip's items (their number), so the buttons look again. */
  count: number;
  /** The scrolling element (the strip itself), rendered with the ref. */
  children: (ref: RefObject<T | null>) => ReactNode;
}) {
  const ref = useRef<T | null>(null);
  const [ends, setEnds] = useState({ prev: false, next: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const prev = el.scrollLeft > 1;
      const next = el.scrollLeft < max - 1;
      setEnds((o) => (o.prev === prev && o.next === next ? o : { prev, next }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    // the items' width too (the strip's own size stays when an item grows or shrinks)
    if (ro && el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [count]);

  const go = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };

  const paddle = (dir: -1 | 1) => (
    <button
      type="button"
      className="nvr-gl__paddle nvr-glass"
      data-dir={dir < 0 ? 'prev' : 'next'}
      tabIndex={-1}
      aria-hidden="true"
      // a click must not focus a button hidden from screen readers (Chromium focuses it despite tabIndex -1)
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => go(dir)}
    >
      {dir < 0 ? <ChevronLeft size={20} strokeWidth={2.25} /> : <ChevronRight size={20} strokeWidth={2.25} />}
    </button>
  );

  return (
    <div className={`nvr-gl__strip ${className}`}>
      {children(ref)}
      {ends.prev && paddle(-1)}
      {ends.next && paddle(1)}
    </div>
  );
}

export interface GlassCamerasProps {
  cameras: SentinelCamera[];
  /** No answer from the NVR yet: an empty tile instead of "no cameras". */
  loading?: boolean | undefined;
  /** How often the snapshots refresh (ms, while the page is visible); default 5 s. */
  refreshMs?: number | undefined;
}

/** The cameras: per camera its snapshot tile, opening the camera page. */
export function GlassCameras({ cameras, loading = false, refreshMs = 5000 }: GlassCamerasProps) {
  const { tick, retry } = useSnapshotTick(refreshMs);
  return <GlassCameraTiles cameras={cameras} loading={loading} tick={tick} retry={retry} />;
}

function GlassCameraTiles({
  cameras,
  loading,
  tick,
  retry,
}: {
  cameras: SentinelCamera[];
  loading: boolean;
  tick: number;
  retry: number;
}) {
  const { t, nav } = useSentinelUi();
  if (cameras.length === 0) {
    return loading ? (
      <div className="nvr-gl__cams" aria-hidden="true">
        <div className="nvr-gl__wait" />
      </div>
    ) : (
      <p className="nvr-gl__empty">{t('nvr.cameras.none')}</p>
    );
  }
  return (
    <GlassStrip<HTMLDivElement> className="nvr-gl__strip--cams" count={cameras.length}>
      {(ref) => (
        <div
          ref={ref}
          className="nvr-gl__cams"
          role="list"
          aria-label={t('nvr.cameras.title')}
          data-several={cameras.length > 1 ? '' : undefined}
        >
          {cameras.map((c) => {
            const rec = sentinelRecordingState(c);
            const state =
              rec === 'ok'
                ? t('nvr.cameras.live')
                : rec === 'offline'
                  ? t('nvr.cameras.offline')
                  : rec === 'stalled'
                    ? t('nvr.cameras.stalled')
                    : null;
            const today = [
              t('nvr.cameras.eventsToday', { count: c.eventsToday }),
              c.lastEventTs ? fmtRelative(c.lastEventTs, t) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={c.id} role="listitem" className="nvr-gl__cam-item">
                <button
                  type="button"
                  className="nvr-gl__cam"
                  data-state={rec}
                  data-nvr-camera={c.id}
                  onClick={() => nav.openCamera(c.id)}
                  aria-label={[c.name, state, today].filter(Boolean).join(', ')}
                >
                  <GlassSnapshot cam={c} tick={tick} retry={retry} />
                  <span className="nvr-gl__shade" aria-hidden="true" />
                  <span className="nvr-gl__pill nvr-glass nvr-glass--clear" aria-hidden="true">
                    {rec !== 'off' && <span className="nvr-gl__dot" />}
                    <span className="nvr-gl__pill-text">{state ? `${c.name} · ${state}` : c.name}</span>
                  </span>
                  <span className="nvr-gl__caption" aria-hidden="true">
                    <span className="nvr-gl__title">
                      <span className="nvr-gl__name">{c.name}</span>
                      {state && <span className="nvr-gl__badge">{rec === 'ok' ? t('nvr.live') : state}</span>}
                    </span>
                    <span className="nvr-gl__today">{today}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </GlassStrip>
  );
}

export interface GlassEventsProps {
  events: SentinelRecentEvent[];
  /** Name the camera of each event (more than one camera). */
  several: boolean;
}

/** The latest events: picture, time (before today with its day, "gestern 22:10"), classes and camera; each opens the
 *  camera at that moment. */
export function GlassEvents({ events, several }: GlassEventsProps) {
  const { client, t, locale, nav } = useSentinelUi();
  if (events.length === 0) return null;
  const now = Date.now();
  return (
    <GlassStrip<HTMLUListElement> className="nvr-gl__strip--events" count={events.length}>
      {(ref) => (
        <ul ref={ref} className="nvr-gl__events" aria-label={t('nvr.events.title')}>
          {events.map((e) => {
            const day = fmtDayPrefix(e.ts, locale, now);
            const time = fmtTime(e.ts, locale);
            return (
              <li key={`${e.camera}-${e.ts}`} className="nvr-gl__ev-item">
                <button
                  type="button"
                  className="nvr-gl__ev"
                  onClick={() => nav.openCamera(e.camera, sentinelEventPlayTs(e), e.ts)}
                >
                  <img className="nvr-gl__ev-img" src={client.eventThumbUrl(e.camera, e.ts)} alt="" loading="lazy" />
                  <span className="nvr-gl__ev-text">
                    <span className="nvr-gl__ev-time">
                      {day && <span className="nvr-gl__ev-day">{day} </span>}
                      {time}
                    </span>
                    <span className="nvr-gl__ev-sub">
                      {eventLabel(t, e)}
                      {several && ` · ${e.cameraName}`}
                      <span className="nvr-gl__ev-ago"> · {fmtRelative(e.ts, t)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </GlassStrip>
  );
}

export interface GlassNvrProps {
  cameras: SentinelCamera[];
  events: SentinelRecentEvent[];
  /** No answer from the NVR yet: an empty tile instead of "no cameras". */
  loading?: boolean | undefined;
  /** How often the snapshots refresh (ms, while the page is visible); default 5 s. */
  refreshMs?: number | undefined;
}

/** Cameras and events as one body (a host's NVR card). */
export function GlassNvr({ cameras, events, loading = false, refreshMs = 5000 }: GlassNvrProps) {
  return (
    <div className="nvr-gl">
      <GlassCameras cameras={cameras} loading={loading} refreshMs={refreshMs} />
      <GlassEvents events={events} several={cameras.length > 1} />
    </div>
  );
}

/** The overview's cameras and events as sections with their titles (symbol + title), the cameras first. */
export function GlassSections({ cameras, events }: { cameras: SentinelCamera[]; events: SentinelRecentEvent[] }) {
  const { t } = useSentinelUi();
  return (
    <div className="nvr-gl-page">
      <section className="nvr-section nvr-gl-page__cams">
        <h2 className="nvr-section__label">
          <span className="nvr-section__icon" aria-hidden="true">
            <Cctv size={18} strokeWidth={2} />
          </span>
          {t('nvr.cameras.title')}
        </h2>
        <GlassCameras cameras={cameras} />
      </section>
      {events.length > 0 && (
        <section className="nvr-section nvr-gl-page__events">
          <h2 className="nvr-section__label">
            <span className="nvr-section__icon" aria-hidden="true">
              <Zap size={18} strokeWidth={2} />
            </span>
            {t('nvr.events.title')}
          </h2>
          <div className="nvr-gl-page__list">
            <GlassEvents events={events} several={cameras.length > 1} />
          </div>
        </section>
      )}
    </div>
  );
}
