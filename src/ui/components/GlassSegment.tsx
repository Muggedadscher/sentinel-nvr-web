/**
 * The Glas segmented control (0.22.0): a port of HAPulse's `components/glas/Segment.tsx` (GLAS-DESIGN §7.27) for the
 * package's parts, text options only. A track, a lens that slides to the chosen option (snappy spring) and equally wide
 * options. `role="radiogroup"` with `role="radio"` options; only one option is in the tab order.
 *
 * Keys: arrows (wrapping), Home and End. With `activation="auto"` (default) the selection follows the focus; with
 * `activation="manual"` the keys only move the focus and Space/Enter choose — for segments that write something (the
 * settings), so that arrowing across does not set every option on the way.
 *
 * Long labels (another language) that do not fit at the segment's size turn the whole segment tight (`data-tight`:
 * 13 px, less padding; glas.css). On every resize the widest label is measured at the normal size with the chosen
 * weight: the segment stays tight exactly as long as it does not fit. Still too long, a label ends in "…".
 *
 * Its looks live in glas.css only (the classes are Glas-only, `nvr-gl-*`); the sizes per use come from a modifier class
 * (`nvr-gl-seg--settings`).
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

/** Width of `text` in `font` (one canvas for all segments; 0 where there is no canvas, e.g. jsdom). */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return 0;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export interface GlassSegmentOption<V extends string> {
  value: V;
  label: string;
}

export interface GlassSegmentProps<V extends string> {
  options: readonly GlassSegmentOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  /** accessible name of the group */
  label: string;
  className?: string | undefined;
  /** 'auto' (default): the arrows choose. 'manual': the arrows move the focus, Space/Enter choose. */
  activation?: 'auto' | 'manual' | undefined;
}

export function GlassSegment<V extends string>({
  options,
  value,
  onChange,
  label,
  className,
  activation = 'auto',
}: GlassSegmentProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  // manual activation: the option the keys moved to (the tab stop while the focus is inside), null = the chosen one
  const [cursor, setCursor] = useState<number | null>(null);
  const n = options.length;
  const found = options.findIndex((o) => o.value === value);
  const index = Math.max(0, found);
  const stop = cursor !== null && cursor < n ? cursor : index;
  const labels = options.map((o) => o.label).join('\n');

  // tight when a label does not fit (see above); data-tight is set here only, never by the render
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !labels.trim()) return;
    let alive = true;
    const fit = () => {
      // measure at the normal size: without the attribute for the moment of reading (the group's size stays)
      el.removeAttribute('data-tight');
      const opts = [...el.querySelectorAll<HTMLElement>('.nvr-gl-seg__opt')];
      const cs = opts[0] ? getComputedStyle(opts[0]) : null;
      if (!opts[0] || !cs) return;
      const font = `600 ${cs.fontSize} ${cs.fontFamily}`;
      const need = Math.max(...opts.map((o) => textWidth(o.textContent ?? '', font)));
      const room = opts[0].offsetWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      el.toggleAttribute('data-tight', need + 1 > room); // 1 px slack: the canvas and the text may round apart
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el);
    // a web font that arrives later changes the widths
    void document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [labels]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const from = activation === 'manual' ? stop : found;
    let i: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = from < 0 ? 0 : (from + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = from < 0 ? n - 1 : (from - 1 + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    const next = i === null ? undefined : options[i];
    if (i === null || !next) return;
    e.preventDefault();
    if (activation === 'manual') setCursor(i);
    else if (next.value !== value) onChange(next.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('.nvr-gl-seg__opt')[i]?.focus();
  }

  function choose(o: GlassSegmentOption<V>) {
    setCursor(null);
    if (o.value !== value) onChange(o.value);
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={className ? `nvr-gl-seg ${className}` : 'nvr-gl-seg'}
      data-none={found < 0 ? '' : undefined}
      style={{ '--nvr-gl-seg-n': n, '--nvr-gl-seg-i': index } as CSSProperties}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // the focus left the group: the tab stop goes back to the chosen option
        if (cursor !== null && !e.currentTarget.contains(e.relatedTarget as Node | null)) setCursor(null);
      }}
    >
      <span className="nvr-gl-seg__track" aria-hidden="true" />
      <span className="nvr-gl-seg__lens" aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={i === found}
          tabIndex={i === stop ? 0 : -1}
          className="nvr-gl-seg__opt"
          data-value={o.value}
          onClick={() => choose(o)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
