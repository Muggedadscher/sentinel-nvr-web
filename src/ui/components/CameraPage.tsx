/**
 * The camera page (Scrypted's timeline page): stage left (video, control pill,
 * mute FAB, info bar with snapshot / PiP / fullscreen), vertical multi-day
 * timeline + events list right (stacked on mobile). Days are loaded on demand
 * around the view centre and merged into ONE continuous range; the
 * PlayerController owns every playback decision (live → relay → fallbacks).
 *
 * This is the ONE implementation both consumers render (the plugin's own UI and
 * HAPulse) — hosts only supply the header row, the modal around the date picker
 * and routing. Client, translate function and locale come from the SentinelUi
 * context; player labels are `nvr.player.<key>` in the host dictionary.
 *
 * Deep link: `startAt` (+ `posterTs`) starts playback there with the event
 * frame as poster (the events strip / home card link here).
 *
 * Clip mode (plugin with `features: ["export"]`): "Download clip" in the info bar
 * or next to an event in the list shows the range as a band on the timeline and
 * the ClipBar under it; its edges are set over the playhead line.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  FastForward,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  sentinelAddDays as addDays,
  sentinelAtTime as atTime,
  sentinelDayEnd as dayEnd,
  SENTINEL_EVENT_CLASSES,
  sentinelClassesOf,
  sentinelEventHidden,
  sentinelDayOf as dayOf,
  sentinelEventPlayTs,
  sentinelMergeDays,
  sentinelHasFeature,
  fmtDay,
  fmtDayPrefix,
  fmtTimeSec,
  type SentinelClip,
  type SentinelClipsResponse,
  type SentinelEvent,
  type SentinelEventClass,
} from '../../api';
import { PlayerController, rlog, type PlayerState } from '../../player';
import { isIosHomeScreenApp, outsideAppHref } from '../outside';
import { useSentinelUi } from '../context';
import { dateChipNav, eventsOnDay, shouldHandleKey, stageStatus, todayRefreshAllowed } from '../camera-logic';
import { lastTileSnapshot } from '../snapshot-cache';
import {
  CLIP_MAX_MS,
  clampClipRange,
  clipProposal,
  clipRangeForEvent,
  clipSetEdge,
  type ClipEdge,
} from '../clip-logic';
import { ClassBadge, classLabel } from './ClassBadge';
import { ClipBar } from './ClipBar';
import { EventList } from './EventList';
import { VerticalTimeline, type ScrubHandlers } from './VerticalTimeline';

const IDLE: PlayerState = {
  live: true,
  label: 'live',
  playhead: null,
  rate: 1,
  sound: false,
  paused: false,
  transport: 'none',
  muted: true,
};
const todayStart = () => dayOf(Date.now());
type Days = Record<number, SentinelClipsResponse>;

/** What the host's modal receives (grid + footer come from `useDatePicker`). */
export interface DatePickerRequest {
  dayStart: number;
  timeTs: number;
  oldestAllowed: number;
  onGo: (dayStart: number, time: string | null) => void;
  onClose: () => void;
}

export interface CameraPageProps {
  camId: string;
  /** display name (falls back to the id while the camera list loads) */
  name: string;
  /** retention floor = `stats.earliest` (no day older than this is requested) */
  earliest?: number | undefined;
  /** deep link: playback start (ms) and the event to poster */
  startAt?: number | undefined;
  posterTs?: number | undefined;
  /** localStorage prefix for the player's aspect cache (keep per host) */
  storagePrefix: string;
  /** telemetry brand (`b:` in every client-log line) */
  brand: string;
  /** media elements load with CORS (a cross-origin host needs it for canvas snapshots) */
  crossOrigin?: boolean | undefined;
  /** rendered above the two columns — the host's page header (see `CameraTitle`). As a function it gets the playback
   *  position (`at`, ms; `undefined` while live), e.g. for a link that opens this camera at the same moment elsewhere,
   *  and whether the page shows live (`info.live`; `at` is also `undefined` while a recording loads). */
  header?: ReactNode | ((at: number | undefined, info: CameraHeaderInfo) => ReactNode);
  /** `'immersive'`: the picture edge to edge with the header over it on phones, controls as floating capsules, the
   *  tabs as a segment (`data-nvr-appearance="immersive"` on the page; meant for dark tokens, the host scopes them).
   *  The host can style the floating parts through `--nvr-ctl-*`, `--nvr-float-*`, `--nvr-seg-*` (README).
   *  Default `'default'`: the page as before. */
  appearance?: 'default' | 'immersive' | undefined;
  /** the host wraps the date picker in its own modal primitive */
  renderDatePicker: (req: DatePickerRequest) => ReactNode;
  /** This camera outside the app (Sentinel's public entry, no token). Offered as "open in Safari" when a Home-Screen
   *  web app on iPhone/iPad cannot do Picture-in-Picture (Apple blocks it there; Safari allows it). As a function it
   *  gets the playback position like `header` (`sentinelTimelineLink(origin, id, at)`), so Safari continues there. */
  externalUrl?: string | ((at: number | undefined) => string) | undefined;
}

