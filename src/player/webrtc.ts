/**
 * WebRTC session over the plugin's WebSocket signaling (docs/API.md §6).
 * Battle-tested flow: options first, createLocalDescription/setRemoteDescription
 * RPCs, trickle ICE, stream composed from ALL receivers (Safari attached an
 * audio-only stream forever when the audio track arrived first), fresh offer on
 * renegotiation, dec-check after connect with a one-time TURN-relay retry on a
 * media blackhole. The API client is injected (hosts may run on another origin).
 */
import type { SentinelClient } from '../api';
import { rlog } from './rlog';

export interface SessionCallbacks {
  onStream: (ms: MediaStream) => void;
  onFail: (reason: string) => void;
  onSessionId?: (id: string) => void;
}
export interface SessionOptions { camId: string; mode: 'live' | 'recorded'; startMs?: number; compat?: boolean; forceRelay?: boolean; kind?: string; }

/** After a connect timeout / media blackhole the next sessions use TURN relay only — for 10 minutes, not for the rest of
 *  the page's life (one mobile-network hiccup would otherwise force relay forever; without a TURN server every later
 *  session would fail and the player end up on MSE/MJPEG). */
let forceRelayUntil = 0;
const FORCE_RELAY_MS = 10 * 60_000;
const relayForced = (): boolean => Date.now() < forceRelayUntil;

export function mobileClient(): boolean {
  return /iPhone|iPod|Android|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width || 9999, screen.height || 9999) < 920);
}
function rtcOptions() {
  let capabilities: unknown;
  try { capabilities = RTCRtpReceiver.getCapabilities ? { audio: RTCRtpReceiver.getCapabilities('audio'), video: RTCRtpReceiver.getCapabilities('video') } : undefined; } catch { /* none */ }
  return { userAgent: navigator.userAgent, capabilities, screen: { devicePixelRatio: window.devicePixelRatio || 1, width: screen.width || 1920, height: screen.height || 1080 } };
}

export class WebRtcSession {
  ws: WebSocket | undefined; pc: RTCPeerConnection | undefined; id: string | undefined; active = false;
  private connectT: number | undefined; private trackSig = ''; private api: SentinelClient; private opts: SessionOptions; private cb: SessionCallbacks;
  constructor(api: SentinelClient, opts: SessionOptions, cb: SessionCallbacks) { this.api = api; this.opts = opts; this.cb = cb; }
  get connected(): boolean { const s = this.pc?.iceConnectionState; return s === 'connected' || s === 'completed'; }

