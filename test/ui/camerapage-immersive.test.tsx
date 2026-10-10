/**
 * The immersive appearance (0.18.0) is opt-in: `appearance="immersive"` sets `data-nvr-appearance` on the page (and
 * `data-active` on the tabs, for the segment's lens); every new rule is scoped to it (immersive-css.test.ts). Without
 * it the page renders exactly the markup of 0.17.1 (fixture) — Sentinel's own UI and hosts that do not opt in look as
 * before. `header` as a function also gets `{ live }`; `CameraTitle` shows "LIVE" or the picture's time when the host
 * passes them, and the row is unchanged when it does not. Clip mode (0.19.0): only the immersive page puts the edges
 * in a segment (`data-edge`, and `data-was` for its lens).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraPage, CameraTitle } from '../../src/ui/components/CameraPage';
import { fmtTimeSec } from '../../src/api';
import type { PlayerState } from '../../src/player';

let emit: ((s: PlayerState) => void) | null = null;
vi.mock('../../src/player', () => ({
  PlayerController: class {
    camId = '';
    constructor(_c: unknown, opts: { onState: (s: PlayerState) => void }) {
      emit = opts.onState;
    }
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
    playAt() {
      /* */
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
      return null;
    }
    scrubSettling() {
      return false;
    }
  },
  rlog: () => {},
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

const client = {
  corsMedia: true,
  url: (p: string) => p,
  getJson: () => Promise.resolve({ clips: [], events: [], motion: [] }),
  eventThumbUrl: () => '',
  snapshotUrl: () => '',
  segmentThumbUrl: () => '',
} as any;
const ui = { client, t: (k: string) => k, locale: 'de-DE', nav: { openCamera: () => {} } };
const state = (s: Partial<PlayerState>): PlayerState => ({
  live: true,
  label: 'live',
  playhead: null,
  rate: 1,
  sound: false,
  paused: false,
  transport: 'webrtc',
  muted: true,
  ...s,
});

async function render(node: React.ReactNode) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await act(async () => {
    root.render(<SentinelUiProvider value={ui}>{node}</SentinelUiProvider>);
  });
  return { div, root };
}
/** the markup without what is not this component's: the timeline's content (its own component, time-dependent) and
 *  the icons' drawing (lucide's paths change with its version) */
function markup(div: HTMLElement): string {
  const c = div.cloneNode(true) as HTMLElement;
  for (const el of c.querySelectorAll('.nvr-vtl')) el.replaceChildren();
  return c.innerHTML.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/g, '<svg></svg>');
}
// vitest runs from the package root
const FIXTURE = () => readFileSync(resolve('test/ui/fixtures/camerapage-default-0.17.1.html'), 'utf8');
const page = (props: Record<string, unknown> = {}) => (
  <CameraPage
    camId="33"
    name="Cam"
    storagePrefix="t-"
    brand="test"
    renderDatePicker={() => null}
    header={
      <CameraTitle name="Cam" onBack={() => {}}>
        <a href="#x">x</a>
      </CameraTitle>
    }
    {...props}
  />
);

beforeEach(() => {
  // the date chip names the day: a fixed clock (local noon, so the same day in every time zone of test:tz)
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  emit = null;
});

