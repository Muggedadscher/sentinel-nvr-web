/**
 * Clip bar (camera page, clip mode): the range as two chips "From"/"To" + its length, hints, and the export — create →
 * "Preparing … N %" → save / share. Two rows at the bottom of the timeline card: chips on top, buttons (≥ 44 px) below.
 *
 * An edge is set over the playhead line: tapping a chip makes it active, the page puts that edge on the line and the
 * edge follows the line while the USER scrolls (VerticalTimeline `onUserCenter`). The export itself is a job on the
 * plugin (`api/export` → `api/export-status` → `api/export-file`); closing the bar or leaving the camera cancels a
 * running job.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Share2, X } from 'lucide-react';
import { SentinelHttpError, type SentinelClip, type SentinelExportStart } from '../../api';
import { rlog } from '../../player';
import { useSentinelUi } from '../context';
import { humanBytes } from '../format';
import { isIosHomeScreenApp, outsideAppHref } from '../outside';
import {
  CLIP_MAX_MS,
  CLIP_POLL_GIVEUP_MS,
  CLIP_POLL_MS,
  clipErrorKind,
  clipHints,
  clipLength,
  clipWays,
  fmtClipTime,
  isCrossOrigin,
  type ClipEdge,
  type ClipErrorKind,
  type ClipRange,
  type ClipWays,
} from '../clip-logic';

export interface ClipBarProps {
  camId: string;
  range: ClipRange;
  /** the range comes from an event that is still running (its end is "now") */
  open?: boolean;
  /** the edge that follows the playhead line, null = none */
  edge: ClipEdge | null;
  /** loaded recordings (hints: no recording, gaps) */
  clips: readonly SentinelClip[];
  /** tap on a chip: the edge to activate, null = none */
  onEdge: (edge: ClipEdge | null) => void;
  onClose: () => void;
}

type Job =
  | { s: 'idle' }
  | { s: 'starting' }
  | { s: 'running'; id: string; pct: number; start: SentinelExportStart; t0: number }
  | (Done & { s: 'loading' })
  | (Done & { s: 'ready'; file?: File; blobUrl?: string })
  | { s: 'error'; kind: ClipErrorKind; vars?: Record<string, string | number> };

/** a finished job (the file waits on the server until `expiresAt`) */
interface Done {
  id: string;
  bytes: number;
  filename: string;
  start: SentinelExportStart;
  t0: number;
  ways: ClipWays;
  expiresAt?: number | undefined;
}

/** `navigator.canShare({files})` for an mp4 (false where the Web Share API or file sharing is missing). */
function canShareFiles(): boolean {
  try {
    const n = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof n.canShare !== 'function' || typeof n.share !== 'function') return false;
    return n.canShare({ files: [new File([new Uint8Array(1)], 'clip.mp4', { type: 'video/mp4' })] });
  } catch {
    return false;
  }
}

