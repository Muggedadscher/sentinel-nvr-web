/**
 * The tiles' snapshot changes every few seconds without a gap (0.22.0, user 25.11.2026: "schwarzes Flickern"): the next
 * picture loads in a second <img> under the shown one and comes to the front only once loaded and decoded. Before, one
 * <img> changed its `src`, and WebKit painted nothing while it decoded the new picture — the dark tile showed through.
 * Both the classic tiles (`CameraTiles`) and the Glas tiles (`GlassNvr`) go through `SnapshotImage`.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import type { SentinelCamera } from '../../src/api';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraTiles } from '../../src/ui/components/CameraGrid';
import { GlassNvr } from '../../src/ui/components/Glass';
import { nextSlots } from '../../src/ui/components/SnapshotImage';
import { lastTileSnapshot } from '../../src/ui/snapshot-cache';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const cam = (id: string, extra: Partial<SentinelCamera> = {}): SentinelCamera => ({
  id,
  name: `Cam ${id}`,
  recording: true,
  online: true,
  eventsToday: 0,
  ...extra,
});

function render(node: ReactNode) {
  const client = {
    snapshotUrl: (id: string, tick: number) => `snap/${id}?${tick}`,
    segmentThumbUrl: (id: string) => `thumb/${id}`,
  } as any;
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() =>
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
        {node}
      </SentinelUiProvider>,
    ),
  );
  return { div, done: () => act(() => root.unmount()) };
}

/** Each <img> decodes when the test says so (`decoded(img)`), or fails to (`undecodable(img)`). */
const pending = new Map<HTMLImageElement, { ok: () => void; fail: (e: Error) => void }>();
function decodeOnCall() {
  // jsdom has no decode()
  (HTMLImageElement.prototype as any).decode = function (this: HTMLImageElement) {
    return new Promise<void>((ok, fail) => pending.set(this, { ok, fail }));
  };
}
const loads = (img: HTMLImageElement) => act(async () => void img.dispatchEvent(new Event('load')));
const decoded = (img: HTMLImageElement) => act(async () => pending.get(img)!.ok());
const fails = (img: HTMLImageElement) => act(async () => void img.dispatchEvent(new Event('error')));

const imgs = (div: HTMLElement, id: string) => [
  ...div.querySelectorAll<HTMLImageElement>(`[data-nvr-camera="${id}"] .nvr-camtile__pic img`),
];
/** the picture on top: the only one, or the one with z-index 1 */
const front = (div: HTMLElement, id: string) => {
  const all = imgs(div, id);
  return all.length === 1 ? all[0] : all.find((i) => i.style.zIndex === '1');
};

const VARIANTS: [string, (cams: SentinelCamera[]) => ReactNode][] = [
  ['classic tiles', (cams) => <CameraTiles cameras={cams} />],
  ['Glas tiles', (cams) => <GlassNvr cameras={cams} events={[]} />],
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as any).decode;
  pending.clear();
  document.body.innerHTML = '';
});

describe.each(VARIANTS)('%s', (_name, ui) => {
  it('the next snapshot loads under the shown one and comes forward once decoded', async () => {
    vi.useFakeTimers();
    decodeOnCall();
    const { div, done } = render(ui([cam('s1')]));
    const [a] = imgs(div, 's1');
    const first = a.getAttribute('src');
    await loads(a);
    await decoded(a);
    expect(front(div, 's1')).toBe(a);
    expect(lastTileSnapshot('s1')).toBe(a);

    await act(async () => void vi.advanceTimersByTime(5000));
    const [a2, b] = imgs(div, 's1');
    // the shown picture stays where and what it is; the next one loads in a second element under it
    expect(a2).toBe(a);
    expect(a.getAttribute('src')).toBe(first);
    expect(b.getAttribute('src')).not.toBe(first);
    expect(front(div, 's1')).toBe(a);
    expect(b.style.zIndex).toBe('0');

    await loads(b);
    expect(front(div, 's1')).toBe(a); // loaded, not decoded: still the old one in front
    await decoded(b);
    expect(front(div, 's1')).toBe(b);
    expect(imgs(div, 's1')).toEqual([a, b]); // no element moved
    expect(lastTileSnapshot('s1')).toBe(b);

    // the next one goes into the element now behind
    await act(async () => void vi.advanceTimersByTime(5000));
    expect(front(div, 's1')).toBe(b);
    expect(a.getAttribute('src')).not.toBe(first);
    await loads(a);
    await decoded(a);
    expect(front(div, 's1')).toBe(a);
    done();
  });

  it('a snapshot that fails keeps the shown picture until the fallback has loaded', async () => {
    vi.useFakeTimers();
    decodeOnCall();
    const { div, done } = render(ui([cam('f1', { latestThumbId: 'seg-1' })]));
    const [a] = imgs(div, 'f1');
    await loads(a);
    await decoded(a);
    await act(async () => void vi.advanceTimersByTime(5000));
    const [, b] = imgs(div, 'f1');
    await fails(b);
    // the thumbnail now loads behind; the picture before stays in front, no broken image
    expect(front(div, 'f1')).toBe(a);
    expect(b.getAttribute('src')).toBe('thumb/seg-1');
    await loads(b);
    await decoded(b);
    expect(front(div, 'f1')).toBe(b);
    done();
  });

  it('a picture that finishes after a newer one was asked for does not come forward', async () => {
    vi.useFakeTimers();
    decodeOnCall();
    const { div, done } = render(ui([cam('n1')]));
    const [a] = imgs(div, 'n1');
    await loads(a);
    await decoded(a);
    await act(async () => void vi.advanceTimersByTime(5000));
    const [, b] = imgs(div, 'n1');
    await loads(b);
    const late = pending.get(b)!;
    await act(async () => void vi.advanceTimersByTime(5000)); // a newer snapshot takes the same element
    await act(async () => late.ok());
    expect(front(div, 'n1')).toBe(a);
    await loads(b);
    await decoded(b);
    expect(front(div, 'n1')).toBe(b);
    done();
  });
});

describe('nextSlots', () => {
  const s = { a: 'x', b: null, front: 'a' as const, ready: false };
  it('before the first picture shows, a new src replaces the front one', () => {
    expect(nextSlots(s, 'y')).toEqual({ ...s, a: 'y' });
  });
  it('afterwards it goes behind; the shown or already loading src changes nothing', () => {
    const r = { ...s, ready: true };
    expect(nextSlots(r, 'y')).toEqual({ ...r, b: 'y' });
    expect(nextSlots(r, 'x')).toBe(r);
    const two = { ...r, b: 'y' };
    expect(nextSlots(two, 'y')).toBe(two);
    expect(nextSlots({ ...two, front: 'b' }, 'z')).toEqual({ ...two, front: 'b', a: 'z' });
  });
});
