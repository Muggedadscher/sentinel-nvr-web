/**
 * "Events (N)" tab: the number counts only the day centred in the timeline (the date chip's day). On today it matches the
 * overview tile's "N today", while the list below keeps every loaded day (today and yesterday on open).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraPage } from '../../src/ui/components/CameraPage';

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
      /* telemetry */
    }
    currentTs() {
      return null;
    }
    scrubSettling() {
      return false;
    }
  },
  rlog: () => {
    /* */
  },
}));
// the real timeline needs layout (scrollTop/clientHeight); the mock hands out onCenter like a scroll would call it
let center: ((ts: number) => void) | null = null;
vi.mock('../../src/ui/components/VerticalTimeline', () => ({
  VerticalTimeline: (p: { onCenter: (ts: number) => void }) => {
    center = p.onCenter;
    return null;
  },
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  center = null;
});

describe('CameraPage events tab number', () => {
  it('counts the centred day only, the list keeps every loaded day', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    const today = new Date().setHours(0, 0, 0, 0);
    const yesterday = new Date(2026, 9, 3).getTime();
    const ev = (id: string, timestamp: number) => ({ id, timestamp, classes: ['person'] });
    const byDay: Record<number, ReturnType<typeof ev>[]> = {
      [today]: [ev('t1', today + 3600e3), ev('t2', today + 2 * 3600e3), ev('t3', today + 3 * 3600e3)],
      [yesterday]: [ev('y1', yesterday + 3600e3), ev('y2', yesterday + 20 * 3600e3)],
    };
    const client = {
      corsMedia: true,
      url: (p: string) => p,
      getJson: (p: string) => {
        const ds = Number(new URL('http://x/' + p).searchParams.get('start'));
        return Promise.resolve({ clips: [], events: byDay[ds] ?? [], motion: [], codecs: 'avc1.42e01f' });
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
    const tab = () =>
      [...div.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.startsWith('nvr.tab.events'))!;
    // opened on today: today and yesterday are loaded (5 events), the number says today's 3
    expect(tab().textContent).toBe('nvr.tab.events (3)');

    // the timeline scrolls back to yesterday: its 2 (the day before is loaded on demand and has none)
    await act(async () => center!(yesterday + 12 * 3600e3));
    expect(tab().textContent).toBe('nvr.tab.events (2)');

    // the list still shows every loaded day
    await act(async () => (tab() as HTMLButtonElement).click());
    for (const hhmm of ['01:00:00', '02:00:00', '03:00:00', '20:00:00']) expect(div.textContent).toContain(hhmm);
    expect(div.textContent!.split('nvr.class.person').length - 1).toBe(5);

    // a day without events: no number
    await act(async () => center!(new Date(2026, 9, 2, 12).getTime()));
    expect(tab().textContent).toBe('nvr.tab.events');

    // class filter off for the only class: the number follows the filter like the list
    await act(async () => center!(today + 12 * 3600e3));
    expect(tab().textContent).toBe('nvr.tab.events (3)');
    await act(async () => (div.querySelector('.nvr-fchip') as HTMLButtonElement).click());
    expect(tab().textContent).toBe('nvr.tab.events');
    act(() => root.unmount());
  });
});
