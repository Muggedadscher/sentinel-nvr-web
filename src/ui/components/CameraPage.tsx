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
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Calendar, Camera, ChevronLeft, ChevronRight, FastForward, Maximize2, Pause, PictureInPicture2, Play, Rewind, Volume2, VolumeX } from 'lucide-react';
import {
  SENTINEL_DAY_MS as DAY, SENTINEL_EVENT_CLASSES, sentinelClassOf as classOf, sentinelDayOf as dayOf, sentinelEventPlayTs, sentinelMergeDays,
  fmtDay, type SentinelClip, type SentinelClipsResponse, type SentinelEvent, type SentinelEventClass,
} from '../../api';
import { PlayerController, type PlayerState } from '../../player';
import { useSentinelUi } from '../context';
import { dateChipNav, stageStatus } from '../camera-logic';
import { lastTileSnapshot } from '../snapshot-cache';
import { ClassBadge, classLabel } from './ClassBadge';
import { EventList } from './EventList';
import { VerticalTimeline, type ScrubHandlers } from './VerticalTimeline';

const IDLE: PlayerState = { live: true, label: 'live', playhead: null, rate: 1, sound: false, paused: false, transport: 'none', muted: true };
const todayStart = () => dayOf(Date.now());
type Days = Record<number, SentinelClipsResponse>;

/** What the host's modal receives (grid + footer come from `useDatePicker`). */
export interface DatePickerRequest {
  dayStart: number; timeTs: number; oldestAllowed: number;
  onGo: (dayStart: number, time: string | null) => void; onClose: () => void;
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
  /** rendered above the two columns — the host's page header (see `CameraTitle`) */
  header?: ReactNode;
  /** the host wraps the date picker in its own modal primitive */
  renderDatePicker: (req: DatePickerRequest) => ReactNode;
}

