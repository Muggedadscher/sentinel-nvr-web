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
import type { SentinelClip as Clip, SentinelClient } from '../api';
import { rlog, setRlogClient } from './rlog';
import { WebRtcSession, mobileClient } from './webrtc';

/** `label` is an i18n key suffix: nvr.player.<label> */
export type PlayerLabel = 'live' | 'liveWebrtc' | 'liveMse' | 'liveMjpeg' | 'loading' | 'playing' | 'paused' | 'scrub' | 'noRecording' | '';
export interface PlayerState {
  live: boolean; label: PlayerLabel; playhead: number | null; rate: number; sound: boolean; paused: boolean;
  transport: 'webrtc' | 'mse' | 'mjpeg' | 'relay' | 'native' | 'none'; muted: boolean;
}
export interface PlayerRefs { video: HTMLVideoElement; freeze: HTMLCanvasElement; img: HTMLImageElement; stage: HTMLElement; }
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
/** Seek → picture. Measured in the lab (scripts/seek-swap-test.js + RTSP tap, 23.09.2026, 14 seeks): the relay answers a seek
 *  after ~10 ms, the NEW position leaves mediamtx ~1.08 s later and reaches the screen after 2.2–2.6 s (sink ffmpeg + 500 ms
 *  jitter buffer + render). Until then the OLD position keeps playing — a poster (event frame / frozen picture) must stay up that
 *  long, else old frames flash through ("springt hin und her"). A profile switch does NOT reset this latency (measured). */
const SWAP_MS = 2600;
/** Scrub profile (640 all-intra) → normal (1280) only after the gesture has been quiet this long: a scroll–pause–scroll pattern
 *  restarted the transcoder twice per pause (server log: profile switch every 1–2 s, 30 restarts in one session). */
const SCRUB_OFF_DELAY_MS = 1500;

export class PlayerController {
  private v!: HTMLVideoElement; private fz!: HTMLCanvasElement; private img!: HTMLImageElement; private stage!: HTMLElement;
  private api: SentinelClient; private opts: Opts;
  camId = ''; camName = ''; clips: Clip[] = []; codecs: string | null = null; rangeStart = 0; rangeEnd = 0;
  live = false; rate = 1; soundOn = false; recPaused = false; recPausedTs: number | null = null;
  recWebrtcDisabled = false; label: PlayerLabel = ''; transport: PlayerState['transport'] = 'none';
  // relay session (RW)
  private rw: WebRtcSession | undefined; private rwStartMs = 0; private rwBase: number | null = null; private rwPosTs: number | null = null; private rwPosAt = 0;
  private rwRate = 1; private rwSrate = 1; private rwScrub = false; private rwSeekBusy = false; private rwPending: { ts: number; rate: number; srate: number } | null = null;
  private rwLastSeekTs: number | null = null; private rwLastSeekAt = 0; private rwRateBusy = false; private rwPendingRate: number | null = null; private rwLastRateAt = 0;
  private relayPoll: number | undefined; private wdLastCt = -1; private wdLastAt = 0; private wdDead = 0; private wdGrace = 0; private wdResumeLogged = false; private recoveries = 0;
  private posterUntilSeek = false; private seekTarget = 0;
  // seek → visible swap (see SWAP_MS); posterFor = event the pending poster belongs to; scrubOffT = delayed profile switch
  private swapPending = false; private swapFrames = -1; private swapT = 0; private posterFor = 0; private scrubOffT = 0;
  // relay-pos answers are only valid for the command generation they were asked under; a poll sent BEFORE a
  // seek/rate change and answered after it would drag the playhead back to the old position (and the
  // auto-follow timeline with it → visible back-and-forth). seekAt: the server may still report the pre-swap
  // position for a moment after a seek — ignore far-off values in that window.
  private cmdSeq = 0; private seekAt = 0;
  // live session (W) + live MSE (L)
  private w: WebRtcSession | undefined; private L = { active: false, ms: null as MediaSource | null, sb: null as SourceBuffer | null, abort: null as AbortController | null, queue: [] as Uint8Array[], restarts: 0, lastTrim: 0, stallT: 0 };
  // recorded MSE (M)
  private M = { ms: null as MediaSource | null, sb: null as SourceBuffer | null, base: 0, nextIdx: -1, end: 0, active: false, feeding: false, abort: null as AbortController | null, q: [] as Uint8Array[], segFirst: false, segOff: 0, pendingSeek: null as number | null, mmsGo: true };
  private CH = { active: false, target: 0, timer: 0 };
  private curClipId: string | null = null; private playIndex = -1; private lastLoad = 0; private pendingTs: number | null = null; private pendingT: number | undefined;
  // frame counter / freeze
  private fc = { n: 0, tok: {} as object }; private freezeT = 0; private freezeTok: object | null = null;
  private cad = { t: 0, last: -1, lastNew: 0, stalls: 0, maxStall: 0, frames0: -1, t0: 0, gapMax: 0 };
  private stallTimer = 0; private destroyed = false; private liveRestartT = 0;
  private unlisten: (() => void)[] = [];

  private arPrefix: string;
  constructor(api: SentinelClient, opts: Opts) { this.api = api; this.opts = opts; this.arPrefix = opts.storagePrefix ?? 'snvr-ar-'; setRlogClient(api, opts.brand); }

  attach(r: PlayerRefs): void {
    this.v = r.video; this.fz = r.freeze; this.img = r.img; this.stage = r.stage;
    const v = this.v;
    const on = (n: string, f: () => void) => { v.addEventListener(n, f); this.unlisten.push(() => v.removeEventListener(n, f)); };
    on('timeupdate', () => { if (this.live) return; if (this.rw?.active && this.rwBase == null && v.currentTime > 0) this.rwBase = v.currentTime; const ts = this.currentTs(); if (ts == null) return; if (this.M.active || this.rw?.active) { const i = this.clipIndexFor(ts); if (i >= 0) this.playIndex = i; } this.feed(); this.emit(); });
    on('waiting', () => { if (this.live) { if (this.L.active && !this.L.stallT) this.L.stallT = window.setTimeout(() => { this.L.stallT = 0; if (this.live && this.L.active && v.readyState < 3) this.liveRestart(); }, 4000); return; } if (!this.rw?.active) this.setLabel('loading'); if (!this.M.active || this.stallTimer) return; this.stallTimer = window.setTimeout(() => { this.stallTimer = 0; this.handleStall(); }, 600); });
    on('seeking', () => { if (!this.live && !this.rw?.active) this.setLabel('loading'); });
    for (const n of ['loadeddata', 'playing', 'canplay', 'seeked']) on(n, () => { if (v.videoWidth) this.freezeHide(); if (!this.live && this.label === 'loading') this.setLabel('playing'); if (this.L.stallT) { clearTimeout(this.L.stallT); this.L.stallT = 0; } this.emit(); });
    on('pause', () => { if (this.L.stallT) { clearTimeout(this.L.stallT); this.L.stallT = 0; } this.emit(); });
    on('play', () => this.emit());
    // the stage box follows the picture's real aspect where the layout uses it (mobile: no letterbox bars for 4:3 cameras)
    on('loadedmetadata', () => this.setAspect(this.v.videoWidth, this.v.videoHeight));
    on('resize', () => this.setAspect(this.v.videoWidth, this.v.videoHeight));
    on('volumechange', () => this.emit());
    on('error', () => { const e = v.error; rlog('video-error', { code: e?.code, msg: e?.message?.slice(0, 120), src: v.getAttribute('src') ? 'src' : 'srcObject' }); });
    on('ended', () => { if (this.live || this.M.active || this.rw?.active) return; const n = this.playIndex + 1; if (n < this.clips.length) { const c = this.clips[n]!; this.curClipId = c.id; this.playIndex = n; v.src = this.api.url(`api/segment?id=${encodeURIComponent(c.videoId || c.id)}`); v.load(); v.onloadedmetadata = () => { v.playbackRate = this.rate; try { v.currentTime = 0; } catch { /* ignore */ } this.safePlay(); }; this.setLabel('playing'); } });
    this.pendingT = window.setInterval(() => { if (this.pendingTs != null && Date.now() - this.lastLoad >= 200) { const t = this.pendingTs; this.pendingTs = null; this.playAt(t, { scrub: true }); } }, 120);
    const vis = () => this.onVisibility(); document.addEventListener('visibilitychange', vis); this.unlisten.push(() => document.removeEventListener('visibilitychange', vis));
    const edge = window.setInterval(() => { if (this.live && this.L.active) this.liveEdge(); }, 1000); this.unlisten.push(() => clearInterval(edge));
  }

