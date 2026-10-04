/**
 * Overlapping event markers on the vertical timeline. At the start scale (2 h per screen) a minute is ~5 px and the
 * markers are 9 / 6 px tall: events a minute or two apart lay on top of each other, the stack showed one marker and a
 * tap opened the oldest (drawn last). Now they form one marker with the count; a tap zooms into the group and moves
 * the view (and the video) onto it, without opening an event (user 04.10.2026).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { VerticalTimeline, type TimelineProps } from '../../src/ui/components/VerticalTimeline';
import { groupEvents, groupZoomPx, groupCountLabel, GROUP_PX } from '../../src/ui/timeline-groups';
import type { SentinelEvent } from '../../src/api';

const rlog = vi.hoisted(() => vi.fn());
vi.mock('../../src/player', () => ({ rlog }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver = class {
  observe() {
    /* */
  }
  disconnect() {
    /* */
  }
};
// jsdom has no layout: give elements a plain stored scrollTop
Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
  configurable: true,
  get() {
    return (this as any).__st || 0;
  },
  set(v: number) {
    (this as any).__st = v;
  },
});

const ev = (ts: number, classes: string[] = ['car']): SentinelEvent =>
  ({ id: 'e' + ts, timestamp: ts, classes, score: 0.9 }) as unknown as SentinelEvent;

describe('groupEvents', () => {
  const px = 600 / (2 * 3600e3); // start scale: 2 h per 600 px, 1 min = 5 px
  it('events closer than GROUP_PX form one group, anchored at the newest', () => {
    const t = 1_800_000_000_000;
    // 0 s, −60 s (5 px), −150 s (12.5 px) → one group; −200 s (16.7 px from the newest) starts the next
    const g = groupEvents([ev(t), ev(t - 60e3), ev(t - 150e3), ev(t - 200e3)], px);
    expect(g.map((x) => x.events.length)).toEqual([3, 1]);
    expect(g[0]!.newest.timestamp).toBe(t);
    expect(g[0]!.oldest.timestamp).toBe(t - 150e3);
  });
  it('a long chain does not melt into one group (the next starts GROUP_PX below the newest)', () => {
    const t = 1_800_000_000_000;
    const step = (GROUP_PX * 0.6) / px; // every marker 8.4 px below the previous one
    const evs = Array.from({ length: 10 }, (_, i) => ev(t - i * step));
    const g = groupEvents(evs, px);
    expect(g.map((x) => x.events.length)).toEqual([2, 2, 2, 2, 2]);
  });
  it('without a scale every event stands alone', () => {
    const t = 1_800_000_000_000;
    expect(groupEvents([ev(t), ev(t - 1000)], 0)).toHaveLength(2);
  });
  it('the group takes the most important class of all members', () => {
    const t = 1_800_000_000_000;
    const g = groupEvents([ev(t, ['car']), ev(t - 1000, ['motion']), ev(t - 2000, ['car', 'person'])], px);
    expect(g[0]!.cls).toBe('person');
  });
  it('zoom: the group fills half the screen, at least one zoom step, at most the finest scale', () => {
    const t = 1_800_000_000_000;
    const maxPx = 600 / 120e3;
    const [g] = groupEvents([ev(t), ev(t - 120e3)], px);
    expect(groupZoomPx(g!, px, 600, maxPx)).toBeCloseTo(300 / 120e3, 12); // 2 min → 300 px
    const [tight] = groupEvents([ev(t), ev(t - 1000)], px);
    expect(groupZoomPx(tight!, px, 600, maxPx)).toBe(maxPx);
    expect(groupZoomPx(tight!, maxPx, 600, maxPx)).toBeNull();
    const [wide] = groupEvents([ev(t), ev(t - 160e3)], 600 / (6 * 3600e3)); // 6 h per screen: 160 s = 4.4 px
    expect(groupZoomPx(wide!, 600 / (6 * 3600e3), 600, maxPx)).toBeCloseTo(300 / 160e3, 12);
  });
  it('count label', () => {
    expect(groupCountLabel(3)).toBe('3');
    expect(groupCountLabel(150)).toBe('99+');
  });
});

const client = { eventThumbUrl: () => '' } as any;
let root: Root;
let div: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  rlog.mockClear();
  div = document.createElement('div');
  document.body.appendChild(div);
  root = createRoot(div);
});
afterEach(() => {
  act(() => root.unmount());
  div.remove();
  vi.useRealTimers();
});

function render(props: TimelineProps) {
  act(() => {
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
        <VerticalTimeline {...props} />
      </SentinelUiProvider>,
    );
  });
}

// jsdom: clientHeight 0 → the timeline assumes a 600 px viewport; the start scale shows 2 h per viewport
const VH = 600;
const PAD = Math.ceil(VH * 0.35);
const centreAt = (el: HTMLDivElement, rangeEnd: number, px: number) => rangeEnd - (el.scrollTop + VH * 0.35 - PAD) / px;

