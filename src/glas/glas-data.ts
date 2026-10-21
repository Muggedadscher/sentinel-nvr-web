/**
 * [fork] Design tokens of the second style "Glas" — pure data + pure functions, DOM-free.
 *
 * Source of every value: docs/GLAS-DESIGN.md and docs/glas/glas-tokens.json (the colour table below is a verbatim
 * copy of `color`). The dashboard's `theme/glasAppearance.ts` writes `glasCssVars(…)` inline on :root after
 * `applyTheme` — the classic token names (so every existing component looks "Glas" without its own CSS) plus the
 * Glas-own `--g-*` variables. Plan and deviations: docs/glas/PLAN-ETAPPE-0-1.md, docs/glas/PLAN-ETAPPE-2.md (frame:
 * surface tints, sheet material, shadows).
 */

import type { ThemeTokens } from '../ui/themes-data';

export type GlasMode = 'light' | 'dark';
export type GlasStrength = 'clear' | 'tinted' | 'opaque';
export type UiStyle = 'classic' | 'glas';

export const UI_STYLES: readonly UiStyle[] = ['classic', 'glas'];
export const GLAS_STRENGTHS: readonly GlasStrength[] = ['clear', 'tinted', 'opaque'];

// ---------------------------------------------------------------------------
// Colours (glas-tokens.json → color, verbatim)
// ---------------------------------------------------------------------------

const LIGHT = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  card2: '#F2F2F7',
  cardSolid: '#FFFFFF',
  cardHover: '#F7F7FA',
  group: '#FFFFFF',
  sheetSolid: '#F2F2F7',
  fill: 'rgba(120,120,128,.12)',
  fill2: 'rgba(120,120,128,.20)',
  fillSolid: '#E5E5EA',
  sep: 'rgba(60,60,67,.18)',
  sepStrong: 'rgba(60,60,67,.36)',
  label: '#000000',
  label2: '#5F5F64',
  label3: '#7C7C80',
  glassLabel2: '#3A3A3C',
  textFaint: '#636366',
  glyphDark: '#1C1C1E',
  onMedia: '#FFFFFF',
  mediaBg: '#000000',
  grabber: 'rgba(60,60,67,.30)',
  yellow: '#FFCC00',
  yellowInk: '#7D5E00',
  yellowSoft: 'rgba(255,204,0,.24)',
  orange: '#FF9500',
  orangeInk: '#B25000',
  orangeSoft: 'rgba(255,149,0,.16)',
  teal: '#30B0C7',
  tealInk: '#0A7389',
  tealSoft: 'rgba(48,176,199,.16)',
  green: '#34C759',
  greenInk: '#1F7A35',
  greenSoft: 'rgba(52,199,89,.16)',
  red: '#FF3B30',
  redInk: '#D70015',
  redSoft: 'rgba(255,59,48,.12)',
  blue: '#007AFF',
  blueInk: '#0060DF',
  blueSoft: 'rgba(0,122,255,.12)',
  purple: '#AF52DE',
  purpleInk: '#8944AB',
  indigo: '#5856D6',
  indigoInk: '#3634A3',
  gray: '#8E8E93',
  warnInk: '#7D5E00',
  warnSoft: 'rgba(255,204,0,.24)',
  switchOn: '#34C759',
  switchOff: 'rgba(120,120,128,.24)',
  knob: '#FFFFFF',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  live: '#D70015',
  liveDot: '#FF3B30',
  actDel: '#D70015',
  actOk: '#1F7A35',
  actNeutral: '#636366',
  binRest: '#8E8E93',
  binPaper: '#007AFF',
  binYellow: '#FFCC00',
  binBio: '#34C759',
  binBrown: '#A2845E',
  ct1: '#FFB25B',
  ct2: '#FFD39C',
  ct3: '#FFF3E3',
  ct4: '#DCE8FF',
  tileOn: '#FFFFFF',
  tileOff: 'color-mix(in srgb, #FFFFFF 45%, #F2F2F7)',
  tileOffLabel: '#5F5F64',
  chartNetz: '#8E8E93',
  chartSolar: '#FFCC00',
  chartSolarEdge: '#A67C00',
  chartBar: 'rgba(120,120,128,.32)',
  chartLine: '#3A3A3C',
  chartArea: 'rgba(120,120,128,.14)',
  chartGrid: 'rgba(60,60,67,.36)',
  chartAvg: '#000000',
  seg: '#FFFFFF',
  segShadow: '0 3px 8px rgba(0,0,0,.12), 0 .5px 0 rgba(0,0,0,.04)',
  lens: '#E6E6E9',
  hover: 'rgba(120,120,128,.08)',
  scrim: 'rgba(0,0,0,.25)',
  scrimDesktop: 'rgba(0,0,0,.22)',
  ctxDim: 'rgba(0,0,0,.18)',
  ctxScrimDesktop: 'rgba(242,242,247,.35)',
  avDim: 'rgba(0,0,0,.10)',
  glow: 'rgba(255,255,255,.45)',
  toastBg: 'rgba(28,28,30,.92)',
  toastText: '#FFFFFF',
  bannerReconnecting: 'color-mix(in srgb, #FFCC00 26%, #FFFFFF)',
  bannerLost: 'color-mix(in srgb, #FF3B30 16%, #FFFFFF)',
  edgeTint: '#F2F2F7',
  wallTint: 'rgba(242,242,247,.38)',
};

export type GlasColorKey = keyof typeof LIGHT;

const DARK: Record<GlasColorKey, string> = {
  bg: '#000000',
  card: '#1C1C1E',
  card2: '#2C2C2E',
  cardSolid: '#1C1C1E',
  cardHover: '#2C2C2E',
  group: '#2C2C2E',
  sheetSolid: '#1C1C1E',
  fill: 'rgba(120,120,128,.24)',
  fill2: 'rgba(120,120,128,.36)',
  fillSolid: '#3A3A3C',
  sep: 'rgba(84,84,88,.55)',
  sepStrong: 'rgba(84,84,88,.95)',
  label: '#FFFFFF',
  label2: '#AEAEB2',
  label3: '#8E8E93',
  glassLabel2: '#D1D1D6',
  textFaint: '#A1A1A6',
  glyphDark: '#1C1C1E',
  onMedia: '#FFFFFF',
  mediaBg: '#000000',
  grabber: 'rgba(235,235,245,.30)',
  yellow: '#FFD60A',
  yellowInk: '#FFD60A',
  yellowSoft: 'rgba(255,214,10,.20)',
  orange: '#FF9F0A',
  orangeInk: '#FFB340',
  orangeSoft: 'rgba(255,159,10,.22)',
  teal: '#40C8E0',
  tealInk: '#40C8E0',
  tealSoft: 'rgba(64,200,224,.20)',
  green: '#30D158',
  greenInk: '#30D158',
  greenSoft: 'rgba(48,209,88,.20)',
  red: '#FF453A',
  redInk: '#FF6961',
  redSoft: 'rgba(255,69,58,.22)',
  blue: '#0A84FF',
  blueInk: '#409CFF',
  blueSoft: 'rgba(10,132,255,.22)',
  purple: '#BF5AF2',
  purpleInk: '#DA8FFF',
  indigo: '#5E5CE6',
  indigoInk: '#9D9BFF',
  gray: '#8E8E93',
  warnInk: '#FFD60A',
  warnSoft: 'rgba(255,214,10,.20)',
  switchOn: '#30D158',
  switchOff: 'rgba(120,120,128,.32)',
  knob: '#FFFFFF',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  live: '#D70015',
  liveDot: '#FF3B30',
  actDel: '#D70015',
  actOk: '#1F7A35',
  actNeutral: '#636366',
  binRest: '#8E8E93',
  binPaper: '#0A84FF',
  binYellow: '#FFD60A',
  binBio: '#30D158',
  binBrown: '#AC8E68',
  ct1: '#FFB25B',
  ct2: '#FFD39C',
  ct3: '#FFF3E3',
  ct4: '#DCE8FF',
  tileOn: '#2C2C2E',
  tileOff: '#1C1C1E',
  tileOffLabel: '#AEAEB2',
  chartNetz: '#8E8E93',
  chartSolar: '#FFD60A',
  chartSolarEdge: 'rgba(0,0,0,0)',
  chartBar: 'rgba(120,120,128,.48)',
  chartLine: '#D1D1D6',
  chartArea: 'rgba(120,120,128,.24)',
  chartGrid: 'rgba(84,84,88,.95)',
  chartAvg: '#FFFFFF',
  seg: '#636366',
  segShadow: '0 3px 8px rgba(0,0,0,.30)',
  lens: '#3C3C3D',
  hover: 'rgba(255,255,255,.06)',
  scrim: 'rgba(0,0,0,.45)',
  scrimDesktop: 'rgba(0,0,0,.45)',
  ctxDim: 'rgba(0,0,0,.40)',
  ctxScrimDesktop: 'rgba(0,0,0,.35)',
  avDim: 'rgba(0,0,0,.36)',
  glow: 'rgba(255,255,255,.22)',
  toastBg: 'rgba(58,58,60,.94)',
  toastText: '#FFFFFF',
  bannerReconnecting: 'color-mix(in srgb, #FFD60A 26%, #1C1C1E)',
  bannerLost: 'color-mix(in srgb, #FF453A 16%, #1C1C1E)',
  edgeTint: '#000000',
  wallTint: 'rgba(0,0,0,.42)',
};