describe('CameraPage appearance', () => {
  it('default: exactly the markup of 0.17.1', async () => {
    const fixture = FIXTURE();
    for (const props of [{}, { appearance: 'default' }]) {
      const { div, root } = await render(page(props));
      expect(markup(div)).toBe(fixture);
      // also after switching tabs: nothing new appears
      await act(async () => (div.querySelectorAll('.nvr-tabs button')[1] as HTMLButtonElement).click());
      expect(div.querySelector('.nvr-tabs')!.hasAttribute('data-active')).toBe(false);
      root.unmount();
    }
  });

  it('immersive: the attributes on the page and the tabs, the same parts inside', async () => {
    const { div, root } = await render(page({ appearance: 'immersive' }));
    const cam = div.querySelector('.nvr-cam')!;
    expect(cam.getAttribute('data-nvr-appearance')).toBe('immersive');
    const html = markup(div);
    expect(html).toContain('<div class="nvr-tabs" role="tablist" data-active="tl">');
    expect(html.replace(' data-nvr-appearance="immersive"', '').replace(' data-active="tl"', '')).toBe(FIXTURE());
    root.unmount();
  });

  it('immersive: the tabs carry the chosen tab (data-active, for the sliding lens)', async () => {
    const { div, root } = await render(page({ appearance: 'immersive' }));
    const tabs = div.querySelector('.nvr-tabs')!;
    expect(tabs.getAttribute('data-active')).toBe('tl');
    await act(async () => (tabs.querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(tabs.getAttribute('data-active')).toBe('ev');
    root.unmount();
  });

  it('clip mode: the edges as a segment only on the immersive page (0.19.0), its lens knows the edge before', async () => {
    // a plugin with the clip export
    const getJson = client.getJson;
    client.getJson = () => Promise.resolve({ clips: [], events: [], motion: [], features: ['export'] });
    try {
      for (const appearance of ['default', 'immersive']) {
        const { div, root } = await render(page({ appearance }));
        const download = div.querySelector('[aria-label="nvr.clip.download"]') as HTMLButtonElement;
        await act(async () => download.click());
        expect(div.querySelector('.nvr-clipbar')).not.toBeNull();
        const seg = div.querySelector('.nvr-clipbar__row > .nvr-clipbar__edges');
        if (appearance === 'default') {
          expect(seg).toBeNull();
          root.unmount();
          continue;
        }
        expect(seg).not.toBeNull();
        expect(seg!.hasAttribute('data-edge')).toBe(false);
        const chips = () => seg!.querySelectorAll<HTMLButtonElement>('.nvr-clipchip');
        // none → "To": the lens appears where it is (no edge before)
        await act(async () => chips()[1]!.click());
        expect([seg!.getAttribute('data-edge'), seg!.getAttribute('data-was')]).toEqual(['to', null]);
        // "To" → "From": it slides
        await act(async () => chips()[0]!.click());
        expect([seg!.getAttribute('data-edge'), seg!.getAttribute('data-was')]).toEqual(['from', 'to']);
        // "From" off: it goes where it is
        await act(async () => chips()[0]!.click());
        expect([seg!.getAttribute('data-edge'), seg!.getAttribute('data-was')]).toEqual([null, 'from']);
        root.unmount();
      }
    } finally {
      client.getJson = getJson;
    }
  });
});

describe('header info and the badge next to the name', () => {
  it('a header function gets the position and { live }', async () => {
    const seen: [number | undefined, boolean][] = [];
    const header = (at: number | undefined, info: { live: boolean }) => {
      seen.push([at, info.live]);
      return <span className="h">{info.live ? 'live' : String(at ?? 'none')}</span>;
    };
    const { div, root } = await render(page({ header }));
    const text = () => div.querySelector('.h')!.textContent;
    expect(text()).toBe('live');
    // a recording loads: not live, no position yet (the badge must not say LIVE then)
    await act(async () => emit!(state({ live: false, label: 'loading', playhead: null, transport: 'relay' })));
    expect(text()).toBe('none');
    const t0 = new Date(2026, 9, 10, 11, 32, 10).getTime();
    await act(async () => emit!(state({ live: false, label: 'playing', playhead: t0, transport: 'relay' })));
    expect(text()).toBe(String(t0));
    expect(seen.at(-1)).toEqual([t0, false]);
    root.unmount();
  });

  it('CameraTitle without live/at: the row as before (no wrapper, no badge)', async () => {
    const { div, root } = await render(<CameraTitle name="Cam" onBack={() => {}} />);
    expect(div.querySelector('.nvr-cam__name')).toBeNull();
    expect(div.querySelector('.nvr-cam__badge')).toBeNull();
    expect(div.querySelector('.nvr-cam__title > h1.nvr-cam__h1')!.textContent).toBe('Cam');
    root.unmount();
  });

  it('live: the LIVE badge next to the name', async () => {
    const { div, root } = await render(<CameraTitle name="Cam" onBack={() => {}} live at={undefined} />);
    expect(div.querySelector('.nvr-cam__name > h1.nvr-cam__h1')!.textContent).toBe('Cam');
    const b = div.querySelector('.nvr-cam__badge--live')!;
    expect(b.textContent).toBe('nvr.live');
    expect(div.querySelector('.nvr-cam__badge--time')).toBeNull();
    root.unmount();
  });

  it('a recording: the picture time, with the day in front on another day', async () => {
    const today = new Date(2026, 9, 10, 11, 32, 10).getTime();
    const { div, root } = await render(<CameraTitle name="Cam" onBack={() => {}} live={false} at={today} />);
    const time = () => div.querySelector('.nvr-cam__badge--time')!.textContent;
    expect(time()).toBe(fmtTimeSec(today, 'de-DE'));
    expect(div.querySelector('.nvr-cam__badge--live')).toBeNull();
    const yesterday = new Date(2026, 9, 9, 23, 59, 58).getTime();
    await act(async () =>
      root.render(
        <SentinelUiProvider value={ui}>
          <CameraTitle name="Cam" onBack={() => {}} live={false} at={yesterday} />
        </SentinelUiProvider>,
      ),
    );
    expect(time()).toBe(`gestern ${fmtTimeSec(yesterday, 'de-DE')}`);
    const older = new Date(2026, 9, 3, 8, 0, 0).getTime();
    await act(async () =>
      root.render(
        <SentinelUiProvider value={ui}>
          <CameraTitle name="Cam" onBack={() => {}} live={false} at={older} />
        </SentinelUiProvider>,
      ),
    );
    expect(time()).toBe(`3.10. ${fmtTimeSec(older, 'de-DE')}`);
    root.unmount();
  });

  it('neither live nor a position (a recording loads): no badge', async () => {
    const { div, root } = await render(<CameraTitle name="Cam" onBack={() => {}} live={false} at={undefined} />);
    expect(div.querySelector('.nvr-cam__badge')).toBeNull();
    expect(div.querySelector('.nvr-cam__name')).toBeNull();
    root.unmount();
  });
});