/** Host header row: back button + camera name (+ host actions on the right). Same metrics in every host. */
export function CameraTitle({ name, onBack, children }: { name: string; onBack: () => void; children?: ReactNode }) {
  const { t } = useSentinelUi();
  return (
    <div className="nvr-cam__head">
      <div className="nvr-cam__title">
        <button type="button" className="nvr-iconbtn" aria-label={t('nvr.back')} onClick={onBack}><ChevronLeft size={20} /></button>
        <h1 className="nvr-cam__h1">{name}</h1>
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
  useEffect(() => { const i = setInterval(() => setNowTick(Date.now()), 30000); return () => clearInterval(i); }, []);
  const [centerDay, setCenterDay] = useState(todayStart());
  const [jump, setJump] = useState<{ ts: number; n: number } | null>(null);
  const [tab, setTab] = useState<'tl' | 'ev'>('tl');
  const [filterOff, setFilterOff] = useState<Record<string, boolean>>({});
  const [ps, setPs] = useState<PlayerState>(IDLE);
  const [loadError, setLoadError] = useState(false);
  const [dt, setDt] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null); const video = useRef<HTMLVideoElement>(null); const freeze = useRef<HTMLCanvasElement>(null); const img = useRef<HTMLImageElement>(null);
  const ctl = useRef<PlayerController | null>(null);
  const psRef = useRef(ps); psRef.current = ps;
  const loading = useRef(new Set<number>()); const daysRef = useRef(days); daysRef.current = days;
  const camRef = useRef(camId); camRef.current = camId;

  // ---- data: one request per day, merged into a continuous range
  const merged = useMemo(() => {
    const m = sentinelMergeDays(days);
    const rangeStart = m.oldestDay ?? todayStart();
    // a little headroom above LIVE, not the whole rest of the day (moves with the clock)
    const rangeEnd = Math.min(todayStart() + DAY, nowTick + 20 * 60000);
    return { ...m, rangeStart, rangeEnd };
  }, [days, nowTick]);
  /** the merged range as of NOW (from daysRef, which ensureDay updates synchronously) — for code that just awaited a load */
  const mergedNow = useCallback(() => { const m = sentinelMergeDays(daysRef.current); return { ...m, rangeStart: m.oldestDay ?? todayStart(), rangeEnd: Math.min(todayStart() + DAY, Date.now() + 20 * 60000) }; }, []);
  useEffect(() => { ctl.current?.setClips(merged.clips, merged.codecs, merged.rangeStart, merged.rangeEnd); }, [merged]);

  const fetchDay = useCallback(async (ds: number): Promise<SentinelClipsResponse> => {
    const d = await client.getJson<SentinelClipsResponse>(`api/clips?camera=${encodeURIComponent(camId)}&start=${ds}&end=${ds + DAY}`);
    d.clips = (d.clips || []).sort((a, b) => a.startTime - b.startTime); d.events = d.events || []; d.motion = d.motion || [];
    return d;
  }, [client, camId]);
  /** load a day once (retention floor: nothing older than the oldest recording); `force` = refresh (today while live) */
  const ensureDay = useCallback(async (ds: number, force = false): Promise<void> => {
    if (ds > todayStart()) return;
    if (earliest && ds + DAY < dayOf(earliest)) return;
    if (!force && (daysRef.current[ds] || loading.current.has(ds))) return;
    loading.current.add(ds);
    try {
      const d = await fetchDay(ds); if (camRef.current !== camId) return;
      // the ref is updated SYNCHRONOUSLY: callers that await ensureDay() read the merged range right after (mergedNow) —
      // React renders the setDays() update in a later task, so a render-time ref would still miss this day (deep link → "no recording")
      daysRef.current = { ...daysRef.current, [ds]: d };
      setDays((prev) => ({ ...prev, [ds]: d }));
    }
    finally { loading.current.delete(ds); }
  }, [fetchDay, earliest, camId]);
  const onCenter = useCallback((ts: number) => { const d = dayOf(ts); setCenterDay(d); void ensureDay(d); void ensureDay(d - DAY); void ensureDay(d + DAY); }, [ensureDay]);

  // the controller writes the picture's aspect (--stage-ar) on the stage; the layout needs it on the body (column width = picture width)
  useEffect(() => {
    const st = stage.current, cd = body.current; if (!st || !cd) return;
    const sync = () => { const ar = st.style.getPropertyValue('--stage-ar'); if (ar) cd.style.setProperty('--stage-ar', ar); else cd.style.removeProperty('--stage-ar'); };
    sync();
    const mo = new MutationObserver(sync); mo.observe(st, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }, []);

  // ---- controller: one per mounted page (re-created when the client changes)
  useEffect(() => {
    const c = new PlayerController(client, {
      onState: (s) => setPs(s),
      onClipsRefresh: async (): Promise<SentinelClip[]> => { await ensureDay(todayStart(), true); return mergedNow().clips; },
      storagePrefix: p.storagePrefix,
      brand: p.brand,
    });
    c.attach({ video: video.current!, freeze: freeze.current!, img: img.current!, stage: stage.current! });
    ctl.current = c;
    (window as unknown as { __snvr?: unknown }).__snvr = { ctl: c, state: () => psRef.current };
    return () => { c.destroy(); ctl.current = null; delete (window as unknown as { __snvr?: unknown }).__snvr; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // open camera (deep link: startAt/posterTs from the overview strip)
  useEffect(() => {
    const c = ctl.current; if (!c || !camId) return;
    c.setCamera(camId, name);
    setDays({}); daysRef.current = {}; setFilterOff({}); setTab('tl'); setLoadError(false); loading.current.clear();
    if (startAt) c.posterEvent(posterTs || startAt); else c.posterFromSnapshot(lastTileSnapshot(camId));
    const t0 = todayStart(); const target = startAt ? dayOf(startAt) : t0;
    Promise.all([ensureDay(target), ensureDay(target - DAY), target !== t0 ? ensureDay(t0) : Promise.resolve(), target === t0 ? Promise.resolve() : ensureDay(target + DAY)])
      .then(() => {
        if (c.camId !== camId || ctl.current !== c) return;
        setLoadError(false); // a prior failure must not stick once a load succeeds
        const m = mergedNow(); c.setClips(m.clips, m.codecs, m.rangeStart, m.rangeEnd);
        if (startAt) { c.playAt(startAt, {}); setJump({ ts: startAt, n: Date.now() }); } else c.goLive();
      })
      .catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camId, client]);
  useEffect(() => { if (ctl.current && name) ctl.current.camName = name; }, [name]);
  // today upkeep: fresh clips/events/motion while live (no seek, no stage reset)
  useEffect(() => { const i = setInterval(() => { if (psRef.current.live) ensureDay(todayStart(), true).catch(() => { /* keep */ }); }, 15000); return () => clearInterval(i); }, [ensureDay]);

  const present = useMemo(() => { const m: Partial<Record<SentinelEventClass, number>> = {}; for (const e of merged.events) { const k = classOf(e); m[k] = (m[k] ?? 0) + 1; } return m; }, [merged.events]);
  const visEvents = useMemo(() => merged.events.filter((e) => !filterOff[classOf(e)]), [merged.events, filterOff]);
  const goLive = useCallback(() => { ctl.current?.goLive(); setJump({ ts: Date.now(), n: Date.now() }); }, []);
  // click → the current picture freezes at once → the event frame replaces it when loaded → the video at the target lifts it
  const playEvent = useCallback((ev: SentinelEvent) => { const c = ctl.current; if (!c) return; setTab('tl'); c.freezeCurrent(); c.posterEvent(ev.timestamp); c.playAt(sentinelEventPlayTs(ev), {}); }, []);
  const jumpEvent = useCallback((dir: 1 | -1) => {
    const c = ctl.current; if (!c) return; const ts = c.currentTs() ?? Date.now();
    let best: SentinelEvent | undefined;
    if (dir > 0) best = visEvents.find((e) => e.timestamp > ts + 500);
    else { for (let i = visEvents.length - 1; i >= 0; i--) { const e = visEvents[i]!; if (e.timestamp < ts - 500) { best = e; break; } } }
    if (best) playEvent(best);
  }, [visEvents, playEvent]);
  /** go to a day (chip arrows / picker): load it, then play from `at` (or the first recording at/after it, else the last one of that day) */
  const goToDay = useCallback(async (ds: number, at?: number) => {
    const c = ctl.current; if (!c) return;
    await Promise.all([ensureDay(ds), ensureDay(ds - DAY), ensureDay(ds + DAY)]);
    if (camRef.current !== camId) return;
    if (ds === todayStart() && at == null) { goLive(); return; }
    const want = at ?? ds + DAY / 2;
    if (want > Date.now()) { goLive(); return; }
    const m = mergedNow(); c.setClips(m.clips, m.codecs, m.rangeStart, m.rangeEnd);
    const inDay = m.clips.filter((x) => x.startTime >= ds && x.startTime < ds + DAY);
    const exact = c.clipIndexFor(want) >= 0;
    const pick = exact ? want : (inDay.find((x) => x.startTime >= want) || inDay[inDay.length - 1])?.startTime;
    setJump({ ts: pick ?? want, n: Date.now() });
    if (pick != null) c.playAt(pick, {}); else setPs((s) => ({ ...s, live: false, label: 'noRecording', playhead: null }));
  }, [ensureDay, camId, goLive]);
  const scrub = useMemo<ScrubHandlers>(() => ({
    begin: () => ctl.current?.scrubBegin(),
    move: (c, v, s) => ctl.current?.scrubMove(c, v, s),
    seek: (ts) => ctl.current?.scrubSeek(ts),
    hold: (ts) => ctl.current?.scrubHold(ts),
    idle: (ts) => ctl.current?.scrubIdle(ts),
  }), []);

  // keyboard: space play/pause, ←/→ ±10 s (shift ±60), n/p events, l live
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (dt) return;
      const tag = ((e.target as HTMLElement | null)?.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      const c = ctl.current; if (!c) return;
      if (e.key === ' ') { e.preventDefault(); c.togglePlayPause(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const ts = c.currentTs(); if (ts == null) return; c.playAt(ts + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 60 : 10) * 1000, {}); }
      else if (e.key === 'n') jumpEvent(1); else if (e.key === 'p') jumpEvent(-1); else if (e.key === 'l' || e.key === 'L') goLive();
    };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [dt, jumpEvent, goLive]);

  const mjpeg = ps.transport === 'mjpeg';
  const oldestAllowed = earliest ? dayOf(earliest) : -Infinity;
  const statusText = stageStatus(ps, t, locale, loadError);
  const nav = dateChipNav(centerDay, oldestAllowed);
  const cors = p.crossOrigin ? 'anonymous' : undefined;

  return (
    <div className="nvr-cam">
      {p.header}
      <div className="nvr-cam__body" ref={body}>
        <div className="nvr-cam__left">
          <div className="nvr-card nvr-stage-card">
            <div className="nvr-stage-wrap">
              <div className="nvr-stage" ref={stage}>
                <video ref={video} playsInline autoPlay muted crossOrigin={cors} className="nvr-stage__video" />
                <img ref={img} crossOrigin={cors} className="nvr-stage__video nvr-stage__img hidden" alt="" />
                <canvas ref={freeze} className="nvr-stage__video nvr-stage__freeze hidden" />
                {!mjpeg && (
                  <button type="button" className="nvr-mute" aria-label={t('nvr.player.sound')} aria-pressed={ps.sound} onClick={() => ctl.current?.setSound(!ps.sound)}>
                    {ps.sound && !ps.muted ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </button>
                )}
                <div className={'nvr-pill-ctl' + (ps.live ? ' nvr-pill-ctl--live' : '')}>
                  <button type="button" className="nvr-pb" aria-label={t('nvr.player.back15')} onClick={() => ctl.current?.skip(-15000)}><Rewind size={18} /></button>
                  <button type="button" className="nvr-pb" aria-label={ps.paused ? t('nvr.player.play') : t('nvr.player.pause')} disabled={ps.live} onClick={() => ctl.current?.togglePlayPause()}>{ps.paused ? <Play size={18} /> : <Pause size={18} />}</button>
                  <button type="button" className="nvr-pb" aria-label={t('nvr.player.fwd15')} disabled={ps.live} onClick={() => ctl.current?.skip(15000)}><FastForward size={18} /></button>
                  <button type="button" className="nvr-pb nvr-pb--speed nvr-data" aria-label={t('nvr.player.speed')} disabled={ps.live} onClick={() => ctl.current?.cycleSpeed()}>{ps.rate}×</button>
                </div>
              </div>
            </div>
            <div className="nvr-stage-bar">
              <span className={'nvr-statusdot' + (ps.live ? ' nvr-statusdot--live' : '')} aria-hidden="true" />
              <span className="nvr-stage-title"><b>{name}</b><small>{statusText}</small></span>
              <span className="nvr-stage-actions">
                <button type="button" className="nvr-iconbtn" aria-label={t('nvr.player.snapshot')} onClick={() => ctl.current?.snapshot()}><Camera size={16} /></button>
                <button type="button" className="nvr-iconbtn" aria-label={t('nvr.player.pip')} onClick={() => ctl.current?.pip()}><PictureInPicture2 size={16} /></button>
                <button type="button" className="nvr-iconbtn" aria-label={t('nvr.player.fullscreen')} onClick={() => ctl.current?.fullscreen()}><Maximize2 size={16} /></button>
              </span>
            </div>
          </div>
        </div>

        <aside className="nvr-card nvr-cam__right">
          <div className="nvr-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'tl'} className={tab === 'tl' ? 'nvr-tabs__tab--active' : ''} onClick={() => setTab('tl')}>{t('nvr.tab.timeline')}</button>
            <button type="button" role="tab" aria-selected={tab === 'ev'} className={tab === 'ev' ? 'nvr-tabs__tab--active' : ''} onClick={() => setTab('ev')}>{t('nvr.tab.events')}{visEvents.length ? ` (${visEvents.length})` : ''}</button>
          </div>
          <div className="nvr-filters">
            {SENTINEL_EVENT_CLASSES.filter((k) => present[k]).map((k) => (
              <button key={k} type="button" className={'nvr-fchip' + (filterOff[k] ? ' nvr-fchip--off' : '')} onClick={() => setFilterOff((f) => ({ ...f, [k]: !f[k] }))} title={classLabel(t, k)} aria-pressed={!filterOff[k]}>
                <ClassBadge cls={k} size={18} />{present[k]}
              </button>
            ))}
          </div>
          {tab === 'tl' ? (
            <VerticalTimeline
              camId={camId} rangeStart={merged.rangeStart} rangeEnd={merged.rangeEnd} clips={merged.clips} events={merged.events} motion={merged.motion}
              live={ps.live} playhead={() => ctl.current?.currentTs() ?? null} following={() => !psRef.current.paused && !ctl.current?.scrubSettling()} filterOff={filterOff}
              onEvent={playEvent} onGoLive={goLive} scrub={scrub} onCenter={onCenter} jump={jump}
            />
          ) : (
            <EventList camId={camId} events={merged.events} filterOff={filterOff} onPick={playEvent} />
          )}
          <div className={'nvr-datechip' + (ps.live ? '' : ' nvr-datechip--rec')}>
            <button type="button" onClick={() => void goToDay(centerDay - DAY)} disabled={nav.prevDisabled} aria-label={t('nvr.date.prevDay')}><ChevronLeft size={14} /></button>
            <button type="button" className="nvr-datechip__lbl nvr-data" onClick={() => setDt(true)} aria-label={t('nvr.date.title')}><Calendar size={13} />{fmtDay(centerDay, locale)}</button>
            <button type="button" onClick={() => void goToDay(centerDay + DAY)} disabled={nav.nextDisabled} aria-label={t('nvr.date.nextDay')}><ChevronRight size={14} /></button>
          </div>
        </aside>
      </div>

      {dt && p.renderDatePicker({
        dayStart: centerDay,
        timeTs: ps.live ? Date.now() : (ctl.current?.currentTs() ?? Date.now()),
        oldestAllowed,
        onClose: () => setDt(false),
        onGo: (ds, time) => {
          setDt(false);
          const at = time ? ds + (Number(time.split(':')[0]) * 3600 + Number(time.split(':')[1]) * 60) * 1000 : undefined;
          goToDay(ds, at).catch(() => { /* keep */ });
        },
      })}
    </div>
  );
}
