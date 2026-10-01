/**
 * Zoom buttons / ctrl+wheel. The scale (px) used to change in one frame and the scroll position only in the next
 * requestAnimationFrame: for one frame the timeline showed the new scale at the old scroll position (the content jumped),
 * and the follow tick in between read a centre far from the playhead and logged a false `follow-jump` (iPhone 30.09.2026:
 * −3599.6 s right after a zoom step ×1.7). And zooming while the timeline is parked on a scrub target (or paused) anchored
 * at the playhead and lost the parked position.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { VerticalTimeline, type TimelineProps } from '../../src/ui/components/VerticalTimeline';

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
const PX0 = VH / (2 * 3600e3);
const PAD = Math.ceil(VH * 0.35);
/** the time under the playhead line, from the scroll position and a given scale (what the next frame shows) */
const centreAt = (el: HTMLDivElement, rangeEnd: number, px: number) => rangeEnd - (el.scrollTop + VH * 0.35 - PAD) / px;

function setup(following: boolean, playhead: number) {
  const now = Date.now();
  const props: TimelineProps = {
    camId: '33',
    rangeStart: now - 2 * 86400e3,
    rangeEnd: now + 20 * 60e3,
    clips: [],
    events: [],
    motion: [],
    live: false,
    playhead: () => playhead,
    following: () => following,
    filterOff: {},
    onEvent: () => {
      /* */
    },
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
  const el = div.querySelector('.vtl-scroll') as HTMLDivElement;
  const zoomIn = div.querySelector('[aria-label="nvr.timeline.zoomIn"]') as HTMLButtonElement;
  return { props, el, zoomIn, now };
}

describe('VerticalTimeline zoom', () => {
  it('scale and scroll position change in the same frame, around the playhead the view follows', () => {
    const playhead = Date.now() - 3600e3;
    const { props, el, zoomIn } = setup(true, playhead);
    act(() => {
      vi.advanceTimersByTime(200); // the follow tick puts the playhead under the line
    });
    expect(Math.abs(centreAt(el, props.rangeEnd, PX0) - playhead)).toBeLessThan(1000);
    rlog.mockClear(); // that first step from "now" to the playhead is a real jump
    act(() => {
      zoomIn.click();
    });
    // no animation frame has run: the committed frame must already show the new scale around the playhead
    expect(Math.abs(centreAt(el, props.rangeEnd, PX0 * 1.7) - playhead)).toBeLessThan(1000);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(Math.abs(centreAt(el, props.rangeEnd, PX0 * 1.7) - playhead)).toBeLessThan(1000);
    expect(rlog.mock.calls.filter((c) => c[0] === 'follow-jump')).toEqual([]);
  });

  it('zooming while the view is parked (not following) keeps the parked position, not the playhead', () => {
    const playhead = Date.now() - 3600e3;
    const { props, el, zoomIn } = setup(false, playhead);
    // the user scrolls ~2 h back and lets go; the view stays there (following() = false, e.g. settling or paused)
    act(() => {
      el.scrollTop = el.scrollTop + 600;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const parked = centreAt(el, props.rangeEnd, PX0);
    expect(Math.abs(parked - playhead)).toBeGreaterThan(30 * 60e3);
    act(() => {
      zoomIn.click();
    });
    expect(Math.abs(centreAt(el, props.rangeEnd, PX0 * 1.7) - parked)).toBeLessThan(1000);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(Math.abs(centreAt(el, props.rangeEnd, PX0 * 1.7) - parked)).toBeLessThan(1000);
  });
});
