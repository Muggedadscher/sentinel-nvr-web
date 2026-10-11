/**
 * Last snapshot a camera tile showed, per camera (module state, survives the route change to the camera page).
 * Opening a camera posters it at once instead of a grey stage (user 23.09.: "erstmal kein Bild"; 27.09.: the stage
 * stays grey for long). Kept is the loaded <img> itself — already decoded, drawn synchronously. A URL alone was not
 * enough: api/snapshot is no-store and the poster's crossOrigin request differs in CORS mode from the tile's, so the
 * "cached" URL meant another full-size download (~400 KB at 5 MP) before the first pixel.
 * A tile that mounts again (back on the overview) draws it too, until its own snapshot is decoded (0.19.2). For that a
 * copy of each loaded picture is kept as well: the tile's <img> loads its next snapshot every few seconds, and while
 * that one loads the element has nothing to draw (WebKit) — a tile left in that moment came back empty.
 */
export type TileSnapshot = HTMLImageElement | string;
const last = new Map<string, TileSnapshot>();
const copies = new Map<string, HTMLCanvasElement>();

/** `snap` = the tile's loaded <img> (preferred; give it crossOrigin="anonymous" on another origin) or its URL */
export function rememberTileSnapshot(camId: string, snap: TileSnapshot): void {
  last.set(camId, snap);
  if (typeof snap === 'string') copies.delete(camId);
  else keepCopy(camId, snap);
}
export function lastTileSnapshot(camId: string): TileSnapshot | undefined {
  return last.get(camId);
}

function loaded(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Paints `src` onto `canvas` at its own size. False without a 2D context (or when drawing throws). */
function paint(canvas: HTMLCanvasElement, src: CanvasImageSource, w: number, h: number): boolean {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(src, 0, 0);
    return true;
  } catch {
    return false;
  }
}

/** Copies the loaded picture once it is decoded (off the main thread where the browser can), unless a newer picture
 *  or the element's next load came first — that one's copy follows. */
function keepCopy(camId: string, img: HTMLImageElement): void {
  const copy = () => {
    if (last.get(camId) !== img || !loaded(img)) return;
    const canvas = copies.get(camId) ?? document.createElement('canvas');
    if (paint(canvas, img, img.naturalWidth, img.naturalHeight)) copies.set(camId, canvas);
  };
  if (typeof img.decode === 'function') img.decode().then(copy, () => {});
  else copy();
}

/** The camera's last picture when it can be drawn at once: the loaded image, else (it loads its next one) the copy. */
function drawable(camId: string): { src: CanvasImageSource; w: number; h: number } | null {
  const snap = last.get(camId);
  if (snap && typeof snap !== 'string' && loaded(snap))
    return { src: snap, w: snap.naturalWidth, h: snap.naturalHeight };
  const copy = copies.get(camId);
  return copy ? { src: copy, w: copy.width, h: copy.height } : null;
}
/** whether `drawLastTileSnapshot` has a picture for this camera */
export function hasLastTileSnapshot(camId: string): boolean {
  return drawable(camId) !== null;
}
/** Draws the camera's last tile picture onto `canvas` at the picture's own size, at once. False when there is none
 *  that can be drawn (only a URL, no image that has loaded, no 2D context). */
export function drawLastTileSnapshot(camId: string, canvas: HTMLCanvasElement): boolean {
  const pic = drawable(camId);
  return pic ? paint(canvas, pic.src, pic.w, pic.h) : false;
}
