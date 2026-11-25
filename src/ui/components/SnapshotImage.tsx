/**
 * A picture whose URL changes now and then (a camera tile's snapshot, every few seconds) and that never shows a gap
 * in between: the next picture loads in a second <img> under the shown one and comes to the front only once it is
 * loaded and decoded. Before (one <img>, its `src` changed), WebKit painted nothing while it decoded the new picture
 * — for a frame or more the tile's dark background showed through (user 25.11.2026: "schwarzes Flickern").
 *
 * The two elements keep their place in the DOM (a moved <img> may be decoded again); which one is in front is its
 * `z-index` — the box around them isolates (`isolation: isolate` in the host's CSS), so nothing outside the box moves.
 * A snapshot is `no-store`: each element keeps the URL it loaded, a picture is never handed to a new element.
 *
 * - `onShown(img)`: a picture is now in front (loaded and decoded) — the tile remembers it, drops its last picture.
 * - `onError()`: the current `src` did not load; the shown picture stays until the host's next `src` has loaded.
 */
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

type Slot = 'a' | 'b';
interface Slots {
  a: string;
  b: string | null;
  front: Slot;
  /** whether the front element has shown a picture yet (before that a new `src` simply replaces it) */
  ready: boolean;
}

const other = (s: Slot): Slot => (s === 'a' ? 'b' : 'a');

/** Where a new `src` goes: nothing shown yet → the front element itself; else the element behind it. */
export function nextSlots(s: Slots, src: string): Slots {
  const slot = s.ready ? other(s.front) : s.front;
  // the front one already shows it: a picture still loading behind it is simply not brought forward (`onLoad`)
  if (s[slot] === src || (s.ready && s[s.front] === src)) return s;
  return { ...s, [slot]: src };
}

export function SnapshotImage({
  src,
  className,
  onShown,
  onError,
}: {
  src: string;
  className: string;
  onShown?: (img: HTMLImageElement) => void;
  onError?: () => void;
}) {
  const [slots, setSlots] = useState<Slots>(() => ({ a: src, b: null, front: 'a', ready: false }));
  const cb = useRef({ onShown, onError, src });
  cb.current = { onShown, onError, src };
  useEffect(() => {
    setSlots((s) => nextSlots(s, src));
  }, [src]);

  const loaded = (slot: Slot) => (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const url = img.getAttribute('src');
    const show = () => {
      // a newer `src` took this element meanwhile (its own load comes next), or the host asks for another picture
      if (img.getAttribute('src') !== url || url !== cb.current.src) return;
      setSlots((s) => (s[slot] !== url ? s : s.front === slot ? { ...s, ready: true } : { ...s, front: slot }));
      cb.current.onShown?.(img);
    };
    if (typeof img.decode === 'function') img.decode().then(show, show);
    else show();
  };
  const failed = (e: SyntheticEvent<HTMLImageElement>) => {
    // only the picture asked for now counts: an older one that fails afterwards changes nothing
    if (e.currentTarget.getAttribute('src') === cb.current.src) cb.current.onError?.();
  };

  const img = (slot: Slot) => {
    const url = slots[slot];
    if (url === null) return null;
    return (
      <img
        key={slot}
        className={className}
        src={url}
        alt=""
        crossOrigin="anonymous"
        // only once there are two: the one in front lies over the other (the box isolates)
        style={slots.b === null ? undefined : { zIndex: slots.front === slot ? 1 : 0 }}
        onLoad={loaded(slot)}
        onError={failed}
      />
    );
  };
  return (
    <>
      {img('a')}
      {img('b')}
    </>
  );
}