export const GLAS_COLORS: Readonly<Record<GlasMode, Readonly<Record<GlasColorKey, string>>>> = { light: LIGHT, dark: DARK };

// ---------------------------------------------------------------------------
// Material (GLAS-DESIGN §3) — given as building blocks; the CSS composes them per element (plan K10)
// ---------------------------------------------------------------------------

/** `--g-glass-tint` per strength; "opaque" has no tint (solid fill, no blur). */
export const GLAS_TINT: Readonly<Record<'clear' | 'tinted', number>> = { clear: 0.25, tinted: 0.75 };

/**
 * Minimum tint per surface; effective tint = max(surface, strength) (GLAS-DESIGN §3.4). `glasCssVars` writes the value
 * of the current strength as `--g-tint-<surface>` (plan Etappe 2, K28); a surface sets
 * `--g-surface-tint: var(--g-tint-<surface>)` and the material recipe takes the maximum.
 */
export const GLAS_SURFACE_TINT = {
  default: { clear: 0.25, tinted: 0.75 },
  tabBar: { clear: 0.6, tinted: 0.75 },
  avatarButton: { clear: 0.6, tinted: 0.75 },
  backButton: { clear: 0.5, tinted: 0.75 },
  dateChip: { clear: 0.55, tinted: 0.75 },
  headerCapsule: { clear: 0.25, tinted: 0.75 },
  sidebar: { clear: 0.5, tinted: 0.8 },
  sheetMedium: { clear: 0.7, tinted: 0.75 },
  dialogDesktop: { clear: 0.68, tinted: 0.85 },
  inspector: { clear: 0.68, tinted: 0.85 },
  toastDesktop: { clear: 0.68, tinted: 0.85 },
  menu: { clear: 0.88, tinted: 0.94 },
} as const;

interface MaterialSet {
  /** fill = linear-gradient(180deg, rgb(rgb / a0 + .40·t), rgb(rgb / a1 + .40·t)) */
  rgb: string; a0: number; a1: number;
  /** filter = blur(6px + 10px·t) saturate(sat) brightness(bright) */
  sat: string; bright: number;
  rim: string;
  /**
   * shadow = `inner, outer` (glas-tokens.json → glass.regular.shadow). The inner part (insets + .5 px hairline) is also
   * `--g-glass-inner`, which the menu and popover shadows of the elevation table start with.
   */
  inner: string; outer: string;
}

const MATERIAL: Record<GlasMode, MaterialSet> = {
  light: {
    rgb: '255 255 255', a0: 0.3, a1: 0.14, sat: '210%', bright: 1.06,
    rim: 'linear-gradient(135deg, rgba(255,255,255,.95) 0%, rgba(255,255,255,.35) 22%, rgba(255,255,255,.06) 50%, rgba(255,255,255,.30) 78%, rgba(255,255,255,.85) 100%)',
    inner: 'inset 1.5px 1.5px 1px -1px rgba(255,255,255,.6), inset -1.5px -1.5px 1px -1px rgba(255,255,255,.4), inset 0 1px 1.5px rgba(255,255,255,.75), inset 0 -1.5px 3px rgba(255,255,255,.22), inset 0 0 16px rgba(255,255,255,.18), inset 0 -12px 20px -14px rgba(0,0,0,.10), 0 0 0 .5px rgba(0,0,0,.10)',
    outer: '0 1px 2px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.14)',
  },
  dark: {
    rgb: '40 40 44', a0: 0.3, a1: 0.2, sat: '180%', bright: 0.9,
    rim: 'linear-gradient(135deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.2) 22%, rgba(255,255,255,.04) 50%, rgba(255,255,255,.17) 78%, rgba(255,255,255,.5) 100%)',
    inner: 'inset 1.5px 1.5px 1px -1px rgba(255,255,255,.32), inset -1.5px -1.5px 1px -1px rgba(255,255,255,.2), inset 0 1px 1.5px rgba(255,255,255,.24), inset 0 0 16px rgba(255,255,255,.05), 0 0 0 .5px rgba(0,0,0,.55)',
    outer: '0 1px 2px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.5)',
  },
};

/**
 * Sheet material (GLAS-DESIGN §3.4, glas-tokens.json → glass.sheet, verbatim): medium sheets, the fill of the desktop
 * dialogs (since Etappe 7: a window reads the same in both presentations) and the phone menus (avatar menu, More and
 * Rooms, context menu). `bottom`/`bright` = the gradient's weaker stop and the filter's brightness, for the contrast
 * tests. Opaque uses the colour `sheetSolid` without a filter.
 */
const SHEET: Record<GlasMode, { fill: string; filter: string; bottom: string; bright: number }> = {
  // Light: white enough that coloured text keeps 4.5:1 over the scrimmed page (Etappe 7, K109; was
  // rgba(246,246,250,.86) → rgba(242,242,247,.80), the inks fell to 3.9:1 over the dimmed page)
  light: {
    fill: 'linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.82))',
    filter: 'blur(28px) saturate(190%) brightness(1.04)',
    bottom: 'rgba(255,255,255,.82)', bright: 1.04,
  },
  dark: {
    fill: 'linear-gradient(180deg, rgba(36,36,40,.86), rgba(28,28,30,.80))',
    filter: 'blur(28px) saturate(170%) brightness(.9)',
    bottom: 'rgba(28,28,30,.80)', bright: 0.9,
  },
};

/**
 * Shadows of the frame (glas-tokens.json → elevation: menuDesktop, popoverDesktop, banner, toastPhone, prominent;
 * "übrige Schatten wie hell" — the same in both modes, the mode lives in `--g-glass-inner`). `chip`: the desktop
 * header's chips and weather pill (GLAS-DESIGN §7.3). `live`: the camera page's LIVE badge and pill (§7.33, stage 6).
 */
export const GLAS_SHADOWS = {
  menu: 'var(--g-glass-inner), 0 2px 6px rgba(0,0,0,.08), 0 24px 60px rgba(0,0,0,.25)',
  popover: 'var(--g-glass-inner), 0 2px 6px rgba(0,0,0,.08), 0 24px 60px rgba(0,0,0,.22)',
  banner: '0 4px 16px rgba(0,0,0,.08)',
  toast: '0 10px 30px rgba(0,0,0,.25)',
  prominent: '0 1px 2px rgba(0,0,0,.08), 0 6px 18px rgba(0,0,0,.12)',
  chip: '0 1px 3px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.08)',
  live: '0 2px 8px rgba(0,0,0,.25)',
} as const;

export type GlasWindowShadow =
  | 'dialog'
  | 'inspector'
  | 'sheetLarge'
  | 'pushedScreen'
  | 'liftContext'
  | 'liftContextDesktop'
  | 'cardHover'
  | 'tileLift'
  | 'tileOnDesktop'
  | 'knob'
  | 'lightGlow';

