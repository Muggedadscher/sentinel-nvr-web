/**
 * Deep link (overview → event): the day loads must be visible to the code that awaited them, even though React
 * renders the state update later. Regression: the newest day (largest response, last to arrive) was missing from the
 * merged range → playAt() saw no clip → "no recording" although the event was fully covered.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SentinelUiProvider } from '../../src/ui/context';
import { CameraPage } from '../../src/ui/components/CameraPage';

const playAt = vi.fn(); const goLive = vi.fn(); const posterEvent = vi.fn(); const freezeCurrent = vi.fn(); const setClips = vi.fn();
vi.mock('../../src/player', () => ({
  PlayerController: class {
    camId = ''; camName = '';
    attach() { /* no dom */ } destroy() { /* */ }
    setCamera(id: string) { this.camId = id; }
    setClips = setClips; playAt = playAt; goLive = goLive; posterEvent = posterEvent; freezeCurrent = freezeCurrent;
    currentTs() { return null; }
  },
  rlog: () => { /* */ },
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver = class { observe() { /* */ } disconnect() { /* */ } };

describe('CameraPage deep link', () => {
  it('plays at startAt once the (late) newest day has arrived — not "no recording"', async () => {
    const today = new Date().setHours(0, 0, 0, 0);
    const ev = today + 5 * 3600e3; // an event today at 05:00, covered by a 60-s clip
    const resolvers: Record<number, (v: unknown) => void> = {};
    const client = {
      corsMedia: true,
      url: (p: string) => p,
      getJson: (p: string) => new Promise((res) => {
        const ds = Number(new URL('http://x/' + p).searchParams.get('start'));
        resolvers[ds] = res;
      }),
      eventThumbUrl: () => '', snapshotUrl: () => '', segmentThumbUrl: () => '',
    } as any;
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(
        <SentinelUiProvider value={{ client, t: (k: string) => k, locale: 'de-DE', nav: { openCamera: () => { /* */ } } }}>
          <CameraPage camId="33" name="Cam" startAt={ev - 3000} posterTs={ev} storagePrefix="t-" brand="test" renderDatePicker={() => null} />
        </SentinelUiProvider>,
      );
    });
    // older days answer first (empty), TODAY last — its resolution and the awaiting .then run in the same microtask turn
    for (const ds of Object.keys(resolvers).map(Number).sort((a, b) => a - b)) {
      if (ds === today) continue;
      await act(async () => { resolvers[ds]!({ clips: [], events: [], motion: [], codecs: null }); });
    }
    // deliberately OUTSIDE act(): in the browser React renders the setDays() update in a later task, while the awaiting .then
    // (setClips + playAt) runs as a microtask right after the resolution — act() would flush the render first and hide the race
    resolvers[today]!({ clips: [{ id: 'c', startTime: ev - 30000, duration: 60000 }], events: [], motion: [], codecs: 'avc1.42e01f' });
    await new Promise((r) => setTimeout(r, 30));
    expect(posterEvent).toHaveBeenCalledWith(ev);
    expect(playAt).toHaveBeenCalledWith(ev - 3000, {});
    // the clips handed over right BEFORE playAt must include today's clip (a later setClips from the render effect doesn't help:
    // nothing restarts playback, the label would stay "no recording")
    const playOrder = playAt.mock.invocationCallOrder[0]!;
    const before = setClips.mock.calls.filter((_, i) => setClips.mock.invocationCallOrder[i]! < playOrder);
    expect(before.length).toBeGreaterThan(0);
    const handed = before[before.length - 1]![0] as { id: string }[];
    expect(handed.some((c) => c.id === 'c')).toBe(true);
    expect(goLive).not.toHaveBeenCalled();
    root.unmount();
  });
});
