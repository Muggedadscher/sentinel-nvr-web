/**
 * Today refresh (15 s): runs during playback too — new events show up and a running one grows — but waits while the
 * player settles a timeline gesture. The player only gets the new clip list (no seek, no restart).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraPage } from '../../src/ui/components/CameraPage';

const playAt = vi.fn();
const setClips = vi.fn();
let onState: ((s: unknown) => void) | null = null;
let settling = false;
vi.mock('../../src/player', () => ({
  PlayerController: class {
    camId = '';
    camName = '';
    constructor(_c: unknown, o: { onState: (s: unknown) => void }) {
      onState = o.onState;
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
    setClips = setClips;
    playAt = playAt;
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
      /* telemetry */
    }
    currentTs() {
      return null;
    }
    scrubSettling() {
      return settling;
    }
  },
  rlog: () => {
    /* */
  },
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

afterEach(() => {
  vi.useRealTimers();
  settling = false;
});

describe('CameraPage today refresh', () => {
  it('refreshes today during playback (not only live) and hands the player the new clips; waits while a gesture settles', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));
    const today = new Date().setHours(0, 0, 0, 0);
    let todayCalls = 0;
    let evs: { id: string; timestamp: number }[] = [];
    const client = {
      corsMedia: true,
      url: (p: string) => p,
      getJson: (p: string) => {
        const ds = Number(new URL('http://x/' + p).searchParams.get('start'));
        if (ds === today) todayCalls++;
        return Promise.resolve({
          clips: ds === today ? [{ id: 'c1', startTime: today + 3600e3, duration: 60000 }] : [],
          events: ds === today ? evs : [],
          motion: [],
          codecs: 'avc1.42e01f',
        });
      },
      eventThumbUrl: () => '',
      snapshotUrl: () => '',
      segmentThumbUrl: () => '',
    } as any;
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <SentinelUiProvider
          value={{
            client,
            t: (k: string) => k,
            locale: 'de-DE',
            nav: {
              openCamera: () => {
                /* */
              },
            },
          }}
        >
          <CameraPage camId="33" name="Cam" storagePrefix="t-" brand="test" renderDatePicker={() => null} />
        </SentinelUiProvider>,
      );
    });
    expect(todayCalls).toBe(1); // the open
    // the user plays back a recording
    await act(async () => {
      onState!({
        live: false,
        label: 'relay',
        playhead: today + 3600e3,
        rate: 1,
        sound: false,
        paused: false,
        transport: 'relay',
        muted: true,
      });
    });
    evs = [{ id: 'e1', timestamp: Date.now() - 5000 }];
    const before = setClips.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(todayCalls).toBe(2);
    expect(setClips.mock.calls.length).toBeGreaterThan(before);
    expect(playAt).not.toHaveBeenCalled(); // no seek, no restart
    // a settling gesture: the tick is skipped
    settling = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(todayCalls).toBe(2);
    settling = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(todayCalls).toBe(3);
    root.unmount();
  });
});