  destroy(): void {
    this.destroyed = true;
    // no path may (re)start a stream on a destroyed controller: the 1-s live
    // restart timer, a pending async load in the host, a visibility change …
    this.live = false; this.recPaused = false;
    if (this.liveRestartT) { clearTimeout(this.liveRestartT); this.liveRestartT = 0; }
    this.recWebrtcTeardown(); this.webrtcTeardown(); this.mseTeardown(); this.liveTeardown(); this.chaseAbort();
    if (this.pendingT) clearInterval(this.pendingT);
    for (const u of this.unlisten) u();
    try { this.v.pause(); this.v.srcObject = null; this.v.removeAttribute('src'); } catch { /* ignore */ }
  }

  setCamera(camId: string, name: string): void {
    if (camId !== this.camId) { this.recWebrtcDisabled = false; this.recoveries = 0; }
    this.camId = camId; this.camName = name;
    // last known picture aspect of this camera: the stage has the right shape before any poster/video arrives
    let ar = ''; try { ar = localStorage.getItem(this.arPrefix + camId) || ''; } catch { /* ignore */ }
    if (ar) this.stage.style.setProperty('--stage-ar', ar); else this.stage.style.removeProperty('--stage-ar');
  }
  /** picture aspect → stage box (mobile layout uses it); posters and video both report it */
  private setAspect(w: number, h: number): void {
    if (!w || !h) return;
    const ar = `${w} / ${h}`;
    if (this.stage.style.getPropertyValue('--stage-ar') === ar) return;
    this.stage.style.setProperty('--stage-ar', ar);
    try { localStorage.setItem(this.arPrefix + this.camId, ar); } catch { /* ignore */ }
  }
  /** clips of the loaded range (several days, sorted), codec string, and the range the timeline spans */
  setClips(clips: Clip[], codecs: string | null, rangeStart: number, rangeEnd: number): void { this.clips = clips; this.codecs = codecs; this.rangeStart = rangeStart; this.rangeEnd = rangeEnd; }

  // ---- state ---------------------------------------------------------------------
  private setLabel(l: PlayerLabel): void { this.label = l; this.emit(); }
  private emit(): void {
    if (this.destroyed) return;
    this.opts.onState({ live: this.live, label: this.label, playhead: this.live ? null : this.currentTs(), rate: this.rate, sound: this.soundOn, paused: this.recPaused || (this.v.paused && !this.live && !this.rw?.active), transport: this.transport, muted: this.v.muted });
  }
  clipIndexFor(ts: number): number { for (let i = 0; i < this.clips.length; i++) { const c = this.clips[i]!; if (ts >= c.startTime && ts < c.startTime + (c.duration || 60000)) return i; } return -1; }
  private nearNow(ts: number): boolean { return Date.now() - ts < 8000; }
  private clampRange(ts: number): number { return Math.min(Math.max(ts, this.rangeStart), Math.min(this.rangeEnd - 1, Date.now())); }

  /** Wall-clock position of the picture on screen (Scrypted's getRecordingStreamCurrentTime). */
  currentTs(): number | null {
    if (this.rw?.active) {
      if (this.rwPosTs != null) return this.rwPosTs + (Date.now() - this.rwPosAt) * (this.rwRate || 1);
      if (this.rwBase != null && this.v.currentTime > 0) return this.rwStartMs + (this.v.currentTime - this.rwBase) * 1000 * (this.rwRate || 1);
      return this.rwStartMs;
    }
    if (this.recPaused) return this.recPausedTs;
    if (this.live) return null;
    if (this.M.active) return this.M.base + this.v.currentTime * 1000;
    const pc = this.playIndex >= 0 ? this.clips[this.playIndex] : undefined; if (pc) return pc.startTime + this.v.currentTime * 1000;
    return null;
  }

