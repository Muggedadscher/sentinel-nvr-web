/**
 * PlayerController — the whole playback brain of the NVR. Framework-free: it owns
 * a <video>, a freeze <canvas> and an MJPEG <img> inside a stage element, and
 * reports state through `onState`; the host only renders what it says.
 *
 * Host seams: the API client is injected; status labels are i18n KEY suffixes
 * (`nvr.player.<label>`) the host translates; `storagePrefix` namespaces the
 * remembered stage aspect per camera; `brand` tags telemetry lines. The MSE paths
 * are gated on `SentinelClient.corsMedia`; posters load with crossOrigin so the
 * freeze canvas stays untainted. The host CSS must define a `.hidden` class.
 *
 * Paths: LIVE = WebRTC (sink) → MSE live (fMP4, no audio) → MJPEG <img>.
 * RECORDED = WebRTC relay (server-seekable, scrub time-lapse in place) →
 * MSE fallback (progressive segments, trick-play chase) → native <video src>.
 */
import { timeoutSignal, type SentinelClip as Clip, type SentinelClient } from '../api';
import { rlog, setRlogClient } from './rlog';
import { WebRtcSession, mobileClient } from './webrtc';

/** `label` is an i18n key suffix: nvr.player.<label> */
export type PlayerLabel =
  'live' | 'liveWebrtc' | 'liveMse' | 'liveMjpeg' | 'loading' | 'playing' | 'paused' | 'scrub' | 'noRecording' | '';
export interface PlayerState {
  live: boolean;
  label: PlayerLabel;
  playhead: number | null;
  rate: number;
  sound: boolean;
  paused: boolean;
  transport: 'webrtc' | 'mse' | 'mjpeg' | 'relay' | 'native' | 'none';
  muted: boolean;
}
export interface PlayerRefs {
  video: HTMLVideoElement;
  freeze: HTMLCanvasElement;
  img: HTMLImageElement;
  stage: HTMLElement;
}
export interface PlayerOptions {
  onState: (s: PlayerState) => void;
  onClipsRefresh: () => Promise<Clip[]>;
  /** localStorage key prefix for the remembered stage aspect per camera (default 'snvr-ar-'). */
  storagePrefix?: string;
  /** telemetry brand tag written into api/clientlog lines (default 'web'). */
  brand?: string;
}
type Opts = PlayerOptions;

const MSCls: typeof MediaSource | undefined = (window as any).ManagedMediaSource || window.MediaSource;
/** Seek → picture. After a jump the OLD position keeps playing until the new one has crossed the pipeline (measured 24.09.2026,
 *  sink passthrough: 1.3–1.4 s on the LAN, more on slow links). A still picture (event frame / frozen picture) covers that and
 *  is lifted on the EXACT first frame of the new position: the server restarts its transcoder with a marker width it names in
 *  the relay-seek answer ({w}); the first presented frame of that width (rVFC metadata / `resize`) is the new position.
 *  Servers without markers (plain 204): lifted SWAP_MS after the answer plus one presented frame. MARK_CAP_MS = safety net. */
const SWAP_MS = 2600;
const MARK_CAP_MS = 12000;
/** Lifting a still: wait this many further presented frames after the "new content" signal, then fade it out. iOS/Safari
 *  draw video on a separate layer that may still be empty for a moment after the frame callback — hiding the still at
 *  once let the grey stage background flash through (user 25.09.2026, iPhone). ~100 ms + 120 ms fade at 20 fps. */
const LIFT_FRAMES = 2;
const LIFT_FADE_MS = 120;
/** Scrub profile (640 all-intra) → normal (1280) only after the gesture has been quiet this long: a scroll–pause–scroll pattern
 *  restarted the transcoder twice per pause (server log: profile switch every 1–2 s, 30 restarts in one session). */
const SCRUB_OFF_DELAY_MS = 1500;
/** hold mid-gesture: seek only if the playhead is further than this from the centre; idle: land if further than this */
/** Scrub by TARGET (since 0.7.0): while the user scrubs, the client sends the timeline centre (api/relay-target, coalesced) and
 *  the server's feeder steers its cursor onto it and stops there. No client-side rate estimate, no hold/landing seeks — those
 *  overshot by (reaction time × rate) and then jumped back, and every seek shows 2.4 s of stale stream first. */
const TARGET_FLOOR_MS = 120,
  TARGET_MIN_STEP_MS = 250;

export class PlayerController {
  private v!: HTMLVideoElement;
  private fz!: HTMLCanvasElement;
  private img!: HTMLImageElement;
  private stage!: HTMLElement;
  private api: SentinelClient;
  private opts: Opts;
  camId = '';
  camName = '';
  clips: Clip[] = [];
  codecs: string | null = null;
  rangeStart = 0;
  rangeEnd = 0;
  live = false;
  rate = 1;
  soundOn = false;
  recPaused = false;
  recPausedTs: number | null = null;
  recWebrtcDisabled = false;
  label: PlayerLabel = '';
  transport: PlayerState['transport'] = 'none';
  // relay session (RW)
  private rw: WebRtcSession | undefined;
  private rwStartMs = 0;
  private rwBase: number | null = null;
  private rwPosTs: number | null = null;
  private rwPosAt = 0;
  private rwRate = 1;
  private rwSrate = 1;
  private rwScrub = false;
  private rwSeekBusy = false;
  private rwPending: { ts: number; rate: number; srate: number; mark?: boolean } | null = null;
  private rwLastSeekTs: number | null = null;
  private rwLastSeekAt = 0;
  private relayPoll: number | undefined;
  private wdLastCt = -1;
  private wdLastAt = 0;
  private wdDead = 0;
  private wdGrace = 0;
  private wdResumeLogged = false;
  private recoveries = 0;
  private posterUntilSeek = false;
  private seekTarget = 0;
  // seek → visible swap (see SWAP_MS); posterFor = event the pending poster belongs to; scrubOffT = delayed profile switch
  private swapPending = false;
  private swapFrames = -1;
  private swapT = 0;
  private posterFor = 0;
  private scrubOffT = 0;
  // marked seek: width the new position arrives with (0 = timer path), send time (telemetry); presented width / frames at session start
  private swapW = 0;
  private swapAt = 0;
  private shownW = 0;
  private sessFrames0 = 0;
  private liftTok: object | null = null; // a pending lift (frames → fade → hide); any new still cancels it
  private scrubMoves = 0;
  private rwTargetBusy = false;
  private rwPendingTarget: number | null = null;
  private rwLastTarget = 0;
  private rwLastTargetAt = 0;
  // relay-pos answers are only valid for the command generation they were asked under; a poll sent BEFORE a
  // seek/rate change and answered after it would drag the playhead back to the old position (and the
  // auto-follow timeline with it → visible back-and-forth). seekAt: the server may still report the pre-swap
  // position for a moment after a seek — ignore far-off values in that window.
  private cmdSeq = 0;
  private seekAt = 0;
  // live session (W) + live MSE (L)
  private w: WebRtcSession | undefined;
  private L = {
    active: false,
    ms: null as MediaSource | null,
    sb: null as SourceBuffer | null,
    abort: null as AbortController | null,
    queue: [] as Uint8Array[],
    restarts: 0,
    lastTrim: 0,
    stallT: 0,
  };
  // recorded MSE (M)
  private M = {
    ms: null as MediaSource | null,
    sb: null as SourceBuffer | null,
    base: 0,
    nextIdx: -1,
    end: 0,
    active: false,
    feeding: false,
    abort: null as AbortController | null,
    q: [] as Uint8Array[],
    segFirst: false,
    segOff: 0,
    pendingSeek: null as number | null,
    mmsGo: true,
  };
  private CH = { active: false, target: 0, timer: 0 };
  private curClipId: string | null = null;
  private playIndex = -1;
  private lastLoad = 0;
  private pendingTs: number | null = null;
  private pendingT: number | undefined;
  // frame counter / freeze
  private fc = { n: 0, tok: {} as object };
  private freezeT = 0;
  private freezeTok: object | null = null;
  private cad = { t: 0, last: -1, lastNew: 0, stalls: 0, maxStall: 0, frames0: -1, t0: 0, gapMax: 0 };
  private stallTimer = 0;
  private destroyed = false;
  private liveRestartT = 0;
  // live watchdog (presented frames), MJPEG retry, periodic WebRTC retry out of a fallback, relay-pos in flight
  private liveWd = { last: -1, at: 0, since: 0 };
  private mjpegRetries = 0;
  private mjpegRetryT = 0;
  private liveUpgradeAt = 0;
  private liveUpgradeN = 0;
  private rwPosBusy = false;
  private unlisten: (() => void)[] = [];

  private arPrefix: string;
  constructor(api: SentinelClient, opts: Opts) {
    this.api = api;
    this.opts = opts;
    this.arPrefix = opts.storagePrefix ?? 'snvr-ar-';
    setRlogClient(api, opts.brand);
  }

