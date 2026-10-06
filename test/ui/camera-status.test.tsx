/**
 * Recording state on the camera tiles and in the hero pill: a camera whose recording hangs (server watchdog, `stalled`)
 * shows "Aufnahme hängt" instead of looking healthy — also while the restart is pending (`online` false) — and an
 * unreachable camera keeps "Offline".
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { sentinelRecordingState, type SentinelCamera, type SentinelStats } from '../../src/api';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraTiles } from '../../src/ui/components/CameraGrid';
import { Hero } from '../../src/ui/components/Stats';
import { createT } from '../../src/ui/i18n';
import de from '../../src/ui/locales/de.json';
import en from '../../src/ui/locales/en.json';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const cam = (id: string, over: Partial<SentinelCamera> = {}): SentinelCamera => ({
  id,
  name: `Cam ${id}`,
  recording: true,
  online: true,
  eventsToday: 0,
  ...over,
});
const stats = (n: number): SentinelStats => ({
  cameras: n,
  recording: n,
  eventsToday: 0,
  segments: 0,
  bytes: 0,
  retentionDays: 14,
  diskFree: 1e12,
  diskTotal: 2e12,
  minFreeBytes: 1e10,
});

function render(node: React.ReactNode) {
  const client = { snapshotUrl: () => '', segmentThumbUrl: () => '' } as any;
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() =>
    root.render(
      <SentinelUiProvider
        value={{
          client,
          t: createT(de, en, 'de'),
          locale: 'de-DE',
          nav: {
            openCamera: () => {
              /* */
            },
          },
        }}
      >
        {node}
      </SentinelUiProvider>,
    ),
  );
  return { div, done: () => act(() => root.unmount()) };
}

describe('sentinelRecordingState', () => {
  it('off / stalled / offline / ok', () => {
    expect(sentinelRecordingState(cam('a', { recording: false, online: false }))).toBe('off');
    expect(sentinelRecordingState(cam('a', { recording: false, stalled: true }))).toBe('off');
    expect(sentinelRecordingState(cam('a', { stalled: true }))).toBe('stalled');
    // the restart after a stall: ffmpeg briefly down, still "hangs" (not offline)
    expect(sentinelRecordingState(cam('a', { stalled: true, online: false }))).toBe('stalled');
    expect(sentinelRecordingState(cam('a', { online: false }))).toBe('offline');
    expect(sentinelRecordingState(cam('a'))).toBe('ok');
    // servers before the watchdog send no `stalled`
    expect(sentinelRecordingState({ recording: true, online: true })).toBe('ok');
  });
});

describe('camera tiles', () => {
  it('badge per state, recording dot only while recording', () => {
    const { div, done } = render(
      <CameraTiles
        cameras={[cam('1'), cam('2', { stalled: true }), cam('3', { online: false }), cam('4', { recording: false })]}
      />,
    );
    const tiles = [...div.querySelectorAll('.nvr-camtile')];
    const badge = (i: number) => tiles[i].querySelector('.nvr-camtile__offline')?.textContent ?? null;
    const dotOff = (i: number) =>
      tiles[i].querySelector('.nvr-camtile__dot')?.classList.contains('nvr-camtile__dot--off');
    expect(badge(0)).toBeNull();
    expect(dotOff(0)).toBe(false);
    expect(badge(1)).toBe('Aufnahme hängt');
    expect(dotOff(1)).toBe(true);
    expect(tiles[1].classList.contains('nvr-camtile--badged')).toBe(true);
    expect(badge(2)).toBe('Offline');
    expect(badge(3)).toBeNull();
    expect(tiles[3].querySelector('.nvr-camtile__dot')).toBeNull();
    done();
  });
});

describe('hero pill', () => {
  const pill = (div: HTMLElement) => div.querySelector('.nvr-hero__head .nvr-pill')!;
  it('all fine', () => {
    const { div, done } = render(<Hero cameras={[cam('1'), cam('2')]} stats={stats(2)} />);
    expect(pill(div).textContent).toBe('Alle Kameras online');
    expect(pill(div).classList.contains('nvr-pill--positive')).toBe(true);
    done();
  });
  it('a hanging recording: own text, counted online (also during its restart)', () => {
    const { div, done } = render(
      <Hero cameras={[cam('1'), cam('2', { stalled: true, online: false })]} stats={stats(2)} />,
    );
    expect(pill(div).textContent).toBe('1 Aufnahme hängt');
    expect(pill(div).classList.contains('nvr-pill--danger')).toBe(true);
    expect(div.textContent).not.toContain('offline');
    done();
  });
  it('offline and hanging together', () => {
    const { div, done } = render(
      <Hero
        cameras={[cam('1', { online: false }), cam('2', { stalled: true }), cam('3', { stalled: true })]}
        stats={stats(3)}
      />,
    );
    expect(pill(div).textContent).toBe('1 Kamera offline · 2 Aufnahmen hängen');
    done();
  });
});
