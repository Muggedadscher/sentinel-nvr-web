/**
 * The Glas components (0.21.0, moved from HAPulse): a camera tile is the button with `data-nvr-camera` and its picture
 * box as direct child (a host's transition between tile and camera page finds it there), opening goes through the host
 * (a tile with the camera alone, an event with its moment), the strip's buttons appear only where it can scroll, a
 * failed snapshot keeps its fallback until a background probe loads, the overview has its section titles, and the
 * tafel head says the state as the classic hero does. Without the new prop the hero stays the classic one.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import type { SentinelCamera, SentinelRecentEvent, SentinelStats } from '../../src/api';
import { SentinelUiProvider } from '../../src/ui/context';
import { GlassNvr, GlassSections } from '../../src/ui/components/Glass';
import { Hero, HistogramCard } from '../../src/ui/components/Stats';
import { AppearanceSection, type AppearanceProps } from '../../src/ui/components/Appearance';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const cam = (id: string, extra: Partial<SentinelCamera> = {}): SentinelCamera => ({
  id,
  name: `Cam ${id}`,
  recording: true,
  online: true,
  eventsToday: 2,
  ...extra,
});
const ev = (camera: string, ts: number): SentinelRecentEvent =>
  ({ camera, cameraName: `Cam ${camera}`, ts, timestamp: ts, classes: ['person'] }) as unknown as SentinelRecentEvent;

function render(node: ReactNode) {
  const openCamera = vi.fn();
  const client = {
    snapshotUrl: (id: string, tick: number) => `snap/${id}?${tick}`,
    segmentThumbUrl: (id: string) => `thumb/${id}`,
    eventThumbUrl: (c: string, ts: number) => `ev/${c}/${ts}`,
  } as any;
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() =>
    root.render(
      <SentinelUiProvider
        value={{
          client,
          t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k),
          locale: 'de-DE',
          nav: { openCamera },
        }}
      >
        {node}
      </SentinelUiProvider>,
    ),
  );
  return { div, openCamera, done: () => act(() => root.unmount()) };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('GlassNvr', () => {
  it('a tile is the button with the camera id, its picture box the first child; opening goes through the host', () => {
    const { div, openCamera, done } = render(
      <GlassNvr cameras={[cam('1'), cam('2', { online: false })]} events={[ev('2', 100_000)]} />,
    );
    const tile = div.querySelector<HTMLButtonElement>('[data-nvr-camera="1"]')!;
    expect(tile.tagName).toBe('BUTTON');
    expect(tile.className).toBe('nvr-gl__cam');
    expect(tile.firstElementChild?.className).toBe('nvr-camtile__pic');
    expect(tile.closest('.nvr-gl__cams')?.hasAttribute('data-several')).toBe(true);
    expect(div.querySelector('[data-nvr-camera="2"]')!.getAttribute('data-state')).toBe('offline');
    expect(div.querySelector('[data-nvr-camera="1"] .nvr-gl__pill')!.className).toBe(
      'nvr-gl__pill nvr-glass nvr-glass--clear',
    );
    act(() => tile.click());
    expect(openCamera).toHaveBeenLastCalledWith('1');
    act(() => div.querySelector<HTMLButtonElement>('.nvr-gl__ev')!.click());
    // the moment the classic event list plays from (3 s before the trigger), and the event itself
    expect(openCamera).toHaveBeenLastCalledWith('2', 97_000, 100_000);
    // several cameras: each event names its camera
    expect(div.querySelector('.nvr-gl__ev-sub')!.textContent).toContain('Cam 2');
    done();
  });

  it('no cameras: while loading a calm placeholder, then the text', () => {
    let r = render(<GlassNvr cameras={[]} events={[]} loading />);
    expect(r.div.querySelector('.nvr-gl__wait')).not.toBeNull();
    r.done();
    r = render(<GlassNvr cameras={[]} events={[]} />);
    expect(r.div.querySelector('.nvr-gl__empty')!.textContent).toBe('nvr.cameras.none');
    expect(r.div.querySelector('.nvr-gl__events')).toBeNull();
    r.done();
  });

  it('a failed snapshot keeps the thumbnail until a background probe loads, then the snapshot comes back', () => {
    vi.useFakeTimers();
    const probes: HTMLImageElement[] = [];
    const Orig = window.Image;
    (window as any).Image = function () {
      const img = new Orig();
      probes.push(img);
      return img;
    };
    const { div, done } = render(
      <GlassNvr cameras={[cam('1', { latestThumbId: 'x' })]} events={[]} refreshMs={5000} />,
    );
    const img = () => div.querySelector<HTMLImageElement>('.nvr-camtile__pic > img')!;
    expect(img().getAttribute('src')).toMatch(/^snap\/1/);
    act(() => img().dispatchEvent(new Event('error')));
    expect(img().getAttribute('src')).toBe('thumb/x');
    // the refresh does not switch back by itself
    act(() => vi.advanceTimersByTime(25_000));
    expect(img().getAttribute('src')).toBe('thumb/x');
    // 30 s: a probe in the background; only its load brings the snapshot back
    act(() => vi.advanceTimersByTime(5_000));
    expect(probes.length).toBe(1);
    act(() => probes[0]!.onload?.(new Event('load')));
    expect(img().getAttribute('src')).toMatch(/^snap\/1/);
    (window as any).Image = Orig;
    done();
  });

  it('the strip shows a button only towards where it can scroll', () => {
    const { div, done } = render(<GlassNvr cameras={[cam('1'), cam('2')]} events={[]} />);
    expect(div.querySelectorAll('.nvr-gl__paddle').length).toBe(0); // jsdom: nothing overflows
    done();
  });
});

describe('GlassSections', () => {
  it('cameras first, then events, each with its title; no events, no section', () => {
    let r = render(<GlassSections cameras={[cam('1')]} events={[ev('1', 5)]} />);
    const titles = [...r.div.querySelectorAll('.nvr-gl-page > .nvr-section > .nvr-section__label')].map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['nvr.cameras.title', 'nvr.events.title']);
    // one camera: the events do not name it
    expect(r.div.querySelector('.nvr-gl__ev-sub')!.textContent).not.toContain('Cam 1');
    r.done();
    r = render(<GlassSections cameras={[cam('1')]} events={[]} />);
    expect(r.div.querySelectorAll('.nvr-section').length).toBe(1);
    r.done();
  });
});

describe('Hero', () => {
  const stats = {
    cameras: 2,
    recording: 2,
    eventsToday: 1234,
    bytes: 1e12,
    storageOk: true,
  } as unknown as SentinelStats;

  it('without the prop the classic hero', () => {
    const { div, done } = render(<Hero cameras={[cam('1'), cam('2')]} stats={stats} />);
    expect(div.querySelector('.nvr-hero')).not.toBeNull();
    expect(div.querySelector('.nvr-tafel')).toBeNull();
    done();
  });

  it('glass: the tafel, the state in its tone, problems apart', () => {
    let r = render(<Hero cameras={[cam('1'), cam('2')]} stats={stats} appearance="glass" />);
    const card = r.div.querySelector('.nvr-tafel')!;
    expect(card.className).toBe('nvr-card nvr-tafel nvr-tafel--ok');
    expect(r.div.querySelector('.nvr-tafel__title')!.getAttribute('data-tone')).toBe('ok');
    expect([...r.div.querySelectorAll('.nvr-tafel__cell')].map((c) => c.getAttribute('data-tafel'))).toEqual([
      'events',
      'recording',
      'storage',
      'retention',
    ]);
    expect(r.div.querySelector('[data-tafel="events"] .nvr-tafel__value')!.textContent).toBe('1.234');
    r.done();
    r = render(
      <Hero
        cameras={[cam('1', { online: false }), cam('2', { stalled: true } as Partial<SentinelCamera>)]}
        stats={stats}
        appearance="glass"
      />,
    );
    expect(r.div.querySelector('.nvr-tafel')!.className).toContain('nvr-tafel--problem');
    expect(r.div.querySelectorAll('.nvr-tafel__part').length).toBeGreaterThanOrEqual(1);
    r.done();
  });

  it('the stat cards carry nvr-statcard (no rule in Klassisch)', () => {
    const { div, done } = render(<HistogramCard histogram={new Array(24).fill(0)} />);
    expect(div.querySelector('.nvr-card.nvr-statcard')).not.toBeNull();
    done();
  });
});

describe('AppearanceSection: the style', () => {
  const base: AppearanceProps = {
    theme: 'aurora',
    mode: 'light',
    language: 'auto',
    languages: [],
    onTheme: () => {},
    onMode: () => {},
    onAccent: () => {},
    onLanguage: () => {},
  };
  const labels = (div: HTMLElement) => [...div.querySelectorAll('.nvr-set__label')].map((l) => l.textContent);

  it('Klassisch: the style row above the rest, the theme cards stay', () => {
    const onUiStyle = vi.fn();
    const { div, done } = render(<AppearanceSection {...base} uiStyle="classic" onUiStyle={onUiStyle} />);
    expect(labels(div)[0]).toBe('nvr.settings.style');
    expect(labels(div)).not.toContain('nvr.settings.glassStrength');
    expect(div.querySelector('.nvr-swatches')).not.toBeNull();
    const glas = [...div.querySelectorAll<HTMLButtonElement>('.nvr-seg__btn')].find(
      (b) => b.textContent === 'nvr.settings.style.glas',
    )!;
    act(() => glas.click());
    expect(onUiStyle).toHaveBeenCalledWith('glas');
    done();
  });

  it('Glas: strength and reduce transparency, a hint instead of the theme cards, the accent stays', () => {
    const onGlassStrength = vi.fn();
    const onReduceTransparency = vi.fn();
    const { div, done } = render(
      <AppearanceSection
        {...base}
        uiStyle="glas"
        onUiStyle={() => {}}
        glassStrength="tinted"
        onGlassStrength={onGlassStrength}
        reduceTransparency={false}
        onReduceTransparency={onReduceTransparency}
      />,
    );
    expect(labels(div).slice(0, 3)).toEqual([
      'nvr.settings.style',
      'nvr.settings.glassStrength',
      'nvr.settings.reduceTransparency',
    ]);
    expect(div.querySelector('.nvr-swatches')).toBeNull();
    expect(div.textContent).toContain('nvr.settings.theme.glasHint');
    expect(div.querySelector('.nvr-accent__slider')).not.toBeNull();
    const active = [...div.querySelectorAll('.nvr-seg__btn--active')].map((b) => b.textContent);
    expect(active).toContain('nvr.settings.glassStrength.tinted');
    act(() =>
      [...div.querySelectorAll<HTMLButtonElement>('.nvr-seg__btn')]
        .find((b) => b.textContent === 'nvr.settings.glassStrength.opaque')!
        .click(),
    );
    expect(onGlassStrength).toHaveBeenCalledWith('opaque');
    const sw = div.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    act(() => sw.click());
    expect(onReduceTransparency).toHaveBeenCalledWith(true);
    done();
  });
});