  start(): void {
    const params: Record<string, string> = {};
    if (this.opts.mode === 'recorded') { params.mode = 'recorded'; params.start = String(Math.round(this.opts.startMs || 0)); }
    if (this.opts.compat ?? mobileClient()) params.compat = '1';
    let ws: WebSocket;
    try { ws = new WebSocket(this.api.signalingUrl(this.opts.camId, params)); } catch { this.cb.onFail('ws'); return; }
    this.ws = ws; this.active = true;
    this.connectT = window.setTimeout(() => {
      if (this.active && this.ws === ws && !this.connected) {
        rlog('connect-timeout', { kind: this.opts.mode, ice: this.pc?.iceConnectionState });
        if (!relayForced()) { forceRelayUntil = Date.now() + FORCE_RELAY_MS; rlog('retry-relay-only', { kind: this.opts.mode }); this.stop(); this.start(); return; }
        this.fail('timeout');
      }
    }, 12000);
    ws.onopen = () => { try { ws.send(JSON.stringify({ type: 'options', options: rtcOptions() })); } catch { /* ignore */ } };
    ws.onerror = () => { if (this.active && this.ws === ws && !this.pc) this.fail('ws-error'); };
    ws.onclose = () => { if (this.active && this.ws === ws && !this.connected) this.fail('ws-closed'); };
    ws.onmessage = (ev) => {
      let msg: any; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'createLocalDescription') this.createLocal(ws, msg);
      else if (msg.type === 'setRemoteDescription') this.setRemote(ws, msg);
      else if (msg.type === 'addIceCandidate') this.pc?.addIceCandidate(msg.candidate).catch(() => { /* ignore */ });
      else if (msg.type === 'sessionStarted') { this.id = msg.id; this.cb.onSessionId?.(msg.id); }
      else if (msg.type === 'error') { if (this.active && this.ws === ws) this.fail(msg.reason || 'error'); }
    };
  }

  stop(): void {
    this.active = false;
    if (this.connectT) { clearTimeout(this.connectT); this.connectT = undefined; }
    try { if (this.ws) { this.ws.onmessage = null; this.ws.onclose = null; this.ws.onerror = null; this.ws.close(); } } catch { /* ignore */ }
    try { if (this.pc) { this.pc.ontrack = null; this.pc.oniceconnectionstatechange = null; this.pc.onicecandidate = null; this.pc.close(); } } catch { /* ignore */ }
    this.ws = undefined; this.pc = undefined; this.id = undefined; this.trackSig = '';
  }

  private fail(reason: string): void { if (!this.active) return; this.stop(); this.cb.onFail(reason); }

  private ensurePc(setup: any): RTCPeerConnection {
    if (this.pc) return this.pc;
    let cfg: RTCConfiguration = (setup && setup.configuration) || { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    if (relayForced()) cfg = { ...cfg, iceTransportPolicy: 'relay' };
    const pc = new RTCPeerConnection(cfg);
    this.pc = pc;
    if (setup?.datachannel) { try { const dc = pc.createDataChannel(setup.datachannel.label, setup.datachannel.dict); dc.binaryType = 'arraybuffer'; } catch { /* ignore */ } }
    if (setup?.audio) { try { pc.addTransceiver('audio', { direction: setup.audio.direction || 'recvonly' }); } catch { /* ignore */ } }
    if (setup?.video) { try { pc.addTransceiver('video', { direction: setup.video.direction || 'recvonly' }); } catch { /* ignore */ } }
    pc.ontrack = () => {
      if (!this.active || this.pc !== pc) return;
      const ms = new MediaStream();
      pc.getReceivers().forEach(r => { if (r.track) ms.addTrack(r.track); });
      if (!ms.getVideoTracks().length) return; // audio-first: wait for the video event
      const sig = ms.getTracks().map(t => t.id).sort().join(',');
      if (this.trackSig === sig) return;
      this.trackSig = sig;
      this.cb.onStream(ms);
    };
    pc.oniceconnectionstatechange = () => {
      if (!this.active || this.pc !== pc) return;
      const st = pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        if (this.connectT) { clearTimeout(this.connectT); this.connectT = undefined; }
        window.setTimeout(() => {
          if (!this.active || this.pc !== pc) return;
          pc.getStats().then(s => {
            let dec = -1, recv = -1, vBytes = -1, aBytes = -1;
            s.forEach((r: any) => {
              if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'video') { dec = r.framesDecoded || 0; recv = r.framesReceived ?? -1; vBytes = r.bytesReceived || 0; }
              if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'audio') aBytes = r.bytesReceived || 0;
            });
            if (dec <= 0) {
              rlog('dec-check-fail', { kind: this.opts.mode, dec, recv, vBytes, aBytes, relayForced: relayForced() });
              if (!relayForced() && vBytes <= 0 && aBytes <= 0) { forceRelayUntil = Date.now() + FORCE_RELAY_MS; rlog('retry-relay-only', { kind: this.opts.mode }); this.stop(); this.start(); return; }
              this.fail('no-decode');
            }
            else rlog('dec-ok', { kind: this.opts.mode, dec, relayForced: relayForced() });
          }).catch(() => { /* ignore */ });
        }, this.opts.mode === 'live' ? 5000 : 9000);
      }
      if (st === 'failed') { rlog('ice-failed', { kind: this.opts.mode }); this.fail('ice-failed'); }
    };
    return pc;
  }

  private createLocal(ws: WebSocket, msg: any): void {
    const pc = this.ensurePc(msg.setup);
    const mid = this.connected;
    if (mid) rlog('reneg', { dtype: msg.dtype, kind: this.opts.mode });
    const reply = (desc: RTCSessionDescriptionInit) => { try { ws.send(JSON.stringify({ type: 'response', reqId: msg.reqId, description: { type: desc.type, sdp: desc.sdp } })); } catch { /* ignore */ } };
    pc.onicecandidate = (ev) => { if (ev.candidate) { try { ws.send(JSON.stringify({ type: 'iceCandidate', candidate: JSON.parse(JSON.stringify(ev.candidate)) })); } catch { /* ignore */ } } };
    const p = msg.dtype === 'offer'
      ? pc.createOffer({ offerToReceiveAudio: !!msg.setup?.audio, offerToReceiveVideo: !!msg.setup?.video }).then(o => pc.setLocalDescription(o).then(() => reply(o)))
      : pc.createAnswer().then(a => pc.setLocalDescription(a).then(() => reply(a)));
    p.catch(e => { rlog('createLocal-fail', { dtype: msg.dtype, name: e?.name, mid }); if (!mid) this.fail('createLocal'); });
  }

  private setRemote(ws: WebSocket, msg: any): void {
    const pc = this.ensurePc(msg.setup);
    const mid = this.connected;
    pc.setRemoteDescription(msg.description)
      .then(() => { try { ws.send(JSON.stringify({ type: 'response', reqId: msg.reqId, ok: true })); } catch { /* ignore */ } })
      .catch(e => { rlog('sRD-fail', { name: e?.name, mid }); try { ws.send(JSON.stringify({ type: 'response', reqId: msg.reqId, ok: false })); } catch { /* ignore */ } if (!mid) this.fail('sRD'); });
  }
}