  attach(r: PlayerRefs): void {
    this.v = r.video;
    this.fz = r.freeze;
    this.img = r.img;
    this.stage = r.stage;
    const v = this.v;
    const on = (n: string, f: () => void) => {
      v.addEventListener(n, f);
      this.unlisten.push(() => v.removeEventListener(n, f));
    };
    on('timeupdate', () => {
      if (this.live) return;
      if (this.rw?.active && this.rwBase == null && v.currentTime > 0) this.rwBase = v.currentTime;
      const ts = this.currentTs();
      if (ts == null) return;
      if (this.M.active || this.rw?.active) {
        const i = this.clipIndexFor(ts);
        if (i >= 0) this.playIndex = i;
      }
      this.feed();
      this.emit();
    });
    on('waiting', () => {
      if (this.live) {
        if (this.L.active && !this.L.stallT)
          this.L.stallT = window.setTimeout(() => {
            this.L.stallT = 0;
            if (this.live && this.L.active && v.readyState < 3) this.liveRestart();
          }, 4000);
        return;
      }
      if (!this.rw?.active) this.setLabel('loading');
      if (!this.M.active || this.stallTimer) return;
      this.stallTimer = window.setTimeout(() => {
        this.stallTimer = 0;
        this.handleStall();
      }, 600);
    });
    on('seeking', () => {
      if (!this.live && !this.rw?.active) this.setLabel('loading');
    });
    for (const n of ['loadeddata', 'playing', 'canplay', 'seeked'])
      on(n, () => {
        if (v.videoWidth && !v.srcObject && !this.posterUntilSeek) this.freezeLift();
        /* WebRTC: presented frames decide (rVFC), not these events */ if (!this.live && this.label === 'loading')
          this.setLabel('playing');
        if (this.L.stallT) {
          clearTimeout(this.L.stallT);
          this.L.stallT = 0;
        }
        this.emit();
      });
    on('pause', () => {
      if (this.L.stallT) {
        clearTimeout(this.L.stallT);
        this.L.stallT = 0;
      }
      this.emit();
    });
    on('play', () => this.emit());
    // the stage box follows the picture's real aspect where the layout uses it (mobile: no letterbox bars for 4:3 cameras)
    on('loadedmetadata', () => this.setAspect(this.v.videoWidth, this.v.videoHeight));
    on('resize', () => {
      this.setAspect(this.v.videoWidth, this.v.videoHeight);
      if (this.v.videoWidth && !(this.v as any).requestVideoFrameCallback) this.markerCheck(this.v.videoWidth);
    });
    on('volumechange', () => this.emit());
    on('error', () => {
      const e = v.error;
      rlog('video-error', {
        code: e?.code,
        msg: e?.message?.slice(0, 120),
        src: v.getAttribute('src') ? 'src' : 'srcObject',
      });
    });
    on('ended', () => {
      if (this.live || this.M.active || this.rw?.active) return;
      const n = this.playIndex + 1;
      if (n < this.clips.length) {
        const c = this.clips[n]!;
        this.curClipId = c.id;
        this.playIndex = n;
        v.src = this.api.url(`api/segment?id=${encodeURIComponent(c.videoId || c.id)}`);
        v.load();
        v.onloadedmetadata = () => {
          v.playbackRate = this.rate;
          try {
            v.currentTime = 0;
          } catch {
            /* ignore */
          }
          this.safePlay();
        };
        this.setLabel('playing');
      }
    });
    this.pendingT = window.setInterval(() => {
      if (this.pendingTs != null && Date.now() - this.lastLoad >= 200) {
        const t = this.pendingTs;
        this.pendingTs = null;
        this.playAt(t, { scrub: true });
      }
    }, 120);
    const vis = () => this.onVisibility();
    document.addEventListener('visibilitychange', vis);
    this.unlisten.push(() => document.removeEventListener('visibilitychange', vis));
    const edge = window.setInterval(() => {
      if (this.live && this.L.active) this.liveEdge();
      if (this.live) this.liveWatch();
    }, 1000);
    this.unlisten.push(() => clearInterval(edge));
  }

  destroy(): void {
    this.destroyed = true;
    // no path may (re)start a stream on a destroyed controller: the 1-s live
    // restart timer, a pending async load in the host, a visibility change …
    this.live = false;
    this.recPaused = false;
    if (this.liveRestartT) {
      clearTimeout(this.liveRestartT);
      this.liveRestartT = 0;
    }
    if (this.mjpegRetryT) {
      clearTimeout(this.mjpegRetryT);
      this.mjpegRetryT = 0;
    }
    this.recWebrtcTeardown();
    this.webrtcTeardown();
    this.mseTeardown();
    this.liveTeardown();
    this.chaseAbort();
    if (this.pendingT) clearInterval(this.pendingT);
    if (this.freezeT) {
      clearTimeout(this.freezeT);
      this.freezeT = 0;
    } // the 90-s safety timer held the controller + DOM
    for (const u of this.unlisten) u();
    try {
      this.v.pause();
      this.v.srcObject = null;
      this.v.removeAttribute('src');
      this.v.onloadedmetadata = null;
    } catch {
      /* ignore */
    }
    try {
      this.img.onload = null;
      this.img.onerror = null;
      this.img.removeAttribute('src');
    } catch {
      /* ignore */
    } // ends the MJPEG stream
  }

  setCamera(camId: string, name: string): void {
    if (camId !== this.camId) {
      this.recWebrtcDisabled = false;
      this.recoveries = 0;
      // the previous camera's stream must not keep playing under the new name while the host loads the new days
      if (this.camId) this.stopStreams();
    }
    this.camId = camId;
    this.camName = name;
    // last known picture aspect of this camera: the stage has the right shape before any poster/video arrives
    let ar = '';
    try {
      ar = localStorage.getItem(this.arPrefix + camId) || '';
    } catch {
      /* ignore */
    }
    if (ar) this.stage.style.setProperty('--stage-ar', ar);
    else this.stage.style.removeProperty('--stage-ar');
  }
  /** Stop every stream and clear the stage (camera switch): no picture of the old camera stays. */
  private stopStreams(): void {
    this.chaseAbort();
    if (this.liveRestartT) {
      clearTimeout(this.liveRestartT);
      this.liveRestartT = 0;
    }
    if (this.mjpegRetryT) {
      clearTimeout(this.mjpegRetryT);
      this.mjpegRetryT = 0;
    }
    this.recWebrtcTeardown();
    this.webrtcTeardown();
    this.mseTeardown();
    this.liveTeardown();
    this.live = false;
    this.recPaused = false;
    this.recPausedTs = null;
    this.hiddenTs = null;
    this.playIndex = -1;
    this.curClipId = null;
    try {
      this.v.pause();
      this.v.srcObject = null;
      this.v.removeAttribute('src');
      this.v.onloadedmetadata = null;
    } catch {
      /* ignore */
    }
    this.setMjpeg(false);
    this.freezeHide();
    this.transport = 'none';
    this.setLabel('loading');
  }
  /** picture aspect → stage box (mobile layout uses it); posters and video both report it */
  private setAspect(w: number, h: number): void {
    if (!w || !h) return;
    const ar = `${w} / ${h}`;
    if (this.stage.style.getPropertyValue('--stage-ar') === ar) return;
    this.stage.style.setProperty('--stage-ar', ar);
    try {
      localStorage.setItem(this.arPrefix + this.camId, ar);
    } catch {
      /* ignore */
    }
  }
  /** clips of the loaded range (several days, sorted), codec string, and the range the timeline spans */
  setClips(clips: Clip[], codecs: string | null, rangeStart: number, rangeEnd: number): void {
    this.clips = clips;
    this.codecs = codecs;
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
  }

  // ---- state ---------------------------------------------------------------------
  private setLabel(l: PlayerLabel): void {
    this.label = l;
    this.emit();
  }
  private emit(): void {
    if (this.destroyed) return;
    this.opts.onState({
      live: this.live,
      label: this.label,
      playhead: this.live ? null : this.currentTs(),
      rate: this.rate,
      sound: this.soundOn,
      paused: this.recPaused || (this.v.paused && !this.live && !this.rw?.active),
      transport: this.transport,
      muted: this.v.muted,
    });
  }
  clipIndexFor(ts: number): number {
    for (let i = 0; i < this.clips.length; i++) {
      const c = this.clips[i]!;
      if (ts >= c.startTime && ts < c.startTime + (c.duration || 60000)) return i;
    }
    return -1;
  }
  private nearNow(ts: number): boolean {
    return Date.now() - ts < 8000;
  }
  private clampRange(ts: number): number {
    return Math.min(Math.max(ts, this.rangeStart), Math.min(this.rangeEnd - 1, Date.now()));
  }

  /** Wall-clock position of the picture on screen (Scrypted's getRecordingStreamCurrentTime). */
  currentTs(): number | null {
    if (this.rw?.active) {
      if (this.rwPosTs != null) {
        const v = this.rwPosTs + (Date.now() - this.rwPosAt) * (this.rwRate || 1);
        // while the server steers onto a target its rate changes every 100 ms — never extrapolate past the target
        if ((this.rwScrub || this.scrubMoves > 0) && this.rwLastTarget) {
          const lo = Math.min(this.rwPosTs, this.rwLastTarget),
            hi = Math.max(this.rwPosTs, this.rwLastTarget);
          return Math.min(hi, Math.max(lo, v));
        }
        return v;
      }
      if (this.rwBase != null && this.v.currentTime > 0)
        return this.rwStartMs + (this.v.currentTime - this.rwBase) * 1000 * (this.rwRate || 1);
      return this.rwStartMs;
    }
    if (this.recPaused) return this.recPausedTs;
    if (this.live) return null;
    if (this.M.active) return this.M.base + this.v.currentTime * 1000;
    const pc = this.playIndex >= 0 ? this.clips[this.playIndex] : undefined;
    if (pc) return pc.startTime + this.v.currentTime * 1000;
    return null;
  }