/**
 * Shadows of windows and gestures (stage 3, plan docs/glas/PLAN-ETAPPE-3.md §5.1; glas-tokens.json → elevation, verbatim):
 * desktop dialog, inspector, large sheet, the page pushed over a sheet and the lifted card of the context menu; since
 * stage 4 (docs/glas/PLAN-ETAPPE-4.md K83) also the tiles: card hover, an "on" tile (phone / desktop), the switch knob
 * and the glow of a lit light circle. Dark overrides `sheetLarge`, both lifts, `cardHover`, `tileLift` and
 * `tileOnDesktop`; the others are the same in both modes.
 */
export const GLAS_WINDOW_SHADOWS: Record<GlasMode, Record<GlasWindowShadow, string>> = {
  light: {
    dialog: 'var(--g-glass-inner), 0 2px 6px rgba(0,0,0,.08), 0 30px 80px rgba(0,0,0,.28)',
    inspector: 'var(--g-glass-inner), 0 2px 6px rgba(0,0,0,.06), 0 24px 70px rgba(0,0,0,.20)',
    sheetLarge: '0 -10px 40px rgba(0,0,0,.14)',
    pushedScreen: '-12px 0 32px rgba(0,0,0,.14)',
    liftContext: '0 18px 50px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.08)',
    liftContextDesktop: '0 18px 50px rgba(0,0,0,.28)',
    cardHover: '0 1px 2px rgba(0,0,0,.05), 0 10px 24px rgba(0,0,0,.08)',
    tileLift: '0 1px 2px rgba(0,0,0,.04), 0 4px 14px rgba(0,0,0,.06)',
    tileOnDesktop: '0 1px 2px rgba(0,0,0,.06), 0 6px 16px rgba(0,0,0,.08)',
    knob: '0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.16)',
    lightGlow: '0 4px 14px rgba(255,204,0,.35)',
  },
  dark: {
    dialog: 'var(--g-glass-inner), 0 2px 6px rgba(0,0,0,.08), 0 30px 80px rgba(0,0,0,.28)',
    inspector: 'var(--g-glass-inner), 0 2px 6px rgba(0,0,0,.06), 0 24px 70px rgba(0,0,0,.20)',
    sheetLarge: '0 -10px 40px rgba(0,0,0,.6)',
    pushedScreen: '-12px 0 32px rgba(0,0,0,.14)',
    liftContext: '0 18px 50px rgba(0,0,0,.6)',
    liftContextDesktop: '0 18px 50px rgba(0,0,0,.6)',
    cardHover: '0 10px 24px rgba(0,0,0,.5)',
    tileLift: 'none',
    tileOnDesktop: '0 6px 16px rgba(0,0,0,.4)',
    knob: '0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.16)',
    lightGlow: '0 4px 14px rgba(255,204,0,.35)',
  },
};

const CLEAR = {
  fill: 'rgba(0,0,0,.20)',
  // Text on clear glass over a picture (the camera tiles' names, the NVR card's pill): white 15 px keeps 4.5:1 over a
  // white picture together with the tile's top shade (GLAS-DESIGN §2.5 rule 5; Etappe 7, K109: .20 gave 1.4:1 over sky)
  textFill: 'rgba(0,0,0,.50)',
  filter: 'blur(4px) saturate(160%)',
  rim: 'linear-gradient(135deg, rgba(255,255,255,.62) 0%, rgba(255,255,255,.2) 24%, rgba(255,255,255,.04) 50%, rgba(255,255,255,.18) 76%, rgba(255,255,255,.52) 100%)',
  shadow: 'inset 1.5px 1.5px 1px -1px rgba(255,255,255,.35), inset 0 1px 1px rgba(255,255,255,.28), inset 0 0 12px rgba(255,255,255,.08), 0 0 0 .5px rgba(0,0,0,.25), 0 6px 20px rgba(0,0,0,.25)',
  textShadow: '0 1px 2px rgba(0,0,0,.45)',
};

// ---------------------------------------------------------------------------
// Motion (GLAS-DESIGN §6.1) — the 41-point phone curves are binding
// ---------------------------------------------------------------------------

export const GLAS_SPRINGS = {
  smooth: {
    linear: 'linear(0, 0.0263, 0.0895, 0.1722, 0.2626, 0.3534, 0.4399, 0.5197, 0.5916, 0.6551, 0.7104, 0.7581, 0.7988, 0.8334, 0.8624, 0.8868, 0.9071, 0.9239, 0.9379, 0.9494, 0.9588, 0.9665, 0.9729, 0.978, 0.9822, 0.9857, 0.9884, 0.9907, 0.9925, 0.994, 0.9952, 0.9961, 0.9969, 0.9975, 0.998, 0.9984, 0.9987, 0.999, 0.9992, 0.9993, 1)',
    fallback: 'cubic-bezier(.3,.6,.04,1)',
    duration: '.5s',
  },
  snappy: {
    linear: 'linear(0, 0.0217, 0.0778, 0.1568, 0.2492, 0.3477, 0.4464, 0.5414, 0.6296, 0.7093, 0.7795, 0.8398, 0.8905, 0.932, 0.9651, 0.9908, 1.0099, 1.0234, 1.0323, 1.0375, 1.0398, 1.0398, 1.0381, 1.0354, 1.0319, 1.028, 1.0241, 1.0202, 1.0165, 1.0131, 1.0101, 1.0075, 1.0053, 1.0035, 1.002, 1.0008, 0.9999, 0.9993, 0.9989, 0.9986, 1)',
    fallback: 'cubic-bezier(.34,.65,0,1.2)',
    duration: '.35s',
  },
  bouncy: {
    linear: 'linear(0, 0.0371, 0.131, 0.2588, 0.4016, 0.5451, 0.679, 0.7967, 0.8947, 0.9716, 1.0283, 1.0667, 1.0892, 1.099, 1.099, 1.092, 1.0806, 1.0669, 1.0524, 1.0384, 1.0258, 1.015, 1.0063, 0.9997, 0.995, 0.992, 0.9904, 0.99, 0.9904, 0.9913, 0.9926, 0.9941, 0.9955, 0.9968, 0.998, 0.999, 0.9997, 1.0003, 1.0007, 1.0009, 1)',
    fallback: 'cubic-bezier(.34,1.2,0,1.12)',
    duration: '.6s',
  },
} as const;

// ---------------------------------------------------------------------------
// Colour math (sRGB, WCAG 2.x)
// ---------------------------------------------------------------------------

export interface Rgba { r: number; g: number; b: number; a: number }

/** #rgb, #rrggbb, rgb()/rgba() with commas or spaces; `transparent`. Anything else (color-mix, gradients) → null. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const h = m[1]!;
    return { r: parseInt(h[0]! + h[0]!, 16), g: parseInt(h[1]! + h[1]!, 16), b: parseInt(h[2]! + h[2]!, 16), a: 1 };
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1]!;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: parseFloat(m[1]!), g: parseFloat(m[2]!), b: parseFloat(m[3]!), a: alpha };
  }
  return null;
}

function mustParse(c: string): Rgba {
  const p = parseColor(c);
  if (!p) throw new Error(`glasTokens: not a plain colour: ${c}`);
  return p;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

export function toHex(c: Pick<Rgba, 'r' | 'g' | 'b'>): string {
  const h = (v: number) => Math.round(clamp255(v)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

/** Alpha-composite `fg` over an opaque `bg` → opaque hex. */
export function compositeOver(fg: string, bg: string): string {
  const f = mustParse(fg), b = mustParse(bg);
  return toHex({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a) });
}