/** What a `header` function gets besides the playback position. */
export interface CameraHeaderInfo {
  /** the page shows live */
  live: boolean;
}

/** Host header row: back button + camera name (+ host actions on the right). Same metrics in every host.
 *  `live` / `at` (from the `header` function) add a badge next to the name: "LIVE", or the time of the picture
 *  (with "yesterday" or a short date in front on another day); without them the row is as before. */
export function CameraTitle({
  name,
  onBack,
  children,
  live,
  at,
}: {
  name: string;
  onBack: () => void;
  children?: ReactNode;
  live?: boolean | undefined;
  at?: number | undefined;
}) {
  const { t, locale } = useSentinelUi();
  const day = !live && at != null ? fmtDayPrefix(at, locale) : '';
  const badge = live ? (
    <span className="nvr-cam__badge nvr-cam__badge--live">{t('nvr.live')}</span>
  ) : at != null ? (
    <span className="nvr-cam__badge nvr-cam__badge--time nvr-data">
      {day ? `${day} ${fmtTimeSec(at, locale)}` : fmtTimeSec(at, locale)}
    </span>
  ) : null;
  const h1 = <h1 className="nvr-cam__h1">{name}</h1>;
  return (
    <div className="nvr-cam__head">
      <div className="nvr-cam__title">
        <button type="button" className="nvr-iconbtn" aria-label={t('nvr.back')} onClick={onBack}>
          <ChevronLeft size={20} />
        </button>
        {badge ? (
          <span className="nvr-cam__name">
            {h1}
            {badge}
          </span>
        ) : (
          h1
        )}
      </div>
      {children ? <div className="nvr-cam__actions">{children}</div> : null}
    </div>
  );
}

export { dateChipNav, stageStatus };

