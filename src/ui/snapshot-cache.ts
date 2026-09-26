/**
 * Last snapshot URL a camera tile showed, per camera (module state, survives the route change to the camera page).
 * Opening a camera from the overview posters that image at once — it is in the browser cache — instead of waiting
 * ~1–3 s for a fresh api/snapshot (user 23.09.: "erstmal kein Bild").
 */
const last = new Map<string, string>();
export function rememberTileSnapshot(camId: string, url: string): void {
  last.set(camId, url);
}
export function lastTileSnapshot(camId: string): string | undefined {
  return last.get(camId);
}