function viewerTz(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function ClipBar(p: ClipBarProps) {
  const { client, t, locale } = useSentinelUi();
  const [job, setJobState] = useState<Job>({ s: 'idle' });
  const jobRef = useRef<Job>(job);
  const setJob = useCallback((j: Job) => {
    jobRef.current = j;
    setJobState(j);
  }, []);
  const gen = useRef(0); // bumped on every new job / reset: answers of an older job are dropped
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const standalone = isIosHomeScreenApp();

  /** drop the page's copy of a finished clip (blob URL) and stop a running prefetch */
  const release = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    const j = jobRef.current;
    if (j.s === 'ready' && j.blobUrl) URL.revokeObjectURL(j.blobUrl);
  }, []);
  /** cancel a job that still runs on the server (closing the bar, leaving the camera, "Cancel") */
  const cancelRunning = useCallback(() => {
    const j = jobRef.current;
    if (j.s === 'running') void client.cancelExport(j.id);
  }, [client]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // a counter, not a DOM node: bumping the current value is the point (answers of the old job are dropped)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      gen.current++;
      cancelRunning();
      release();
    };
  }, [cancelRunning, release]);

  // a new range makes every job stale: a running one is cancelled on the server (the chips are locked meanwhile, but
  // another event's download button still sets a new range), a finished clip or an error is dropped
  const rangeKey = `${p.range.from}|${p.range.to}`;
  const lastKey = useRef(rangeKey);
  useEffect(() => {
    if (lastKey.current === rangeKey) return;
    lastKey.current = rangeKey;
    if (jobRef.current.s === 'idle') return;
    cancelRunning();
    gen.current++; // also drops a POST still on its way (`create` cancels the job it answers)
    release();
    setJob({ s: 'idle' });
  }, [rangeKey, cancelRunning, release, setJob]);

  const fail = useCallback(
    (kind: ClipErrorKind, vars?: Record<string, string | number>, extra?: Record<string, unknown>) => {
      rlog('clip', { ok: false, err: kind, standalone, ...extra });
      setJob(vars ? { s: 'error', kind, vars } : { s: 'error', kind });
    },
    [setJob, standalone],
  );
  const errorOf = useCallback(
    (e: unknown) => {
      const st = e instanceof SentinelHttpError ? e.status : 0;
      const code = e instanceof SentinelHttpError ? e.code : undefined;
      const body = e instanceof SentinelHttpError ? e.body : undefined;
      const kind = clipErrorKind(st, code);
      const vars: Record<string, string | number> = {};
      if (kind === 'tooLong') vars.max = Math.round(Number(body?.maxMs ?? CLIP_MAX_MS) / 60_000);
      let k = kind;
      if (kind === 'streamChange') {
        if (typeof body?.at === 'number') vars.time = fmtClipTime(body.at, locale);
        else k = 'failed'; // without the time the text would show a bare "{time}"
      }
      fail(k, vars, { status: st, code });
    },
    [fail, locale],
  );

  /** the file is done: load it into the page when sharing, a Home-Screen app or another origin needs it, else offer the link */
  const finish = useCallback(
    async (g: number, d: Omit<Done, 'ways'>) => {
      const crossOrigin = isCrossOrigin(client.exportFileUrl(d.id));
      const ways = clipWays({ bytes: d.bytes, canShareFiles: canShareFiles(), standalone, crossOrigin });
      if (!ways.prefetch) {
        setJob({ s: 'ready', ...d, ways });
        return;
      }
      setJob({ s: 'loading', ...d, ways });
      const ac = new AbortController();
      abort.current = ac;
      try {
        const r = await fetch(client.exportFileUrl(d.id), { cache: 'no-store', signal: ac.signal });
        if (r.status === 404) {
          if (g === gen.current) fail('expired');
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (g !== gen.current || !alive.current) return;
        const file = new File([blob], d.filename, { type: blob.type || 'video/mp4' });
        setJob({ s: 'ready', ...d, ways, file, blobUrl: URL.createObjectURL(blob) });
      } catch (e) {
        if (g !== gen.current || !alive.current) return;
        // the page could not hold the file: the link still works (no share, no blob; another origin in a new tab, so
        // the host page stays)
        rlog('clip', {
          ok: false,
          err: 'prefetch',
          msg: String((e as Error)?.message ?? e).slice(0, 80),
          bytes: d.bytes,
          standalone,
          xo: crossOrigin,
        });
        setJob({ s: 'ready', ...d, ways: { prefetch: false, share: false, save: crossOrigin ? 'tab' : 'link' } });
      } finally {
        if (abort.current === ac) abort.current = null;
      }
    },
    [client, fail, setJob, standalone],
  );

  // status poll of a running job: every CLIP_POLL_MS, paused in a hidden tab, at once when the tab comes back
  const running = job.s === 'running' ? job.id : null;
  useEffect(() => {
    if (!running) return;
    const g = gen.current;
    let timer = 0;
    let busy = false;
    let lastOk = Date.now();
    const poll = async () => {
      if (busy || g !== gen.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const st = await client.exportStatus(running);
        if (g !== gen.current || !alive.current) return;
        lastOk = Date.now();
        const j = jobRef.current;
        if (j.s !== 'running') return;
        if (st.state === 'running') setJob({ ...j, pct: Math.max(0, Math.min(1, st.progress || 0)) });
        else if (st.state === 'done') {
          window.clearInterval(timer);
          void finish(g, {
            id: j.id,
            bytes: st.bytes ?? j.start.estBytes,
            filename: st.filename || j.start.filename,
            start: j.start,
            t0: j.t0,
            expiresAt: st.expiresAt,
          });
        } else if (st.state === 'cancelled') {
          window.clearInterval(timer);
          setJob({ s: 'idle' });
        } else {
          window.clearInterval(timer);
          fail('failed', undefined, { serverErr: st.error });
        }
      } catch (e) {
        if (g !== gen.current || !alive.current) return;
        // a lost poll is retried; a job the server forgot (restart), a refused login or a minute without an answer
        // ends the wait (the job is cancelled on the server as far as it can still be reached)
        const status = e instanceof SentinelHttpError ? e.status : 0;
        if (status === 404 || status === 401 || status === 403 || Date.now() - lastOk > CLIP_POLL_GIVEUP_MS) {
          window.clearInterval(timer);
          if (status !== 404) void client.cancelExport(running);
          gen.current++;
          fail('failed', undefined, { status, code: e instanceof SentinelHttpError ? e.code : undefined });
        }
      } finally {
        busy = false;
      }
    };
    timer = window.setInterval(() => void poll(), CLIP_POLL_MS);
    const vis = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [running, client, finish, fail, setJob]);

  // a finished file lives on the server for a while (expiresAt, 15 min): afterwards offer "Create again"
  const expiresAt = job.s === 'ready' || job.s === 'loading' ? job.expiresAt : undefined;
  useEffect(() => {
    if (!expiresAt) return;
    const g = gen.current;
    const i = window.setTimeout(
      () => {
        if (g !== gen.current || !alive.current) return;
        const j = jobRef.current;
        if (j.s === 'ready' && j.file) return; // the page holds the file: save and share keep working
        gen.current++;
        release();
        setJob({ s: 'error', kind: 'expired' });
      },
      Math.min(2 ** 31 - 1, Math.max(0, expiresAt - Date.now())),
    );
    return () => window.clearTimeout(i);
  }, [expiresAt, release, setJob]);

  const create = useCallback(async () => {
    const j = jobRef.current;
    if (j.s === 'starting' || j.s === 'running' || j.s === 'loading') return;
    gen.current++;
    const g = gen.current;
    release();
    p.onEdge(null);
    setJob({ s: 'starting' });
    const t0 = Date.now();
    try {
      const start = await client.startExport(p.camId, p.range.from, p.range.to, viewerTz());
      if (g !== gen.current) {
        // closed or reset while the POST was on its way: the job must not run on
        void client.cancelExport(start.id);
        return;
      }
      setJob({ s: 'running', id: start.id, pct: 0, start, t0 });
    } catch (e) {
      if (g !== gen.current || !alive.current) return;
      errorOf(e);
    }
  }, [client, p, release, setJob, errorOf]);

  const cancel = useCallback(() => {
    cancelRunning();
    gen.current++;
    release();
    setJob({ s: 'idle' });
  }, [cancelRunning, release, setJob]);

  const log = (w: 'download' | 'blob' | 'tab' | 'share' | 'safari', ok = true, err?: string) => {
    const j = jobRef.current;
    if (j.s !== 'ready' && j.s !== 'loading') return;
    rlog('clip', { ms: Date.now() - j.t0, bytes: j.bytes, w, standalone, ok, ...(err ? { err } : {}) });
  };
  /** Share: navigator.share() synchronously inside the tap (WebKit refuses it after an await — the file is prefetched) */
  const share = () => {
    const j = jobRef.current;
    if (j.s !== 'ready' || !j.file) return;
    try {
      void navigator.share({ files: [j.file] }).then(
        () => log('share'),
        (e: unknown) => {
          const name = (e as { name?: string })?.name;
          if (name !== 'AbortError') log('share', false, name || 'error');
        },
      );
    } catch (e) {
      log('share', false, (e as { name?: string })?.name || 'error');
    }
  };

  const busy = job.s === 'starting' || job.s === 'running' || job.s === 'loading';
  const now = Date.now();
  const hints = clipHints(p.range, p.clips, now);
  const chip = (e: ClipEdge) => {
    const ts = e === 'from' ? p.range.from : p.range.to;
    const active = p.edge === e;
    const bad = e === 'to' && hints.tooLong;
    const k = t(e === 'from' ? 'nvr.clip.from' : 'nvr.clip.to');
    const v = fmtClipTime(ts, locale);
    return (
      <button
        type="button"
        className={'nvr-clipchip' + (active ? ' nvr-clipchip--active' : '') + (bad ? ' nvr-clipchip--bad' : '')}
        aria-pressed={active}
        aria-label={`${k} ${v}`}
        disabled={busy}
        onClick={() => p.onEdge(active ? null : e)}
      >
        <span className="nvr-clipchip__k">{k}</span> <span className="nvr-clipchip__v nvr-data">{v}</span>
      </button>
    );
  };

  // one hint line: the most important note first
  // the line between chips and buttons: state of the job (with progress), else the most important hint
  let note: { text: string; tone: 'bad' | 'info' } | null = null;
  const st = job.s === 'running' || job.s === 'loading' || job.s === 'ready' ? job.start : null;
  if (job.s === 'error') {
    note = { text: t(`nvr.clip.${job.kind}`, job.vars), tone: job.kind === 'expired' ? 'info' : 'bad' };
  } else if (job.s === 'ready' && job.ways.save === 'safari') note = { text: t('nvr.clip.tooLarge'), tone: 'info' };
  else if (st) {
    if (st.clipped) note = { text: t('nvr.clip.endsAt', { time: fmtClipTime(st.to, locale) }), tone: 'info' };
    else if (st.gaps?.length) note = { text: t('nvr.clip.gaps'), tone: 'info' };
  } else if (job.s === 'starting') note = null;
  else if (hints.tooLong) note = { text: t('nvr.clip.tooLong', { max: CLIP_MAX_MS / 60_000 }), tone: 'bad' };
  else if (hints.noRecording) note = { text: t('nvr.clip.noRecording'), tone: 'bad' };
  else if (p.edge) note = { text: t('nvr.clip.edgeHint'), tone: 'info' };
  // a running event: its range was already cut to "now − 10 s" (no endsAt), the clip ends now
  else if (p.open) note = { text: t('nvr.clip.eventRunning'), tone: 'info' };
  else if (hints.endsAt != null)
    note = { text: t('nvr.clip.endsAt', { time: fmtClipTime(hints.endsAt, locale) }), tone: 'info' };
  else if (hints.gaps) note = { text: t('nvr.clip.gaps'), tone: 'info' };

  const lenText = t('nvr.clip.length', { d: clipLength(p.range) });
  const ready = job.s === 'ready' || job.s === 'loading' ? job : null;
  const fileUrl = ready ? client.exportFileUrl(ready.id) : '';
  let state: string | null = null;
  let pct: number | null = null;
  let actions;
  if (job.s === 'starting' || job.s === 'running') {
    pct = job.s === 'running' ? Math.round(job.pct * 100) : 0;
    state = t('nvr.clip.preparing', { pct });
    actions = (
      <button type="button" className="nvr-btn nvr-btn--ghost" onClick={cancel}>
        {t('nvr.clip.cancel')}
      </button>
    );
  } else if (ready) {
    state =
      job.s === 'loading' ? t('nvr.clip.loading') : t('nvr.clip.ready', { size: humanBytes(ready.bytes, locale) });
    const save =
      ready.ways.save === 'safari' ? (
        <a
          className="nvr-btn nvr-btn--primary"
          href={outsideAppHref(fileUrl)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => log('safari')}
        >
          {t('nvr.player.openInSafari')}
        </a>
      ) : ready.ways.save === 'blob' ? (
        job.s === 'ready' && job.blobUrl ? (
          <a
            className="nvr-btn nvr-btn--primary"
            href={job.blobUrl}
            download={ready.filename}
            onClick={() => log('blob')}
          >
            {t('nvr.clip.save')}
          </a>
        ) : (
          <button type="button" className="nvr-btn nvr-btn--primary" disabled>
            {t('nvr.clip.save')}
          </button>
        )
      ) : ready.ways.save === 'tab' ? (
        // another origin, too large for the page: a new tab saves it (attachment), the host page stays
        <a
          className="nvr-btn nvr-btn--primary"
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => log('tab')}
        >
          {t('nvr.clip.save')}
        </a>
      ) : (
        <a
          className="nvr-btn nvr-btn--primary"
          href={fileUrl}
          download={ready.filename}
          onClick={() => log('download')}
        >
          {t('nvr.clip.save')}
        </a>
      );
    actions = (
      <>
        {save}
        {ready.ways.share && (
          <button
            type="button"
            className="nvr-btn nvr-btn--ghost"
            disabled={!(job.s === 'ready' && job.file)}
            onClick={share}
          >
            <Share2 size={16} />
            {t('nvr.clip.share')}
          </button>
        )}
      </>
    );
  } else {
    const again = job.s === 'error' && job.kind === 'expired';
    actions = (
      <button
        type="button"
        className="nvr-btn nvr-btn--primary"
        disabled={!hints.canCreate}
        onClick={() => void create()}
      >
        {t(again ? 'nvr.clip.recreate' : 'nvr.clip.create')}
      </button>
    );
  }

  return (
    <div className="nvr-clipbar" role="group" aria-label={t('nvr.clip.download')}>
      <div className="nvr-clipbar__row">
        {chip('from')}
        {chip('to')}
        <button
          type="button"
          className="nvr-iconbtn nvr-clipbar__close"
          aria-label={t('nvr.clip.close')}
          onClick={p.onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div
        className={'nvr-clipbar__note' + (note?.tone === 'bad' ? ' nvr-clipbar__note--bad' : '')}
        title={[lenText, state, note?.text].filter(Boolean).join(' · ')}
      >
        {/* the length changes with every scroll step of an edge: outside the live region (never read out each time) */}
        <span className="nvr-clipbar__len nvr-data">{lenText}</span>
        <span role="status">
          {state && (
            <>
              {' · '}
              <span className="nvr-clipbar__state">{state}</span>
            </>
          )}
          {note && (
            <>
              {' · '}
              <span className={note.tone === 'bad' ? 'nvr-clipbar__bad' : undefined}>{note.text}</span>
            </>
          )}
        </span>
      </div>
      {pct != null && (
        <div className="nvr-clipbar__prog" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="nvr-clipbar__row nvr-clipbar__actions">{actions}</div>
    </div>
  );
}