  // ---- presented frames / freeze / poster -----------------------------------------
  private fcArm(): void { const v: any = this.v; if (!v.requestVideoFrameCallback) return; const tok = {}; this.fc.tok = tok; const tick = () => { if (this.fc.tok !== tok) return; this.fc.n++; try { v.requestVideoFrameCallback(tick); } catch { /* ignore */ } }; try { v.requestVideoFrameCallback(tick); } catch { /* ignore */ } }
  presentedFrames(): number { if ((this.v as any).requestVideoFrameCallback) return this.fc.n; try { return this.v.getVideoPlaybackQuality().totalVideoFrames; } catch { return -1; } }
  private freezeArm(hold: boolean): void {
    if (this.freezeT) clearTimeout(this.freezeT);
    this.freezeT = window.setTimeout(() => this.freezeHide(), hold ? 90000 : 5000);
    const v: any = this.v;
    if (hold && v.requestVideoFrameCallback) { const tok = {}; this.freezeTok = tok; try { v.requestVideoFrameCallback(() => { if (this.freezeTok === tok && this.v.videoWidth) this.freezeHide(); }); } catch { /* ignore */ } }
  }
  /** copy the current video picture onto the freeze canvas (false = nothing to copy yet) */
  private drawVideo(): boolean {
    const v = this.v, fc = this.fz;
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return false;
    if (fc.width !== v.videoWidth) fc.width = v.videoWidth;
    if (fc.height !== v.videoHeight) fc.height = v.videoHeight;
    fc.getContext('2d')!.drawImage(v, 0, 0, fc.width, fc.height);
    fc.classList.remove('hidden'); fc.dataset.src = 'video';
    return true;
  }
  freezeShow(hold = false): void {
    try { if (this.drawVideo()) this.freezeArm(hold); } catch { /* ignore */ }
  }
  /** poster/freeze stays until the seek's picture is visible (swapVisible), 6 s safety net */
  private holdUntilSwap(): void {
    if (this.freezeT) clearTimeout(this.freezeT); this.freezeTok = null;
    this.posterUntilSeek = true; this.freezeT = window.setTimeout(() => this.swapVisible(), 6000);
  }
  /** Event click inside a running relay session: the current picture stands still at once (the old position must not keep
   *  playing while the event frame loads); the event frame replaces it, the picture at the target lifts it. */
  freezeCurrent(): void {
    if (!this.rw?.active || !this.rw.id) return; // no session yet: playAt's own freeze/poster path applies
    try { if (this.drawVideo()) this.holdUntilSwap(); } catch { /* ignore */ }
  }
  /** the picture of the last seek is on screen: lift a held poster, report playing */
  private swapVisible(): void {
    if (this.swapT) { clearTimeout(this.swapT); this.swapT = 0; }
    this.swapPending = false;
    if (this.posterUntilSeek) this.freezeHide();
    if (this.label === 'loading' && this.rw?.active) this.setLabel('playing');
  }
  /** seek answered: the new picture is on screen SWAP_MS later (plus proof of a presented frame) */
  private swapArm(): void {
    if (this.swapT) clearTimeout(this.swapT);
    this.swapFrames = this.presentedFrames();
    const check = () => { this.swapT = 0; if (!this.swapPending || !this.rw?.active) return; if (this.presentedFrames() > this.swapFrames) this.swapVisible(); else this.swapT = window.setTimeout(check, 100); };
    this.swapT = window.setTimeout(check, SWAP_MS);
  }
  freezeFromImage(img: HTMLImageElement, hold: boolean, untilSeek = false, kind = 'image'): boolean {
    try {
      if (!img.naturalWidth || !img.naturalHeight) return false;
      const fc = this.fz; fc.width = img.naturalWidth; fc.height = img.naturalHeight; fc.getContext('2d')!.drawImage(img, 0, 0); fc.classList.remove('hidden'); fc.dataset.src = kind;
      this.setAspect(img.naturalWidth, img.naturalHeight);
      if (untilSeek) this.holdUntilSwap(); // stays until the seek's picture is visible (see startRelayPoll)
      else this.freezeArm(hold);
      return true;
    } catch { return false; }
  }
  freezeHide(): void { if (this.freezeT) { clearTimeout(this.freezeT); this.freezeT = 0; } this.posterUntilSeek = false; this.fz.classList.add('hidden'); delete this.fz.dataset.src; }
  private posterUp(): boolean { return !this.fz.classList.contains('hidden'); }
  freezeHold(): void { if (this.freezeT) { clearTimeout(this.freezeT); this.freezeT = window.setTimeout(() => this.freezeHide(), 5000); } }
  /** Event click: the stored frame is the poster until the seek lands. */
  posterEvent(ts: number): void {
    const cam = this.camId; this.posterFor = ts; const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.camId !== cam || this.posterFor !== ts || this.destroyed) return;
      const inSession = !!this.rw?.active && !!this.rw.id;
      if (inSession && !this.swapPending) return; // arrived after the seek's picture is already on screen — don't cover it
      this.freezeFromImage(img, true, inSession, 'event');
    };
    img.src = this.api.url(`api/evframe?camera=${encodeURIComponent(cam)}&ts=${ts}`);
  }
  /** Camera opened: newest snapshot in front of the black stage until live plays. */
  posterFromSnapshot(): void { const cam = this.camId; const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { if (this.camId !== cam || this.rw?.active || this.recPaused || this.posterUp()) return; if (this.v.readyState >= 2 && this.v.videoWidth && !this.v.paused) return; this.freezeFromImage(img, true, false, 'snapshot'); }; img.src = this.api.url(`api/snapshot?camera=${encodeURIComponent(cam)}`) + `&_=${Date.now()}`; }
  private posterShow(ts: number): void { try { if (this.posterUp()) return; if (this.v.readyState >= 2 && this.v.videoWidth) return; const i = this.clipIndexFor(ts); const c = i >= 0 ? this.clips[i] : undefined; if (!c?.thumbnailId) return; const cam = this.camId; const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { if (this.camId !== cam || this.destroyed) return; if (!this.posterUp()) this.freezeFromImage(img, true, false, 'thumb'); }; img.src = this.api.url(`api/thumb?id=${encodeURIComponent(c.thumbnailId)}`); } catch { /* ignore */ } }

  private safePlay(): void {
    let pr: Promise<void>; try { pr = this.v.play(); } catch { return; }
    pr.then(() => this.emit()).catch((e1) => { this.v.muted = true; this.v.play().then(() => this.emit()).catch((e2) => rlog('play-fail', { e1: e1?.name, e2: e2?.name, rs: this.v.readyState, paused: this.v.paused })); });
  }

  // ---- LIVE ---------------------------------------------------------------------------
  goLive(): void {
    if (!this.camId || this.destroyed) return;
    this.chaseAbort();
    this.freezeShow(true);
    this.exitLiveState(); this.recWebrtcTeardown(); this.recPaused = false; this.live = true; this.playIndex = -1; this.curClipId = null; this.L.restarts = 0;
    this.setLabel('live');
    if (document.visibilityState === 'hidden') return;
    if (window.RTCPeerConnection && window.WebSocket) this.liveStartWebrtc();
    else if (this.liveMseOk()) this.liveStartMse();
    else { try { this.v.pause(); } catch { /* ignore */ } this.liveFallbackImg(); }
  }
  private exitLiveState(): void { if (this.live) { this.live = false; this.webrtcTeardown(); this.liveTeardown(); try { this.v.srcObject = null; } catch { /* ignore */ } this.setMjpeg(false); } }
  private setMjpeg(on: boolean): void { this.img.classList.toggle('hidden', !on); this.v.classList.toggle('hidden', on); if (!on) this.img.removeAttribute('src'); }
  private webrtcTeardown(): void { this.w?.stop(); this.w = undefined; }
  private liveStartWebrtc(): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.webrtcTeardown(); this.recWebrtcTeardown(); this.mseTeardown(); this.liveTeardown();
    try { this.v.pause(); } catch { /* ignore */ } try { this.v.srcObject = null; } catch { /* ignore */ } this.v.removeAttribute('src');
    this.setMjpeg(false);
    const s = new WebRtcSession(this.api, { camId: this.camId, mode: 'live' }, {
      onStream: (ms) => { if (!this.live || this.w !== s) return; this.setMjpeg(false); this.v.muted = !this.soundOn; try { this.v.removeAttribute('src'); } catch { /* ignore */ } try { this.v.srcObject = ms; } catch { /* ignore */ } this.fcArm(); this.safePlay(); this.transport = 'webrtc'; this.setLabel('liveWebrtc'); },
      onFail: () => { if (this.w === s) this.liveFallbackMse(); },
    });
    this.w = s; this.transport = 'webrtc'; s.start();
  }
  private liveFallbackMse(): void { this.webrtcTeardown(); if (!this.live) return; try { this.v.srcObject = null; } catch { /* ignore */ } if (this.liveMseOk()) this.liveStartMse(); else this.liveFallbackImg(); }
  private liveCodec(): string | null { return this.codecs ? (this.codecs.split(',')[0] ?? null) : null; }
  private liveMseOk(): boolean { try { const c = this.liveCodec(); return !!(this.api.corsMedia && MSCls && c && MSCls.isTypeSupported(`video/mp4; codecs="${c}"`)); } catch { return false; } }
  private liveTeardown(): void { const L = this.L; L.active = false; L.queue = []; if (L.stallT) { clearTimeout(L.stallT); L.stallT = 0; } try { L.abort?.abort(); } catch { /* ignore */ } L.abort = null; if (L.sb && L.ms && L.ms.readyState === 'open') { try { L.sb.abort(); } catch { /* ignore */ } } L.sb = null; L.ms = null; }
  private liveAppend(): void { const L = this.L; if (!L.active || !L.sb || L.sb.updating || !L.queue.length) return; const buf = L.queue.shift()!; try { L.sb.appendBuffer(buf as BufferSource); } catch { this.liveRestart(); } }
  private liveTrim(): void { const L = this.L; if (!L.sb || L.sb.updating) return; try { const b = this.v.buffered; if (b.length && this.v.currentTime - b.start(0) > 30) L.sb.remove(0, this.v.currentTime - 10); } catch { /* ignore */ } }
  private liveEdge(): void { try { const b = this.v.buffered; if (!b.length) return; const end = b.end(b.length - 1); if (end - this.v.currentTime > 2.5) this.v.currentTime = end - 0.7; if (this.v.paused) this.safePlay(); } catch { /* ignore */ } }
  private liveRestart(): void { if (!this.live || !this.L.active) return; this.liveTeardown(); this.L.restarts++; if (this.L.restarts > 5) { this.liveFallbackImg(); return; } if (this.liveRestartT) clearTimeout(this.liveRestartT); this.liveRestartT = window.setTimeout(() => { this.liveRestartT = 0; if (this.live && !this.destroyed) this.liveStartMse(); }, 1000); }
  private liveStartMse(): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.liveTeardown(); this.mseTeardown();
    const L = this.L; L.active = true; this.transport = 'mse'; this.setLabel('liveMse'); this.setMjpeg(false);
    const ms = new MSCls!(); L.ms = ms; L.lastTrim = Date.now();
    if ((window as any).ManagedMediaSource && ms instanceof (window as any).ManagedMediaSource) { try { (this.v as any).disableRemotePlayback = true; } catch { /* ignore */ } }
    const u = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', () => {
      URL.revokeObjectURL(u); if (L.ms !== ms) return;
      let sb: SourceBuffer; try { sb = ms.addSourceBuffer(`video/mp4; codecs="${this.liveCodec()}"`); } catch { this.liveFallbackImg(); return; }
      sb.mode = 'segments';
      sb.addEventListener('updateend', () => { if (Date.now() - L.lastTrim > 10000) { L.lastTrim = Date.now(); this.liveTrim(); } this.liveAppend(); });
      sb.addEventListener('error', () => this.liveRestart());
      L.sb = sb; L.abort = new AbortController();
      fetch(this.api.url(`api/livemse?camera=${encodeURIComponent(this.camId)}`), { credentials: 'same-origin', signal: L.abort.signal })
        .then(r => { if (!r.ok || !r.body) throw new Error(String(r.status)); const rd = r.body.getReader(); const loop = () => { rd.read().then(x => { if (!L.active || L.ms !== ms) return; if (x.done) { this.liveRestart(); return; } L.queue.push(x.value); this.liveAppend(); loop(); }).catch(() => { if (L.active && L.ms === ms) this.liveRestart(); }); }; loop(); })
        .catch(() => { if (L.active && L.ms === ms) this.liveFallbackImg(); });
    });
    try { this.v.srcObject = null; } catch { /* ignore */ }
    this.v.src = u; this.v.playbackRate = 1; this.v.muted = true; this.safePlay();
  }
  private liveFallbackImg(): void { this.liveTeardown(); if (!this.live) return; try { this.v.pause(); } catch { /* ignore */ } this.freezeHide(); this.transport = 'mjpeg'; this.setLabel('liveMjpeg'); this.setMjpeg(true); this.img.src = this.api.url(`api/live?camera=${encodeURIComponent(this.camId)}`) + `&_=${Date.now()}`; }

  // ---- RECORDED via relay -----------------------------------------------------------------
  private recWebrtcOk(): boolean { return !this.recWebrtcDisabled && !!(window.RTCPeerConnection && window.WebSocket); }
  private recWebrtcTeardown(): void { this.posterUntilSeek = false; this.swapPending = false; if (this.swapT) { clearTimeout(this.swapT); this.swapT = 0; } if (this.scrubOffT) { clearTimeout(this.scrubOffT); this.scrubOffT = 0; } this.stopRelayPoll(); this.rw?.stop(); this.rw = undefined; this.rwBase = null; this.rwPosTs = null; this.rwScrub = false; this.rwSeekBusy = false; this.rwPending = null; this.rwLastSeekTs = null; this.rwSrate = 1; this.rwRate = 1; this.rwRateBusy = false; this.rwPendingRate = null; }
  private recWebrtcStart(ts: number): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.freezeShow(true); this.posterShow(ts);
    this.live = false;
    this.recWebrtcTeardown(); this.webrtcTeardown(); this.mseTeardown(); this.liveTeardown();
    try { this.v.pause(); } catch { /* ignore */ } try { this.v.removeAttribute('src'); this.v.srcObject = null; } catch { /* ignore */ }
    this.setMjpeg(false); this.transport = 'relay';
    this.setLabel('loading');
    this.rwStartMs = ts; this.rwBase = null; this.rwRate = this.rate; this.rwSrate = 1; this.seekTarget = ts; // event poster clears when relay-pos reaches here
    const compat = mobileClient();
    if (compat) rlog('rec-compat-start', { ts: Math.round(ts) });
    const s = new WebRtcSession(this.api, { camId: this.camId, mode: 'recorded', startMs: ts, compat }, {
      onStream: (ms) => {
        if (this.rw !== s || this.live) return;
        try { s.pc?.getReceivers().forEach(r => { try { (r as any).jitterBufferTarget = 500; } catch { /* ignore */ } try { (r as any).playoutDelayHint = 0.5; } catch { /* ignore */ } }); } catch { /* ignore */ }
        this.setMjpeg(false); this.v.muted = !this.soundOn || this.rate !== 1;
        try { this.v.removeAttribute('src'); } catch { /* ignore */ } try { this.v.srcObject = ms; } catch { /* ignore */ }
        this.fcArm(); this.rwBase = null; this.safePlay(); this.setLabel('playing');
      },
      onFail: () => { if (this.rw === s) this.recFallbackMse(ts); },
      onSessionId: () => { if (this.rw === s && this.rwPending) { const p = this.rwPending; this.rwPending = null; if (Math.abs(p.ts - this.rwStartMs) > 1500) this.recRelaySeek(p.ts, p.rate, p.srate); } },
    });
    this.rw = s; s.start(); this.startRelayPoll(); this.emit();
  }
  /** Relay failed: retry the relay up to twice (transient WS/ICE hiccups), only then fall back to MSE for the rest of this camera. */
  private recFallbackMse(ts: number): void {
    this.recWebrtcTeardown();
    if (this.live || this.destroyed) return;
    this.recoveries++;
    if (this.recoveries <= 2) { rlog('relay-retry', { n: this.recoveries }); this.recWebrtcStart(ts); return; }
    rlog('rec-fallback-mse', { mseOk: this.mseSupported(), after: this.recoveries }); this.recWebrtcDisabled = true; this.playAt(ts, {});
  }
  /** Hard server-side seek, coalesced: one in flight, latest wins, 150 ms floor. */
  private recRelaySeek(ts: number, rate = 1, srate = 1): void {
    const s = this.rw; if (!s?.id) return;
    if (this.rwSeekBusy) { this.rwPending = { ts, rate, srate }; return; }
    if (this.rwLastSeekTs === ts && this.rwRate === rate && this.rwSrate === srate && Date.now() - this.rwLastSeekAt < 1000) return;
    const wait = 150 - (Date.now() - this.rwLastSeekAt);
    if (wait > 0) { this.rwSeekBusy = true; this.rwPending = { ts, rate, srate }; window.setTimeout(() => { this.rwSeekBusy = false; const p = this.rwPending; this.rwPending = null; if (p && this.rw?.id) this.recRelaySeek(p.ts, p.rate, p.srate); }, wait); return; }
    this.rwStartMs = ts; this.rwSrate = srate; this.rwRate = this.rwScrub ? srate : rate; this.rwPendingRate = null; this.rwLastSeekTs = ts; this.rwLastSeekAt = Date.now();
    this.cad.lastNew = Date.now(); this.wdLastCt = -1; this.wdLastAt = Date.now(); this.wdGrace = Date.now() + 5000;
    this.rwPosTs = ts; this.rwPosAt = Date.now();
    this.setLabel(this.rwScrub ? 'scrub' : 'loading'); // scrubbing seeks constantly — no "loading" flicker there
    this.rwSeekBusy = true;
    this.seekTarget = ts; this.seekAt = Date.now(); this.cmdSeq++;
    this.swapPending = true; if (this.swapT) { clearTimeout(this.swapT); this.swapT = 0; }
    const done = (ok: boolean) => { this.rwSeekBusy = false; if (!ok) { this.relayRecover(); return; } if (this.swapPending) this.swapArm(); const p = this.rwPending; this.rwPending = null; if (p && this.rw?.id) this.recRelaySeek(p.ts, p.rate, p.srate); };
    this.api.control(`api/relay-seek?session=${encodeURIComponent(s.id)}&start=${Math.round(ts)}&rate=${rate}&srate=${srate}`).then(ok => done(ok));
  }
  /** Scrub time-lapse rate, coalesced (120 ms floor, 15 % hysteresis). */
  private recRelayRate(r: number): void {
    const s = this.rw; if (!s?.active || !s.id || !this.rwScrub) return;
    if (this.rwRateBusy) { this.rwPendingRate = r; return; }
    if (this.rwSrate === r) return;
    if (this.rwSrate !== 1 && (r > 0) === (this.rwSrate > 0) && Math.abs(r - this.rwSrate) < 0.15 * Math.abs(this.rwSrate)) return;
    const wait = 120 - (Date.now() - this.rwLastRateAt);
    if (wait > 0) { this.rwRateBusy = true; this.rwPendingRate = r; window.setTimeout(() => { this.rwRateBusy = false; const p = this.rwPendingRate; this.rwPendingRate = null; if (p != null && this.rw?.id) this.recRelayRate(p); }, wait); return; }
    const c = this.currentTs(); this.rwSrate = r; this.rwRate = r; this.rwLastRateAt = Date.now(); this.cmdSeq++; if (c != null) { this.rwPosTs = c; this.rwPosAt = Date.now(); }
    this.wdGrace = Date.now() + 8000; this.cad.lastNew = Date.now();
    this.rwRateBusy = true;
    this.api.control(`api/relay-rate?session=${encodeURIComponent(s.id)}&rate=${r}`).then(ok => { if (!ok) this.relayRecover(); }).then(() => { this.rwRateBusy = false; const p = this.rwPendingRate; this.rwPendingRate = null; if (p != null && this.rw?.id && p !== this.rwSrate) this.recRelayRate(p); });
  }
  private recRelayScrub(on: boolean): void {
    const s = this.rw; if (!s?.active || !s.id || this.rwScrub === on) return;
    this.rwScrub = on;
    this.cmdSeq++;
    if (!on) { const c = this.currentTs(); this.rwSrate = 1; this.rwRate = this.rate; this.rwPendingRate = null; if (c != null) { this.rwPosTs = c; this.rwPosAt = Date.now(); } if (this.label === 'scrub') this.setLabel('playing'); }
    this.wdLastCt = -1; this.wdLastAt = Date.now(); this.wdGrace = Date.now() + 5000; this.cad.lastNew = Date.now();
    this.api.control(`api/relay-scrub?session=${encodeURIComponent(s.id)}&on=${on ? 1 : 0}`).then(ok => { if (!ok) this.relayRecover(); });
  }
  private relayRecover(): void {
    if (!this.rw?.active) return;
    const t = this.rwPosTs ?? this.rwStartMs;
    this.recoveries++; rlog('relay-recover', { n: this.recoveries });
    if (this.recoveries > 2) { this.recoveries--; this.recFallbackMse(t); return; } // hand-over: recFallbackMse counts once more
    this.recWebrtcStart(t);
  }
  private startRelayPoll(): void {
    if (this.relayPoll) return;
    this.cadStart(); this.wdLastCt = -1; this.wdLastAt = Date.now(); this.wdDead = 0; this.wdGrace = Date.now() + 8000;
    this.relayPoll = window.setInterval(() => {
      const s = this.rw; const v = this.v; if (!s?.active || !s.id) return;
      const q = this.presentedFrames();
      if (v.paused && !this.recPaused && !document.hidden) { if (!this.wdResumeLogged) { this.wdResumeLogged = true; rlog('auto-resume', { rs: v.readyState }); } this.safePlay(); } else if (!v.paused) this.wdResumeLogged = false;
      if (!v.paused && !document.hidden && this.rwBase != null) {
        if (q !== this.wdLastCt) { this.wdLastCt = q; this.wdLastAt = Date.now(); this.recoveries = 0; if (!this.posterUntilSeek) this.freezeHide(); if (this.label === 'loading' && !this.swapPending) this.setLabel('playing'); }
        else if (this.rwScrub) this.wdLastAt = Date.now();
        else if (Date.now() - this.wdLastAt > 4000 && Date.now() > this.wdGrace) {
          this.wdLastAt = Date.now();
          const o: any = { ct: Math.round(v.currentTime * 10) / 10, paused: v.paused, muted: v.muted, rs: v.readyState, pf: q, w: v.videoWidth };
          try { s.pc?.getStats().then(st => { st.forEach((r: any) => { if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'video') { o.recv = r.framesReceived; o.dec = r.framesDecoded; o.drop = r.framesDropped; o.pli = r.pliCount; } }); rlog('stall-snap', o); }).catch(() => { /* ignore */ }); } catch { /* ignore */ }
          this.relayRecover(); return;
        }
      } else { this.wdLastCt = q; this.wdLastAt = Date.now(); }
      const seq = this.cmdSeq;
      fetch(this.api.url(`api/relay-pos?session=${encodeURIComponent(s.id)}`), { cache: 'no-store' }).then(r => r.json()).then((d: any) => {
        if (seq !== this.cmdSeq) return; // answered across a seek/rate change → stale
        if (d && d.t > 0 && Date.now() - this.seekAt < 2500 && Math.abs(d.t - this.seekTarget) > 5000) return; // pre-swap position
        if (d && d.t > 0) { this.wdDead = 0; this.rwPosTs = d.t; this.rwPosAt = Date.now(); this.emit(); }
        else if (d && d.t <= 0) { if (++this.wdDead >= 3) { this.wdDead = 0; this.relayRecover(); } }
      }).catch(() => { /* ignore */ });
    }, 600);
  }
  private stopRelayPoll(): void { this.cadStop(); if (this.relayPoll) { clearInterval(this.relayPoll); this.relayPoll = undefined; } }
  private cadStart(): void {
    this.cadStop(); const C = this.cad; C.last = -1; C.frames0 = -1; C.stalls = 0; C.maxStall = 0; C.gapMax = 0; C.t0 = Date.now();
    C.t = window.setInterval(() => {
      if (!this.rw?.active || document.hidden) return;
      const q = this.presentedFrames(), now = Date.now();
      if (this.rwScrub) { C.last = q; C.lastNew = now; return; }
      if (C.frames0 < 0) { C.frames0 = q; C.last = q; C.lastNew = now; return; }
      if (q === C.frames0 && C.last === C.frames0) { C.lastNew = now; return; } // connect phase: no frame yet, not a stall
      if (q > C.last) { const gap = now - C.lastNew; if (gap > C.gapMax) C.gapMax = gap; if (gap >= 400) { C.stalls++; if (gap > C.maxStall) C.maxStall = gap; } C.last = q; C.lastNew = now; }
      if (now - C.t0 >= 30000) {
        const rep: any = { sec: Math.round((now - C.t0) / 1000), frames: C.last - C.frames0, stalls: C.stalls, maxStall: C.maxStall, gapMax: C.gapMax, w: this.v.videoWidth };
        C.t0 = now; C.frames0 = C.last; C.stalls = 0; C.maxStall = 0; C.gapMax = 0;
        const pc = this.rw?.pc;
        if (pc) pc.getStats().then(st => { st.forEach((r: any) => { if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'video') { rep.lost = r.packetsLost; rep.jit = Math.round((r.jitter || 0) * 1000); rep.recv = r.framesReceived; rep.dec = r.framesDecoded; rep.drop = r.framesDropped; } }); rlog('cadence', rep); }).catch(() => rlog('cadence', rep));
        else rlog('cadence', rep);
      }
    }, 100);
  }
  private cadStop(): void { if (this.cad.t) { clearInterval(this.cad.t); this.cad.t = 0; } }

  // ---- playAt: relay first, MSE/native fallback ------------------------------------------------
  playAt(ts: number, opts: { scrub?: boolean; srate?: number; noChase?: boolean } = {}): void {
    if (this.destroyed) return;
    const idx0 = this.clipIndexFor(ts);
    if (this.recWebrtcOk()) {
      this.chaseAbort();
      if (idx0 < 0) { this.setLabel('noRecording'); return; }
      this.recPaused = false;
      const t0 = Math.max(ts, this.clips[idx0]!.startTime);
      if (this.rw?.active && this.rw.id) this.recRelaySeek(t0, this.rate || 1, opts.srate || 1);
      else if (this.rw?.active && !this.live) this.rwPending = { ts: t0, rate: this.rate || 1, srate: opts.srate || 1 };
      else { if (this.live) { this.freezeShow(true); this.exitLiveState(); } this.recWebrtcStart(t0); }
      return;
    }
    // ---- MSE fallback / native
    const canChase = !opts.noChase && !this.live && this.M.active && !this.recPaused && this.currentTs() != null && idx0 >= 0;
    this.chaseAbort();
    if (canChase && !opts.scrub) { this.startChase(ts); return; }
    if (idx0 < 0) { this.setLabel('noRecording'); return; }
    if (this.live) { this.freezeShow(true); this.exitLiveState(); }
    this.recPaused = false;
    const clip = this.clips[idx0]!; if (ts < clip.startTime) ts = clip.startTime;
    this.playIndex = idx0;
    this.v.muted = opts.scrub ? true : !this.soundOn;
    if (this.mseSupported()) {
      const t = (ts - this.M.base) / 1000;
      if (this.M.active && t >= 0 && (this.bufferedContains(t) || (t <= this.M.end + 0.5 && this.M.end - t < 95))) { try { this.v.currentTime = t; } catch { /* ignore */ } if (this.v.paused) this.safePlay(); this.feed(); }
      else { if (opts.scrub && Date.now() - this.lastLoad < 200) { this.pendingTs = ts; return; } this.lastLoad = Date.now(); this.mseStart(idx0, (ts - clip.startTime) / 1000); }
    } else {
      const off = Math.min(Math.max((ts - clip.startTime) / 1000, 0), (clip.duration || 0) / 1000);
      if (clip.id === this.curClipId && this.v.src) { try { this.v.currentTime = off; } catch { /* ignore */ } if (this.v.paused) this.safePlay(); }
      else { if (opts.scrub && Date.now() - this.lastLoad < 120) { this.pendingTs = ts; return; } this.freezeShow(); this.lastLoad = Date.now(); this.curClipId = clip.id; this.transport = 'native'; rlog('native-fallback', { clip: clip.id }); this.v.src = this.api.url(`api/segment?id=${encodeURIComponent(clip.videoId || clip.id)}`); this.v.load(); this.v.onloadedmetadata = () => { this.v.playbackRate = this.rate; try { this.v.currentTime = off; } catch { /* ignore */ } this.safePlay(); }; }
    }
    this.setLabel(opts.scrub ? 'scrub' : 'playing');
  }

  // ---- MSE recorded ------------------------------------------------------------------------
  private mseSupported(): boolean { try { return !!(this.api.corsMedia && MSCls && this.codecs && MSCls.isTypeSupported(`video/mp4; codecs="${this.codecs}"`)); } catch { return false; } }
  private mseTeardown(): void { const M = this.M; M.active = false; M.nextIdx = -1; M.feeding = false; M.end = 0; M.pendingSeek = null; M.q = []; M.segFirst = false; try { M.abort?.abort(); } catch { /* ignore */ } M.abort = null; if (M.sb && M.ms && M.ms.readyState === 'open') { try { M.sb.abort(); } catch { /* ignore */ } } M.sb = null; M.ms = null; }
  private bufferedContains(t: number): boolean { try { const b = this.v.buffered; for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.3 && t <= b.end(i) + 0.3) return true; } catch { /* ignore */ } return false; }
  private mseStart(idx: number, offSec: number): void {
    if (this.destroyed) return;
    this.v.onloadedmetadata = null;
    this.freezeShow(); this.mseTeardown();
    const M = this.M; const ms = new MSCls!(); M.ms = ms; M.active = true; M.base = this.clips[idx]!.startTime; M.nextIdx = idx; M.end = 0; M.mmsGo = true; this.transport = 'mse';
    if ((window as any).ManagedMediaSource && ms instanceof (window as any).ManagedMediaSource) { try { (this.v as any).disableRemotePlayback = true; } catch { /* ignore */ } ms.addEventListener('startstreaming', () => { M.mmsGo = true; this.feed(); }); ms.addEventListener('endstreaming', () => { M.mmsGo = false; }); }
    M.pendingSeek = offSec;
    const u = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', () => {
      URL.revokeObjectURL(u); if (M.ms !== ms) return;
      let sb: SourceBuffer; try { sb = ms.addSourceBuffer(`video/mp4; codecs="${this.codecs}"`); } catch { this.codecs = null; M.active = false; return; }
      sb.mode = 'segments';
      sb.addEventListener('updateend', () => { if (M.pendingSeek != null && this.v.readyState >= 1) { const t0 = M.pendingSeek; M.pendingSeek = null; try { this.v.currentTime = t0; } catch { /* ignore */ } } this.drain(); if (!M.feeding && !M.q.length) this.feed(); });
      sb.addEventListener('error', () => { M.active = false; });
      M.sb = sb; try { this.v.currentTime = offSec; } catch { /* ignore */ } this.feed();
    });
    try { this.v.srcObject = null; } catch { /* ignore */ }
    this.v.src = u; this.v.playbackRate = this.rate; this.safePlay();
  }
  private drain(): void {
    const M = this.M; if (!M.active || !M.sb || M.sb.updating || !M.q.length) return;
    if (M.segFirst) { M.segFirst = false; try { M.sb.timestampOffset = M.segOff; } catch { try { M.sb.abort(); M.sb.timestampOffset = M.segOff; } catch { M.active = false; return; } } }
    const buf = M.q.shift()!;
    try { M.sb.appendBuffer(buf as BufferSource); } catch { try { M.sb.abort(); M.sb.appendBuffer(buf as BufferSource); } catch { M.active = false; } }
  }
  private feed(): void {
    const M = this.M; if (!M.active || M.feeding) return; if (M.mmsGo === false) return; if (M.nextIdx < 0 || M.nextIdx >= this.clips.length) return;
    if (M.end - this.v.currentTime > 90) return;
    try { const b = this.v.buffered; if (b.length && this.v.currentTime - b.start(0) > 240 && M.sb && !M.sb.updating && !M.q.length) { M.sb.remove(0, this.v.currentTime - 120); return; } } catch { /* ignore */ }
    const clip = this.clips[M.nextIdx]!, ms = M.ms;
    M.feeding = true; M.segFirst = true; M.segOff = (clip.startTime - M.base) / 1000; M.abort = new AbortController();
    fetch(this.api.url(`api/segment?id=${encodeURIComponent(clip.videoId || clip.id)}`), { credentials: 'same-origin', signal: M.abort.signal })
      .then(r => { if (!r.ok || !r.body) throw new Error(String(r.status)); const rd = r.body.getReader(); const loop = () => { rd.read().then(x => { if (M.ms !== ms || !M.active) return; if (x.done) { M.feeding = false; M.nextIdx++; M.end = M.segOff + (clip.duration || 60000) / 1000; if (!M.q.length) this.feed(); return; } M.q.push(x.value); this.drain(); loop(); }).catch(() => { if (M.ms === ms) M.feeding = false; }); }; loop(); })
      .catch(() => { if (M.ms !== ms) return; M.feeding = false; M.nextIdx++; this.feed(); });
  }
  private handleStall(): void { if (this.live || !this.M.active || this.v.paused) return; const t = this.v.currentTime; try { const b = this.v.buffered; for (let i = 0; i < b.length; i++) if (b.start(i) > t && b.start(i) - t < 60) { this.v.currentTime = b.start(i) + 0.05; return; } } catch { /* ignore */ } if (this.M.nextIdx >= this.clips.length) this.opts.onClipsRefresh().then(c => { const cur = this.clips[this.M.nextIdx - 1]; this.clips = c; if (cur) { const i = c.findIndex(x => x.id === cur.id); if (i >= 0) this.M.nextIdx = i + 1; } this.feed(); }).catch(() => { /* ignore */ }); else this.feed(); }
  // trick-play chase inside the MSE buffer
  private chaseAbort(): void { if (!this.CH.active) return; this.CH.active = false; if (this.CH.timer) { clearInterval(this.CH.timer); this.CH.timer = 0; } this.v.playbackRate = this.rate; this.v.muted = !this.soundOn; }
  private endChase(): void { const tgt = this.CH.target; this.chaseAbort(); try { this.v.currentTime = (tgt - this.M.base) / 1000; } catch { /* ignore */ } this.setLabel('playing'); if (this.v.paused) this.safePlay(); }
  private startChase(target: number): void {
    this.chaseAbort(); this.freezeHide(); this.CH.active = true; this.CH.target = target; try { this.v.pause(); } catch { /* ignore */ } this.v.muted = true; this.setLabel('scrub');
    this.CH.timer = window.setInterval(() => {
      if (!this.CH.active) return; const c = this.currentTs(); if (c == null) { this.endChase(); return; }
      const rem = this.CH.target - c; if (Math.abs(rem) <= 250) { this.endChase(); return; }
      let step = rem * 0.2; if (Math.abs(step) < 180) step = rem > 0 ? 180 : -180;
      const nt = c + step, tt = (nt - this.M.base) / 1000;
      if (this.M.active && this.bufferedContains(tt)) { try { this.v.currentTime = tt; } catch { /* ignore */ } this.feed(); } else { this.endChase(); this.playAt(this.CH.target, { noChase: true }); }
    }, 50);
  }

  // ---- controls -----------------------------------------------------------------------------
  togglePlayPause(): void {
    if (this.live) return;
    if (this.CH.active) { this.chaseAbort(); try { this.v.pause(); } catch { /* ignore */ } this.emit(); return; }
    if (this.recPaused) { this.recPaused = false; const t = this.recPausedTs ?? (this.currentTs() ?? Date.now() - 1000); this.playAt(t, {}); return; }
    if (this.rw?.active) { this.recPausedTs = this.currentTs(); this.freezeShow(); if (this.freezeT) { clearTimeout(this.freezeT); this.freezeT = 0; } this.recWebrtcTeardown(); try { this.v.pause(); } catch { /* ignore */ } this.recPaused = true; this.transport = 'none'; this.setLabel('paused'); return; }
    if (this.v.paused) this.safePlay(); else this.v.pause();
  }
  skip(ms: number): void { const ts = this.live ? Date.now() + ms : ((this.currentTs() ?? Date.now()) + ms); if (this.live && ms > 0) return; this.playAt(ts, {}); }
  cycleSpeed(): number {
    if (this.live) return this.rate;
    const rates = [1, 2, 4, 8]; this.rate = rates[(rates.indexOf(this.rate) + 1) % rates.length] ?? 1;
    if (this.rw?.active && this.rw.id) { const c = this.currentTs(); this.recRelaySeek(c ?? this.rwStartMs, this.rate); this.v.muted = !this.soundOn || this.rate !== 1; }
    else this.v.playbackRate = this.rate;
    this.emit(); return this.rate;
  }
  setSound(on: boolean): void { this.soundOn = on; this.v.muted = !on || (!!this.rw?.active && this.rate !== 1); if (on && this.v.paused && !this.recPaused) this.safePlay(); this.emit(); }
  snapshot(): void {
    try {
      const src: any = this.live && !this.img.classList.contains('hidden') ? this.img : this.v;
      const w = src.videoWidth || src.naturalWidth || 1280, h = src.videoHeight || src.naturalHeight || 720;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(src, 0, 0, w, h);
      cv.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); const ts = this.currentTs() ?? Date.now(); const d = new Date(ts); a.download = `${(this.camName || 'snapshot').replace(/[^\w.-]+/g, '_')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.jpg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/jpeg', 0.92);
    } catch { /* ignore */ }
  }
  private capLog(tag: string, extra?: object): void { try { const v: any = this.v, st: any = this.stage; rlog(tag, { fsReq: !!st.requestFullscreen, wkFs: !!st.webkitRequestFullscreen, vEnter: !!v.webkitEnterFullscreen, pipReq: !!v.requestPictureInPicture, wkPip: !!(v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')), rs: v.readyState, vw: v.videoWidth, ...(extra || {}) }); } catch { /* ignore */ } }
  pip(): void {
    const v: any = this.v; this.capLog('pip-btn');
    try {
      if (document.pictureInPictureElement || v.webkitPresentationMode === 'picture-in-picture') { if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => { /* ignore */ }); else v.webkitSetPresentationMode('inline'); return; }
      if (this.v.classList.contains('hidden')) return;
      const wk = () => { try { if (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')) v.webkitSetPresentationMode('picture-in-picture'); else this.capLog('pip-unsupported'); } catch (e: any) { this.capLog('pip-fail', { e: String(e?.name || e) }); } };
      if (v.requestPictureInPicture) v.requestPictureInPicture().catch((e: any) => { this.capLog('pip-fail', { e: String(e?.name || e) }); wk(); }); else wk();
    } catch (e: any) { this.capLog('pip-fail', { e: String(e?.name || e) }); }
  }
  fullscreen(): void {
    const st: any = this.stage, v: any = this.v, d: any = document; this.capLog('fs-btn');
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
      if (st.requestFullscreen) st.requestFullscreen().catch((e: any) => this.capLog('fs-fail', { e: String(e?.name || e) }));
      else if (st.webkitRequestFullscreen) st.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen && !this.v.classList.contains('hidden')) v.webkitEnterFullscreen();
      else this.capLog('fs-unsupported');
    } catch (e: any) { this.capLog('fs-fail', { e: String(e?.name || e) }); }
  }

  // ---- scrub (timeline gesture) ------------------------------------------------------------
  /** first gesture: scrub profile on (relay); MSE: freeze + pause */
  scrubBegin(): void {
    this.chaseAbort();
    if (this.scrubOffT) { clearTimeout(this.scrubOffT); this.scrubOffT = 0; } // gesture continues → stay in the scrub profile
    if (!this.rw?.active) { this.freezeShow(); if (!this.live) { try { this.v.pause(); } catch { /* ignore */ } } }
    // the scrub profile is entered by scrubMove on the first real movement (a single wheel notch = one in-place seek, no restarts)
  }
  /** scroll position + velocity (timeline-ms per wall-s) while the gesture runs */
  scrubMove(_centerTs: number, vel: number, smoothTs: number): void {
    if (!this.rw?.active) { this.freezeHold(); return; }
    if (!this.rw.id) return;
    let r = vel / 1000;
    if (Math.abs(r) < 0.1) return;
    r = Math.min(3000, Math.max(-3000, r));
    r = Math.abs(r) >= 10 ? Math.round(r) : Math.round(r * 10) / 10;
    this.recRelayScrub(true);
    const tgt = this.clampRange(smoothTs), cur = this.currentTs();
    const drift = cur == null ? null : tgt - cur;
    if (drift == null || Math.abs(drift) > Math.max(4500, 1200 * Math.abs(r))) this.scrubSeek(tgt, r);
    else this.recRelayRate(r);
  }
  /** hold / release: land exactly on the centre at 1× (or go live near now) */
  scrubSeek(ts: number, srate = 1): void { if (this.nearNow(ts)) { this.goLive(); return; } this.playAt(this.clampRange(ts), { scrub: true, srate }); }
  /** gesture settled → back to the normal profile after SCRUB_OFF_DELAY_MS of quiet (a new gesture cancels it) */
  scrubIdle(): void {
    if (this.scrubOffT) clearTimeout(this.scrubOffT);
    this.scrubOffT = window.setTimeout(() => { this.scrubOffT = 0; this.recRelayScrub(false); }, SCRUB_OFF_DELAY_MS);
  }

  // ---- visibility ---------------------------------------------------------------------------
  private hiddenTs: number | null = null;
  private onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      // don't pin a camera stream in the background; live is simply restarted on return
      if (this.live) { this.hiddenTs = null; this.webrtcTeardown(); this.liveTeardown(); if (this.transport === 'mjpeg') this.img.removeAttribute('src'); }
      else if (this.rw?.active) { this.hiddenTs = this.currentTs(); this.freezeShow(true); this.recWebrtcTeardown(); }
    } else {
      if (this.live) this.goLive(); // also covers goLive() issued while hidden (background tab)
      else if (this.hiddenTs != null && !this.recPaused) { const t = this.hiddenTs; this.hiddenTs = null; this.playAt(t, {}); }
    }
  }
}

