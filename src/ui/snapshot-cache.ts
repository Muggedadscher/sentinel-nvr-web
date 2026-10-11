/**
 * Last snapshot a camera tile showed, per camera (module state, survives the route change to the camera page).
 * Opening a camera posters it at once instead of a grey stage (user 23.09.: "erstmal kein Bild"; 27.09.: the stage
 * stays grey for long). Kept is the loaded <img> itself — already decoded, drawn synchronously. A URL alone was not
 * enough: api/snapshot is no-store and the poster's crossOrigin request differs in CORS mode from the tile's, so the
 * "cached" URL meant another full-size download (~400 KB at 5 MP) before the first pixel.
 * A tile that mounts again (back on the overview) draws it too, until its own snapshot has loaded (0.19.2).
 */
export type TileSnapshot = HTMLImageElement | string;
const last = new Map<string, TileSnapshot>();
/** `snap` = the tile's loaded <img> (preferred; give it crossOrigin="anonymous" on another origin) or its URL */
export function rememberTileSnapshot(camId: string, snap: TileSnapshot): void {
  last.set(camId, snap);
}
export function lastTileSnapshot(camId: string): TileSnapshot | undefined {
  return last.get(camId);
}
/** the remembered picture when it can be drawn at once: a loaded image, not a URL */
function drawable(camId: string): HTMLImageElement | null {
  const snap = last.get(camId);
  return snap && typeof snap !== 'string' && snap.complete && snap.naturalWidth > 0 ? snap : null;
}
/** whether `drawLastTileSnapshot` has a picture for this camera */
export function hasLastTileSnapshot(camId: string): boolean {
  return drawable(camId) !== null;
}
/** Draws the camera's last tile picture onto `canvas` at the picture's own size, at once. False when there is none
 *  that can be drawn (only a URL, an image that has not loaded, no 2D context). */
export function drawLastTileSnapshot(camId: string, canvas: HTMLCanvasElement): boolean {
  const snap = drawable(camId);
  if (!snap) return false;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    canvas.width = snap.naturalWidth;
    canvas.height = snap.naturalHeight;
    ctx.drawImage(snap, 0, 0);
    return true;
  } catch {
    return false;
  }
}
