/**
 * Appearance = the classic theme (`applyTheme`, unchanged) plus the optional second style "Glas" — a port of HAPulse's
 * `apps/dashboard/src/theme/glasAppearance.ts` (MIT, see NOTICE.md) for hosts without HAPulse's settings store.
 *
 * Klassisch stays exactly as before: `applyAppearance` calls `applyTheme` first and, in Klassisch, only removes what
 * Glas left behind (`--g-*` inline variables, `data-glass`, `data-contrast`, the dark subtree) and hands the browser
 * colour back to the host. In Glas it then writes `glasCssVars(…)` inline on :root — the classic token names plus the
 * Glas-own `--g-*` variables — and sets `data-style="glas"`, which `ui/glas.css` keys on. `prefers-contrast: more` and
 * `prefers-reduced-transparency` are read here and written as values, so `glas-data.ts` stays the only source of
 * numbers.
 *
 * Dark subtree: in Glas a `<style id="glas-dark-scope">` holds the same variables in dark mode for
 * `[data-glas-scheme="dark"]` — the host puts that attribute on the part that is always dark (the camera page) — and,
 * while `data-g-immersive` is set on :root, on the host's floating surfaces (`setAppearanceHost`).
 */

import { applyTheme, resolveMode, type ResolvedMode, type ThemeMode, type ThemeName } from '../ui/theme';
import { glasCssVars, GLAS_COLORS, GLAS_STRENGTHS, type GlasStrength, type UiStyle } from './glas-data';

export interface AppearanceInput {
  theme: ThemeName;
  mode: ThemeMode;
  accentHue?: number | undefined;
  uiStyle: UiStyle;
  glassStrength: GlasStrength;
  reduceTransparency: boolean;
}

/** What this device asks for (system settings) and what its browser can do. */
export interface MediaEnv {
  contrastMore: boolean;
  reducedTransparency: boolean;
  supportsLinear: boolean;
}

export interface StyleFields {
  uiStyle: UiStyle;
  glassStrength: GlasStrength;
  reduceTransparency: boolean;
}

/** What the host adds to the shared rules. */
export interface AppearanceHost {
  /** Surfaces the host floats over the page from `<body>` (windows, panels): dark while the camera page is shown.
   *  One selector per entry (no comma lists: each entry gets the Glas prefix in front). */
  floating?: readonly string[];
  /** Klassisch: the host's own browser colour (e.g. from `--bg`); without it the page's original value comes back. */
  classicThemeColor?: () => void;
}

export const CLASSIC_STYLE: StyleFields = { uiStyle: 'classic', glassStrength: 'clear', reduceTransparency: false };

export const normalizeUiStyle = (v: unknown): UiStyle => (v === 'glas' ? 'glas' : 'classic');
export const normalizeGlassStrength = (v: unknown): GlasStrength =>
  (GLAS_STRENGTHS as readonly unknown[]).includes(v) ? (v as GlasStrength) : 'clear';

/** The style fields of a (possibly old or hand-edited) stored object, normalized. */
export function styleFields(
  c: { uiStyle?: unknown; glassStrength?: unknown; reduceTransparency?: unknown } | null | undefined,
): StyleFields {
  return {
    uiStyle: normalizeUiStyle(c?.uiStyle),
    glassStrength: normalizeGlassStrength(c?.glassStrength),
    reduceTransparency: c?.reduceTransparency === true,
  };
}

const media = (query: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;

const CONTRAST_MORE = '(prefers-contrast: more)';
const REDUCED_TRANSPARENCY = '(prefers-reduced-transparency: reduce)';

export function readMediaEnv(): MediaEnv {
  return {
    contrastMore: media(CONTRAST_MORE)?.matches ?? false,
    reducedTransparency: media(REDUCED_TRANSPARENCY)?.matches ?? false,
    supportsLinear:
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports('transition-timing-function', 'linear(0, 1)')
        : false,
  };
}

/** Glas strength in effect: "opaque" when the switch, the system or more contrast asks for it. */
export function effectiveStrength(
  a: Pick<AppearanceInput, 'glassStrength' | 'reduceTransparency'>,
  env: MediaEnv,
): GlasStrength {
  return a.reduceTransparency || env.reducedTransparency || env.contrastMore ? 'opaque' : a.glassStrength;
}

/** Id of the style element with the dark subtree's variables. */
export const DARK_SCOPE_ID = 'glas-dark-scope';

let host: AppearanceHost = {};

/** Pure: the dark subtree's rule — the Glas variables of dark mode on `[data-glas-scheme='dark']` and, while the
 *  camera page is shown (`data-g-immersive`), on the floating surfaces. */
export function darkScopeCss(vars: Readonly<Record<string, string>>, floating: readonly string[] = []): string {
  const decls = Object.entries(vars).map(([name, value]) => `${name}: ${value};`);
  const sel = [
    ":root[data-style='glas'] [data-glas-scheme='dark']",
    ...floating.map((s) => `:root[data-style='glas'][data-g-immersive] ${s}`),
  ].join(', ');
  return `${sel} { color-scheme: dark; ${decls.join(' ')} }`;
}

/** theme-color of the page, remembered on the first call so Klassisch gets exactly it back. */
let classicThemeColor: string | null | undefined;
/** What the last `applyAppearance` decided the browser colour from (null = not applied yet). */
let themeColorBase: { glas: boolean; resolved: ResolvedMode } | null = null;
/** The camera page is shown: its dark page sets the browser colour meanwhile (Glas only). */
let immersiveColor = false;

function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta || !themeColorBase) return;
  const { glas, resolved } = themeColorBase;
  if (!glas && host.classicThemeColor) {
    host.classicThemeColor();
    return;
  }
  const color = glas ? GLAS_COLORS[immersiveColor ? 'dark' : resolved].bg : classicThemeColor;
  if (color == null) meta.removeAttribute('content');
  else if (meta.getAttribute('content') !== color) meta.setAttribute('content', color);
}

