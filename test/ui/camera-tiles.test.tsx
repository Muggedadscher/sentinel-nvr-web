/**
 * Camera tiles that mount again (0.19.2): a tile carries its camera's id and holds its picture in one box; until its own
 * snapshot is decoded it shows the camera's last picture there, drawn at once from the image a tile remembered (or from
 * the copy kept of it, while that image loads its next snapshot) — back on the overview there are pictures, not empty
 * tiles, and a host's transition back from the camera page lands in one.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { SentinelCamera } from '../../src/api';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraTiles } from '../../src/ui/components/CameraGrid';
import {
  drawLastTileSnapshot,
  hasLastTileSnapshot,
  lastTileSnapshot,
  rememberTileSnapshot,
} from '../../src/ui/snapshot-cache';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const cam = (id: string, extra: Partial<SentinelCamera> = {}): SentinelCamera => ({
  id,
  name: `Cam ${id}`,
  recording: true,
  online: true,
  eventsToday: 0,
  ...extra,
});

/** An image as a tile leaves it behind: loaded (or not), with its natural size; `state` changes both later. */
function picture(loaded = true, w = 640, h = 360) {
  const img = document.createElement('img');
  const state = { complete: loaded, w: loaded ? w : 0, h: loaded ? h : 0 };
  Object.defineProperty(img, 'complete', { get: () => state.complete });
  Object.defineProperty(img, 'naturalWidth', { get: () => state.w });
  Object.defineProperty(img, 'naturalHeight', { get: () => state.h });
  return Object.assign(img, { state });
}

/** A 2D context that records what is drawn (jsdom has none). */
function mockCanvas() {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as any);
  return drawImage;
}

function render(cameras: SentinelCamera[]) {
  const client = { snapshotUrl: (id: string) => `snap/${id}`, segmentThumbUrl: (id: string) => `thumb/${id}` } as any;
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
        <CameraTiles cameras={cameras} />
      </SentinelUiProvider>,
    ),
  );
  return { div, done: () => act(() => root.unmount()) };
}

