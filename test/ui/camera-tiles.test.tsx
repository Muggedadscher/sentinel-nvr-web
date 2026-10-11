/**
 * Camera tiles that mount again (0.19.2): a tile carries its camera's id and holds its picture in one box; until its own
 * snapshot is decoded it shows the camera's last picture there, drawn at once from the image a tile remembered — back
 * on the overview there are pictures, not empty tiles, and a host's transition back from the camera page lands in one.
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

const cam = (id: string): SentinelCamera => ({ id, name: `Cam ${id}`, recording: true, online: true, eventsToday: 0 });

/** an image as a tile leaves it behind: loaded (or not), with its natural size */
function picture(loaded = true, w = 640, h = 360): HTMLImageElement {
  const img = document.createElement('img');
  Object.defineProperty(img, 'complete', { value: loaded });
  Object.defineProperty(img, 'naturalWidth', { value: loaded ? w : 0 });
  Object.defineProperty(img, 'naturalHeight', { value: loaded ? h : 0 });
  return img;
}

function mockCanvas() {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as any);
  return drawImage;
}

function render(cameras: SentinelCamera[]) {
  const client = { snapshotUrl: (id: string) => `snap/${id}`, segmentThumbUrl: () => '' } as any;
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

const box = (div: HTMLElement, id: string) => div.querySelector(`[data-nvr-camera="${id}"] .nvr-camtile__pic`)!;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('camera tile', () => {
  it('carries its camera id and holds its picture in one box', () => {
    const { div, done } = render([cam('a1'), cam('a 2')]);
    const tiles = [...div.querySelectorAll<HTMLElement>('.nvr-camtile')];
    expect(tiles.map((t) => t.dataset.nvrCamera)).toEqual(['a1', 'a 2']);
    expect([...box(div, 'a1').children].map((c) => c.tagName + '.' + c.className)).toEqual(['IMG.nvr-camtile__img']);
    expect(box(div, 'a1').querySelector('img')!.getAttribute('src')).toBe('snap/a1');
    done();
  });

  it('mounting again: the last picture under its own, drawn at once at its size', () => {
    const drawImage = mockCanvas();
    const last = picture(true, 960, 540);
    rememberTileSnapshot('b1', last);
    const { div, done } = render([cam('b1')]);
    const kids = [...box(div, 'b1').children];
    expect(kids.map((c) => c.tagName + '.' + c.className)).toEqual(['CANVAS.nvr-camtile__img', 'IMG.nvr-camtile__img']);
    const canvas = kids[0] as HTMLCanvasElement;
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
    rememberTileSnapshot('f1', picture(true, 320, 240));
    const canvas = document.createElement('canvas');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as any);
    expect(drawLastTileSnapshot('f1', canvas)).toBe(false);
    vi.restoreAllMocks();
    const drawImage = mockCanvas();
    expect(drawLastTileSnapshot('f1', canvas)).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([320, 240]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawLastTileSnapshot('nope', canvas)).toBe(false);
  });
});
