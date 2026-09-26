/**
 * Apply a theme to the document (port of HAPulse's dashboard theme façade, MIT,
 * © 2026 Julian — see NOTICE.md). Writes every token as an inline CSS custom
 * property on :root and sets data-theme / data-mode / color-scheme.
 */
import {
  THEMES,
  THEME_NAMES,
  accentOverride,
  resolveThemeMode,
  type ThemeName,
  type ThemeMode,
  type ResolvedMode,
  type ThemeTokens,
} from './themes-data';

export * from './themes-data';

export const TOKEN_TO_VAR: Record<keyof ThemeTokens, string> = {
  bg: '--bg',
  bgRaised: '--bg-raised',
  bgCard: '--bg-card',
  bgCardHover: '--bg-card-hover',
  bgSubtle: '--bg-subtle',
  text: '--text',
  textDim: '--text-dim',
  textFaint: '--text-faint',
  accent: '--accent',
  accentSoft: '--accent-soft',
  onAccent: '--on-accent',
  line: '--line',
  border: '--border',
  positive: '--positive',
  positiveSoft: '--positive-soft',
  warning: '--warning',
  warningSoft: '--warning-soft',
  danger: '--danger',
  dangerSoft: '--danger-soft',
  info: '--info',
  infoSoft: '--info-soft',
  shadowCard: '--shadow-card',
  shadowElevated: '--shadow-elevated',
  shadowActive: '--shadow-active',
};

const darkMql = (): MediaQueryList | null =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** Resolve 'auto' to light/dark from the OS preference. */
export function resolveMode(mode: ThemeMode): ResolvedMode {
  return resolveThemeMode(mode, darkMql()?.matches ?? false);
}

export function isThemeName(name: string): name is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(name);
}

/** Apply identity + mode (+ optional accent hue override) to <html>. */
export function applyTheme(name: ThemeName, mode: ThemeMode = 'light', accentHue?: number): ResolvedMode {
  const root = document.documentElement;
  const theme: ThemeName = isThemeName(name) ? name : 'aurora';
  const resolved = resolveMode(mode);
  const tokens = THEMES[theme][resolved];
  for (const key of Object.keys(TOKEN_TO_VAR) as (keyof ThemeTokens)[])
    root.style.setProperty(TOKEN_TO_VAR[key], tokens[key]);
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-mode', resolved);
  root.style.setProperty('color-scheme', resolved);
  if (accentHue !== undefined) {
    const o = accentOverride(accentHue, resolved);
    root.style.setProperty('--accent', o.accent);
    root.style.setProperty('--accent-soft', o.accentSoft);
    root.style.setProperty('--on-accent', o.onAccent);
  }
  return resolved;
}

/** Re-apply while mode === 'auto' when the OS scheme flips. Returns a cleanup. */
export function watchSystemMode(
  getState: () => { theme: ThemeName; mode: ThemeMode; accentHue?: number | undefined },
): () => void {
  const mql = darkMql();
  if (!mql)
    return () => {
      /* no matchMedia */
    };
  const on = () => {
    const s = getState();
    if (s.mode === 'auto') applyTheme(s.theme, s.mode, s.accentHue);
  };
  mql.addEventListener('change', on);
  return () => mql.removeEventListener('change', on);
}
