/**
 * Clip download UI: the button only with `features: ["export"]`, clip mode on/off, an active edge follows the line only
 * while the user scrolls (never the playback), locks and error texts, an expired file → "Create again", closing cancels
 * a running job, and Share gets a prefetched file synchronously inside the tap.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraPage } from '../../src/ui/components/CameraPage';
import { ClipBar } from '../../src/ui/components/ClipBar';
import { SentinelHttpError } from '../../src/api';

const rlog = vi.fn();
let playhead: number | null = null;
const playAt = vi.fn();
vi.mock('../../src/player', () => ({
  PlayerController: class {
    camId = '';
    camName = '';
    attach() {
      /* no dom */
    }
    destroy() {
      /* */
    }
    setCamera(id: string) {
      this.camId = id;
    }
    setClips() {
      /* */
    }
    playAt(ts: number) {
      playAt(ts);
    }
    goLive() {
      /* */
    }
    posterEvent() {
      /* */
    }
    posterFromSnapshot() {
      /* */
    }
    freezeCurrent() {
      /* */
    }
    openMark() {
      /* */
    }
    currentTs() {
      return playhead;
    }
    scrubSettling() {
      return false;
    }
    scrubBegin() {
      /* */
    }
    scrubMove() {
      /* */
    }
    scrubHold() {
      /* */
    }
    scrubSeek() {
      /* */
    }
    scrubIdle() {
      /* */
    }
  },
  rlog: (...a: unknown[]) => rlog(...a),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver = class {
  observe() {
    /* */
  }
  disconnect() {
    /* */
  }
};

