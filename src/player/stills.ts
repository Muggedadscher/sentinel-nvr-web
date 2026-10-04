// DOM-free still-picture rules of the PlayerController (unit-testable without a browser). The controller owns the timers,
// the freeze canvas and the frame callbacks; what a still waits for and how long is decided here.

/** Seek → picture. After a jump the OLD position keeps playing until the new one has crossed the pipeline (measured 24.09.2026,
 *  sink passthrough: 1.3–1.4 s on the LAN, more on slow links). A still picture (event frame / frozen picture) covers that and
 *  is lifted on the EXACT first frame of the new position: the server restarts its transcoder with a marker width it names in
 *  the relay-seek answer ({w}); the first presented frame of that width (rVFC metadata / `resize`) is the new position.
 *  Servers without markers (plain 204): lifted SWAP_MS after the answer plus one presented frame. MARK_CAP_MS = safety net. */
export const SWAP_MS = 2600;
export const MARK_CAP_MS = 12000;
/** Lifting a still: wait this many further presented frames after the "new content" signal, then fade it out. iOS/Safari
 *  draw video on a separate layer that may still be empty for a moment after the frame callback — hiding the still at
 *  once let the grey stage background flash through (user 25.09.2026, iPhone). ~100 ms + 120 ms fade at 20 fps. */
export const LIFT_FRAMES = 2;
export const LIFT_FADE_MS = 120;
/** A still of a new session (start, resume, tab back, recovery) stays until the first presented frame; this is only the
 *  safety net — a still stays until the video really runs. */
export const STILL_CAP_MS = 90000;

/** A presented frame of width `w`: is it the first frame of the marked seek's new position? */
export function isMarkerFrame(swapPending: boolean, swapW: number, w: number): boolean {
  return swapPending && !!swapW && w === swapW;
}

/** How the still of an answered seek is lifted: `now` = the marker width is already on screen, `marker` = wait for the
 *  first frame of that width, `timer` = server without markers (SWAP_MS plus one presented frame). */
export function seekLift(markerW: number, shownW: number): 'now' | 'marker' | 'timer' {
  if (!markerW) return 'timer';
  return shownW === markerW ? 'now' : 'marker';
}

/** Width the server must avoid for a marked seek: the picture the viewer sees (last presented frame, else the element). */
export function avoidWidth(shownW: number, videoWidth: number): number {
  return shownW || videoWidth || 0;
}