const tile = (div: HTMLElement, id: string) => div.querySelector<HTMLElement>(`[data-nvr-camera="${id}"]`)!;
const box = (div: HTMLElement, id: string) => tile(div, id).querySelector('.nvr-camtile__pic')!;
const kids = (el: Element | null) => [...(el?.children ?? [])].map((c) => c.tagName + '.' + c.className);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('camera tile', () => {
  it('carries its camera id and holds its picture in one box', () => {
    const { div, done } = render([cam('a1'), cam('a 2')]);
    const tiles = [...div.querySelectorAll<HTMLElement>('.nvr-camtile')];
    expect(tiles.map((t) => t.dataset.nvrCamera)).toEqual(['a1', 'a 2']);
    expect(kids(box(div, 'a1'))).toEqual(['IMG.nvr-camtile__img']);
    expect(box(div, 'a1').querySelector('img')!.getAttribute('src')).toBe('snap/a1');
    done();
  });

  it('mounting again: the last picture under its own, drawn at once at its size', () => {
    const drawImage = mockCanvas();
    const last = picture(true, 960, 540);
    rememberTileSnapshot('b1', last);
    drawImage.mockClear(); // the copy the cache keeps
    const { div, done } = render([cam('b1')]);
    expect(kids(box(div, 'b1'))).toEqual(['CANVAS.nvr-camtile__img nvr-camtile__img--last', 'IMG.nvr-camtile__img']);
    const canvas = box(div, 'b1').querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect([canvas.width, canvas.height]).toEqual([960, 540]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(last, 0, 0);
    done();
  });

  it('the last picture goes once its own is decoded; the tile remembers its own', async () => {
    mockCanvas();
    rememberTileSnapshot('c1', picture());
    const { div, done } = render([cam('c1')]);
    const img = box(div, 'c1').querySelector('img')!;
    let decoded!: () => void;
    img.decode = () => new Promise<void>((resolve) => (decoded = resolve));
    await act(async () => {
      img.dispatchEvent(new Event('load'));
    });
    // loaded, not yet decoded: the last picture still lies under it
    expect(box(div, 'c1').querySelector('canvas')).not.toBeNull();
    expect(lastTileSnapshot('c1')).toBe(img);
    await act(async () => decoded());
    expect(box(div, 'c1').querySelector('canvas')).toBeNull();
    expect(box(div, 'c1').querySelector('img')).toBe(img);
    done();
  });

  it('also goes when decoding fails or the browser has no decode()', async () => {
    mockCanvas();
    rememberTileSnapshot('d1', picture());
    rememberTileSnapshot('d2', picture());
    const { div, done } = render([cam('d1'), cam('d2')]);
    const img1 = box(div, 'd1').querySelector('img')!;
    img1.decode = () => Promise.reject(new Error('EncodingError'));
    const img2 = box(div, 'd2').querySelector('img')!;
    (img2 as any).decode = undefined;
    await act(async () => {
      img1.dispatchEvent(new Event('load'));
      img2.dispatchEvent(new Event('load'));
    });
    expect(box(div, 'd1').querySelector('canvas')).toBeNull();
    expect(box(div, 'd2').querySelector('canvas')).toBeNull();
    done();
  });

  it('stays with a thumbnail that loads; a failure that ends in the placeholder takes it away for good', async () => {
    vi.useFakeTimers();
    mockCanvas();
    rememberTileSnapshot('g1', picture());
    rememberTileSnapshot('g2', picture());
    const { div, done } = render([cam('g1', { latestThumbId: 'th-g1' }), cam('g2')]);
    // g1: the snapshot fails, its thumbnail comes next — the last picture lies under it until that is decoded
    await act(async () => {
      box(div, 'g1').querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(box(div, 'g1').querySelector('img')!.getAttribute('src')).toBe('thumb/th-g1');
    expect(box(div, 'g1').querySelector('canvas')).not.toBeNull();
    // g2: no thumbnail, the placeholder
    await act(async () => {
      box(div, 'g2').querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(tile(div, 'g2').querySelector('.nvr-camtile__pic')).toBeNull();
    expect(tile(div, 'g2').querySelector('.nvr-camtile__placeholder')).not.toBeNull();
    // 30 s later the snapshot gets another chance: no old picture on the retry
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(kids(box(div, 'g2'))).toEqual(['IMG.nvr-camtile__img']);
    done();
  });

  it('while the remembered image loads its next snapshot: the copy of the one before', async () => {
    const drawImage = mockCanvas();
    const img = picture(true, 960, 540);
    rememberTileSnapshot('h1', img);
    const copy = drawImage.mock.calls[0]![0];
    expect(copy).toBe(img);
    // the tile's next 5-s snapshot is on its way: the element has nothing to draw
    img.state.complete = false;
    img.state.w = img.state.h = 0;
    drawImage.mockClear();
    const { div, done } = render([cam('h1')]);
    const canvas = box(div, 'h1').querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([960, 540]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0]![0]).toBeInstanceOf(HTMLCanvasElement);
    expect(hasLastTileSnapshot('h1')).toBe(true);
    done();
  });

  it('the copy waits for the decode and keeps only the newest picture', async () => {
    const drawImage = mockCanvas();
    const img = picture(true, 640, 360);
    let decoded!: () => void;
    img.decode = () => new Promise<void>((resolve) => (decoded = resolve));
    rememberTileSnapshot('k1', img);
    expect(drawImage).not.toHaveBeenCalled();
    await act(async () => decoded());
    expect(drawImage).toHaveBeenCalledTimes(1);
    // a decode that fails (the element moved on) or a newer picture first: no copy of this one
    const other = picture(true, 320, 240);
    let fail!: (e: Error) => void;
    other.decode = () => new Promise<void>((_, reject) => (fail = reject));
    rememberTileSnapshot('k2', other);
    await act(async () => fail(new Error('EncodingError')));
    const older = picture(true, 320, 240);
    let olderDecoded!: () => void;
    older.decode = () => new Promise<void>((resolve) => (olderDecoded = resolve));
    rememberTileSnapshot('k3', older);
    rememberTileSnapshot('k3', 'snap/k3?url');
    await act(async () => olderDecoded());
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect([hasLastTileSnapshot('k2'), hasLastTileSnapshot('k3')]).toEqual([true, false]);
    other.state.complete = false;
    expect(hasLastTileSnapshot('k2')).toBe(false);
  });

  it('nothing to draw: no remembered picture, only a URL, or an image that has not loaded', () => {
    mockCanvas();
    rememberTileSnapshot('e2', 'snap/e2?old');
    rememberTileSnapshot('e3', picture(false));
    const { div, done } = render([cam('e1'), cam('e2'), cam('e3')]);
    for (const id of ['e1', 'e2', 'e3']) expect(box(div, id).querySelector('canvas')).toBeNull();
    expect([hasLastTileSnapshot('e1'), hasLastTileSnapshot('e2'), hasLastTileSnapshot('e3')]).toEqual([
      false,
      false,
      false,
    ]);
    done();
  });

  it('drawLastTileSnapshot: false without a 2D context, true with one', () => {
    const drawImage = mockCanvas();
    rememberTileSnapshot('f1', picture(true, 320, 240));
    drawImage.mockClear();
    const canvas = document.createElement('canvas');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as any);
    expect(drawLastTileSnapshot('f1', canvas)).toBe(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as any);
    expect(drawLastTileSnapshot('f1', canvas)).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([320, 240]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawLastTileSnapshot('nope', canvas)).toBe(false);
  });
});