const MIN = 60_000;
const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}${JSON.stringify(v)}` : k);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeClient(over: Record<string, unknown> = {}, features?: string[]) {
  return {
    corsMedia: true,
    url: (p: string) => p,
    getJson: (path: string) => {
      const now = Date.now();
      // today and yesterday: one continuous recording over the last 3 h
      const clips = path.includes(`start=${new Date().setHours(0, 0, 0, 0)}`)
        ? Array.from({ length: 180 }, (_, i) => ({ id: `s${i}`, startTime: now - 180 * MIN + i * MIN, duration: MIN }))
        : [];
      return Promise.resolve({ clips, events: [], motion: [], codecs: null, ...(features ? { features } : {}) });
    },
    eventThumbUrl: () => '',
    snapshotUrl: () => '',
    segmentThumbUrl: () => '',
    exportFileUrl: (id: string) => `api/export-file?id=${id}`,
    startExport: vi.fn(),
    exportStatus: vi.fn(),
    cancelExport: vi.fn(() => Promise.resolve(true)),
    ...over,
  } as any;
}

let root: Root | null = null;
let div: HTMLDivElement;
async function render(node: React.ReactNode, client: any) {
  div = document.createElement('div');
  document.body.appendChild(div);
  root = createRoot(div);
  await act(async () => {
    root!.render(
      <SentinelUiProvider value={{ client, t: t as any, locale: 'de-DE', nav: { openCamera: () => {} } }}>
        {node}
      </SentinelUiProvider>,
    );
  });
}
const page = (client: any) =>
  render(<CameraPage camId="33" name="Cam" storagePrefix="t-" brand="test" renderDatePicker={() => null} />, client);
const q = (sel: string) => div.querySelector(sel) as HTMLElement | null;
const btn = (label: string) =>
  [...div.querySelectorAll('button, a')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  ) as HTMLElement | undefined;
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const chipTime = (i: number) => (div.querySelectorAll('.nvr-clipchip__v')[i] as HTMLElement).textContent;

beforeEach(() => {
  playhead = null;
  playAt.mockClear();
  rlog.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('clip mode on the camera page', () => {
  it('no button without features: ["export"] (older plugin)', async () => {
    await page(makeClient());
    expect(btn('nvr.clip.download')).toBeUndefined();
  });

  it('button opens clip mode (band, bar, no date chip) and closes it again', async () => {
    await page(makeClient({}, ['export']));
    const b = btn('nvr.clip.download')!;
    expect(b).toBeTruthy();
    expect(q('.nvr-datechip')).not.toBeNull();
    await click(b);
    expect(q('.nvr-clipbar')).not.toBeNull();
    expect(q('.vclip')).not.toBeNull();
    expect(q('.nvr-datechip')).toBeNull();
    expect(b.getAttribute('aria-pressed')).toBe('true');
    // live: the last minute up to now − 10 s
    expect(div.querySelector('.nvr-clipbar__len')?.textContent).toContain('1:00');
    await click(btn('nvr.clip.close'));
    expect(q('.nvr-clipbar')).toBeNull();
    expect(q('.vclip')).toBeNull();
    expect(q('.nvr-datechip')).not.toBeNull();
  });

  it('Escape ends clip mode', async () => {
    await page(makeClient({}, ['export']));
    await click(btn('nvr.clip.download'));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(q('.nvr-clipbar')).toBeNull();
  });

  it('an active edge follows the line only while the USER scrolls — never the running playback', async () => {
    await page(makeClient({}, ['export']));
    await click(btn('nvr.clip.download'));
    const from0 = chipTime(0);
    await click(div.querySelectorAll('.nvr-clipchip')[0]!);
    expect(div.querySelectorAll('.nvr-clipchip')[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.edgeHint');
    // playback runs on (the playhead moves): the edge stays
    playhead = Date.now() - 20 * MIN;
    await act(async () => {
      await wait(450);
    });
    expect(chipTime(0)).toBe(from0);
    // the user scrolls the timeline down (= older): the start follows the line
    const sc = q('.vtl-scroll')!;
    await act(async () => {
      sc.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      sc.scrollTop = sc.scrollTop + 200;
      sc.dispatchEvent(new Event('scroll'));
    });
    const from1 = chipTime(0);
    expect(from1).not.toBe(from0);
    // after the gesture settles the edge stays where it is, even though the video plays on
    await act(async () => {
      window.dispatchEvent(new Event('pointerup'));
      await wait(900);
    });
    playhead = Date.now() - 5 * MIN;
    await act(async () => {
      await wait(300);
    });
    expect(chipTime(0)).toBe(from1);
  });

  it('a download button per event row opens the event range on the timeline tab', async () => {
    const now = Date.now();
    const ev = {
      id: 'e1',
      timestamp: now - 30 * MIN,
      startTs: now - 30 * MIN - 2000,
      endTs: now - 30 * MIN + 8000,
      classes: ['person'],
      score: 0.9,
      source: 'object',
    };
    const client = makeClient({}, ['export']);
    const getJson = client.getJson;
    client.getJson = (p: string) => getJson(p).then((d: any) => ({ ...d, events: d.clips.length ? [ev] : [] }));
    await page(client);
    await click([...div.querySelectorAll('[role="tab"]')][1]);
    const dl = div.querySelector('.nvr-evrow__clip');
    expect(dl).not.toBeNull();
    await click(dl);
    expect(q('.nvr-clipbar')).not.toBeNull();
    expect(div.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('nvr.tab.timeline');
    // ±5 s around 2 s before … 8 s after the trigger = 20 s, the video at the clip start
    expect(div.querySelector('.nvr-clipbar__len')?.textContent).toContain('0:20');
    expect(playAt).toHaveBeenLastCalledWith(ev.startTs - 5000);
  });

  it('the event list has no download button without the feature', async () => {
    const now = Date.now();
    const ev = { id: 'e1', timestamp: now - 30 * MIN, classes: ['person'], score: 0.9, source: 'object' };
    const client = makeClient();
    const getJson = client.getJson;
    client.getJson = (p: string) => getJson(p).then((d: any) => ({ ...d, events: d.clips.length ? [ev] : [] }));
    await page(client);
    await click([...div.querySelectorAll('[role="tab"]')][1]);
    expect(div.querySelector('.nvr-evrow')).not.toBeNull();
    expect(div.querySelector('.nvr-evrow__clip')).toBeNull();
  });
});

// ---- the bar itself

const now0 = () => Date.now();
const recClips = () => {
  const n = now0();
  return Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, startTime: n - 120 * MIN + i * MIN, duration: MIN }));
};
const START = (over: Record<string, unknown> = {}) => ({
  id: 'job1',
  camera: '33',
  from: 0,
  to: 0,
  clipped: false,
  durationMs: MIN,
  segments: 2,
  gaps: [],
  estBytes: 5_000_000,
  filename: 'Cam_2026-10-06_12-00-00.mp4',
  ...over,
});
function bar(client: any, range = { from: now0() - 10 * MIN, to: now0() - 9 * MIN }, onClose = () => {}) {
  return render(
    <ClipBar camId="33" range={range} edge={null} clips={recClips()} onEdge={() => {}} onClose={onClose} />,
    client,
  );
}

describe('ClipBar', () => {
  it('more than 30 min: the end chip is red and Create is locked', async () => {
    await bar(makeClient(), { from: now0() - 100 * MIN, to: now0() - 69 * MIN });
    expect(div.querySelectorAll('.nvr-clipchip')[1]!.className).toContain('nvr-clipchip--bad');
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.tooLong{"max":30}');
    expect((btn('nvr.clip.create') as HTMLButtonElement).disabled).toBe(true);
  });

  it('no recording in the range: locked with a note', async () => {
    await bar(makeClient(), { from: now0() - 300 * MIN, to: now0() - 299 * MIN });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.noRecording');
    expect((btn('nvr.clip.create') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    [new SentinelHttpError(429, 'p', 'busy'), 'nvr.clip.busy'],
    [new SentinelHttpError(507, 'p', 'no space'), 'nvr.clip.noSpace'],
    [new SentinelHttpError(404, 'p', 'no recording'), 'nvr.clip.noRecording'],
    [
      new SentinelHttpError(413, 'p', 'too long', { error: 'too long', maxMs: 1_800_000 }),
      'nvr.clip.tooLong{"max":30}',
    ],
    [
      new SentinelHttpError(409, 'p', 'stream change', { error: 'stream change', at: Date.now() - 5 * MIN }),
      'nvr.clip.streamChange{"time":',
    ],
    [new SentinelHttpError(404, 'p'), 'nvr.clip.oldServer'],
    [new SentinelHttpError(0, 'p'), 'nvr.clip.failed'],
  ])('error %# → its text', async (err, text) => {
    const client = makeClient({ startExport: vi.fn(() => Promise.reject(err)) });
    await bar(client);
    await click(btn('nvr.clip.create'));
    expect(q('.nvr-clipbar__note')?.textContent).toContain(text);
    expect(rlog).toHaveBeenCalledWith('clip', expect.objectContaining({ ok: false }));
  });

  it('progress, then a ready file offered as a link (desktop); closing a RUNNING job cancels it', async () => {
    let state = 'running';
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        Promise.resolve({
          id: 'job1',
          state,
          progress: 0.4,
          bytes: 4_200_000,
          filename: 'Cam.mp4',
          expiresAt: Date.now() + 15 * MIN,
        }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    expect(client.startExport).toHaveBeenCalledWith('33', expect.any(Number), expect.any(Number), expect.any(String));
    await act(async () => {
      await wait(800);
    });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.preparing{"pct":40}');
    // the chips are locked while the job runs
    expect((div.querySelector('.nvr-clipchip') as HTMLButtonElement).disabled).toBe(true);
    state = 'done';
    await act(async () => {
      await wait(800);
    });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.ready');
    const save = btn('nvr.clip.save') as HTMLAnchorElement;
    expect(save.tagName).toBe('A');
    expect(save.getAttribute('href')).toBe('api/export-file?id=job1');
    expect(save.getAttribute('download')).toBe('Cam.mp4');
    expect(btn('nvr.clip.share')).toBeUndefined();
    // closing a finished job does NOT cancel it (a download may still run)
    await act(async () => root!.unmount());
    root = null;
    expect(client.cancelExport).not.toHaveBeenCalled();
  });

  it('closing while the job runs cancels it on the server', async () => {
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() => Promise.resolve({ id: 'job1', state: 'running', progress: 0.1, filename: 'Cam.mp4' })),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => root!.unmount());
    root = null;
    expect(client.cancelExport).toHaveBeenCalledWith('job1');
  });

  it('Cancel stops the job and returns to Create', async () => {
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() => Promise.resolve({ id: 'job1', state: 'running', progress: 0.1, filename: 'Cam.mp4' })),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await click(btn('nvr.clip.cancel'));
    expect(client.cancelExport).toHaveBeenCalledWith('job1');
    expect(btn('nvr.clip.create')).toBeTruthy();
  });

  it('an expired file offers "Create again"', async () => {
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        Promise.resolve({
          id: 'job1',
          state: 'done',
          progress: 1,
          bytes: 1000,
          filename: 'Cam.mp4',
          expiresAt: Date.now() + 50,
        }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(900);
    });
    // (act flushes the "ready" state when it ends; the expiry timer starts only then)
    await act(async () => {
      await wait(50);
    });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.expired');
    expect(btn('nvr.clip.recreate')).toBeTruthy();
    await click(btn('nvr.clip.recreate'));
    expect(client.startExport).toHaveBeenCalledTimes(2);
  });

  it('a new range while the job runs (another event) cancels it and offers Create for the new range', async () => {
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() => Promise.resolve({ id: 'job1', state: 'running', progress: 0.3, filename: 'Cam.mp4' })),
    });
    const r1 = { from: now0() - 10 * MIN, to: now0() - 9 * MIN };
    const el = (range: typeof r1) => (
      <SentinelUiProvider value={{ client, t: t as any, locale: 'de-DE', nav: { openCamera: () => {} } }}>
        <ClipBar camId="33" range={range} edge={null} clips={recClips()} onEdge={() => {}} onClose={() => {}} />
      </SentinelUiProvider>
    );
    await bar(client, r1);
    await click(btn('nvr.clip.create'));
    expect(btn('nvr.clip.cancel')).toBeTruthy();
    await act(async () => root!.render(el({ from: r1.from - 5 * MIN, to: r1.to - 5 * MIN })));
    expect(client.cancelExport).toHaveBeenCalledWith('job1');
    expect(btn('nvr.clip.create')).toBeTruthy();
    expect(q('.nvr-clipbar__note')?.textContent).not.toContain('nvr.clip.preparing');
    // late status answers of the old job change nothing
    await act(async () => {
      await wait(800);
    });
    expect(btn('nvr.clip.save')).toBeUndefined();
  });

  it('a range change while the POST is on its way cancels the job it answers', async () => {
    let resolve: (v: unknown) => void = () => {};
    const client = makeClient({ startExport: vi.fn(() => new Promise((r) => (resolve = r))) });
    const r1 = { from: now0() - 10 * MIN, to: now0() - 9 * MIN };
    await bar(client, r1);
    await click(btn('nvr.clip.create'));
    await act(async () =>
      root!.render(
        <SentinelUiProvider value={{ client, t: t as any, locale: 'de-DE', nav: { openCamera: () => {} } }}>
          <ClipBar
            camId="33"
            range={{ from: r1.from - MIN, to: r1.to }}
            edge={null}
            clips={recClips()}
            onEdge={() => {}}
            onClose={() => {}}
          />
        </SentinelUiProvider>,
      ),
    );
    await act(async () => resolve(START({ id: 'late' })));
    expect(client.cancelExport).toHaveBeenCalledWith('late');
    expect(btn('nvr.clip.create')).toBeTruthy();
  });

  it('a running event says so (its range ends at now − 10 s, no "ends at")', async () => {
    const n = now0();
    await render(
      <ClipBar
        camId="33"
        range={{ from: n - 2 * MIN, to: n - 10_000 }}
        open
        edge={null}
        clips={recClips()}
        onEdge={() => {}}
        onClose={() => {}}
      />,
      makeClient(),
    );
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.eventRunning');
  });

  it('a refused login while polling ends the wait (no endless "Preparing")', async () => {
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() => Promise.reject(new SentinelHttpError(401, 'api/export-status'))),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(800);
    });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.failed');
    expect(client.cancelExport).toHaveBeenCalledWith('job1');
    expect(client.exportStatus).toHaveBeenCalledTimes(1);
  });

  it('a lost poll is retried (no error for a single network failure)', async () => {
    let n = 0;
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        n++ === 0
          ? Promise.reject(new SentinelHttpError(0, 'api/export-status'))
          : Promise.resolve({ id: 'job1', state: 'running', progress: 0.5, filename: 'Cam.mp4' }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(1500);
    });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.preparing{"pct":50}');
  });

  it('409 stream change without a time: the general error, never a bare "{time}"', async () => {
    const client = makeClient({
      startExport: vi.fn(() =>
        Promise.reject(new SentinelHttpError(409, 'p', 'stream change', { error: 'stream change' })),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.failed');
  });

  it('the length is outside the live region (an edge scroll is not read out at every step)', async () => {
    await bar(makeClient());
    const live = div.querySelector('.nvr-clipbar [role="status"]') as HTMLElement;
    expect(live).toBeTruthy();
    expect(live.querySelector('.nvr-clipbar__len')).toBeNull();
    expect(q('.nvr-clipbar__note')?.getAttribute('title')).toContain('nvr.clip.length');
  });

  it('the chips read "From 12:00:00" (label and time apart)', async () => {
    await bar(makeClient());
    const c = div.querySelector('.nvr-clipchip') as HTMLElement;
    expect(c.getAttribute('aria-label')).toMatch(/^nvr\.clip\.from \d\d:\d\d:\d\d$/);
    expect(c.textContent).toMatch(/^nvr\.clip\.from \d\d:\d\d:\d\d$/);
  });

  it('a failed job shows "could not be created"', async () => {
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        Promise.resolve({ id: 'job1', state: 'failed', progress: 0.2, filename: 'x', error: 'ffmpeg' }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(800);
    });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.failed');
  });

  it('plugin on another origin (HAPulse): the file is loaded into the page, Save is a blob link with download', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:xo', revokeObjectURL: vi.fn() }));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array(10)], { type: 'video/mp4' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = makeClient({
      exportFileUrl: (id: string) => `https://nvr.example/endpoint/@local/sentinel-nvr/public/api/export-file?id=${id}`,
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        Promise.resolve({
          id: 'job1',
          state: 'done',
          progress: 1,
          bytes: 150 * 1024 * 1024,
          filename: 'Cam.mp4',
          expiresAt: Date.now() + 15 * MIN,
        }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(800);
    });
    await act(async () => {
      await wait(20);
    });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('https://nvr.example/');
    const save = btn('nvr.clip.save') as HTMLAnchorElement;
    expect(save.tagName).toBe('A');
    expect(save.getAttribute('href')).toBe('blob:xo');
    expect(save.getAttribute('download')).toBe('Cam.mp4');
    expect(save.getAttribute('target')).toBeNull();
    // over 100 MB: no Share
    expect(btn('nvr.clip.share')).toBeUndefined();
  });

  it('another origin above 200 MB: Save opens the file in a new tab (the host page stays), nothing is loaded', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://nvr.example/endpoint/@local/sentinel-nvr/public/api/export-file?id=job1';
    const client = makeClient({
      exportFileUrl: () => url,
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        Promise.resolve({ id: 'job1', state: 'done', progress: 1, bytes: 250 * 1024 * 1024, filename: 'Cam.mp4' }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(800);
    });
    const save = btn('nvr.clip.save') as HTMLAnchorElement;
    expect(save.getAttribute('href')).toBe(url);
    expect(save.getAttribute('target')).toBe('_blank');
    expect(save.hasAttribute('download')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('another origin, loading the file fails: Save falls back to a new tab, never the same tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Load failed'))),
    );
    const url = 'https://nvr.example/endpoint/@local/sentinel-nvr/public/api/export-file?id=job1';
    const client = makeClient({
      exportFileUrl: () => url,
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        Promise.resolve({ id: 'job1', state: 'done', progress: 1, bytes: 1000, filename: 'Cam.mp4' }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(800);
    });
    await act(async () => {
      await wait(20);
    });
    const save = btn('nvr.clip.save') as HTMLAnchorElement;
    expect(save.getAttribute('href')).toBe(url);
    expect(save.getAttribute('target')).toBe('_blank');
    expect(rlog).toHaveBeenCalledWith('clip', expect.objectContaining({ err: 'prefetch', xo: true }));
  });

  it('Share: the file is loaded first ("Loading …"), then share() runs synchronously inside the tap', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare: () => true, share }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate;
        // (a jsdom Blob cannot travel through Node's Response)
        return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array(10)], { type: 'video/mp4' }) };
      }),
    );
    const client = makeClient({
      startExport: vi.fn(() => Promise.resolve(START())),
      exportStatus: vi.fn(() =>
        Promise.resolve({
          id: 'job1',
          state: 'done',
          progress: 1,
          bytes: 10,
          filename: 'Cam.mp4',
          expiresAt: Date.now() + 15 * MIN,
        }),
      ),
    });
    await bar(client);
    await click(btn('nvr.clip.create'));
    await act(async () => {
      await wait(800);
    });
    expect(q('.nvr-clipbar__note')?.textContent).toContain('nvr.clip.loading');
    expect((btn('nvr.clip.share') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      release();
      await wait(20);
    });
    const sb = btn('nvr.clip.share') as HTMLButtonElement;
    expect(sb.disabled).toBe(false);
    // synchronous: called during the click itself, before any await
    sb.click();
    expect(share).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(arg.files?.[0]?.name).toBe('Cam.mp4');
  });
});