export function relativeLuminance(color: string): number {
  const c = mustParse(color);
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio of two opaque colours (1…21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360, ss = s / 100, ll = l / 100;
  const k = (n: number) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

/**
 * The backdrop of a regular glass surface after its backdrop-filter (brightness only — saturate and blur do not
 * change a uniform grey/white/black backdrop), then the gradient's weakest stop on top. For the contrast tests.
 */
export function glassOver(backdrop: string, mode: GlasMode, tint: number): string {
  const m = MATERIAL[mode];
  const b = mustParse(backdrop);
  const lit = toHex({ r: b.r * m.bright, g: b.g * m.bright, b: b.b * m.bright });
  const [r, g, bb] = m.rgb.split(' ').map(Number) as [number, number, number];
  const alpha = Math.min(1, m.a1 + 0.4 * tint);
  return compositeOver(`rgba(${r},${g},${bb},${alpha})`, lit);
}

/** Like `glassOver` for the sheet material: brightness of its filter, then its weaker gradient stop. */
export function sheetOver(backdrop: string, mode: GlasMode): string {
  const s = SHEET[mode];
  const b = mustParse(backdrop);
  return compositeOver(s.bottom, toHex({ r: b.r * s.bright, g: b.g * s.bright, b: b.b * s.bright }));
}

/**
 * The resting ground of a window (sheet, desktop dialog, the phone's context menu): the sheet material over the page
 * under the window's scrim (Etappe 7, K109 — the pairs before left the scrim out). The dialog's own filter is a little
 * brighter (1.06); the sheet's 1.04 is the safer value.
 */
export function windowGround(mode: GlasMode, scrim: string, page: string): string {
  return sheetOver(compositeOver(scrim, page), mode);
}

/** `color-mix(in srgb, A p%, B)` of two opaque colours → hex (the banner surfaces); a plain colour is returned as is. */
export function resolveMix(input: string): string {
  const m = /^color-mix\(in srgb,\s*([^,]+?)\s+([\d.]+)%,\s*([^,]+?)\s*\)$/.exec(input.trim());
  if (!m) return toHex(mustParse(input));
  const a = mustParse(m[1]!), b = mustParse(m[3]!), p = parseFloat(m[2]!) / 100;
  return toHex({ r: a.r * p + b.r * (1 - p), g: a.g * p + b.g * (1 - p), b: a.b * p + b.b * (1 - p) });
}

/** An opaque colour at `alpha`, for `compositeOver` (a chart part drawn with an opacity). */
function atAlpha(color: string, alpha: number): string {
  const p = mustParse(color);
  return `rgba(${p.r},${p.g},${p.b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Accent (GLAS-DESIGN §2.3)
// ---------------------------------------------------------------------------

export interface GlasAccent {
  /** Bright accent — surfaces only (`--g-accent`) */
  accent: string;
  /** Accessible text/glyph variant (`--g-accent-ink`; also the classic `--accent` in Glas, plan K6) */
  accentInk: string;
  /** Active tab on the lens */
  tabInk: string;
  accentSoft: string;
  /** The one prominent primary action per view */
  prominent: string;
  onProminent: string;
  /** Best text colour on `accentInk` (classic `--on-accent` in Glas) */
  onAccentInk: string;
  focus: string;
}

const NEUTRAL_DARK = '#1C1C1E';

/** Default accents from the sketch, verbatim (glas-tokens.json → accent.default). */
const DEFAULT_ACCENT: Record<GlasMode, Omit<GlasAccent, 'onAccentInk'>> = {
  light: { accent: '#FF9500', accentInk: '#A64B00', tabInk: '#A64B00', accentSoft: 'rgba(255,149,0,.16)', prominent: '#FF9500', onProminent: '#1C1C1E', focus: '#A64B00' },
  dark: { accent: '#FF9F0A', accentInk: '#FFB340', tabInk: '#FFB340', accentSoft: 'rgba(255,159,10,.26)', prominent: '#FF9F0A', onProminent: '#1C1C1E', focus: '#FFB340' },
};

function bestOn(bg: string): string {
  return contrastRatio('#FFFFFF', bg) >= contrastRatio(NEUTRAL_DARK, bg) ? '#FFFFFF' : NEUTRAL_DARK;
}

/** Darken (light) or lighten (dark) until ≥ 4.5:1 against every colour in `against`, at most 40 steps. */
function inkFor(start: string, mode: GlasMode, against: readonly string[], darken: number, lighten: number): string {
  let c = mustParse(start);
  const worst = () => Math.min(...against.map((b) => contrastRatio(toHex(c), b)));
  for (let i = 0; i < 40 && worst() < 4.5; i++) {
    c = mode === 'light'
      ? { r: c.r * darken, g: c.g * darken, b: c.b * darken, a: 1 }
      : { r: c.r + (255 - c.r) * lighten, g: c.g + (255 - c.g) * lighten, b: c.b + (255 - c.b) * lighten, a: 1 };
  }
  return toHex(c);
}

/**
 * Opaque surfaces the accent ink sits on: GLAS-DESIGN §2.3 step 2 names only `bg` (light) / `card` (dark); the ink
 * is also checked against the other surfaces it is used on (grouped rows, fills, the selected pill = accentSoft — in
 * dark mode also on a sheet's lighter `group`, stage 3), because user hues otherwise fall below 4.5:1 there (measured:
 * down to 3.3:1). The default orange is unaffected.
 */
function inkSurfaces(mode: GlasMode, accentSoft: string): string[] {
  const c = GLAS_COLORS[mode];
  // a window over the scrimmed page (sheet and dialog, Etappe 7, K109): links, labels and the selected chip there
  const win = windowGround(mode, c.scrim, c.bg);
  return mode === 'light'
    ? [c.bg, compositeOver(c.fill, c.card), compositeOver(c.fill, c.bg), compositeOver(accentSoft, c.card), win, compositeOver(accentSoft, win)]
    : [c.card, c.card2, compositeOver(c.fill, c.card), compositeOver(accentSoft, c.card), compositeOver(accentSoft, c.group), win, compositeOver(accentSoft, win)];
}

/** Accent family for the user's hue (HAPulse accent slider); without a hue the iOS orange of the sketch. */
export function glasAccent(hue: number | undefined, mode: GlasMode): GlasAccent {
  if (hue === undefined || !Number.isFinite(hue)) {
    const d = DEFAULT_ACCENT[mode];
    return { ...d, onAccentInk: bestOn(d.accentInk) };
  }
  const accent = hslToHex(hue, 78, mode === 'light' ? 50 : 60);
  const a = mustParse(accent);
  const accentSoft = `rgba(${a.r},${a.g},${a.b},${mode === 'light' ? '.16' : '.26'})`;
  const accentInk = inkFor(accent, mode, inkSurfaces(mode, accentSoft), 0.9, 0.12);
  // the lens is opaque (Etappe 7, K109): the active tab's ink reads the same over whatever scrolls behind the bar
  const tabInk = inkFor(accentInk, mode, [GLAS_COLORS[mode].lens], 0.93, 0.1);
  let prominent = accent, onProminent = NEUTRAL_DARK;
  if (contrastRatio(NEUTRAL_DARK, accent) < 4.5) {
    if (contrastRatio('#FFFFFF', accent) >= 4.5) onProminent = '#FFFFFF';
    else { prominent = accentInk; onProminent = bestOn(accentInk); }
  }
  return { accent, accentInk, tabInk, accentSoft, prominent, onProminent, onAccentInk: bestOn(accentInk), focus: accentInk };
}

/**
 * The third tone of a focus ring on a picture (GLAS-DESIGN §2.5 rule 7, WCAG technique C40): two tones ≥ 9:1 apart make
 * sure that one of them stands out ≥ 3:1 against any picture. The focus colour and the card colour inside it are that
 * far apart in dark mode (orange 9.54:1), not in light mode (5.79:1): there a band in the card's counter-tone follows
 * inside. `transparent` when the two are enough.
 */
export function focusPair(focus: string, card: string): string {
  if (contrastRatio(focus, card) >= 9) return 'transparent';
  return contrastRatio('#000000', card) >= contrastRatio('#FFFFFF', card) ? '#000000' : '#FFFFFF';
}

// ---------------------------------------------------------------------------
// Mapping onto HAPulse token names + Glas variables
// ---------------------------------------------------------------------------

export interface GlasInput {
  mode: GlasMode;
  accentHue?: number | undefined;
  /** Effective strength — "opaque" when the admin's "reduce transparency" or the device's system setting asks for it */
  strength: GlasStrength;
  /** `prefers-contrast: more` on this device */
  contrastMore?: boolean | undefined;
  /** `CSS.supports('transition-timing-function', 'linear(0, 1)')` — else the cubic-bezier fallbacks */
  supportsLinear?: boolean | undefined;
}

/** Colour table after the strength / contrast adjustments (GLAS-DESIGN §3.4 "deckend", §3.7). */
function adjustedColors(input: GlasInput): Record<GlasColorKey, string> {
  const c = { ...GLAS_COLORS[input.mode] };
  const light = input.mode === 'light';
  if (input.contrastMore) {
    c.label2 = c.glassLabel2;
    c.sep = light ? 'rgba(60,60,67,.5)' : 'rgba(84,84,88,.95)';
    c.sepStrong = light ? 'rgba(60,60,67,.7)' : 'rgba(160,160,168,.9)';
  } else if (input.strength === 'opaque') {
    c.label2 = c.glassLabel2;
    c.sep = light ? 'rgba(60,60,67,.36)' : 'rgba(84,84,88,.9)';
  }
  return c;
}

/** The 24 classic HAPulse tokens in Glas (GLAS-DESIGN §2.6; `--accent` = ink, plan K6; `--border`, plan K14). */
export function glasThemeTokens(input: GlasInput): ThemeTokens {
  const c = adjustedColors(input);
  const a = glasAccent(input.accentHue, input.mode);
  const light = input.mode === 'light';
  return {
    bg: c.bg,
    bgRaised: c.card,
    bgCard: c.card,
    bgCardHover: c.cardHover,
    bgSubtle: c.fill,
    text: c.label,
    textDim: c.label2,
    textFaint: input.contrastMore ? c.glassLabel2 : c.textFaint,
    accent: a.accentInk,
    accentSoft: a.accentSoft,
    onAccent: a.onAccentInk,
    line: c.sep,
    // Plan K14: not `transparent` (GLAS-DESIGN §2.6) — HAPulse also uses --border for control outlines, switch-off
    // tracks and gauge/progress tracks, which would vanish. Cards are made borderless in styles/glas/base.css.
    border: c.fillSolid,
    positive: c.greenInk,
    positiveSoft: c.greenSoft,
    warning: c.warnInk,
    warningSoft: c.warnSoft,
    danger: c.redInk,
    dangerSoft: c.redSoft,
    info: c.blueInk,
    infoSoft: c.blueSoft,
    shadowCard: light ? '0 .5px 1px rgba(0,0,0,.04)' : 'none',
    shadowElevated: light ? '0 1px 2px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.14)' : '0 1px 2px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.5)',
    shadowActive: light ? '0 1px 2px rgba(0,0,0,.04), 0 4px 14px rgba(0,0,0,.06)' : 'none',
  };
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([a-zA-Z])(\d)/g, '$1-$2').toLowerCase();

/** CSS variable of a classic token key: `bgCardHover` → `--bg-card-hover` (same names as the dashboard's applyTheme). */
export const classicTokenVar = (key: keyof ThemeTokens): string => `--${kebab(key)}`;

/** CSS variable of a Glas colour: `glassLabel2` → `--g-glass-label-2`, `ct1` → `--g-ct-1`. */
export const glasColorVar = (key: GlasColorKey): string => `--g-${kebab(key)}`;

/**
 * Everything `applyAppearance` writes inline on :root in Glas: the 24 classic names + `--g-*`. Every key is either a
 * classic token name (so `applyTheme` resets it when switching back to Klassisch) or starts with `--g-` (removed).
 */
export function glasCssVars(input: GlasInput): Record<string, string> {
  const out: Record<string, string> = {};
  const tokens = glasThemeTokens(input);
  for (const k of Object.keys(tokens) as (keyof ThemeTokens)[]) out[classicTokenVar(k)] = tokens[k];

  const c = adjustedColors(input);
  for (const k of Object.keys(c) as GlasColorKey[]) out[glasColorVar(k)] = c[k];

  const a = glasAccent(input.accentHue, input.mode);
  out['--g-accent'] = a.accent;
  out['--g-accent-ink'] = a.accentInk;
  out['--g-tab-ink'] = a.tabInk;
  out['--g-accent-soft'] = a.accentSoft;
  out['--g-prominent'] = a.prominent;
  out['--g-on-prominent'] = a.onProminent;
  out['--g-focus'] = a.focus;
  out['--g-focus-pair'] = focusPair(a.focus, c.card);

  const m = MATERIAL[input.mode];
  const light = input.mode === 'light';
  out['--g-glass-tint'] = String(input.strength === 'opaque' ? 1 : GLAS_TINT[input.strength]);
  out['--g-glass-rgb'] = m.rgb;
  out['--g-glass-a0'] = String(m.a0);
  out['--g-glass-a1'] = String(m.a1);
  out['--g-glass-sat'] = m.sat;
  out['--g-glass-bright'] = String(m.bright);
  out['--g-glass-rim'] = m.rim;
  out['--g-glass-inner'] = m.inner;
  out['--g-glass-shadow'] = `${m.inner}, ${m.outer}`;
  out['--g-glass-clear-fill'] = CLEAR.fill;
  out['--g-glass-clear-text-fill'] = CLEAR.textFill;
  out['--g-glass-clear-filter'] = CLEAR.filter;
  out['--g-glass-clear-rim'] = CLEAR.rim;
  out['--g-glass-clear-shadow'] = CLEAR.shadow;
  out['--g-glass-clear-text-shadow'] = CLEAR.textShadow;
  // deckend / "Transparenz reduzieren" / prefers-contrast: more (GLAS-DESIGN §3.4, §3.7)
  out['--g-glass-opaque-shadow'] = input.contrastMore
    ? (light ? '0 0 0 1px #000000, 0 10px 30px rgba(0,0,0,.12)' : '0 0 0 1px #FFFFFF')
    : `0 0 0 1px ${c.sepStrong}, 0 10px 30px rgba(0,0,0,.12)`;
  out['--g-glass-opaque-clear-fill'] = 'rgba(0,0,0,.72)';
  out['--g-glass-opaque-clear-shadow'] = input.contrastMore ? '0 0 0 1px rgba(255,255,255,.7)' : '0 0 0 1px rgba(255,255,255,.35)';
  // Frame (plan Etappe 2): minimum tint per surface for the current strength (K28), sheet material and shadows (K29).
  for (const surface of Object.keys(GLAS_SURFACE_TINT) as (keyof typeof GLAS_SURFACE_TINT)[]) {
    if (surface === 'default') continue; // = --g-glass-tint
    out[`--g-tint-${kebab(surface)}`] = String(input.strength === 'opaque' ? 1 : GLAS_SURFACE_TINT[surface][input.strength]);
  }
  out['--g-sheet-fill'] = SHEET[input.mode].fill;
  out['--g-sheet-filter'] = SHEET[input.mode].filter;
  for (const name of Object.keys(GLAS_SHADOWS) as (keyof typeof GLAS_SHADOWS)[]) out[`--g-shadow-${name}`] = GLAS_SHADOWS[name];
  // Windows and gestures (plan Etappe 3 §5.1)
  const windowShadows = GLAS_WINDOW_SHADOWS[input.mode];
  for (const name of Object.keys(windowShadows) as GlasWindowShadow[]) out[`--g-shadow-${kebab(name)}`] = windowShadows[name];
  out['--g-pill-open-ink'] = openPillInk(input.mode, c);

  for (const name of ['smooth', 'snappy', 'bouncy'] as const) {
    const s = GLAS_SPRINGS[name];
    out[`--g-spring-${name}`] = input.supportsLinear === false ? s.fallback : s.linear;
    out[`--g-d-${name}`] = s.duration;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contrast pairs the tests check (GLAS-DESIGN §2.5)
// ---------------------------------------------------------------------------

export interface ContrastPair { name: string; fg: string; bg: string; min: number }

/** Text/glyph pairs that must hold in Glas for a mode/strength; colours composited onto opaque backgrounds. */
export function glasContrastPairs(input: GlasInput): ContrastPair[] {
  const c = adjustedColors(input);
  const t = glasThemeTokens(input);
  const a = glasAccent(input.accentHue, input.mode);
  const light = input.mode === 'light';
  const surfaces: Record<string, string> = { bg: c.bg, card: c.card, card2: c.card2, fillOnCard: compositeOver(c.fill, c.card) };
  const pairs: ContrastPair[] = [];
  for (const [sName, s] of Object.entries(surfaces)) {
    pairs.push({ name: `text on ${sName}`, fg: t.text, bg: s, min: 4.5 });
    pairs.push({ name: `textDim on ${sName}`, fg: t.textDim, bg: s, min: 4.5 });
    pairs.push({ name: `textFaint on ${sName}`, fg: t.textFaint, bg: s, min: 4.5 });
    pairs.push({ name: `accent (ink) on ${sName}`, fg: t.accent, bg: s, min: 4.5 });
  }
  if (light) {
    pairs.push({ name: 'textDim on fill over bg', fg: t.textDim, bg: compositeOver(c.fill, c.bg), min: 4.5 });
    pairs.push({ name: 'accent (ink) on fill over bg', fg: t.accent, bg: compositeOver(c.fill, c.bg), min: 4.5 });
  } else {
    // GLAS-DESIGN §2.5 marks this one a limit case (4.13:1, "vermeiden") — guarded so it never gets worse.
    pairs.push({ name: 'textFaint on fill over card2', fg: t.textFaint, bg: compositeOver(c.fill, c.card2), min: 4.0 });
  }
  for (const ink of ['yellowInk', 'orangeInk', 'tealInk', 'greenInk', 'redInk', 'blueInk', 'purpleInk', 'indigoInk'] as const) {
    pairs.push({ name: `${ink} on card`, fg: c[ink], bg: c.card, min: 4.5 });
    pairs.push({ name: `${ink} on bg`, fg: c[ink], bg: c.bg, min: 4.5 });
  }
  for (const [ink, soft] of [['yellowInk', 'yellowSoft'], ['orangeInk', 'orangeSoft'], ['tealInk', 'tealSoft'], ['greenInk', 'greenSoft'], ['redInk', 'redSoft'], ['blueInk', 'blueSoft']] as const) {
    pairs.push({ name: `${ink} on ${soft} over card`, fg: c[ink], bg: compositeOver(c[soft], c.card), min: 4.5 });
  }
  pairs.push({ name: 'onAccent on accent (classic names)', fg: t.onAccent, bg: t.accent, min: 4.5 });
  pairs.push({ name: 'onProminent on prominent', fg: a.onProminent, bg: a.prominent, min: 4.5 });
  pairs.push({ name: 'tabInk on lens (opaque, also the active symbol of the sidebar)', fg: a.tabInk, bg: c.lens, min: 4.5 });
  pairs.push({ name: 'accent ink on accentSoft over card', fg: a.accentInk, bg: compositeOver(a.accentSoft, c.card), min: 4.5 });
  // A focus ring on a picture (Etappe 7, K109): the focus colour at the edge, the card's colour inside it and, where those
  // two are less than 9:1 apart, a band in the card's counter-tone (`focusPair`). Two of the tones are ≥ 9:1 apart, so
  // one of them stands out ≥ 3:1 against any picture (WCAG technique C40), and the focus colour against the card.
  pairs.push({ name: 'focus ring beside its inner tone on a picture (the card colour)', fg: a.focus, bg: c.card, min: 3 });
  const pair = focusPair(a.focus, c.card);
  pairs.push(pair === 'transparent'
    ? { name: 'ring on a picture: focus colour and card colour (C40)', fg: a.focus, bg: c.card, min: 9 }
    : { name: 'ring on a picture: card colour and its counter-tone (C40)', fg: pair, bg: c.card, min: 9 });
  // Glas in rest (GLAS-DESIGN §2.5 rules 2 and 4), weakest tint of the strength: light over white, #F2F2F7 and
  // #808080; dark over what lies behind it in rest (page background, cards).
  if (input.strength !== 'opaque') {
    const tint = GLAS_TINT[input.strength];
    for (const back of light ? ['#FFFFFF', '#F2F2F7', '#808080'] : ['#000000', '#1C1C1E', '#2C2C2E']) {
      const g = glassOver(back, input.mode, tint);
      pairs.push({ name: `label on glass over ${back}`, fg: c.label, bg: g, min: 4.5 });
      pairs.push({ name: `glassLabel2 on glass over ${back}`, fg: c.glassLabel2, bg: g, min: 4.5 });
    }
  }
  return [
    ...pairs,
    ...mediaContrastPairs(),
    ...frameContrastPairs(input, c, a),
    ...windowContrastPairs(input, c, a),
    ...homeContrastPairs(c, a),
    ...pagesContrastPairs(c, a),
  ];
}

/**
 * Text over a picture (GLAS-DESIGN §2.5 rule 5, §3.6; Etappe 7, K109): the camera tiles' names and the NVR card's pill
 * are clear capsules 32 high, 12 from the top, white 15/20; at the glyphs' bottom (38 px) the tile's top shade (.35 →
 * 0 over 76 px) is half — over a white picture the capsule's text fill carries the rest.
 */
function mediaContrastPairs(): ContrastPair[] {
  const shade = 0.35 * (1 - 38 / 76);
  const white = compositeOver(`rgba(0,0,0,${shade})`, '#FFFFFF');
  return [{ name: 'camera name on clear text glass over a white picture under the top shade', fg: '#FFFFFF', bg: compositeOver(CLEAR.textFill, white), min: 4.5 }];
}

/** Text of the "open" status pill (redSoft) in a window's group: dark, redInk on redSoft over the lighter group is
 * 3.85:1 (the sketch's value), so the text is `label` there; the red dot stays (plan Etappe 3 K71). */
function openPillInk(mode: GlasMode, c: Record<GlasColorKey, string>): string {
  return mode === 'light' ? c.redInk : c.label;
}

/**
 * Windows (plan Etappe 3 §6.1): text in the opaque groups of sheets and dialogs, the status pills there, white on the
 * action colours (swipe actions, destructive buttons), the play glyph (3:1, non-text) and the desktop dialog's and
 * inspector's glass with its own minimum tint. The medium sheet's material is covered by the frame's pairs.
 */
function windowContrastPairs(input: GlasInput, c: Record<GlasColorKey, string>, a: GlasAccent): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const fg of ['label', 'label2', 'redInk', 'greenInk', 'tealInk', 'blueInk', 'yellowInk', 'orangeInk'] as const) {
    pairs.push({ name: `${fg} on group`, fg: c[fg], bg: c.group, min: 4.5 });
  }
  pairs.push({ name: 'accent ink on group', fg: a.accentInk, bg: c.group, min: 4.5 });
  pairs.push({ name: 'accent ink on accentSoft over group (alarm mode)', fg: a.accentInk, bg: compositeOver(a.accentSoft, c.group), min: 4.5 });
  pairs.push({ name: 'label on accentSoft over group (alarm mode)', fg: c.label, bg: compositeOver(a.accentSoft, c.group), min: 4.5 });
  pairs.push({ name: '"open" pill text on redSoft over group', fg: openPillInk(input.mode, c), bg: compositeOver(c.redSoft, c.group), min: 4.5 });
  pairs.push({ name: 'label2 on fill over group ("closed" pill)', fg: c.label2, bg: compositeOver(c.fill, c.group), min: 4.5 });
  pairs.push({ name: 'label on fill over group (secondary button)', fg: c.label, bg: compositeOver(c.fill, c.group), min: 4.5 });
  for (const act of ['actDel', 'actOk', 'actNeutral'] as const) {
    pairs.push({ name: `white on ${act}`, fg: '#FFFFFF', bg: c[act], min: 4.5 });
  }
  pairs.push({ name: 'white play glyph on blue', fg: '#FFFFFF', bg: c.blue, min: 3 });
  if (input.strength !== 'opaque') {
    const light = input.mode === 'light';
    const backs = light ? ['#FFFFFF', '#F2F2F7', '#808080'] : ['#000000', '#1C1C1E', '#2C2C2E'];
    const tint = GLAS_SURFACE_TINT.inspector[input.strength];
    for (const back of backs) {
      const g = glassOver(back, input.mode, tint);
      pairs.push({ name: `label on inspector glass over ${back}`, fg: c.label, bg: g, min: 4.5 });
      pairs.push({ name: `glassLabel2 on inspector glass over ${back}`, fg: c.glassLabel2, bg: g, min: 4.5 });
    }
    // Windows over the scrimmed page (Etappe 7, K109): the sheet on the phone, the dialog from 900 px (the sheet's fill
    // since then) and the phone's context menu. Black/white text against the realistic worst page (rule 4), coloured
    // text and the selected chip (accentSoft) in rest (rule 3).
    const windows = [['sheet', c.scrim], ['dialog', c.scrimDesktop], ['context menu', c.ctxDim]] as const;
    for (const [win, scrim] of windows) {
      for (const back of backs) {
        const g = windowGround(input.mode, scrim, back);
        pairs.push({ name: `label on the ${win} over the scrimmed ${back}`, fg: c.label, bg: g, min: 4.5 });
        pairs.push({ name: `glassLabel2 on the ${win} over the scrimmed ${back}`, fg: c.glassLabel2, bg: g, min: 4.5 });
      }
      for (const back of light ? ['#FFFFFF', '#F2F2F7'] : ['#000000', '#1C1C1E']) {
        const g = windowGround(input.mode, scrim, back);
        for (const ink of ['redInk', 'greenInk', 'tealInk', 'blueInk', 'yellowInk', 'orangeInk', 'warnInk', 'purpleInk', 'indigoInk'] as const) {
          pairs.push({ name: `${ink} on the ${win} over the scrimmed ${back}`, fg: c[ink], bg: g, min: 4.5 });
        }
        pairs.push({ name: `accent ink on the ${win} over the scrimmed ${back}`, fg: a.accentInk, bg: g, min: 4.5 });
        pairs.push({ name: `accent ink on accentSoft (selected chip) on the ${win} over the scrimmed ${back}`, fg: a.accentInk, bg: compositeOver(a.accentSoft, g), min: 4.5 });
      }
    }
  }
  return pairs;
}

/**
 * The overview and the detail (plan Etappe 4 §3): text on the scene and device tiles; their glyphs (3:1, non-text) in
 * the grey circle when off and on the full colour when on; the energy chart's parts on the card (3:1: grid bars, the
 * solar part's edge where yellow on the card is too light, the dashed average at its .7 opacity); the detail chart's
 * line in its ink on the group and over its own area (.22). The ring and the full-colour circle of an active scene
 * need no pair: the tile says "Aktiv".
 */
function homeContrastPairs(c: Record<GlasColorKey, string>, a: GlasAccent): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  const tileOff = resolveMix(c.tileOff);
  for (const [name, tile] of [['tileOff', tileOff], ['tileOn', resolveMix(c.tileOn)]] as const) {
    pairs.push({ name: `label on ${name}`, fg: c.label, bg: tile, min: 4.5 });
    pairs.push({ name: `label2 on ${name}`, fg: c.label2, bg: tile, min: 4.5 });
  }
  pairs.push({ name: 'tileOffLabel on tileOff (device off)', fg: c.tileOffLabel, bg: tileOff, min: 4.5 });
  const circleOff = compositeOver(c.fill, tileOff);
  pairs.push({ name: 'label2 glyph in the grey circle (device off)', fg: c.label2, bg: circleOff, min: 3 });
  for (const ink of ['yellowInk', 'orangeInk', 'tealInk', 'purpleInk', 'indigoInk', 'blueInk'] as const) {
    pairs.push({ name: `${ink} glyph in the grey circle (scene off)`, fg: c[ink], bg: circleOff, min: 3 });
  }
  const onCircle = [['yellow', 'glyphDark'], ['orange', 'glyphDark'], ['teal', 'glyphDark'], ['green', 'glyphDark'], ['purple', 'onBadge'], ['indigo', 'onBadge'], ['blue', 'onBadge']] as const;
  for (const [tone, glyph] of onCircle) {
    pairs.push({ name: `${glyph} glyph on ${tone} (scene or device on)`, fg: c[glyph], bg: c[tone], min: 3 });
  }
  pairs.push({ name: 'grid bars on card', fg: c.chartNetz, bg: c.card, min: 3 });
  const solarEdge = (parseColor(c.chartSolarEdge)?.a ?? 0) > 0 ? c.chartSolarEdge : c.chartSolar;
  pairs.push({ name: 'solar bars (their edge) on card', fg: solarEdge, bg: c.card, min: 3 });
  pairs.push({ name: 'average line on card', fg: compositeOver(atAlpha(c.chartAvg, 0.7), c.card), bg: c.card, min: 3 });
  for (const [name, fill, ink] of [['accent', a.accent, a.accentInk], ['orange', c.orange, c.orangeInk], ['blue', c.blue, c.blueInk]] as const) {
    pairs.push({ name: `${name} chart line on group`, fg: ink, bg: c.group, min: 3 });
    pairs.push({ name: `${name} chart line on its area over group`, fg: ink, bg: compositeOver(atAlpha(fill, 0.22), c.group), min: 3 });
  }
  return pairs;
}

/**
 * The other pages (plan Etappe 5 §3, K93/K94): the text of a field and its placeholder on `fill` over the card and
 * over the page; the chosen choice pill (`accentInk` on `accentSoft` over the card); the yellow of a warning (motion,
 * an open window, a system warning) as text on the card and on its soft tone over the card; the segment's lens with
 * `label` (pool mode, on/off of a switch point); the pool's schedule editor: the hours of an on window `glyphDark` on
 * `teal`, the time at the dragged handle `group` on `label`. Steppers and play draw `label` on `fill`, the playing state
 * white on blue (window pairs). The energy page's tiles: their text is `label`/`label2` on `fill` over the card (the
 * field pairs), the glyph in its circle the tone's ink on its soft tone over that (3:1, non-text); the neutral circle is
 * the card with `label2`. The music page: a playing zone tile's badge `blueInk` on `blueSoft` over the card (the card
 * lies under it: over the tile's `fill` it would be 4.2:1 in light mode); a chosen player's row `label` on
 * `accentSoft`, also its state (`label2` would fall below 4.5:1 for some accents in dark mode); over a library tile's
 * art the more glyph `label` and a favourite's star `yellowInk` on `fillSolid`, the play glyph `glyphDark` on the white
 * knob (3:1, non-text). The playing blue (`blueInk` on `blueSoft`) on the card and the popovers' text on `group` are
 * covered by the general and the window pairs.
 */
function pagesContrastPairs(c: Record<GlasColorKey, string>, a: GlasAccent): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const [name, under] of [['card', c.card], ['bg', c.bg]] as const) {
    const field = compositeOver(c.fill, under);
    pairs.push({ name: `field text (label) on fill over ${name}`, fg: c.label, bg: field, min: 4.5 });
    pairs.push({ name: `field placeholder (label2) on fill over ${name}`, fg: c.label2, bg: field, min: 4.5 });
  }
  pairs.push({ name: 'chosen pill (accentInk on accentSoft over card)', fg: a.accentInk, bg: compositeOver(a.accentSoft, c.card), min: 4.5 });
  pairs.push({ name: 'warnInk on card', fg: c.warnInk, bg: c.card, min: 4.5 });
  pairs.push({ name: 'warnInk on warnSoft over card (motion pill)', fg: c.warnInk, bg: compositeOver(c.warnSoft, c.card), min: 4.5 });
  pairs.push({ name: 'label on seg (segment lens)', fg: c.label, bg: c.seg, min: 4.5 });
  pairs.push({ name: 'glyphDark on teal (hours of an on window, pool schedule editor)', fg: c.glyphDark, bg: c.teal, min: 4.5 });
  pairs.push({ name: 'group on label (time at the dragged handle)', fg: c.group, bg: c.label, min: 4.5 });
  const tile = compositeOver(c.fill, c.card);
  for (const [ink, soft] of [['blueInk', 'blueSoft'], ['greenInk', 'greenSoft'], ['yellowInk', 'yellowSoft'], ['redInk', 'redSoft']] as const) {
    pairs.push({ name: `${ink} glyph on ${soft} over fill over card (energy tile)`, fg: c[ink], bg: compositeOver(c[soft], tile), min: 3 });
  }
  pairs.push({ name: 'blueInk on blueSoft over card (playing zone tile badge, the card under it)', fg: c.blueInk, bg: compositeOver(c.blueSoft, c.card), min: 4.5 });
  pairs.push({ name: 'label on accentSoft over card (chosen player: name and state)', fg: c.label, bg: compositeOver(a.accentSoft, c.card), min: 4.5 });
  pairs.push({ name: 'label glyph on fillSolid (library item more)', fg: c.label, bg: c.fillSolid, min: 3 });
  pairs.push({ name: 'yellowInk glyph on fillSolid (library favourite star)', fg: c.yellowInk, bg: c.fillSolid, min: 3 });
  pairs.push({ name: 'glyphDark on knob (library play)', fg: c.glyphDark, bg: c.knob, min: 3 });
  // The devices page (plan Etappe 5 §7.13): a favourite in the device window, the inverted eye of a hidden entity.
  pairs.push({ name: 'yellowInk glyph on yellowSoft over group (device window favourite)', fg: c.yellowInk, bg: compositeOver(c.yellowSoft, c.group), min: 3 });
  pairs.push({ name: 'bg glyph on label (eye of a hidden entity or card)', fg: c.bg, bg: c.label, min: 3 });
  // Automations and scenes (plan Etappe 5 §7.14): the symbols of the hero's stats in their ink, in the capsule.
  for (const ink of ['greenInk', 'blueInk', 'tealInk'] as const) {
    pairs.push({ name: `${ink} glyph on fill over card (hero stats)`, fg: c[ink], bg: compositeOver(c.fill, c.card), min: 3 });
  }
  // The system page (plan Etappe 5 §7.16): a battery's symbol in its ink in the grey circle; the chips of the
  // security and system heroes lie in the hero's wash (at most half its soft tone): their secondary text `label2`, the
  // dot of a value over its threshold and an alert's symbol in `warnInk` or `redInk`.
  // The percentages (`orangeInk`, `redInk` on the card) and the count of low batteries (`orangeInk` on `orangeSoft`
  // over the card) are general pairs.
  for (const ink of ['orangeInk', 'redInk'] as const) {
    pairs.push({ name: `${ink} glyph on fill over card (battery symbol)`, fg: c[ink], bg: compositeOver(c.fill, c.card), min: 3 });
  }
  for (const soft of ['greenSoft', 'warnSoft', 'redSoft'] as const) {
    const chip = compositeOver(c.fill, compositeOver(atAlpha(c[soft], mustParse(c[soft]).a / 2), c.card));
    pairs.push({ name: `label2 on fill over the ${soft} wash (hero chip)`, fg: c.label2, bg: chip, min: 4.5 });
    for (const ink of ['warnInk', 'redInk'] as const) {
      pairs.push({ name: `${ink} glyph on fill over the ${soft} wash (hero chip dot or symbol)`, fg: c[ink], bg: chip, min: 3 });
    }
  }
  return pairs;
}

/**
 * The frame's pairs (plan Etappe 2 §6.3): each surface with its own minimum tint. Black/white text against the
 * realistic worst backdrops in rest (GLAS-DESIGN §2.5 rule 4); coloured text and glyphs only against what lies
 * behind the surface in rest (rule 3). "Deckend" has no glass: its surfaces are `cardSolid`/`sheetSolid` = card/bg,
 * covered above. The lens is opaque in every strength (Etappe 7, K109); its pair is in the base list.
 */
function frameContrastPairs(input: GlasInput, c: Record<GlasColorKey, string>, a: GlasAccent): ContrastPair[] {
  const light = input.mode === 'light';
  const mode = input.mode;
  const pairs: ContrastPair[] = [];
  const backs = light ? ['#FFFFFF', '#F2F2F7', '#808080'] : ['#000000', '#1C1C1E', '#2C2C2E'];
  const rest = light ? ['#FFFFFF', '#F2F2F7'] : ['#000000', '#1C1C1E'];
  if (input.strength !== 'opaque') {
    const strength = input.strength;
    const t = (surface: keyof typeof GLAS_SURFACE_TINT) => GLAS_SURFACE_TINT[surface][strength];
    for (const back of backs) {
      const tab = glassOver(back, mode, t('tabBar'));
      const side = glassOver(back, mode, t('sidebar'));
      const menu = glassOver(back, mode, t('menu'));
      const toast = glassOver(back, mode, t('toastDesktop'));
      pairs.push({ name: `tab label on tab bar over ${back}`, fg: c.label, bg: tab, min: 4.5 });
      pairs.push({ name: `glassLabel2 on sidebar over ${back}`, fg: c.glassLabel2, bg: side, min: 4.5 });
      pairs.push({ name: `glassLabel2 on fill over sidebar over ${back}`, fg: c.glassLabel2, bg: compositeOver(c.fill, side), min: 4.5 });
      pairs.push({ name: `label on fill over sidebar over ${back}`, fg: c.label, bg: compositeOver(c.fill, side), min: 4.5 });
      pairs.push({ name: `menu text on menu glass over ${back}`, fg: c.label, bg: menu, min: 4.5 });
      pairs.push({ name: `glassLabel2 on menu glass over ${back}`, fg: c.glassLabel2, bg: menu, min: 4.5 });
      pairs.push({ name: `label on desktop toast over ${back}`, fg: c.label, bg: toast, min: 4.5 });
    }
    for (const back of rest) {
      const menu = glassOver(back, mode, t('menu'));
      pairs.push({ name: `accent ink ("dismiss all") on menu glass over ${back}`, fg: a.accentInk, bg: menu, min: 4.5 });
      pairs.push({ name: `accent ink (current row, "on" symbol) on the phone menu over the scrimmed ${back}`, fg: a.accentInk, bg: windowGround(mode, c.scrim, back), min: 4.5 });
      pairs.push({ name: `redInk on desktop toast over ${back}`, fg: c.redInk, bg: glassOver(back, mode, t('toastDesktop')), min: 4.5 });
      pairs.push({ name: `focus ring on glass over ${back}`, fg: a.focus, bg: glassOver(back, mode, GLAS_TINT[strength]), min: 3 });
      // The context menu (stage 3b, GLAS-DESIGN §7.23) lies over the dimmed page: sheet material on the phone, menu glass
      // on the desktop; "Hide" is redInk.
      const dimmed = sheetOver(compositeOver(c.ctxDim, back), mode);
      const scrimmed = glassOver(compositeOver(c.ctxScrimDesktop, back), mode, t('menu'));
      pairs.push({ name: `label on the context menu over the dimmed ${back}`, fg: c.label, bg: dimmed, min: 4.5 });
      pairs.push({ name: `redInk ("hide") on the context menu over the dimmed ${back}`, fg: c.redInk, bg: dimmed, min: 4.5 });
      pairs.push({ name: `label on the desktop context menu over the scrimmed ${back}`, fg: c.label, bg: scrimmed, min: 4.5 });
      pairs.push({ name: `redInk ("hide") on the desktop context menu over the scrimmed ${back}`, fg: c.redInk, bg: scrimmed, min: 4.5 });
    }
    // Sheet material (dark mode also over a bright camera image, GLAS-DESIGN §2.5 table)
    for (const back of light ? ['#FFFFFF', '#F2F2F7', '#808080'] : ['#000000', '#1C1C1E', '#FFFFFF']) {
      pairs.push({ name: `menu text on sheet over ${back}`, fg: c.label, bg: sheetOver(back, mode), min: 4.5 });
      pairs.push({ name: `glassLabel2 on sheet over ${back}`, fg: c.glassLabel2, bg: sheetOver(back, mode), min: 4.5 });
    }
  }
  // Phone toast: dark tinted surface over anything
  for (const back of ['#FFFFFF', '#808080', '#000000']) {
    pairs.push({ name: `toast text on toast over ${back}`, fg: c.toastText, bg: compositeOver(c.toastBg, back), min: 4.5 });
  }
  pairs.push({ name: 'banner text on reconnecting', fg: c.label, bg: resolveMix(c.bannerReconnecting), min: 4.5 });
  pairs.push({ name: 'banner text on lost', fg: c.label, bg: resolveMix(c.bannerLost), min: 4.5 });
  pairs.push({ name: 'onBadge on badge', fg: c.onBadge, bg: c.badge, min: 4.5 });
  for (const s of ['green', 'yellow', 'red', 'gray'] as const) {
    pairs.push({ name: `glyphDark on ${s} (status pill, devices hero)`, fg: c.glyphDark, bg: c[s], min: 4.5 });
  }
  return pairs;
}
