/**
 * Picture-in-Picture refused: iPhone/iPad Home-Screen apps (Apple blocks PiP there) get a note with "open in Safari"
 * (x-safari-https on iOS 17+), other browsers a plain note; a working PiP shows nothing.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraPage } from '../../src/ui/components/CameraPage';

let pipResult: string = 'unsupported';
const rlog = vi.fn();
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
      return Promise.resolve(pipResult);
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

const EXT = 'https://nvr.example/endpoint/@local/sentinel-nvr/public/#/timeline/33';
const client = {
  corsMedia: true,
  url: (p: string) => p,
  getJson: () => Promise.resolve({ clips: [], events: [], motion: [], codecs: null }),
  eventThumbUrl: () => '',
  snapshotUrl: () => '',
  segmentThumbUrl: () => '',
} as any;

function setNavigator(standalone: boolean | undefined, ua: string) {
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

async function renderAndClickPip(externalUrl?: string) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await act(async () => {
    root.render(
      <SentinelUiProvider value={{ client, t: (k: string) => k, locale: 'de-DE', nav: { openCamera: () => {} } }}>
        <CameraPage
          camId="33"
          name="Cam"
          storagePrefix="t-"
          brand="test"
          renderDatePicker={() => null}
          externalUrl={externalUrl}
        />
      </SentinelUiProvider>,
    );
  });
  const btn = div.querySelector('button[aria-label="nvr.player.pip"]') as HTMLButtonElement;
  await act(async () => {
    btn.click();
  });
  return { div, root };
}

afterEach(() => {
  document.body.innerHTML = '';
  pipResult = 'unsupported';
});

describe('CameraPage picture-in-picture note', () => {
  it('Home-Screen app on iOS 18: note + "open in Safari" via x-safari-https', async () => {
    setNavigator(true, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15');
    const { div, root } = await renderAndClickPip(EXT);
    const note = div.querySelector('.nvr-pipnote');
    expect(note?.textContent).toContain('nvr.player.pipHomeScreen');
    const a = note?.querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('x-safari-' + EXT);
    await act(async () => {
      (note?.querySelector('button') as HTMLButtonElement).click();
    });
    expect(div.querySelector('.nvr-pipnote')).toBeNull();
    root.unmount();
  });

  it('other browsers without PiP: plain note, no Safari link', async () => {
    setNavigator(undefined, 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0');
    const { div, root } = await renderAndClickPip(EXT);
    const note = div.querySelector('.nvr-pipnote');
    expect(note?.textContent).toContain('nvr.player.pipUnsupported');
    expect(note?.querySelector('a')).toBeNull();
    root.unmount();
  });

  it('PiP that works (or fails for another reason) shows no note', async () => {
    setNavigator(true, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15');
    for (const r of ['entered', 'exited', 'failed']) {
      pipResult = r;
      const { div, root } = await renderAndClickPip(EXT);
      expect(div.querySelector('.nvr-pipnote'), r).toBeNull();
      root.unmount();
    }
  });
});