function setup(events: SentinelEvent[], playheadAgo = 30 * 60e3) {
  const now = Date.now();
  const onEvent = vi.fn();
  const onSeekTo = vi.fn();
  const props: TimelineProps = {
    camId: '33',
    rangeStart: now - 2 * 86400e3,
    rangeEnd: now + 20 * 60e3,
    // one recording run over the whole range
    clips: [{ startTime: now - 2 * 86400e3, duration: 2 * 86400e3 } as any],
    events,
    motion: [],
    live: false,
    playhead: () => now - playheadAgo,
    following: () => true,
    filterOff: {},
    onEvent,
    onSeekTo,
    onGoLive: () => {
      /* */
    },
    scrub: { begin: vi.fn(), move: vi.fn(), seek: vi.fn(), hold: vi.fn(), idle: vi.fn() },
    onCenter: () => {
      /* */
    },
    jump: null,
  };
  render(props);
  render(props); // second pass: the scale (px) is known now
  act(() => {
    vi.advanceTimersByTime(200); // follow tick: the playhead under the line, visible window rendered
  });
  const el = div.querySelector('.vtl-scroll') as HTMLDivElement;
  return { props, el, onEvent, onSeekTo, now };
}
const groupsIn = () => [...div.querySelectorAll<HTMLButtonElement>('.vev--group')];
const singlesIn = () => [...div.querySelectorAll<HTMLButtonElement>('.vev:not(.vev--group)')];

describe('VerticalTimeline marker groups', () => {
  it('events a minute apart show one marker with the count, a distant one stays a plain marker', () => {
    const now = Date.now();
    const t = now - 30 * 60e3;
    setup([ev(t, ['car']), ev(t - 60e3, ['person']), ev(t - 90e3, ['car']), ev(t - 40 * 60e3, ['car'])]);
    const g = groupsIn();
    expect(g).toHaveLength(1);
    expect(g[0]!.textContent).toBe('3');
    expect(g[0]!.style.background).toBe('var(--nvr-c-person)'); // the most important class of the group
    expect(g[0]!.getAttribute('aria-label')).toMatch(/^nvr\.timeline\.zoomIn: 3 × nvr\.class\.person /);
    expect(singlesIn()).toHaveLength(1);
  });

  it('a tap on the group zooms in around it, moves the view onto it and seeks there — no event opens', () => {
    const now = Date.now();
    const t = now - 30 * 60e3;
    const { props, el, onEvent, onSeekTo } = setup([ev(t), ev(t - 60e3), ev(t - 120e3)]);
    act(() => {
      groupsIn()[0]!.click();
    });
    const mid = t - 60e3;
    const npx = (VH * 0.5) / 120e3; // 2 min fill half the screen
    expect(onEvent).not.toHaveBeenCalled();
    expect(onSeekTo).toHaveBeenCalledTimes(1);
    expect(Math.abs(onSeekTo.mock.calls[0]![0] - mid)).toBeLessThan(1);
    // the committed frame already shows the new scale with the group's middle on the playhead line
    expect(Math.abs(centreAt(el, props.rangeEnd, npx) - mid)).toBeLessThan(1000);
    // the gesture ends like a tap: idle after 250 ms on the group's middle
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(props.scrub.idle).toHaveBeenCalled();
    const idleTs = (props.scrub.idle as any).mock.calls.at(-1)[0];
    expect(Math.abs(idleTs - mid)).toBeLessThan(1000);
    // zoomed in, the three events are 150 px apart: plain markers now
    expect(groupsIn()).toHaveLength(0);
    expect(singlesIn()).toHaveLength(3);
  });

  it('the middle in a recording gap → the view and the video go to the newest event', () => {
    const now = Date.now();
    const t = now - 30 * 60e3;
    const { props, el, onSeekTo } = setup([ev(t), ev(t - 120e3)]);
    // recordings end 30 s before the newest event starts its own clip: the middle (t − 60 s) is not recorded
    const clips = [
      { startTime: t - 200e3, duration: 90e3 },
      { startTime: t - 10e3, duration: 60e3 },
    ] as any;
    render({ ...props, clips });
    act(() => {
      groupsIn()[0]!.click();
    });
    expect(onSeekTo.mock.calls[0]![0]).toBe(t);
    expect(Math.abs(centreAt(el, props.rangeEnd, (VH * 0.5) / 120e3) - t)).toBeLessThan(1000);
  });

  it('at the finest scale a group of events seconds apart opens the newest event, like its thumbnail', () => {
    const now = Date.now();
    const t = now - 30 * 60e3;
    const newest = ev(t);
    const { onEvent, onSeekTo } = setup([newest, ev(t - 1000)]);
    act(() => {
      groupsIn()[0]!.click(); // first tap: to the finest scale (1 s = 5 px, still one group)
    });
    expect(onSeekTo).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(groupsIn()).toHaveLength(1);
    act(() => {
      groupsIn()[0]!.click();
    });
    expect(onEvent).toHaveBeenCalledWith(newest);
    expect(onSeekTo).toHaveBeenCalledTimes(1);
  });

  it('without onSeekTo the tap lands like a scroll release (scrub.seek)', () => {
    const now = Date.now();
    const t = now - 30 * 60e3;
    const { props } = setup([ev(t), ev(t - 60e3)]);
    render({ ...props, onSeekTo: undefined });
    act(() => {
      groupsIn()[0]!.click();
    });
    expect(props.scrub.seek).toHaveBeenCalledTimes(1);
    expect(Math.abs((props.scrub.seek as any).mock.calls[0][0] - (t - 30e3))).toBeLessThan(1);
  });
});
