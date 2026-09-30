/**
 * The page moves the timeline's rangeEnd forward every 30 s ("now + 20 min"), and the timeline compensates its scroll
 * position at once. The hold (250 ms) and idle (700 ms) timers of a gesture run closures of an older render — they used to
 * compute the centre with the OLD rangeEnd and the compensated scroll position, i.e. 30 s too early, and sent that as
 * the scrub target: the video landed 30 s beside the timeline (lab 30.09.2026).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { VerticalTimeline, type TimelineProps } from '../../src/ui/components/VerticalTimeline';

vi.mock('../../src/player', () => ({
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

describe('VerticalTimeline gesture targets across a range move', () => {
  it('hold and idle send the centre the timeline shows, also when rangeEnd moved in between', () => {
    const now = Date.now();
    const scrub = { begin: vi.fn(), move: vi.fn(), seek: vi.fn(), hold: vi.fn(), idle: vi.fn() };
    const props: TimelineProps = {
      camId: '33',
      rangeStart: now - 2 * 86400e3,
      rangeEnd: now + 20 * 60e3,
      clips: [],
      events: [],
      motion: [],
      live: false,
      playhead: () => null,
      following: () => false,
      filterOff: {},
      onEvent: () => {
        /* */
      },
      onGoLive: () => {
        /* */
      },
      scrub,
      onCenter: () => {
        /* */
      },
      jump: null,
    };
    render(props);
    render(props); // second pass: the scale (px) is known now
    const el = div.querySelector('.vtl-scroll') as HTMLDivElement;
    const label = () => Number(div.querySelector('.vcenter-t')!.getAttribute('data-ts'));
    act(() => {
      vi.advanceTimersByTime(200); // past the own-scroll window of the initial positioning
    });
    // the user scrolls ~2 h back
    act(() => {
      el.scrollTop = el.scrollTop + 600;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const shown = label();
    expect(scrub.move).toHaveBeenCalled();
    expect(now - shown).toBeGreaterThan(3600e3);
    // 100 ms later the page's 30-s tick moves rangeEnd forward
    act(() => {
      vi.advanceTimersByTime(100);
    });
    render({ ...props, rangeEnd: props.rangeEnd + 30_000 });
    expect(Math.abs(label() - shown)).toBeLessThan(1000); // the view stays put
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(scrub.hold).toHaveBeenCalledTimes(1);
    expect(Math.abs(scrub.hold.mock.calls[0]![0] - shown)).toBeLessThan(1000);
    expect(scrub.idle).toHaveBeenCalledTimes(1);
    expect(Math.abs(scrub.idle.mock.calls[0]![0] - shown)).toBeLessThan(1000);
  });
});
