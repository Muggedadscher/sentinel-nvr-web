/**
 * Last snapshot a camera tile showed, per camera (module state, survives the route change to the camera page).
 * Opening a camera posters it at once instead of a grey stage (user 23.09.: "erstmal kein Bild"; 27.09.: the stage
 * stays grey for long). Kept is the loaded <img> itself — already decoded, drawn synchronously. A URL alone was not
 * enough: api/snapshot is no-store and the poster's crossOrigin request differs in CORS mode from the tile's, so the
 * "cached" URL meant another full-size download (~400 KB at 5 MP) before the first pixel.
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