  // ---- presented frames / freeze / poster -----------------------------------------
  private fcArm(): void {
    const v: any = this.v;
    if (!v.requestVideoFrameCallback) return;
    const tok = {};
    this.fc.tok = tok;
    const tick = (_now: number, md?: { width?: number }) => {
      if (this.fc.tok !== tok) return;
      this.fc.n++;
      const w = (md && md.width) || this.v.videoWidth;
      if (w) {
        this.shownW = w;
        this.markerCheck(w);
      }
      try {
        v.requestVideoFrameCallback(tick);
      } catch {
        /* ignore */
      }
    };
    try {
      v.requestVideoFrameCallback(tick);
    } catch {
      /* ignore */
    }
  }
  /** a presented frame of width w: is it the first frame of the marked seek's new position? */
  private markerCheck(w: number): void {
    if (this.swapPending && this.swapW && w === this.swapW) this.swapVisible('marker');
  }
  presentedFrames(): number {
    if ((this.v as any).requestVideoFrameCallback) return this.fc.n;
    try {
      return this.v.getVideoPlaybackQuality().totalVideoFrames;
    } catch {
      return -1;
    }
  }
  private freezeArm(hold: boolean): void {
    if (this.freezeT) clearTimeout(this.freezeT);
    this.freezeT = window.setTimeout(() => this.freezeHide(), 90000); // safety net only — a still stays until the video really runs
    const v: any = this.v;
    if (hold && v.requestVideoFrameCallback) {
      const tok = {};
      this.freezeTok = tok;
      try {
        v.requestVideoFrameCallback(() => {
          if (this.freezeTok === tok && this.v.videoWidth) this.freezeLift();
        });
      } catch {
        /* ignore */
      }
    }
  }
  /** a still is shown (again): cancel a pending lift, full opacity */
  private stillUp(): void {
    this.liftTok = null;
    this.fz.classList.remove('nvr-stage__freeze--fade');
    this.fz.classList.remove('hidden');
  }
  /** New content is being presented → lift the still after LIFT_FRAMES more presented frames with a short fade (see
   *  LIFT_FRAMES). `frames` 0 = fade right away (MJPEG image loaded). A lift already under way is not restarted. */
  private freezeLift(frames = LIFT_FRAMES): void {
    if (!this.posterUp() || this.liftTok) return;
    const tok = {};
    this.liftTok = tok;
    const v: any = this.v;
    const fade = () => {
      if (this.liftTok !== tok) return;
      this.fz.classList.add('nvr-stage__freeze--fade');
      window.setTimeout(() => {
        if (this.liftTok === tok) this.freezeHide();
      }, LIFT_FADE_MS);
    };
    if (frames > 0 && v.requestVideoFrameCallback) {
      let n = 0;
      const tick = () => {
        if (this.liftTok !== tok) return;
        if (++n >= frames) fade();
        else {
          try {
            v.requestVideoFrameCallback(tick);
          } catch {
            fade();
          }
        }
      };
      try {
        v.requestVideoFrameCallback(tick);
      } catch {
        fade();
      }
    } else window.setTimeout(fade, frames > 0 ? 100 : 0);
  }
  /** copy the current video picture onto the freeze canvas (false = nothing to copy yet) */
  private drawVideo(): boolean {
    const v = this.v,
      fc = this.fz;
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return false;
    if (fc.width !== v.videoWidth) fc.width = v.videoWidth;
    if (fc.height !== v.videoHeight) fc.height = v.videoHeight;
    fc.getContext('2d')!.drawImage(v, 0, 0, fc.width, fc.height);
    this.stillUp();
    fc.dataset.src = 'video';
    return true;
  }
  /** Freeze the current picture. A still that is already visible stays (redrawing would copy from an element whose stream
   *  may already be gone → black) — it is only re-armed. */
  freezeShow(hold = false): void {
    try {
      if (this.posterUp()) {
        if (!this.posterUntilSeek) this.freezeArm(hold);
        return;
      }
      if (this.drawVideo()) this.freezeArm(hold);
    } catch {
      /* ignore */
    }
  }
  /** poster/freeze stays until the seek's picture is visible (swapVisible); safety net MARK_CAP_MS */
  private holdUntilSwap(): void {
    if (this.freezeT) clearTimeout(this.freezeT);
    this.freezeTok = null;
    if (this.posterUp()) this.stillUp(); // a lift in progress is cancelled — this still now waits for the jump
    this.posterUntilSeek = true;
    this.freezeT = window.setTimeout(() => this.swapVisible('cap'), MARK_CAP_MS);
  }
  /** A jump inside a running relay session: the current picture stands still at once (the old position must not keep playing
   *  while the new one crosses the pipeline); an already visible still (event frame) is kept. Lifted by swapVisible. */
  freezeCurrent(): void {
    if (!this.rw?.active || !this.rw.id) return; // no session yet: playAt's own freeze/poster path applies
    try {
      if (this.posterUp() || this.drawVideo()) this.holdUntilSwap();
    } catch {
      /* ignore */
    }
  }
  /** the picture of the last seek is on screen: lift a held poster, report playing */
  private swapVisible(how: 'marker' | 'timer' | 'cap' = 'timer'): void {
    if (this.swapT) {
      clearTimeout(this.swapT);
      this.swapT = 0;
    }
    const was = this.swapPending;
    this.swapPending = false;
    this.swapW = 0;
    if (was && this.swapAt) rlog('swap', { how, ms: Date.now() - this.swapAt, w: this.shownW });
    this.swapAt = 0;
    if (this.posterUntilSeek) {
      this.posterUntilSeek = false;
      if (this.freezeT) {
        clearTimeout(this.freezeT);
        this.freezeT = 0;
      }
      this.freezeLift();
    }
    if (this.label === 'loading' && this.rw?.active) this.setLabel('playing');
  }
  /** seek answered: the new picture is on screen SWAP_MS later (plus proof of a presented frame) */
  private swapArm(): void {
    if (this.swapT) clearTimeout(this.swapT);
    this.swapFrames = this.presentedFrames();
    const check = () => {
      this.swapT = 0;
      if (!this.swapPending || !this.rw?.active) return;
      if (this.presentedFrames() > this.swapFrames) this.swapVisible();
      else this.swapT = window.setTimeout(check, 100);
    };
    this.swapT = window.setTimeout(check, SWAP_MS);
  }
  freezeFromImage(img: HTMLImageElement, hold: boolean, untilSeek = false, kind = 'image'): boolean {
    try {
      if (!img.naturalWidth || !img.naturalHeight) return false;
      const fc = this.fz;
      fc.width = img.naturalWidth;
      fc.height = img.naturalHeight;
      fc.getContext('2d')!.drawImage(img, 0, 0);
      this.stillUp();
      fc.dataset.src = kind;
      this.setAspect(img.naturalWidth, img.naturalHeight);
      if (untilSeek)
        this.holdUntilSwap(); // stays until the seek's picture is visible (see startRelayPoll)
      else this.freezeArm(hold);
      return true;
    } catch {
      return false;
    }
  }
  freezeHide(): void {
    if (this.freezeT) {
      clearTimeout(this.freezeT);
      this.freezeT = 0;
    }
    this.liftTok = null;
    this.posterUntilSeek = false;
    this.fz.classList.add('hidden');
    this.fz.classList.remove('nvr-stage__freeze--fade');
    delete this.fz.dataset.src;
  }
  private posterUp(): boolean {
    return !this.fz.classList.contains('hidden');
  }
  /** scrub on MSE: the still stays while the gesture runs (lifted by the seek's `seeked`/`playing`) */
  freezeHold(): void {
    if (this.freezeT) {
      clearTimeout(this.freezeT);
      this.freezeT = window.setTimeout(() => this.freezeHide(), 90000);
    }
  }
  /** Event click: the stored frame is the poster until the seek lands. */
  posterEvent(ts: number): void {
    const cam = this.camId;
    this.posterFor = ts;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.camId !== cam || this.posterFor !== ts || this.destroyed) return;
      const firstFramePending = !!this.rw?.active && this.presentedFrames() <= this.sessFrames0;
      if (this.swapPending)
        this.freezeFromImage(img, true, true, 'event'); // a jump is under way → until its picture
      else if (firstFramePending || !this.rw?.active) this.freezeFromImage(img, true, false, 'event'); // new session → until its first frame
      // else: the target picture is already on screen — don't cover it
    };
    img.src = this.api.url(`api/evframe?camera=${encodeURIComponent(cam)}&ts=${ts}`);
  }
  /** Camera opened: a picture in front of the black stage until live plays — the overview tile's snapshot when the host
   *  remembers one (browser cache → instant), else a fresh api/snapshot (1–3 s). */
  posterFromSnapshot(tileUrl?: string): void {
    const cam = this.camId;
    const load = (src: string, fresh: boolean) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.camId !== cam || this.rw?.active || this.recPaused || this.posterUp()) return;
        if (this.v.readyState >= 2 && this.v.videoWidth && !this.v.paused) return;
        this.freezeFromImage(img, true, false, 'snapshot');
      };
      if (!fresh)
        img.onerror = () =>
          load(this.api.url(`api/snapshot?camera=${encodeURIComponent(cam)}`) + `&_=${Date.now()}`, true);
      img.src = src;
    };
    if (tileUrl) load(tileUrl, false);
    else load(this.api.url(`api/snapshot?camera=${encodeURIComponent(cam)}`) + `&_=${Date.now()}`, true);
  }
  private posterShow(ts: number): void {
    try {
      if (this.posterUp()) return;
      if (this.v.readyState >= 2 && this.v.videoWidth) return;
      const i = this.clipIndexFor(ts);
      const c = i >= 0 ? this.clips[i] : undefined;
      if (!c?.thumbnailId) return;
      const cam = this.camId;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.camId !== cam || this.destroyed) return;
        if (!this.posterUp()) this.freezeFromImage(img, true, false, 'thumb');
      };
      img.src = this.api.url(`api/thumb?id=${encodeURIComponent(c.thumbnailId)}`);
    } catch {
      /* ignore */
    }
  }

  private safePlay(): void {
    let pr: Promise<void>;
    try {
      pr = this.v.play();
    } catch {
      return;
    }
    pr.then(() => this.emit()).catch((e1) => {
      this.v.muted = true;
      this.v
        .play()
        .then(() => this.emit())
        .catch((e2) => rlog('play-fail', { e1: e1?.name, e2: e2?.name, rs: this.v.readyState, paused: this.v.paused }));
    });
  }

  // ---- LIVE ---------------------------------------------------------------------------
  goLive(): void {
    if (!this.camId || this.destroyed) return;
    this.chaseAbort();
    this.freezeShow(true);
    this.exitLiveState();
    this.recWebrtcTeardown();
    this.recPaused = false;
    this.live = true;
    this.playIndex = -1;
    this.curClipId = null;
    this.L.restarts = 0;
    this.setLabel('live');
    if (document.visibilityState === 'hidden') return;
    if (window.RTCPeerConnection && window.WebSocket) this.liveStartWebrtc();
    else if (this.liveMseOk()) this.liveStartMse();
    else {
      try {
        this.v.pause();
      } catch {
        /* ignore */
      }
      this.liveFallbackImg();
    }
  }
  private exitLiveState(): void {
    if (this.live) {
      this.live = false;
      this.webrtcTeardown();
      this.liveTeardown();
      try {
        this.v.srcObject = null;
      } catch {
        /* ignore */
      }
      this.setMjpeg(false);
    }
  }
  private setMjpeg(on: boolean): void {
    this.img.classList.toggle('hidden', !on);
    this.v.classList.toggle('hidden', on);
    if (!on) {
      this.img.onerror = null;
      this.img.removeAttribute('src');
    }
  }
  private webrtcTeardown(): void {
    this.w?.stop();
    this.w = undefined;
  }
  private liveStartWebrtc(): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.webrtcTeardown();
    this.recWebrtcTeardown();
    this.mseTeardown();
    this.liveTeardown();
    try {
      this.v.pause();
    } catch {
      /* ignore */
    }
    try {
      this.v.srcObject = null;
    } catch {
      /* ignore */
    }
    this.v.removeAttribute('src');
    this.setMjpeg(false);
    const s = new WebRtcSession(
      this.api,
      { camId: this.camId, mode: 'live' },
      {
        onStream: (ms) => {
          if (!this.live || this.w !== s) return;
          this.setMjpeg(false);
          this.v.muted = !this.soundOn;
          try {
            this.v.removeAttribute('src');
          } catch {
            /* ignore */
          }
          try {
            this.v.srcObject = ms;
          } catch {
            /* ignore */
          }
          this.fcArm();
          this.safePlay();
          this.transport = 'webrtc';
          this.setLabel('liveWebrtc');
          this.liveWd = {
            last: this.presentedFrames(),
            at: Date.now() + 8000 /* first frame grace */,
            since: Date.now(),
          };
        },
        onFail: () => {
          if (this.w === s) this.liveFallbackMse();
        },
      },
    );
    this.w = s;
    this.transport = 'webrtc';
    s.start();
  }
  /**
   * Live health, once a second while live and visible:
   * - WebRTC: no presented frame for 8 s (a 'disconnected' ICE that never turns 'failed' froze the picture under the
   *   "Live" label) → restart, after 3 restarts in a row the MSE/MJPEG fallback;
   * - 30 s of flowing frames reset the restart counter (it only ever grew → MJPEG for good after 5 hiccups);
   * - in a fallback (MSE/MJPEG) WebRTC is tried again every 2 minutes.
   */
  private liveWatch(): void {
    if (document.visibilityState === 'hidden' || this.destroyed) return;
    const now = Date.now();
    if (this.transport === 'webrtc' && this.w?.active && this.v.srcObject) {
      const q = this.presentedFrames();
      const W = this.liveWd;
      if (q !== W.last) {
        W.last = q;
        if (now > W.at) W.at = now;
        if (now - W.since > 30000) {
          this.L.restarts = 0;
          this.liveUpgradeN = 0;
          W.since = now;
        }
        return;
      }
      if (now - W.at > 8000) {
        this.L.restarts++;
        rlog('live-stall', { n: this.L.restarts, pf: q, ice: this.w.pc?.iceConnectionState });
        if (this.L.restarts > 3) this.liveFallbackMse();
        else this.liveStartWebrtc();
      }
      return;
    }
    if (
      (this.transport === 'mse' || this.transport === 'mjpeg') &&
      window.RTCPeerConnection &&
      window.WebSocket &&
      !this.w
    ) {
      // back-off 2 → 5 → 15 min: a WebRTC path that stays broken must not blink the picture every 2 minutes
      if (!this.liveUpgradeAt) this.liveUpgradeAt = now + [120000, 300000, 900000][Math.min(this.liveUpgradeN, 2)]!;
      else if (now > this.liveUpgradeAt) {
        this.liveUpgradeAt = 0;
        this.liveUpgradeN++;
        this.L.restarts = 0;
        rlog('live-upgrade', { from: this.transport, n: this.liveUpgradeN });
        if (this.transport === 'mjpeg') this.freezeFromImage(this.img, true, false, 'mjpeg');
        else this.freezeShow(true); // a still until WebRTC shows its first frame
        this.liveStartWebrtc();
      }
    } else this.liveUpgradeAt = 0;
  }
  private liveFallbackMse(): void {
    this.webrtcTeardown();
    if (!this.live) return;
    try {
      this.v.srcObject = null;
    } catch {
      /* ignore */
    }
    if (this.liveMseOk()) this.liveStartMse();
    else this.liveFallbackImg();
  }
  private liveCodec(): string | null {
    return this.codecs ? (this.codecs.split(',')[0] ?? null) : null;
  }
  private liveMseOk(): boolean {
    try {
      const c = this.liveCodec();
      return !!(this.api.corsMedia && MSCls && c && MSCls.isTypeSupported(`video/mp4; codecs="${c}"`));
    } catch {
      return false;
    }
  }
  private liveTeardown(): void {
    const L = this.L;
    L.active = false;
    L.queue = [];
    if (L.stallT) {
      clearTimeout(L.stallT);
      L.stallT = 0;
    }
    try {
      L.abort?.abort();
    } catch {
      /* ignore */
    }
    L.abort = null;
    if (L.sb && L.ms && L.ms.readyState === 'open') {
      try {
        L.sb.abort();
      } catch {
        /* ignore */
      }
    }
    L.sb = null;
    L.ms = null;
  }
  private liveAppend(): void {
    const L = this.L;
    if (!L.active || !L.sb || L.sb.updating || !L.queue.length) return;
    const buf = L.queue.shift()!;
    try {
      L.sb.appendBuffer(buf as BufferSource);
    } catch {
      this.liveRestart();
    }
  }
  private liveTrim(): void {
    const L = this.L;
    if (!L.sb || L.sb.updating) return;
    try {
      const b = this.v.buffered;
      if (b.length && this.v.currentTime - b.start(0) > 30) L.sb.remove(0, this.v.currentTime - 10);
    } catch {
      /* ignore */
    }
  }
  private liveEdge(): void {
    try {
      const b = this.v.buffered;
      if (!b.length) return;
      const end = b.end(b.length - 1);
      if (end - this.v.currentTime > 2.5) this.v.currentTime = end - 0.7;
      if (this.v.paused) this.safePlay();
    } catch {
      /* ignore */
    }
  }
  private liveRestart(): void {
    if (!this.live || !this.L.active) return;
    this.liveTeardown();
    this.L.restarts++;
    if (this.L.restarts > 5) {
      this.liveFallbackImg();
      return;
    }
    if (this.liveRestartT) clearTimeout(this.liveRestartT);
    this.liveRestartT = window.setTimeout(() => {
      this.liveRestartT = 0;
      if (this.live && !this.destroyed) this.liveStartMse();
    }, 1000);
  }
  private liveStartMse(): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.liveTeardown();
    this.mseTeardown();
    const L = this.L;
    L.active = true;
    this.transport = 'mse';
    this.setLabel('liveMse');
    this.setMjpeg(false);
    const ms = new MSCls!();
    L.ms = ms;
    L.lastTrim = Date.now();
    if ((window as any).ManagedMediaSource && ms instanceof (window as any).ManagedMediaSource) {
      try {
        (this.v as any).disableRemotePlayback = true;
      } catch {
        /* ignore */
      }
    }
    const u = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', () => {
      URL.revokeObjectURL(u);
      if (L.ms !== ms) return;
      let sb: SourceBuffer;
      try {
        sb = ms.addSourceBuffer(`video/mp4; codecs="${this.liveCodec()}"`);
      } catch {
        this.liveFallbackImg();
        return;
      }
      sb.mode = 'segments';
      sb.addEventListener('updateend', () => {
        if (Date.now() - L.lastTrim > 10000) {
          L.lastTrim = Date.now();
          this.liveTrim();
        }
        this.liveAppend();
      });
      sb.addEventListener('error', () => this.liveRestart());
      L.sb = sb;
      L.abort = new AbortController();
      fetch(this.api.url(`api/livemse?camera=${encodeURIComponent(this.camId)}`), {
        credentials: 'same-origin',
        signal: L.abort.signal,
      })
        .then((r) => {
          if (!r.ok || !r.body) throw new Error(String(r.status));
          const rd = r.body.getReader();
          const loop = () => {
            rd.read()
              .then((x) => {
                if (!L.active || L.ms !== ms) return;
                if (x.done) {
                  this.liveRestart();
                  return;
                }
                L.queue.push(x.value);
                this.liveAppend();
                loop();
              })
              .catch(() => {
                if (L.active && L.ms === ms) this.liveRestart();
              });
          };
          loop();
        })
        .catch(() => {
          if (L.active && L.ms === ms) this.liveFallbackImg();
        });
    });
    try {
      this.v.srcObject = null;
    } catch {
      /* ignore */
    }
    this.v.src = u;
    this.v.playbackRate = 1;
    this.v.muted = true;
    this.safePlay();
  }
  private liveFallbackImg(): void {
    this.liveTeardown();
    if (!this.live) return;
    try {
      this.v.pause();
    } catch {
      /* ignore */
    }
    const cam = this.camId;
    this.img.onload = () => {
      this.img.onload = null;
      this.mjpegRetries = 0;
      if (this.live) this.freezeLift(0);
    };
    // the MJPEG stream ends or fails (429 busy, network): retry with back-off, 3 times in a row at most
    this.img.onerror = () => {
      if (!this.live || this.camId !== cam || this.transport !== 'mjpeg' || this.destroyed || this.mjpegRetries >= 3)
        return;
      const wait = 2000 * 2 ** this.mjpegRetries++;
      rlog('mjpeg-retry', { n: this.mjpegRetries });
      if (this.mjpegRetryT) clearTimeout(this.mjpegRetryT);
      this.mjpegRetryT = window.setTimeout(() => {
        this.mjpegRetryT = 0;
        if (this.live && this.camId === cam && this.transport === 'mjpeg')
          this.img.src = this.api.url(`api/live?camera=${encodeURIComponent(cam)}`) + `&_=${Date.now()}`;
      }, wait);
    };
    this.transport = 'mjpeg';
    this.setLabel('liveMjpeg');
    this.setMjpeg(true);
    this.img.src = this.api.url(`api/live?camera=${encodeURIComponent(cam)}`) + `&_=${Date.now()}`;
  }

  // ---- RECORDED via relay -----------------------------------------------------------------
  private recWebrtcOk(): boolean {
    return !this.recWebrtcDisabled && !!(window.RTCPeerConnection && window.WebSocket);
  }
  private recWebrtcTeardown(): void {
    const seekStill = this.posterUntilSeek && this.posterUp();
    this.posterUntilSeek = false;
    this.swapPending = false;
    this.swapW = 0;
    if (seekStill) this.freezeArm(true);
    /* still over a jump → now until the NEXT stream's first frame */ if (this.swapT) {
      clearTimeout(this.swapT);
      this.swapT = 0;
    }
    if (this.scrubOffT) {
      clearTimeout(this.scrubOffT);
      this.scrubOffT = 0;
    }
    this.rwTargetBusy = false;
    this.rwPendingTarget = null;
    this.rwLastTarget = 0;
    this.stopRelayPoll();
    this.rw?.stop();
    this.rw = undefined;
    this.rwBase = null;
    this.rwPosTs = null;
    this.rwScrub = false;
    this.rwSeekBusy = false;
    this.rwPending = null;
    this.rwLastSeekTs = null;
    this.rwSrate = 1;
    this.rwRate = 1;
  }
  private recWebrtcStart(ts: number): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.freezeShow(true);
    this.posterShow(ts);
    this.live = false;
    this.recWebrtcTeardown();
    this.webrtcTeardown();
    this.mseTeardown();
    this.liveTeardown();
    try {
      this.v.pause();
    } catch {
      /* ignore */
    }
    try {
      this.v.removeAttribute('src');
      this.v.srcObject = null;
    } catch {
      /* ignore */
    }
    this.setMjpeg(false);
    this.transport = 'relay';
    this.setLabel('loading');
    // a new session starts at 1× on the server — the chosen speed is sent once the session id is known (onSessionId)
    this.rwStartMs = ts;
    this.rwBase = null;
    this.rwRate = 1;
    this.rwSrate = 1;
    this.seekTarget = ts;
    this.cmdSeq++; // event poster clears when relay-pos reaches here
    const compat = mobileClient();
    if (compat) rlog('rec-compat-start', { ts: Math.round(ts) });
    const s = new WebRtcSession(
      this.api,
      { camId: this.camId, mode: 'recorded', startMs: ts, compat },
      {
        onStream: (ms) => {
          if (this.rw !== s || this.live) return;
          try {
            s.pc?.getReceivers().forEach((r) => {
              try {
                (r as any).jitterBufferTarget = 500;
              } catch {
                /* ignore */
              }
              try {
                (r as any).playoutDelayHint = 0.5;
              } catch {
                /* ignore */
              }
            });
          } catch {
            /* ignore */
          }
          this.setMjpeg(false);
          this.v.muted = !this.soundOn || this.rate !== 1;
          try {
            this.v.removeAttribute('src');
          } catch {
            /* ignore */
          }
          try {
            this.v.srcObject = ms;
          } catch {
            /* ignore */
          }
          this.fcArm();
          this.rwBase = null;
          this.safePlay();
          this.setLabel('playing');
        },
        onFail: () => {
          if (this.rw === s) this.recFallbackMse(ts);
        },
        onSessionId: () => {
          if (this.rw !== s) return;
          const p = this.rwPending;
          this.rwPending = null;
          if (p && Math.abs(p.ts - this.rwStartMs) > 1500) {
            if (p.mark) this.freezeCurrent();
            this.recRelaySeek(p.ts, p.rate, p.srate, p.mark);
          } // carries the rate
          else if (this.rate !== 1) this.recRelaySpeed(this.rate); // pause/play, tab switch, recovery: keep the chosen speed
        },
      },
    );
    this.sessFrames0 = this.presentedFrames();
    this.shownW = 0;
    this.rw = s;
    s.start();
    this.startRelayPoll();
    this.emit();
  }
  /** Relay failed: retry the relay up to twice (transient WS/ICE hiccups), only then fall back to MSE for the rest of this camera. */
  private recFallbackMse(ts: number): void {
    this.recWebrtcTeardown();
    if (this.live || this.destroyed) return;
    this.recoveries++;
    if (this.recoveries <= 2) {
      rlog('relay-retry', { n: this.recoveries });
      this.recWebrtcStart(ts);
      return;
    }
    rlog('rec-fallback-mse', { mseOk: this.mseSupported(), after: this.recoveries });
    this.recWebrtcDisabled = true;
    this.playAt(ts, {});
  }
  /** Hard server-side seek, coalesced: one in flight, latest wins, 150 ms floor. `mark` = a user jump with a still picture
   *  (see SWAP_MS): the server answers with the marker width the new position arrives with. */
  private recRelaySeek(ts: number, rate = 1, srate = 1, mark = false): void {
    const s = this.rw;
    if (!s?.id) return;
    if (this.rwSeekBusy) {
      this.rwPending = { ts, rate, srate, mark: mark || !!this.rwPending?.mark };
      return;
    }
    if (
      !mark &&
      this.rwLastSeekTs === ts &&
      this.rwRate === rate &&
      this.rwSrate === srate &&
      Date.now() - this.rwLastSeekAt < 1000
    )
      return;
    const wait = 150 - (Date.now() - this.rwLastSeekAt);
    if (wait > 0) {
      this.rwSeekBusy = true;
      this.rwPending = { ts, rate, srate, mark: mark || !!this.rwPending?.mark };
      window.setTimeout(() => {
        this.rwSeekBusy = false;
        const p = this.rwPending;
        this.rwPending = null;
        if (p && this.rw?.id) this.recRelaySeek(p.ts, p.rate, p.srate, p.mark);
      }, wait);
      return;
    }
    if (mark) {
      this.rwScrub = false;
      if (this.scrubOffT) {
        clearTimeout(this.scrubOffT);
        this.scrubOffT = 0;
      }
      this.scrubMoves = 0;
    } // the server leaves the scrub profile for a marked seek
    this.rwStartMs = ts;
    this.rwSrate = srate;
    this.rwRate = this.rwScrub ? srate : rate;
    this.rwLastSeekTs = ts;
    this.rwLastSeekAt = Date.now();
    this.cad.lastNew = Date.now();
    this.wdLastCt = -1;
    this.wdLastAt = Date.now();
    this.wdGrace = Date.now() + 5000;
    this.rwPosTs = ts;
    this.rwPosAt = Date.now();
    this.setLabel(this.rwScrub ? 'scrub' : 'loading'); // scrubbing seeks constantly — no "loading" flicker there
    this.rwSeekBusy = true;
    this.seekTarget = ts;
    this.seekAt = Date.now();
    this.cmdSeq++;
    this.swapPending = true;
    this.swapW = 0;
    this.swapAt = Date.now();
    if (this.swapT) {
      clearTimeout(this.swapT);
      this.swapT = 0;
    }
    const seq = this.cmdSeq;
    const done = (ok: boolean, w: number) => {
      if (this.rw !== s) return; // answer of a session that is gone: must not touch (or recover) the current one
      this.rwSeekBusy = false;
      if (!ok) {
        this.relayRecover();
        return;
      }
      if (this.swapPending && seq === this.cmdSeq) {
        if (w) {
          this.swapW = w;
          if (this.shownW === w) this.swapVisible('marker');
        } // marker path (see SWAP_MS)
        else this.swapArm(); // server without markers: timer
      }
      const p = this.rwPending;
      this.rwPending = null;
      if (p && this.rw?.id) this.recRelaySeek(p.ts, p.rate, p.srate, p.mark);
    };
    const q =
      `api/relay-seek?session=${encodeURIComponent(s.id)}&start=${Math.round(ts)}&rate=${rate}&srate=${srate}` +
      (mark ? `&mark=1&avoid=${this.shownW || this.v.videoWidth || 0}` : '');
    fetch(this.api.url(q), { cache: 'no-store', signal: timeoutSignal(10000) }) // bounded: a hanging seek blocked every later jump
      .then((r) => {
        if (!r.ok) return done(false, 0);
        if (r.status === 200)
          return r.json().then(
            (j: any) => done(true, Number(j?.w) || 0),
            () => done(true, 0),
          );
        return done(true, 0);
      })
      .catch(() => done(false, 0));
  }
  /** Speed button: the server changes its base rate in place (api/relay-speed) — no reposition, no "loading", no still.
   *  Servers without the endpoint (404) get the former seek to the displayed position. */
  private recRelaySpeed(r: number): void {
    const s = this.rw;
    if (!s?.id) return;
    const c = this.currentTs();
    if (c != null) {
      this.rwPosTs = c;
      this.rwPosAt = Date.now();
    }
    if (!this.rwScrub) this.rwRate = r;
    this.cmdSeq++;
    this.wdGrace = Date.now() + 5000;
    this.cad.lastNew = Date.now();
    this.api.control(`api/relay-speed?session=${encodeURIComponent(s.id)}&rate=${r}`).then((ok) => {
      if (!ok && this.rw === s && s.id) this.recRelaySeek(c ?? this.rwStartMs, r);
    });
  }
  /** Scrub target (timeline centre), coalesced: one in flight, latest wins, 120 ms floor, 250 ms minimum step. */
  private recRelayTarget(ts: number): void {
    const s = this.rw;
    if (!s?.active || !s.id) return;
    if (this.rwTargetBusy) {
      this.rwPendingTarget = ts;
      return;
    }
    if (Math.abs(ts - this.rwLastTarget) < TARGET_MIN_STEP_MS) return;
    const wait = TARGET_FLOOR_MS - (Date.now() - this.rwLastTargetAt);
    if (wait > 0) {
      this.rwTargetBusy = true;
      this.rwPendingTarget = ts;
      window.setTimeout(() => {
        this.rwTargetBusy = false;
        const p = this.rwPendingTarget;
        this.rwPendingTarget = null;
        if (p != null && this.rw?.id) this.recRelayTarget(p);
      }, wait);
      return;
    }
    this.rwLastTarget = ts;
    this.rwLastTargetAt = Date.now(); // no cmdSeq bump: the position moves continuously, polls stay valid
    this.wdGrace = Date.now() + 8000;
    this.cad.lastNew = Date.now();
    this.rwTargetBusy = true;
    this.api
      .control(`api/relay-target?session=${encodeURIComponent(s.id)}&ts=${Math.round(ts)}`)
      .then((ok) => {
        if (this.rw !== s) return;
        if (!ok) this.relayRecover();
      })
      .then(() => {
        if (this.rw !== s) return;
        this.rwTargetBusy = false;
        const p = this.rwPendingTarget;
        this.rwPendingTarget = null;
        if (p != null && this.rw?.id && Math.abs(p - this.rwLastTarget) >= TARGET_MIN_STEP_MS) this.recRelayTarget(p);
      });
  }
  /** profile on/off; `off` also ends the server's target steering, so it is sent even when the profile was never entered
   *  (single-notch gesture) as long as the gesture steered (`force`) */
  private recRelayScrub(on: boolean, force = false): void {
    const s = this.rw;
    if (!s?.active || !s.id) return;
    if (this.rwScrub === on && !(force && !on)) return;
    this.rwScrub = on;
    this.cmdSeq++;
    if (!on) {
      const c = this.currentTs();
      this.rwSrate = 1;
      this.rwRate = this.rate;
      if (c != null) {
        this.rwPosTs = c;
        this.rwPosAt = Date.now();
      }
      if (this.label === 'scrub') this.setLabel('playing');
    }
    this.wdLastCt = -1;
    this.wdLastAt = Date.now();
    this.wdGrace = Date.now() + 5000;
    this.cad.lastNew = Date.now();
    this.api.control(`api/relay-scrub?session=${encodeURIComponent(s.id)}&on=${on ? 1 : 0}`).then((ok) => {
      if (this.rw === s && !ok) this.relayRecover();
    });
  }
  private relayRecover(): void {
    if (!this.rw?.active) return;
    const t = this.rwPosTs ?? this.rwStartMs;
    this.recoveries++;
    rlog('relay-recover', { n: this.recoveries });
    if (this.recoveries > 2) {
      this.recoveries--;
      this.recFallbackMse(t);
      return;
    } // hand-over: recFallbackMse counts once more
    this.recWebrtcStart(t);
  }
  private startRelayPoll(): void {
    if (this.relayPoll) return;
    this.cadStart();
    this.wdLastCt = -1;
    this.wdLastAt = Date.now();
    this.wdDead = 0;
    this.wdGrace = Date.now() + 8000;
    this.relayPoll = window.setInterval(() => {
      const s = this.rw;
      const v = this.v;
      if (!s?.active || !s.id) return;
      const q = this.presentedFrames();
      if (v.paused && !this.recPaused && !document.hidden) {
        if (!this.wdResumeLogged) {
          this.wdResumeLogged = true;
          rlog('auto-resume', { rs: v.readyState });
        }
        this.safePlay();
      } else if (!v.paused) this.wdResumeLogged = false;
      if (!v.paused && !document.hidden && this.rwBase != null) {
        if (q !== this.wdLastCt) {
          this.wdLastCt = q;
          this.wdLastAt = Date.now();
          this.recoveries = 0;
          if (!this.posterUntilSeek) this.freezeLift();
          if (this.label === 'loading' && !this.swapPending) this.setLabel('playing');
        } else if (this.rwScrub) this.wdLastAt = Date.now();
        else if (Date.now() - this.wdLastAt > 4000 && Date.now() > this.wdGrace) {
          this.wdLastAt = Date.now();
          const o: any = {
            ct: Math.round(v.currentTime * 10) / 10,
            paused: v.paused,
            muted: v.muted,
            rs: v.readyState,
            pf: q,
            w: v.videoWidth,
          };
          try {
            s.pc
              ?.getStats()
              .then((st) => {
                st.forEach((r: any) => {
                  if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'video') {
                    o.recv = r.framesReceived;
                    o.dec = r.framesDecoded;
                    o.drop = r.framesDropped;
                    o.pli = r.pliCount;
                  }
                });
                rlog('stall-snap', o);
              })
              .catch(() => {
                /* ignore */
              });
          } catch {
            /* ignore */
          }
          this.relayRecover();
          return;
        }
      } else {
        this.wdLastCt = q;
        this.wdLastAt = Date.now();
      }
      if (this.rwPosBusy) return; // one poll at a time: hanging polls would fill the browser's connection pool (HTTP/1.1: 6 per host)
      const seq = this.cmdSeq;
      this.rwPosBusy = true;
      fetch(this.api.url(`api/relay-pos?session=${encodeURIComponent(s.id)}`), {
        cache: 'no-store',
        signal: timeoutSignal(3000),
      })
        .then((r) => r.json())
        .then((d: any) => {
          if (this.rw !== s || seq !== this.cmdSeq) return; // other session, or answered across a seek/rate change → stale
          if (d && d.t > 0 && Date.now() - this.seekAt < 2500 && Math.abs(d.t - this.seekTarget) > 5000) return; // pre-swap position
          if (d && d.t > 0) {
            this.wdDead = 0;
            this.rwPosTs = d.t;
            this.rwPosAt = Date.now();
            if ((this.rwScrub || this.scrubMoves > 0) && typeof d.r === 'number' && isFinite(d.r) && d.r)
              this.rwRate = d.r;
            this.emit();
          } else if (d && d.t <= 0) {
            if (++this.wdDead >= 3) {
              this.wdDead = 0;
              this.relayRecover();
            }
          }
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => {
          this.rwPosBusy = false;
        });
    }, 600);
  }
  private stopRelayPoll(): void {
    this.cadStop();
    if (this.relayPoll) {
      clearInterval(this.relayPoll);
      this.relayPoll = undefined;
    }
    this.rwPosBusy = false;
  }
  private cadStart(): void {
    this.cadStop();
    const C = this.cad;
    C.last = -1;
    C.frames0 = -1;
    C.stalls = 0;
    C.maxStall = 0;
    C.gapMax = 0;
    C.t0 = Date.now();
    C.t = window.setInterval(() => {
      if (!this.rw?.active || document.hidden) return;
      const q = this.presentedFrames(),
        now = Date.now();
      if (this.rwScrub) {
        C.last = q;
        C.lastNew = now;
        return;
      }
      if (C.frames0 < 0) {
        C.frames0 = q;
        C.last = q;
        C.lastNew = now;
        return;
      }
      if (q === C.frames0 && C.last === C.frames0) {
        C.lastNew = now;
        return;
      } // connect phase: no frame yet, not a stall
      if (q > C.last) {
        const gap = now - C.lastNew;
        if (gap > C.gapMax) C.gapMax = gap;
        if (gap >= 400) {
          C.stalls++;
          if (gap > C.maxStall) C.maxStall = gap;
        }
        C.last = q;
        C.lastNew = now;
      }
      if (now - C.t0 >= 30000) {
        const rep: any = {
          sec: Math.round((now - C.t0) / 1000),
          frames: C.last - C.frames0,
          stalls: C.stalls,
          maxStall: C.maxStall,
          gapMax: C.gapMax,
          w: this.v.videoWidth,
        };
        C.t0 = now;
        C.frames0 = C.last;
        C.stalls = 0;
        C.maxStall = 0;
        C.gapMax = 0;
        const pc = this.rw?.pc;
        if (pc)
          pc.getStats()
            .then((st) => {
              st.forEach((r: any) => {
                if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'video') {
                  rep.lost = r.packetsLost;
                  rep.jit = Math.round((r.jitter || 0) * 1000);
                  rep.recv = r.framesReceived;
                  rep.dec = r.framesDecoded;
                  rep.drop = r.framesDropped;
                }
              });
              rlog('cadence', rep);
            })
            .catch(() => rlog('cadence', rep));
        else rlog('cadence', rep);
      }
    }, 100);
  }
  private cadStop(): void {
    if (this.cad.t) {
      clearInterval(this.cad.t);
      this.cad.t = 0;
    }
  }

  // ---- playAt: relay first, MSE/native fallback ------------------------------------------------
  playAt(ts: number, opts: { scrub?: boolean; srate?: number; noChase?: boolean } = {}): void {
    if (this.destroyed) return;
    const idx0 = this.clipIndexFor(ts);
    if (this.recWebrtcOk()) {
      this.chaseAbort();
      if (idx0 < 0) {
        this.setLabel('noRecording');
        return;
      }
      this.recPaused = false;
      const t0 = Math.max(ts, this.clips[idx0]!.startTime);
      const jump = !opts.scrub; // a user jump (event, ±15 s, keys, date) — scrub landings are steered, not jumped
      if (this.rw?.active && this.rw.id) {
        if (jump) this.freezeCurrent();
        this.recRelaySeek(t0, this.rate || 1, opts.srate || 1, jump);
      } else if (this.rw?.active && !this.live)
        this.rwPending = { ts: t0, rate: this.rate || 1, srate: opts.srate || 1, mark: jump };
      else {
        if (this.live) {
          this.freezeShow(true);
          this.exitLiveState();
        }
        this.recWebrtcStart(t0);
      }
      return;
    }
    // ---- MSE fallback / native
    const canChase =
      !opts.noChase && !this.live && this.M.active && !this.recPaused && this.currentTs() != null && idx0 >= 0;
    this.chaseAbort();
    if (canChase && !opts.scrub) {
      this.startChase(ts);
      return;
    }
    if (idx0 < 0) {
      this.setLabel('noRecording');
      return;
    }
    if (this.live) {
      this.freezeShow(true);
      this.exitLiveState();
    }
    this.recPaused = false;
    const clip = this.clips[idx0]!;
    if (ts < clip.startTime) ts = clip.startTime;
    this.playIndex = idx0;
    this.v.muted = opts.scrub ? true : !this.soundOn;
    if (this.mseSupported()) {
      const t = (ts - this.M.base) / 1000;
      if (this.M.active && t >= 0 && (this.bufferedContains(t) || (t <= this.M.end + 0.5 && this.M.end - t < 95))) {
        try {
          this.v.currentTime = t;
        } catch {
          /* ignore */
        }
        if (this.v.paused) this.safePlay();
        this.feed();
      } else {
        if (opts.scrub && Date.now() - this.lastLoad < 200) {
          this.pendingTs = ts;
          return;
        }
        this.lastLoad = Date.now();
        this.mseStart(idx0, (ts - clip.startTime) / 1000);
      }
    } else {
      const off = Math.min(Math.max((ts - clip.startTime) / 1000, 0), (clip.duration || 0) / 1000);
      if (clip.id === this.curClipId && this.v.src) {
        try {
          this.v.currentTime = off;
        } catch {
          /* ignore */
        }
        if (this.v.paused) this.safePlay();
      } else {
        if (opts.scrub && Date.now() - this.lastLoad < 120) {
          this.pendingTs = ts;
          return;
        }
        this.freezeShow();
        this.lastLoad = Date.now();
        this.curClipId = clip.id;
        this.transport = 'native';
        rlog('native-fallback', { clip: clip.id });
        this.v.src = this.api.url(`api/segment?id=${encodeURIComponent(clip.videoId || clip.id)}`);
        this.v.load();
        this.v.onloadedmetadata = () => {
          this.v.playbackRate = this.rate;
          try {
            this.v.currentTime = off;
          } catch {
            /* ignore */
          }
          this.safePlay();
        };
      }
    }
    this.setLabel(opts.scrub ? 'scrub' : 'playing');
  }

  // ---- MSE recorded ------------------------------------------------------------------------
  private mseSupported(): boolean {
    try {
      return !!(
        this.api.corsMedia &&
        MSCls &&
        this.codecs &&
        MSCls.isTypeSupported(`video/mp4; codecs="${this.codecs}"`)
      );
    } catch {
      return false;
    }
  }
  private mseTeardown(): void {
    const M = this.M;
    M.active = false;
    M.nextIdx = -1;
    M.feeding = false;
    M.end = 0;
    M.pendingSeek = null;
    M.q = [];
    M.segFirst = false;
    try {
      M.abort?.abort();
    } catch {
      /* ignore */
    }
    M.abort = null;
    if (M.sb && M.ms && M.ms.readyState === 'open') {
      try {
        M.sb.abort();
      } catch {
        /* ignore */
      }
    }
    M.sb = null;
    M.ms = null;
  }
  private bufferedContains(t: number): boolean {
    try {
      const b = this.v.buffered;
      for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.3 && t <= b.end(i) + 0.3) return true;
    } catch {
      /* ignore */
    }
    return false;
  }
  private mseStart(idx: number, offSec: number): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.freezeShow();
    this.mseTeardown();
    const M = this.M;
    const ms = new MSCls!();
    M.ms = ms;
    M.active = true;
    M.base = this.clips[idx]!.startTime;
    M.nextIdx = idx;
    M.end = 0;
    M.mmsGo = true;
    this.transport = 'mse';
    if ((window as any).ManagedMediaSource && ms instanceof (window as any).ManagedMediaSource) {
      try {
        (this.v as any).disableRemotePlayback = true;
      } catch {
        /* ignore */
      }
      ms.addEventListener('startstreaming', () => {
        M.mmsGo = true;
        this.feed();
      });
      ms.addEventListener('endstreaming', () => {
        M.mmsGo = false;
      });
    }
    M.pendingSeek = offSec;
    const u = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', () => {
      URL.revokeObjectURL(u);
      if (M.ms !== ms) return;
      let sb: SourceBuffer;
      try {
        sb = ms.addSourceBuffer(`video/mp4; codecs="${this.codecs}"`);
      } catch {
        this.codecs = null;
        M.active = false;
        return;
      }
      sb.mode = 'segments';
      sb.addEventListener('updateend', () => {
        if (M.pendingSeek != null && this.v.readyState >= 1) {
          const t0 = M.pendingSeek;
          M.pendingSeek = null;
          try {
            this.v.currentTime = t0;
          } catch {
            /* ignore */
          }
        }
        this.drain();
        if (!M.feeding && !M.q.length) this.feed();
      });
      sb.addEventListener('error', () => {
        M.active = false;
      });
      M.sb = sb;
      try {
        this.v.currentTime = offSec;
      } catch {
        /* ignore */
      }
      this.feed();
    });
    try {
      this.v.srcObject = null;
    } catch {
      /* ignore */
    }
    this.v.src = u;
    this.v.playbackRate = this.rate;
    this.safePlay();
  }
  private drain(): void {
    const M = this.M;
    if (!M.active || !M.sb || M.sb.updating || !M.q.length) return;
    if (M.segFirst) {
      M.segFirst = false;
      try {
        M.sb.timestampOffset = M.segOff;
      } catch {
        try {
          M.sb.abort();
          M.sb.timestampOffset = M.segOff;
        } catch {
          M.active = false;
          return;
        }
      }
    }
    const buf = M.q.shift()!;
    try {
      M.sb.appendBuffer(buf as BufferSource);
    } catch {
      try {
        M.sb.abort();
        M.sb.appendBuffer(buf as BufferSource);
      } catch {
        M.active = false;
      }
    }
  }
  private feed(): void {
    const M = this.M;
    if (!M.active || M.feeding) return;
    if (M.mmsGo === false) return;
    if (M.nextIdx < 0 || M.nextIdx >= this.clips.length) return;
    if (M.end - this.v.currentTime > 90) return;
    try {
      const b = this.v.buffered;
      if (b.length && this.v.currentTime - b.start(0) > 240 && M.sb && !M.sb.updating && !M.q.length) {
        M.sb.remove(0, this.v.currentTime - 120);
        return;
      }
    } catch {
      /* ignore */
    }
    const clip = this.clips[M.nextIdx]!,
      ms = M.ms;
    M.feeding = true;
    M.segFirst = true;
    M.segOff = (clip.startTime - M.base) / 1000;
    M.abort = new AbortController();
    fetch(this.api.url(`api/segment?id=${encodeURIComponent(clip.videoId || clip.id)}`), {
      credentials: 'same-origin',
      signal: M.abort.signal,
    })
      .then((r) => {
        if (!r.ok || !r.body) throw new Error(String(r.status));
        const rd = r.body.getReader();
        const loop = () => {
          rd.read()
            .then((x) => {
              if (M.ms !== ms || !M.active) return;
              if (x.done) {
                M.feeding = false;
                M.nextIdx++;
                M.end = M.segOff + (clip.duration || 60000) / 1000;
                if (!M.q.length) this.feed();
                return;
              }
              M.q.push(x.value);
              this.drain();
              loop();
            })
            .catch(() => {
              if (M.ms === ms) M.feeding = false;
            });
        };
        loop();
      })
      .catch(() => {
        if (M.ms !== ms) return;
        M.feeding = false;
        M.nextIdx++;
        this.feed();
      });
  }
  private handleStall(): void {
    if (this.live || !this.M.active || this.v.paused) return;
    const t = this.v.currentTime;
    try {
      const b = this.v.buffered;
      for (let i = 0; i < b.length; i++)
        if (b.start(i) > t && b.start(i) - t < 60) {
          this.v.currentTime = b.start(i) + 0.05;
          return;
        }
    } catch {
      /* ignore */
    }
    if (this.M.nextIdx >= this.clips.length)
      this.opts
        .onClipsRefresh()
        .then((c) => {
          const cur = this.clips[this.M.nextIdx - 1];
          this.clips = c;
          if (cur) {
            const i = c.findIndex((x) => x.id === cur.id);
            if (i >= 0) this.M.nextIdx = i + 1;
          }
          this.feed();
        })
        .catch(() => {
          /* ignore */
        });
    else this.feed();
  }
  // trick-play chase inside the MSE buffer
  private chaseAbort(): void {
    if (!this.CH.active) return;
    this.CH.active = false;
    if (this.CH.timer) {
      clearInterval(this.CH.timer);
      this.CH.timer = 0;
    }
    this.v.playbackRate = this.rate;
    this.v.muted = !this.soundOn;
  }
  private endChase(): void {
    const tgt = this.CH.target;
    this.chaseAbort();
    try {
      this.v.currentTime = (tgt - this.M.base) / 1000;
    } catch {
      /* ignore */
    }
    this.setLabel('playing');
    if (this.v.paused) this.safePlay();
  }
  private startChase(target: number): void {
    this.chaseAbort();
    this.freezeHide();
    this.CH.active = true;
    this.CH.target = target;
    try {
      this.v.pause();
    } catch {
      /* ignore */
    }
    this.v.muted = true;
    this.setLabel('scrub');
    this.CH.timer = window.setInterval(() => {
      if (!this.CH.active) return;
      const c = this.currentTs();
      if (c == null) {
        this.endChase();
        return;
      }
      const rem = this.CH.target - c;
      if (Math.abs(rem) <= 250) {
        this.endChase();
        return;
      }
      let step = rem * 0.2;
      if (Math.abs(step) < 180) step = rem > 0 ? 180 : -180;
      const nt = c + step,
        tt = (nt - this.M.base) / 1000;
      if (this.M.active && this.bufferedContains(tt)) {
        try {
          this.v.currentTime = tt;
        } catch {
          /* ignore */
        }
        this.feed();
      } else {
        this.endChase();
        this.playAt(this.CH.target, { noChase: true });
      }
    }, 50);
  }

  // ---- controls -----------------------------------------------------------------------------
  togglePlayPause(): void {
    if (this.live) return;
    if (this.CH.active) {
      this.chaseAbort();
      try {
        this.v.pause();
      } catch {
        /* ignore */
      }
      this.emit();
      return;
    }
    if (this.recPaused) {
      this.recPaused = false;
      const t = this.recPausedTs ?? this.currentTs() ?? Date.now() - 1000;
      this.playAt(t, {});
      return;
    }
    if (this.rw?.active) {
      this.recPausedTs = this.currentTs();
      this.freezeShow();
      this.recWebrtcTeardown();
      if (this.freezeT) {
        clearTimeout(this.freezeT);
        this.freezeT = 0;
      }
      this.freezeTok = null;
      /* the pause still stays until play */ try {
        this.v.pause();
      } catch {
        /* ignore */
      }
      this.recPaused = true;
      this.transport = 'none';
      this.setLabel('paused');
      return;
    }
    if (this.v.paused) this.safePlay();
    else this.v.pause();
  }
  skip(ms: number): void {
    const ts = this.live ? Date.now() + ms : (this.currentTs() ?? Date.now()) + ms;
    if (this.live && ms > 0) return;
    this.playAt(ts, {});
  }
  cycleSpeed(): number {
    if (this.live) return this.rate;
    const rates = [1, 2, 4, 8];
    this.rate = rates[(rates.indexOf(this.rate) + 1) % rates.length] ?? 1;
    if (this.rw?.active && this.rw.id) {
      this.recRelaySpeed(this.rate);
      this.v.muted = !this.soundOn || this.rate !== 1;
    } else this.v.playbackRate = this.rate;
    this.emit();
    return this.rate;
  }
  setSound(on: boolean): void {
    this.soundOn = on;
    this.v.muted = !on || (!!this.rw?.active && this.rate !== 1);
    if (on && this.v.paused && !this.recPaused) this.safePlay();
    this.emit();
  }
  snapshot(): void {
    try {
      const src: any = this.live && !this.img.classList.contains('hidden') ? this.img : this.v;
      const w = src.videoWidth || src.naturalWidth || 1280,
        h = src.videoHeight || src.naturalHeight || 720;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d')!.drawImage(src, 0, 0, w, h);
      cv.toBlob(
        (b) => {
          if (!b) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          const ts = this.currentTs() ?? Date.now();
          const d = new Date(ts);
          a.download = `${(this.camName || 'snapshot').replace(/[^\w.-]+/g, '_')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.jpg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        },
        'image/jpeg',
        0.92,
      );
    } catch {
      /* ignore */
    }
  }
  private capLog(tag: string, extra?: object): void {
    try {
      const v: any = this.v,
        st: any = this.stage;
      rlog(tag, {
        fsReq: !!st.requestFullscreen,
        wkFs: !!st.webkitRequestFullscreen,
        vEnter: !!v.webkitEnterFullscreen,
        pipReq: !!v.requestPictureInPicture,
        wkPip: !!(v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')),
        rs: v.readyState,
        vw: v.videoWidth,
        ...(extra || {}),
      });
    } catch {
      /* ignore */
    }
  }
  pip(): void {
    const v: any = this.v;
    this.capLog('pip-btn');
    try {
      if (document.pictureInPictureElement || v.webkitPresentationMode === 'picture-in-picture') {
        if (document.pictureInPictureElement)
          document.exitPictureInPicture().catch(() => {
            /* ignore */
          });
        else v.webkitSetPresentationMode('inline');
        return;
      }
      if (this.v.classList.contains('hidden')) return;
      const wk = () => {
        try {
          if (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture'))
            v.webkitSetPresentationMode('picture-in-picture');
          else this.capLog('pip-unsupported');
        } catch (e: any) {
          this.capLog('pip-fail', { e: String(e?.name || e) });
        }
      };
      if (v.requestPictureInPicture)
        v.requestPictureInPicture().catch((e: any) => {
          this.capLog('pip-fail', { e: String(e?.name || e) });
          wk();
        });
      else wk();
    } catch (e: any) {
      this.capLog('pip-fail', { e: String(e?.name || e) });
    }
  }
  fullscreen(): void {
    const st: any = this.stage,
      v: any = this.v,
      d: any = document;
    this.capLog('fs-btn');
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        return;
      }
      if (st.requestFullscreen)
        st.requestFullscreen().catch((e: any) => this.capLog('fs-fail', { e: String(e?.name || e) }));
      else if (st.webkitRequestFullscreen) st.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen && !this.v.classList.contains('hidden')) v.webkitEnterFullscreen();
      else this.capLog('fs-unsupported');
    } catch (e: any) {
      this.capLog('fs-fail', { e: String(e?.name || e) });
    }
  }

  // ---- scrub (timeline gesture) ------------------------------------------------------------
  /** first gesture: scrub profile on (relay); MSE: freeze + pause */
  scrubBegin(): void {
    this.chaseAbort();
    if (this.scrubOffT) {
      clearTimeout(this.scrubOffT);
      this.scrubOffT = 0;
    } // gesture continues → stay in the scrub profile
    this.scrubMoves = 0;
    if (!this.rw?.active) {
      this.freezeShow();
      if (!this.live) {
        try {
          this.v.pause();
        } catch {
          /* ignore */
        }
      }
    }
    // the scrub profile is entered by scrubMove on the first real movement (a single wheel notch = one in-place seek, no restarts)
  }
  /** true between the end of a gesture and the profile switch back (SCRUB_OFF_DELAY_MS): the timeline must not auto-follow
   *  the playhead in that window — the servo is still converging on the centre the user left */
  scrubSettling(): boolean {
    return this.scrubOffT !== 0;
  }
  /** scroll position while the gesture runs: the centre becomes the server's steering target (velocity unused since 0.7.0) */
  scrubMove(centerTs: number, _vel: number, _smoothTs: number): void {
    if (!this.rw?.active) {
      this.freezeHold();
      return;
    }
    if (!this.rw.id) return;
    // the 640 all-intra profile (two transcoder restarts per gesture) only for real scrubbing: a second movement of the
    // gesture or a big jump — a single wheel notch is steered in the normal profile
    const c = this.currentTs();
    if (++this.scrubMoves >= 2 || (c != null && Math.abs(centerTs - c) > 60000)) this.recRelayScrub(true);
    this.recRelayTarget(this.clampRange(centerTs));
  }
  /** release / hard landing: near now → live; relay in scrub → just the final target (no seek: the servo stops there);
   *  MSE / no session → preview seek */
  scrubSeek(ts: number, srate = 1): void {
    if (this.nearNow(ts)) {
      this.goLive();
      return;
    }
    if (this.rw?.active && this.rw.id && this.scrubMoves > 0) {
      this.recRelayTarget(this.clampRange(ts));
      return;
    }
    this.playAt(this.clampRange(ts), { scrub: true, srate });
  }
  /** brief hold mid-gesture: nothing to do on the relay (the target already stands), MSE: preview seek */
  scrubHold(ts: number): void {
    if (!this.rw?.active) this.scrubSeek(ts);
    else if (this.rw.id) this.recRelayTarget(this.clampRange(ts));
  }
  /** gesture settled → final target, then back to the normal profile after SCRUB_OFF_DELAY_MS of quiet (a new gesture cancels it) */
  scrubIdle(ts?: number): void {
    if (ts != null && this.rw?.active && this.rw.id && this.scrubMoves > 0) this.recRelayTarget(this.clampRange(ts));
    if (this.scrubOffT) clearTimeout(this.scrubOffT);
    this.scrubOffT = window.setTimeout(() => {
      this.scrubOffT = 0;
      const steered = this.scrubMoves > 0;
      this.scrubMoves = 0;
      this.recRelayScrub(false, steered);
    }, SCRUB_OFF_DELAY_MS);
  }

  // ---- visibility ---------------------------------------------------------------------------
  private hiddenTs: number | null = null;
  private onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      // don't pin a camera stream in the background; live is simply restarted on return
      if (this.live) {
        this.hiddenTs = null;
        this.webrtcTeardown();
        this.liveTeardown();
        if (this.transport === 'mjpeg') this.img.removeAttribute('src');
      }
      // the still stays while hidden (like pause): a hold-until-next-frame would be lifted by the last frame the torn-down
      // stream still presents, and the return would then copy a black picture from the dead element
      else if (this.rw?.active) {
        this.hiddenTs = this.currentTs();
        this.freezeShow();
        this.recWebrtcTeardown();
        if (this.freezeT) {
          clearTimeout(this.freezeT);
          this.freezeT = 0;
        }
        this.freezeTok = null;
      }
    } else {
      if (this.live)
        this.goLive(); // also covers goLive() issued while hidden (background tab)
      else if (this.hiddenTs != null && !this.recPaused) {
        const t = this.hiddenTs;
        this.hiddenTs = null;
        this.playAt(t, {});
      }
    }
  }
}