export function CameraPage(p: CameraPageProps) {
  const { client, t, locale } = useSentinelUi();
  const { camId, name, earliest, startAt = 0, posterTs = 0 } = p;
  const [days, setDays] = useState<Days>({});
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);
  const [centerDay, setCenterDay] = useState(todayStart());
  const [jump, setJump] = useState<{ ts: number; n: number } | null>(null);
  const [tab, setTab] = useState<'tl' | 'ev'>('tl');
  const [filterOff, setFilterOff] = useState<Record<string, boolean>>({});
  const [ps, setPs] = useState<PlayerState>(IDLE);
  const [loadError, setLoadError] = useState(false);
  const [dt, setDt] = useState(false);
  // Picture-in-Picture refused by the browser: 'homescreen' = iPhone/iPad Home-Screen app (Apple blocks PiP there)
  const [pipNote, setPipNote] = useState<null | 'homescreen' | 'unsupported'>(null);
  useEffect(() => {
    if (!pipNote) return;
    const i = setTimeout(() => setPipNote(null), 15000);
    return () => clearTimeout(i);
  }, [pipNote]);
  const onPip = useCallback(() => {
    const c = ctl.current;
    if (!c) return;
    void c.pip().then((r) => {
      if (r === 'unsupported') setPipNote(isIosHomeScreenApp() ? 'homescreen' : 'unsupported');
      else if (r === 'entered') setPipNote(null);
    });
  }, []);
  const body = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const freeze = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const ctl = useRef<PlayerController | null>(null);
  const psRef = useRef(ps);
  psRef.current = ps;
  const loading = useRef(new Set<number>());
  const daysRef = useRef(days);
  daysRef.current = days;
  const camRef = useRef(camId);
  camRef.current = camId;
  const deepRef = useRef(''); // camera|startAt the page last opened or jumped to (deep links)
  // clip mode: the range (null = off), `open` = it comes from a running event; the edge that follows the playhead line
  const [clip, setClip] = useState<{ from: number; to: number; open: boolean } | null>(null);
  const [clipEdge, setClipEdge] = useState<ClipEdge | null>(null);
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const clipEdgeRef = useRef(clipEdge);
  clipEdgeRef.current = clipEdge;
  const lineTs = useRef<number | null>(null); // time under the playhead line as the timeline last reported it
  const gestureAt = useRef(0); // last activity of the running timeline gesture, 0 = none (the today refresh waits for its end)

  // ---- data: one request per day, merged into a continuous range
  const merged = useMemo(() => {
    const m = sentinelMergeDays(days);
    const rangeStart = m.oldestDay ?? todayStart();
    // a little headroom above LIVE, not the whole rest of the day (moves with the clock)
    const rangeEnd = Math.min(dayEnd(todayStart()), nowTick + 20 * 60000);
    return { ...m, rangeStart, rangeEnd };
  }, [days, nowTick]);
  /** the merged range as of NOW (from daysRef, which ensureDay updates synchronously) — for code that just awaited a load */
  const mergedNow = useCallback(() => {
    const m = sentinelMergeDays(daysRef.current);
    return {
      ...m,
      rangeStart: m.oldestDay ?? todayStart(),
      rangeEnd: Math.min(dayEnd(todayStart()), Date.now() + 20 * 60000),
    };
  }, []);
  useEffect(() => {
    ctl.current?.setClips(merged.clips, merged.codecs, merged.rangeStart, merged.rangeEnd);
  }, [merged]);

  const fetchDay = useCallback(
    async (ds: number): Promise<SentinelClipsResponse> => {
      const d = await client.getJson<SentinelClipsResponse>(
        `api/clips?camera=${encodeURIComponent(camId)}&start=${ds}&end=${dayEnd(ds)}`,
      );
      d.clips = (d.clips || []).sort((a, b) => a.startTime - b.startTime);
      d.events = d.events || [];
      d.motion = d.motion || [];
      return d;
    },
    [client, camId],
  );
  /** load a day once (retention floor: nothing older than the oldest recording); `force` = refresh (today while live) */
  const ensureDay = useCallback(
    async (ds: number, force = false): Promise<void> => {
      if (ds > todayStart()) return;
      if (earliest && addDays(ds, 1) < dayOf(earliest)) return;
      if (!force && (daysRef.current[ds] || loading.current.has(ds))) return;
      loading.current.add(ds);
      try {
        const d = await fetchDay(ds);
        if (camRef.current !== camId) return;
        // the ref is updated SYNCHRONOUSLY: callers that await ensureDay() read the merged range right after (mergedNow) —
        // React renders the setDays() update in a later task, so a render-time ref would still miss this day (deep link → "no recording")
        daysRef.current = { ...daysRef.current, [ds]: d };
        setDays((prev) => ({ ...prev, [ds]: d }));
        setLoadError(false); // an earlier failed load is over once a day loads again
      } finally {
        loading.current.delete(ds);
      }
    },
    [fetchDay, earliest, camId],
  );
  const onCenter = useCallback(
    (ts: number) => {
      lineTs.current = ts;
      const d = dayOf(ts);
      setCenterDay(d);
      for (const x of [d, addDays(d, -1), addDays(d, 1)]) ensureDay(x).catch(() => setLoadError(true));
    },
    [ensureDay],
  );

  // the controller writes the picture's aspect (--stage-ar) on the stage; the layout needs it on the body (column width = picture width)
  useEffect(() => {
    const st = stage.current,
      cd = body.current;
    if (!st || !cd) return;
    const sync = () => {
      const ar = st.style.getPropertyValue('--stage-ar');
      if (ar) cd.style.setProperty('--stage-ar', ar);
      else cd.style.removeProperty('--stage-ar');
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(st, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }, []);

  // ---- controller: one per mounted page (re-created when the client changes)
  useEffect(() => {
    const c = new PlayerController(client, {
      onState: (s) => setPs(s),
      onClipsRefresh: async (): Promise<SentinelClip[]> => {
        await ensureDay(todayStart(), true);
        return mergedNow().clips;
      },
      storagePrefix: p.storagePrefix,
      brand: p.brand,
    });
    c.attach({ video: video.current!, freeze: freeze.current!, img: img.current!, stage: stage.current! });
    ctl.current = c;
    (window as unknown as { __snvr?: unknown }).__snvr = { ctl: c, state: () => psRef.current };
    return () => {
      c.destroy();
      ctl.current = null;
      delete (window as unknown as { __snvr?: unknown }).__snvr;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // open camera (deep link: startAt/posterTs from the overview strip)
  useEffect(() => {
    const c = ctl.current;
    if (!c || !camId) return;
    c.setCamera(camId, name);
    setDays({});
    daysRef.current = {};
    setFilterOff({});
    setTab('tl');
    setClip(null);
    setClipEdge(null);
    setLoadError(false);
    loading.current.clear();
    // a stored event frame exists only for an event (posterTs = `ev` of the link); a time-only link (`at` from "Open in
    // Sentinel", "Open in Safari", a reload) asked api/evframe for `at` and got a 404
    if (startAt) {
      if (posterTs) c.posterEvent(posterTs);
    } else {
      c.posterFromSnapshot(lastTileSnapshot(camId));
      // live needs no clips: start it now instead of after the day loads (two api/clips answers, several hundred KB on a
      // phone — the grey stage waited for them). Only the MSE-live fallback reads the codec from the clips: a fallback
      // before they arrive goes to MJPEG and switches to MSE-live in setClips.
      c.goLive();
    }
    const t0 = todayStart();
    const target = startAt ? dayOf(startAt) : t0;
    Promise.all([
      ensureDay(target),
      ensureDay(addDays(target, -1)),
      target !== t0 ? ensureDay(t0) : Promise.resolve(),
      target === t0 ? Promise.resolve() : ensureDay(addDays(target, 1)),
    ])
      .then(() => {
        if (c.camId !== camId || ctl.current !== c) return;
        c.openMark('clips');
        setLoadError(false); // a prior failure must not stick once a load succeeds
        const m = mergedNow();
        c.setClips(m.clips, m.codecs, m.rangeStart, m.rangeEnd);
        if (startAt) {
          c.playAt(startAt, {});
          setJump({ ts: startAt, n: Date.now() });
        }
      })
      .catch(() => {
        c.openMark('clipsErr');
        setLoadError(true);
      });
    deepRef.current = `${camId}|${startAt}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camId, client]);
  // another deep link to the SAME camera (back/forward between #/…?at=… entries, a second event from the overview):
  // the camera stays open, only the position changes
  useEffect(() => {
    const key = `${camId}|${startAt}`;
    if (!startAt || !ctl.current || key === deepRef.current) return;
    deepRef.current = key;
    const c = ctl.current;
    c.freezeCurrent();
    if (posterTs) c.posterEvent(posterTs);
    goToDay(dayOf(startAt), startAt).catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt, posterTs]);
  useEffect(() => {
    if (ctl.current && name) ctl.current.camName = name;
  }, [name]);
  // today upkeep: fresh clips/events/motion every 15 s, live and during playback (no seek, no stage reset: the player only
  // gets the new clip list); skipped while a timeline gesture runs or settles and in a hidden tab (todayRefreshAllowed)
  useEffect(() => {
    const i = setInterval(() => {
      const ok = todayRefreshAllowed({
        hidden: document.visibilityState === 'hidden',
        gestureAt: gestureAt.current,
        settling: !!ctl.current?.scrubSettling(),
        now: Date.now(),
      });
      if (ok)
        ensureDay(todayStart(), true).catch(() => {
          /* keep */
        });
    }, 15000);
    return () => clearInterval(i);
  }, [ensureDay]);

  const present = useMemo(() => {
    const m: Partial<Record<SentinelEventClass, number>> = {};
    // a chip counts every event that CONTAINS its class (a cyclist counts for person and vehicle)
    for (const e of merged.events) for (const k of sentinelClassesOf(e)) m[k] = (m[k] ?? 0) + 1;
    return m;
  }, [merged.events]);
  const visEvents = useMemo(
    () => merged.events.filter((e) => !sentinelEventHidden(e, filterOff)),
    [merged.events, filterOff],
  );
  // tab number: the centred day only (on today = the overview tile's "N today"); the list keeps every loaded day
  const dayCount = useMemo(() => eventsOnDay(visEvents, centerDay), [visEvents, centerDay]);
  const goLive = useCallback(() => {
    ctl.current?.goLive();
    setJump({ ts: Date.now(), n: Date.now() });
  }, []);
  // click → the current picture freezes at once → the event frame replaces it when loaded → the video at the target lifts it
  const playEvent = useCallback((ev: SentinelEvent) => {
    const c = ctl.current;
    if (!c) return;
    setTab('tl');
    c.freezeCurrent();
    c.posterEvent(ev.timestamp);
    c.playAt(sentinelEventPlayTs(ev), {});
  }, []);
  // tap on a group of timeline markers: the timeline zoomed in and put the group on the playhead line — play from there,
  // a jump like an event click (still picture until the new picture), but no event poster; seconds before now = live
  const seekTo = useCallback(
    (ts: number) => {
      const c = ctl.current;
      if (!c) return;
      if (Date.now() - ts < 8000) {
        goLive();
        return;
      }
      c.freezeCurrent();
      c.playAt(ts, {});
    },
    [goLive],
  );
  const jumpEvent = useCallback(
    (dir: 1 | -1) => {
      const c = ctl.current;
      if (!c) return;
      const ts = c.currentTs() ?? Date.now();
      let best: SentinelEvent | undefined;
      if (dir > 0) best = visEvents.find((e) => e.timestamp > ts + 500);
      else {
        for (let i = visEvents.length - 1; i >= 0; i--) {
          const e = visEvents[i]!;
          if (e.timestamp < ts - 500) {
            best = e;
            break;
          }
        }
      }
      if (best) playEvent(best);
    },
    [visEvents, playEvent],
  );
  /** go to a day (chip arrows / picker): load it, then play from `at` (or the first recording at/after it, else the last one of that day) */
  const goToDay = useCallback(
    async (ds: number, at?: number) => {
      const c = ctl.current;
      if (!c) return;
      await Promise.all([ensureDay(ds), ensureDay(addDays(ds, -1)), ensureDay(addDays(ds, 1))]);
      if (camRef.current !== camId) return;
      if (ds === todayStart() && at == null) {
        goLive();
        return;
      }
      const want = at ?? atTime(ds, 12, 0);
      if (want > Date.now()) {
        goLive();
        return;
      }
      const m = mergedNow();
      c.setClips(m.clips, m.codecs, m.rangeStart, m.rangeEnd);
      const inDay = m.clips.filter((x) => x.startTime >= ds && x.startTime < dayEnd(ds));
      const exact = c.clipIndexFor(want) >= 0;
      const pick = exact ? want : (inDay.find((x) => x.startTime >= want) || inDay[inDay.length - 1])?.startTime;
      setJump({ ts: pick ?? want, n: Date.now() });
      if (pick != null) c.playAt(pick, {});
      else setPs((s) => ({ ...s, live: false, label: 'noRecording', playhead: null }));
    },
    [ensureDay, camId, goLive, mergedNow],
  );
  // ---- clip mode
  const canExport = useMemo(() => Object.values(days).some((d) => sentinelHasFeature(d, 'export')), [days]);
  const oldestRec = earliest ?? merged.clips[0]?.startTime;
  /** the clip range of an event: band + bar, the timeline tab, the video at the clip start (an edge stays inactive) */
  const clipEvent = useCallback(
    (ev: SentinelEvent) => {
      const now = Date.now();
      const r = clipRangeForEvent(ev, now);
      setClip({ ...clampClipRange(r, { now, oldest: oldestRec }), open: r.open });
      setClipEdge(null);
      setTab('tl');
      const c = ctl.current;
      if (!c) return;
      c.freezeCurrent();
      c.posterEvent(ev.timestamp);
      c.playAt(Math.max(r.from, oldestRec ?? -Infinity), {});
    },
    [oldestRec],
  );
  const closeClip = useCallback(() => {
    setClip(null);
    setClipEdge(null);
  }, []);
  /** info-bar button: on = the proposal (the event under the playhead, else ± 30 s, live the last minute), off = close */
  const toggleClip = useCallback(() => {
    if (clipRef.current) {
      closeClip();
      return;
    }
    const s = psRef.current;
    setClip(
      clipProposal({
        live: s.live,
        playhead: s.live ? null : (ctl.current?.currentTs() ?? s.playhead),
        now: Date.now(),
        events: visEvents,
        oldest: oldestRec,
      }),
    );
    setClipEdge(null);
    setTab('tl');
  }, [closeClip, visEvents, oldestRec]);
  /** a chip was tapped: that edge goes onto the playhead line (the view jumps there, the video too) and follows the
   *  line while the user scrolls; null = no edge active */
  const activateEdge = useCallback((e: ClipEdge | null) => {
    setClipEdge(e);
    const r = clipRef.current;
    if (!e || !r) return;
    const ts = e === 'from' ? r.from : r.to;
    setJump({ ts, n: Date.now() });
    lineTs.current = ts;
    const c = ctl.current;
    // an edge in the last seconds (or above LIVE) only moves the view — playing there would mean live
    if (c && ts < Date.now() - 8000) {
      c.freezeCurrent();
      c.playAt(ts, {});
    }
  }, []);
  /** the user scrolled: the active edge follows the line (and takes over the other's role when it passes it) */
  const onUserCenter = useCallback((ts: number) => {
    lineTs.current = ts;
    const e = clipEdgeRef.current,
      r = clipRef.current;
    if (!e || !r) return;
    const n = clipSetEdge(r, e, ts);
    setClip({ ...n.range, open: false });
    if (n.edge !== e) setClipEdge(n.edge);
  }, []);
  /** i / o: set the start / end to the time on the line (keyboard) */
  const setEdgeToLine = useCallback((e: ClipEdge) => {
    const r = clipRef.current;
    if (!r) return;
    const s = psRef.current;
    const ts = clipEdgeRef.current
      ? lineTs.current
      : s.live
        ? Date.now()
        : (ctl.current?.currentTs() ?? lineTs.current);
    if (ts == null) return;
    const n = clipSetEdge(r, e, ts);
    setClip({ ...n.range, open: false });
    if (clipEdgeRef.current) setClipEdge(n.edge);
  }, []);
  /** an event marker / thumbnail on the timeline: in clip mode it sets the range, otherwise it plays */
  const onTimelineEvent = useCallback(
    (ev: SentinelEvent) => (clipRef.current ? clipEvent(ev) : playEvent(ev)),
    [clipEvent, playEvent],
  );

  const scrub = useMemo<ScrubHandlers>(
    () => ({
      begin: () => {
        gestureAt.current = Date.now();
        ctl.current?.scrubBegin();
      },
      move: (c, v, s) => {
        gestureAt.current = Date.now();
        ctl.current?.scrubMove(c, v, s);
      },
      seek: (ts) => {
        gestureAt.current = Date.now();
        ctl.current?.scrubSeek(ts);
      },
      hold: (ts) => {
        gestureAt.current = Date.now();
        ctl.current?.scrubHold(ts);
      },
      idle: (ts) => {
        gestureAt.current = 0;
        ctl.current?.scrubIdle(ts);
      },
    }),
    [],
  );

  // keyboard: space play/pause, ←/→ ±10 s (shift ±60), n/p events, l live
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (dt || !shouldHandleKey(e)) return;
      const c = ctl.current;
      if (!c) return;
      if (clipRef.current && (e.key === 'Escape' || e.key === 'i' || e.key === 'o')) {
        e.preventDefault();
        if (e.key === 'Escape') closeClip();
        else setEdgeToLine(e.key === 'i' ? 'from' : 'to');
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        c.togglePlayPause();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const ts = c.currentTs();
        if (ts == null) return;
        c.playAt(ts + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 60 : 10) * 1000, {});
      } else if (e.key === 'n') jumpEvent(1);
      else if (e.key === 'p') jumpEvent(-1);
      else if (e.key === 'l' || e.key === 'L') goLive();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [dt, jumpEvent, goLive, closeClip, setEdgeToLine]);

  const mjpeg = ps.transport === 'mjpeg';
  const oldestAllowed = earliest ? dayOf(earliest) : -Infinity;
  const statusText = stageStatus(ps, t, locale, loadError);
  const nav = dateChipNav(centerDay, oldestAllowed);
  const cors = p.crossOrigin ? 'anonymous' : undefined;
  // playback position for the host's links (state is re-emitted on every timeupdate, ~4×/s); live = no position
  const at = !ps.live && ps.playhead != null ? ps.playhead : undefined;
  const header = typeof p.header === 'function' ? p.header(at, { live: ps.live }) : p.header;
  const immersive = p.appearance === 'immersive';
  const externalUrl = typeof p.externalUrl === 'function' ? p.externalUrl(at) : p.externalUrl;

  return (
    <div className="nvr-cam" data-nvr-appearance={immersive ? 'immersive' : undefined}>
      {header}
      <div className={'nvr-cam__body' + (clip ? ' nvr-cam__body--clip' : '')} ref={body}>
        <div className="nvr-cam__left">
          <div className="nvr-card nvr-stage-card">
            <div className="nvr-stage-wrap">
              <div className="nvr-stage" ref={stage}>
                <video ref={video} playsInline autoPlay muted crossOrigin={cors} className="nvr-stage__video" />
                <img ref={img} crossOrigin={cors} className="nvr-stage__video nvr-stage__img hidden" alt="" />
                <canvas ref={freeze} className="nvr-stage__video nvr-stage__freeze hidden" />
                {!mjpeg && (
                  <button
                    type="button"
                    className="nvr-mute"
                    aria-label={t('nvr.player.sound')}
                    aria-pressed={ps.sound}
                    onClick={() => ctl.current?.setSound(!ps.sound)}
                  >
                    {ps.sound && !ps.muted ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </button>
                )}
                <div className={'nvr-pill-ctl' + (ps.live ? ' nvr-pill-ctl--live' : '')}>
                  <button
                    type="button"
                    className="nvr-pb"
                    aria-label={t('nvr.player.back15')}
                    onClick={() => ctl.current?.skip(-15000)}
                  >
                    <Rewind size={18} />
                  </button>
                  <button
                    type="button"
                    className="nvr-pb"
                    aria-label={ps.paused ? t('nvr.player.play') : t('nvr.player.pause')}
                    disabled={ps.live}
                    onClick={() => ctl.current?.togglePlayPause()}
                  >
                    {ps.paused ? <Play size={18} /> : <Pause size={18} />}
                  </button>
                  <button
                    type="button"
                    className="nvr-pb"
                    aria-label={t('nvr.player.fwd15')}
                    disabled={ps.live}
                    onClick={() => ctl.current?.skip(15000)}
                  >
                    <FastForward size={18} />
                  </button>
                  <button
                    type="button"
                    className="nvr-pb nvr-pb--speed nvr-data"
                    aria-label={t('nvr.player.speed')}
                    disabled={ps.live}
                    onClick={() => ctl.current?.cycleSpeed()}
                  >
                    {ps.rate}×
                  </button>
                </div>
              </div>
            </div>
            <div className="nvr-stage-bar">
              <span className={'nvr-statusdot' + (ps.live ? ' nvr-statusdot--live' : '')} aria-hidden="true" />
              <span className="nvr-stage-title">
                <b>{name}</b>
                <small>{statusText}</small>
              </span>
              <span className="nvr-stage-actions">
                <button
                  type="button"
                  className="nvr-iconbtn"
                  aria-label={t('nvr.player.snapshot')}
                  onClick={() => ctl.current?.snapshot()}
                >
                  <Camera size={16} />
                </button>
                {canExport && (
                  <button
                    type="button"
                    className={'nvr-iconbtn' + (clip ? ' nvr-iconbtn--on' : '')}
                    aria-label={t('nvr.clip.download')}
                    title={t('nvr.clip.download')}
                    aria-pressed={!!clip}
                    onClick={toggleClip}
                  >
                    <Download size={16} />
                  </button>
                )}
                <button type="button" className="nvr-iconbtn" aria-label={t('nvr.player.pip')} onClick={onPip}>
                  <PictureInPicture2 size={16} />
                </button>
                <button
                  type="button"
                  className="nvr-iconbtn"
                  aria-label={t('nvr.player.fullscreen')}
                  onClick={() => ctl.current?.fullscreen()}
                >
                  <Maximize2 size={16} />
                </button>
              </span>
            </div>
            {pipNote && (
              <div className="nvr-pipnote" role="status">
                <span>{t(pipNote === 'homescreen' ? 'nvr.player.pipHomeScreen' : 'nvr.player.pipUnsupported')}</span>
                {pipNote === 'homescreen' && externalUrl && (
                  <a
                    className="nvr-pipnote__open"
                    href={outsideAppHref(externalUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      rlog('pip-outside', { href: outsideAppHref(externalUrl).split(':')[0], at: at != null })
                    }
                  >
                    {t('nvr.player.openInSafari')}
                  </a>
                )}
                <button
                  type="button"
                  className="nvr-iconbtn nvr-pipnote__close"
                  aria-label={t('nvr.player.dismiss')}
                  onClick={() => setPipNote(null)}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className={'nvr-card nvr-cam__right' + (clip ? ' nvr-cam__right--clip' : '')}>
          {/* the chosen tab for the immersive segment's lens (the default page keeps the markup of 0.17.1) */}
          <div className="nvr-tabs" role="tablist" data-active={immersive ? tab : undefined}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'tl'}
              className={tab === 'tl' ? 'nvr-tabs__tab--active' : ''}
              onClick={() => setTab('tl')}
            >
              {t('nvr.tab.timeline')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ev'}
              className={tab === 'ev' ? 'nvr-tabs__tab--active' : ''}
              onClick={() => setTab('ev')}
            >
              {t('nvr.tab.events')}
              {dayCount ? ` (${dayCount})` : ''}
            </button>
          </div>
          <div className="nvr-filters">
            {SENTINEL_EVENT_CLASSES.filter((k) => present[k]).map((k) => (
              <button
                key={k}
                type="button"
                className={'nvr-fchip' + (filterOff[k] ? ' nvr-fchip--off' : '')}
                onClick={() => setFilterOff((f) => ({ ...f, [k]: !f[k] }))}
                title={classLabel(t, k)}
                aria-pressed={!filterOff[k]}
              >
                <ClassBadge cls={k} size={18} />
                {present[k]}
              </button>
            ))}
          </div>
          {tab === 'tl' ? (
            <VerticalTimeline
              camId={camId}
              rangeStart={merged.rangeStart}
              rangeEnd={merged.rangeEnd}
              clips={merged.clips}
              events={merged.events}
              motion={merged.motion}
              live={ps.live}
              playhead={() => ctl.current?.currentTs() ?? null}
              following={() => !psRef.current.paused && !ctl.current?.scrubSettling()}
              filterOff={filterOff}
              onEvent={onTimelineEvent}
              onSeekTo={seekTo}
              onGoLive={goLive}
              scrub={scrub}
              onCenter={onCenter}
              jump={jump}
              clip={
                clip ? { from: clip.from, to: clip.to, edge: clipEdge, bad: clip.to - clip.from > CLIP_MAX_MS } : null
              }
              hold={!!clip && !!clipEdge}
              onUserCenter={onUserCenter}
            />
          ) : (
            <EventList
              camId={camId}
              events={merged.events}
              filterOff={filterOff}
              onPick={playEvent}
              onClip={canExport ? clipEvent : undefined}
            />
          )}
          {clip && (
            <ClipBar
              key={camId}
              camId={camId}
              range={clip}
              open={clip.open}
              edge={clipEdge}
              clips={merged.clips}
              onEdge={activateEdge}
              onClose={closeClip}
            />
          )}
          {!clip && (
            <div className={'nvr-datechip' + (ps.live ? '' : ' nvr-datechip--rec')}>
              <button
                type="button"
                onClick={() => goToDay(addDays(centerDay, -1)).catch(() => setLoadError(true))}
                disabled={nav.prevDisabled}
                aria-label={t('nvr.date.prevDay')}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="nvr-datechip__lbl nvr-data"
                onClick={() => setDt(true)}
                aria-label={t('nvr.date.title')}
              >
                <Calendar size={13} />
                {fmtDay(centerDay, locale)}
              </button>
              <button
                type="button"
                onClick={() => goToDay(addDays(centerDay, 1)).catch(() => setLoadError(true))}
                disabled={nav.nextDisabled}
                aria-label={t('nvr.date.nextDay')}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </aside>
      </div>

      {dt &&
        p.renderDatePicker({
          dayStart: centerDay,
          timeTs: ps.live ? Date.now() : (ctl.current?.currentTs() ?? Date.now()),
          oldestAllowed,
          onClose: () => setDt(false),
          onGo: (ds, time) => {
            setDt(false);
            const at = time ? atTime(ds, Number(time.split(':')[0]), Number(time.split(':')[1])) : undefined;
            goToDay(ds, at).catch(() => setLoadError(true));
          },
        })}
    </div>
  );
}