/** Glas: while the camera page is shown, the browser colour is its dark page's (Klassisch ignores it). */
export function setImmersiveThemeColor(on: boolean): void {
  if (immersiveColor === on) return;
  immersiveColor = on;
  if (typeof document !== 'undefined') syncThemeColor();
}

function inlineGlasNames(style: CSSStyleDeclaration): string[] {
  const out: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    if (name.startsWith('--g-')) out.push(name);
  }
  return out;
}

/** The last applied state: Glas would otherwise rewrite ~145 properties on :root on every call. */
let last: { root: HTMLElement; key: string } | null = null;

/** Set what the host adds (floating surfaces, its Klassisch browser colour); applies again on the next call. */
export function setAppearanceHost(next: AppearanceHost): void {
  host = next;
  last = null;
}

/** Apply theme + style to <html>. */
export function applyAppearance(a: AppearanceInput, env: MediaEnv = readMediaEnv()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveMode(a.mode);
  const key = JSON.stringify([
    a.theme,
    a.mode,
    resolved,
    a.accentHue ?? null,
    a.uiStyle,
    a.glassStrength,
    a.reduceTransparency,
    env.contrastMore,
    env.reducedTransparency,
    env.supportsLinear,
  ]);
  if (last && last.root === root && last.key === key) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (classicThemeColor === undefined) classicThemeColor = meta ? meta.getAttribute('content') : null;

  // 1. Klassisch exactly as before (Glas overwrites the classic names below).
  applyTheme(a.theme, a.mode, a.accentHue);

  const glas = a.uiStyle === 'glas';
  const strength = effectiveStrength(a, env);
  const vars = glas
    ? glasCssVars({
        mode: resolved,
        accentHue: a.accentHue,
        strength,
        contrastMore: env.contrastMore,
        supportsLinear: env.supportsLinear,
      })
    : {};

  // 2. No stale Glas variable survives (switching back to Klassisch, or a value Glas no longer sets).
  for (const name of inlineGlasNames(root.style)) {
    if (!(name in vars)) root.style.removeProperty(name);
  }
  // 3. Glas values (classic names + --g-*).
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);

  // 4. Attributes the Glas CSS keys on.
  root.setAttribute('data-style', glas ? 'glas' : 'classic');
  if (glas) root.setAttribute('data-glass', strength);
  else root.removeAttribute('data-glass');
  if (glas && env.contrastMore) root.setAttribute('data-contrast', 'more');
  else root.removeAttribute('data-contrast');

  // 5. The dark subtree: the same input in dark mode (in dark mode the variables just written).
  let scope = document.getElementById(DARK_SCOPE_ID);
  if (glas) {
    const dark =
      resolved === 'dark'
        ? vars
        : glasCssVars({
            mode: 'dark',
            accentHue: a.accentHue,
            strength,
            contrastMore: env.contrastMore,
            supportsLinear: env.supportsLinear,
          });
    const css = darkScopeCss(dark, host.floating);
    if (!scope) {
      scope = document.createElement('style');
      scope.id = DARK_SCOPE_ID;
      document.head.appendChild(scope);
    }
    if (scope.textContent !== css) scope.textContent = css;
  } else scope?.remove();

  // 6. Browser colour: the Glas page background (the dark one while the camera page is shown), in Klassisch the host's.
  themeColorBase = { glas, resolved };
  syncThemeColor();
  last = { root, key };
}

let unwatch: (() => void) | null = null;

/**
 * Re-applies on OS changes — colour scheme (only in "auto"), more contrast and reduced transparency (only in Glas).
 * Pass a getter so the latest settings are read. Returns a cleanup function; replaces `watchSystemMode`.
 */
export function watchAppearance(get: () => AppearanceInput): () => void {
  unwatch?.();
  const subs: (() => void)[] = [];
  const on = (query: string, relevant: (a: AppearanceInput) => boolean) => {
    const mql = media(query);
    if (!mql) return;
    const listener = () => {
      const a = get();
      if (relevant(a)) applyAppearance(a);
    };
    mql.addEventListener('change', listener);
    subs.push(() => mql.removeEventListener('change', listener));
  };
  on('(prefers-color-scheme: dark)', (a) => a.mode === 'auto');
  on(CONTRAST_MORE, (a) => a.uiStyle === 'glas');
  on(REDUCED_TRANSPARENCY, (a) => a.uiStyle === 'glas');
  const stop = () => {
    subs.forEach((s) => s());
    subs.length = 0;
    if (unwatch === stop) unwatch = null;
  };
  unwatch = stop;
  return stop;
}
