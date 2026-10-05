/**
 * Host links with the playback position: `header` and `externalUrl` may be functions of `at` (ms, `undefined` while
 * live) — HAPulse's "open in Sentinel" and the "open in Safari" link of the PiP note continue at the same moment.
 * Plain values keep working as before.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraPage } from '../../src/ui/components/CameraPage';
import { sentinelTimelineLink } from '../../src/api';
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
    pip() {
      return Promise.resolve('unsupported');
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

const ORIGIN = 'https://nvr.example';
const client = {
  corsMedia: true,
  url: (p: string) => p,
  getJson: () => Promise.resolve({ clips: [], events: [], motion: [], codecs: null }),
  eventThumbUrl: () => '',
  snapshotUrl: () => '',
  segmentThumbUrl: () => '',
} as any;
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

async function render(props: { header?: any; externalUrl?: any }) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await act(async () => {
    root.render(
      <SentinelUiProvider value={{ client, t: (k: string) => k, locale: 'de-DE', nav: { openCamera: () => {} } }}>
        <CameraPage camId="33" name="Cam" storagePrefix="t-" brand="test" renderDatePicker={() => null} {...props} />
      </SentinelUiProvider>,
    );
  });
  return { div, root };
}
const link = (at: number | undefined) => sentinelTimelineLink(ORIGIN, '33', at);
const header = (at: number | undefined) => (
  <a className="open" href={link(at)}>
    open
  </a>
);

afterEach(() => {
  document.body.innerHTML = '';
  emit = null;
});

describe('CameraPage passes the playback position to host links', () => {
  it('header link: live without position, recorded playback and pause with the position on screen', async () => {
    const { div, root } = await render({ header });
    const href = () => (div.querySelector('a.open') as HTMLAnchorElement).getAttribute('href');
    expect(href()).toBe(`${ORIGIN}/endpoint/@local/sentinel-nvr/public/#/timeline/33`);
    const t0 = Date.UTC(2026, 9, 4, 12, 32, 10, 400);
    await act(async () => emit!(state({ live: false, label: 'playing', playhead: t0, transport: 'relay' })));
    expect(href()).toBe(`${ORIGIN}/endpoint/@local/sentinel-nvr/public/#/timeline/33?at=${t0}`);
    // the state follows the picture (timeupdate) — the link follows the state
    await act(async () => emit!(state({ live: false, label: 'playing', playhead: t0 + 2500, transport: 'relay' })));
    expect(href()).toBe(link(t0 + 2500));
    await act(async () => emit!(state({ live: false, label: 'paused', playhead: t0 + 3000, paused: true })));
    expect(href()).toBe(link(t0 + 3000));
    // no recording at the position (playhead null) and back to live: no position
    await act(async () => emit!(state({ live: false, label: 'noRecording', playhead: null })));
    expect(href()).toBe(link(undefined));
    await act(async () => emit!(state({ live: true, label: 'live', playhead: null })));
    expect(href()).toBe(link(undefined));
    root.unmount();
  });

  it('PiP note in a Home-Screen app: "open in Safari" continues at the position', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });
    const { div, root } = await render({ externalUrl: link });
    const t0 = Date.UTC(2026, 9, 4, 12, 32, 10);
    await act(async () => emit!(state({ live: false, label: 'playing', playhead: t0, transport: 'relay' })));
    await act(async () => (div.querySelector('button[aria-label="nvr.player.pip"]') as HTMLButtonElement).click());
    const a = div.querySelector('.nvr-pipnote a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('x-safari-' + link(t0));
    root.unmount();
  });

  it('plain values stay as they are', async () => {
    const { div, root } = await render({
      header: (
        <a className="open" href="/x">
          x
        </a>
      ),
    });
    await act(async () => emit!(state({ live: false, label: 'playing', playhead: 123456, transport: 'relay' })));
    expect((div.querySelector('a.open') as HTMLAnchorElement).getAttribute('href')).toBe('/x');
    root.unmount();
  });
});
