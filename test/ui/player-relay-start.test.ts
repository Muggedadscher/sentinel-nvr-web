// @vitest-environment jsdom
/**
 * A new relay session (event opened from the overview or from live, resume, tab back, recovery): the server plays from
 * the start position while the connection is still being set up, so the first frame that arrives lies the connection
 * time INTO the recording — on a phone several seconds; the event began in the middle and the clock had run on while
 * the stage still said "loading" (user 27.11.2026, iPhone, both hosts). The controller now holds the playhead on the
 * start until the first presented frame and then jumps back to the start with a marked seek; the still stays until the
 * marker frame.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessions: any[] = [];
vi.mock('../../src/player/webrtc', () => ({
  mobileClient: () => false,
  WebRtcSession: class {
    id: string | undefined;
    active = false;
    pc = undefined;
    constructor(
      public api: any,
      public o: any,
      public cb: any,
    ) {
      sessions.push(this);
    }
    start() {
      this.active = true;
    }
    stop() {
      this.active = false;
    }
  },
}));
import { PlayerController } from '../../src/player/controller';

const T = 1_790_000_000_000; // session start position (the event's playback start)
const NOW = T + 3_600_000;

function setup() {
  const urls: string[] = [];
  vi.stubGlobal('RTCPeerConnection', class {});
  let pos = T; // what the server reports as its position
  let seekOk = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      urls.push(u);
      if (u.includes('api/relay-seek'))
        return seekOk ? { ok: true, status: 200, json: async () => ({ w: 1264 }) } : { ok: false, status: 404 };
      if (u.includes('api/relay-pos')) return { ok: true, status: 200, json: async () => ({ t: pos, r: 1, v: 1 }) };
      return { ok: true, status: 204, json: async () => ({}) };
    }),
  );
  const states: any[] = [];
  const ctl = new PlayerController(
    { url: (p: string) => p, corsMedia: true, control: async () => true, postText: () => undefined } as any,
    { onState: (s: any) => states.push(s) } as any,
  );
  const c = ctl as any;
  const v = document.createElement('video') as any;
  let frameCbs: ((now: number, md?: { width?: number }) => void)[] = [];
  v.requestVideoFrameCallback = (f: any) => frameCbs.push(f);
  v.play = () => Promise.resolve();
  v.pause = () => undefined;
  let width = 0;
  Object.defineProperty(v, 'videoWidth', { get: () => width });
  c.v = v;
  c.fz = document.createElement('canvas');
  c.fz.classList.add('hidden');
  c.img = document.createElement('img');
  c.stage = document.createElement('div');
  c.camId = '33';
  c.clips = [{ id: 'a', startTime: T - 10_000, duration: 60_000 }];
  c.rangeStart = T - 3_600_000;
  c.rangeEnd = NOW + 60_000;
  /** one presented frame of this width */
  const frame = (w: number) => {
    width = w;
    const cbs = frameCbs;
    frameCbs = [];
    cbs.forEach((f) => f(0, { width: w }));
  };
  const seeks = () => urls.filter((u) => u.includes('api/relay-seek'));
  const still = () => !c.fz.classList.contains('hidden');
  /** an event still on the stage (what posterEvent draws) */
  const showStill = () => {
    c.fz.classList.remove('hidden');
    c.freezeArm(true);
  };
  return {
    ctl,
    c,
    states,
    frame,
    seeks,
    still,
    showStill,
    setPos: (t: number) => (pos = t),
    failSeeks: () => (seekOk = false),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sessions.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('new relay session starts at its start position', () => {
  it('holds the clock and the still while connecting, then jumps back to the start on the first frame', async () => {
    const h = setup();
    h.ctl.playAt(T, {});
    const s = sessions[0];
    expect(s.o).toMatchObject({ mode: 'recorded', startMs: T });
    h.showStill();
    expect(h.c.label).toBe('loading');

    // connecting takes 6 s; the server plays on meanwhile and says so
    s.id = 'sid';
    s.cb.onSessionId('sid');
    s.cb.onStream({} as MediaStream);
    for (let i = 1; i <= 10; i++) {
      h.setPos(T + i * 600);
      await vi.advanceTimersByTimeAsync(600);
    }
    expect(h.ctl.currentTs()).toBe(T); // the clock waits for the picture
    expect(h.c.label).toBe('loading');
    expect(h.still()).toBe(true);
    expect(h.seeks()).toEqual([]);

    // first presented frame = 6 s into the event → marked jump back to the start, the still stays
    h.frame(1280);
    expect(h.seeks()).toHaveLength(1);
    expect(h.seeks()[0]).toContain(`start=${T}`);
    expect(h.seeks()[0]).toContain('mark=1&avoid=1280');
    await vi.advanceTimersByTimeAsync(0);
    h.frame(1280);
    h.frame(1280);
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.still()).toBe(true); // frames of the old position do not lift it
    expect(h.c.label).toBe('loading');
    expect(h.ctl.currentTs()).toBe(T); // the clock still stands: the start picture is not on screen yet

    // the marker frame is the start position: now the still goes (2 frames + fade) and the label says playing
    h.frame(1264);
    expect(h.c.label).toBe('playing');
    expect(h.ctl.currentTs()).toBe(T); // the clock starts with the start picture
    h.frame(1264);
    h.frame(1264);
    await vi.advanceTimersByTimeAsync(200);
    expect(h.still()).toBe(false);
    expect(h.ctl.currentTs()).toBe(T + 200);
    expect(h.seeks()).toHaveLength(1); // once per session
  });

  it('a late frame of the previous stream is not the first frame of the new session', async () => {
    const h = setup();
    h.c.fcArm(); // the stream that played before (live, the old session)
    h.frame(1280);
    h.ctl.playAt(T, {});
    const s = sessions[0];
    h.showStill();
    h.frame(1280); // still delivered after the new session was requested
    h.frame(1280);
    s.id = 'sid';
    s.cb.onSessionId('sid');
    await vi.advanceTimersByTimeAsync(700);
    expect(h.seeks()).toEqual([]);
    expect(h.ctl.currentTs()).toBe(T);
    s.cb.onStream({} as MediaStream);
    h.frame(1280);
    expect(h.seeks()).toHaveLength(1);
  });

  it('the jump back fails: the session is rebuilt once and then plays on as it comes (no loop)', async () => {
    const h = setup();
    h.failSeeks();
    h.ctl.playAt(T, {});
    const s = sessions[0];
    s.id = 'sid';
    s.cb.onSessionId('sid');
    s.cb.onStream({} as MediaStream);
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(50);
    expect(h.seeks()).toHaveLength(1);
    expect(sessions).toHaveLength(2); // recovered
    const s2 = sessions[1];
    expect(s2.o.startMs).toBe(T);
    s2.id = 'sid2';
    s2.cb.onSessionId('sid2');
    s2.cb.onStream({} as MediaStream);
    expect(h.c.label).toBe('playing');
    h.frame(1280);
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(700);
    expect(h.seeks()).toHaveLength(1);
    expect(sessions).toHaveLength(2);
  });

  it('a scrub that starts while connecting wins', async () => {
    const h = setup();
    h.ctl.playAt(T, {});
    const s = sessions[0];
    s.id = 'sid';
    s.cb.onSessionId('sid');
    s.cb.onStream({} as MediaStream);
    h.ctl.scrubBegin();
    h.ctl.scrubMove(T - 120_000, 0, 0);
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.seeks()).toEqual([]);
  });

  it('a frame before the session id waits for the id', async () => {
    const h = setup();
    h.ctl.playAt(T, {});
    const s = sessions[0];
    h.showStill();
    s.cb.onStream({} as MediaStream);
    h.frame(1280);
    h.frame(1280);
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.seeks()).toEqual([]);
    expect(h.still()).toBe(true);
    expect(h.ctl.currentTs()).toBe(T);
    s.id = 'sid';
    s.cb.onSessionId('sid');
    expect(h.seeks()).toHaveLength(1);
    expect(h.seeks()[0]).toContain(`start=${T}`);
  });

  it('a jump asked while connecting wins: one seek to the new target, no jump back to the old start', async () => {
    const h = setup();
    h.ctl.playAt(T, {});
    const s = sessions[0];
    h.showStill();
    h.ctl.playAt(T + 30_000, {}); // no session id yet → pending
    s.id = 'sid';
    s.cb.onSessionId('sid');
    s.cb.onStream({} as MediaStream);
    await vi.advanceTimersByTimeAsync(0);
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(700);
    h.frame(1280);
    expect(h.seeks()).toHaveLength(1);
    expect(h.seeks()[0]).toContain(`start=${T + 30_000}`);
    expect(h.still()).toBe(true);
  });

  it('the chosen speed is carried by the jump back', async () => {
    const h = setup();
    h.c.rate = 2;
    h.ctl.playAt(T, {});
    const s = sessions[0];
    s.id = 'sid';
    s.cb.onSessionId('sid');
    s.cb.onStream({} as MediaStream);
    await vi.advanceTimersByTimeAsync(200);
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(200);
    expect(h.seeks()).toHaveLength(1);
    expect(h.seeks()[0]).toContain('rate=2');
  });

  it('pause before the first frame: nothing is sent for the session that is gone', async () => {
    const h = setup();
    h.ctl.playAt(T, {});
    const s = sessions[0];
    s.id = 'sid';
    s.cb.onSessionId('sid');
    s.cb.onStream({} as MediaStream);
    h.ctl.togglePlayPause();
    h.frame(1280);
    await vi.advanceTimersByTimeAsync(700);
    expect(h.seeks()).toEqual([]);
    expect(h.c.recPausedTs).toBe(T); // resume starts where the event starts
  });
});
