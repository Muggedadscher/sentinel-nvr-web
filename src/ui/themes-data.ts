/**
 * Theme tokens: the four colour identities (aurora / sunset / ocean / forest),
 * each with light + dark token sets, plus the pure mode/accent maths.
 *
 * Copied from HAPulse (https://github.com/jlnbln/HAPulse, packages/core/src/themes.ts),
 * MIT License, Copyright (c) 2026 Julian — see NOTICE.md. Kept verbatim so both
 * consumers stay pixel-identical.
 */
export type ThemeName = 'aurora' | 'sunset' | 'ocean' | 'forest';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedMode = 'light' | 'dark';

export const THEME_NAMES: readonly ThemeName[] = ['aurora', 'sunset', 'ocean', 'forest'];

/** Human-facing labels for the theme identities. */
export const THEME_LABELS: Record<ThemeName, string> = {
  aurora: 'Aurora',
  sunset: 'Sunset',
  ocean: 'Ocean',
  forest: 'Forest',
};

export interface ThemeTokens {
  /** Page background */
  bg: string;
  /** Raised surface (sidebar, sheets) */
  bgRaised: string;
  /** Card surface */
  bgCard: string;
  /** Card hover surface */
  bgCardHover: string;
  /** Subtle inset surface (icon chips, inputs) */
  bgSubtle: string;

  text: string;
  textDim: string;
  textFaint: string;

  /** Primary accent — orange family for aurora (= lights) */
  accent: string;
  accentSoft: string;
  onAccent: string;

  /** Hairline divider (alpha) */
  line: string;
  /** Solid card border */
  border: string;

  positive: string;
  positiveSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  shadowCard: string;
  shadowElevated: string;
  shadowActive: string;
}

interface ThemeVariants {
  light: ThemeTokens;
  dark: ThemeTokens;
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export const THEMES: Record<ThemeName, ThemeVariants> = {
  // Aurora — the default: neutral surfaces, warm orange accent (matches mockups)
  aurora: {
    light: {
      bg: '#f3f4f6',
      bgRaised: '#ffffff',
      bgCard: '#ffffff',
      bgCardHover: '#f8f9fb',
      bgSubtle: '#f1f3f5',
      text: '#1a1d23',
      textDim: '#697079',
      textFaint: '#9aa1ab',
      accent: '#f2941c',
      accentSoft: 'rgba(242, 148, 28, 0.12)',
      onAccent: '#ffffff',
      line: 'rgba(20, 24, 30, 0.07)',
      border: '#e8eaee',
      positive: '#16a34a',
      positiveSoft: 'rgba(22, 163, 74, 0.12)',
      warning: '#e59411',
      warningSoft: 'rgba(229, 148, 17, 0.12)',
      danger: '#e5484d',
      dangerSoft: 'rgba(229, 72, 77, 0.10)',
      info: '#3b82f6',
      infoSoft: 'rgba(59, 130, 246, 0.12)',
      shadowCard: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
      shadowElevated: '0 12px 32px -8px rgba(16, 24, 40, 0.16)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 20px -8px rgba(242, 148, 28, 0.30)',
    },
    dark: {
      bg: '#0f1116',
      bgRaised: '#171a21',
      bgCard: '#171a21',
      bgCardHover: '#1e222b',
      bgSubtle: '#22262f',
      text: '#f2f4f7',
      textDim: '#9aa1ad',
      textFaint: '#646b76',
      accent: '#f5a623',
      accentSoft: 'rgba(245, 166, 35, 0.16)',
      onAccent: '#1a1205',
      line: 'rgba(255, 255, 255, 0.08)',
      border: 'rgba(255, 255, 255, 0.09)',
      positive: '#3ad07f',
      positiveSoft: 'rgba(58, 208, 127, 0.15)',
      warning: '#f5b53d',
      warningSoft: 'rgba(245, 181, 61, 0.15)',
      danger: '#f0686d',
      dangerSoft: 'rgba(240, 104, 109, 0.15)',
      info: '#5fa0f5',
      infoSoft: 'rgba(95, 160, 245, 0.15)',
      shadowCard: '0 2px 8px -2px rgba(0, 0, 0, 0.5)',
      shadowElevated: '0 16px 40px -12px rgba(0, 0, 0, 0.7)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 24px -8px rgba(245, 166, 35, 0.30)',
    },
  },

  // Sunset — warm amber identity, warm-tinted surfaces
  sunset: {
    light: {
      bg: '#f6f1ea',
      bgRaised: '#fffdfa',
      bgCard: '#fffdfa',
      bgCardHover: '#f7f1e9',
      bgSubtle: '#f1e9dd',
      text: '#241d15',
      textDim: '#7c6f5e',
      textFaint: '#b3a692',
      accent: '#d98324',
      accentSoft: 'rgba(217, 131, 36, 0.13)',
      onAccent: '#ffffff',
      line: 'rgba(40, 30, 18, 0.09)',
      border: '#ece2d3',
      positive: '#3f8a5d',
      positiveSoft: 'rgba(63, 138, 93, 0.13)',
      warning: '#c98a1e',
      warningSoft: 'rgba(201, 138, 30, 0.14)',
      danger: '#c75a44',
      dangerSoft: 'rgba(199, 90, 68, 0.12)',
      info: '#3f7da0',
      infoSoft: 'rgba(63, 125, 160, 0.13)',
      shadowCard: '0 1px 3px rgba(80, 55, 20, 0.07)',
      shadowElevated: '0 12px 32px -8px rgba(80, 55, 20, 0.18)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 20px -8px rgba(217, 131, 36, 0.30)',
    },
    dark: {
      bg: '#161310',
      bgRaised: '#1f1b16',
      bgCard: '#241f19',
      bgCardHover: '#2a241d',
      bgSubtle: '#2f2820',
      text: '#f2ece2',
      textDim: '#a39a8c',
      textFaint: '#6f675c',
      accent: '#e8a84b',
      accentSoft: 'rgba(232, 168, 75, 0.16)',
      onAccent: '#1c1610',
      line: 'rgba(242, 236, 226, 0.08)',
      border: 'rgba(242, 236, 226, 0.09)',
      positive: '#8fc7a2',
      positiveSoft: 'rgba(143, 199, 162, 0.16)',
      warning: '#e8a84b',
      warningSoft: 'rgba(232, 168, 75, 0.16)',
      danger: '#e08a78',
      dangerSoft: 'rgba(224, 138, 120, 0.16)',
      info: '#8fb7c7',
      infoSoft: 'rgba(143, 183, 199, 0.16)',
      shadowCard: '0 2px 10px -3px rgba(0, 0, 0, 0.5)',
      shadowElevated: '0 16px 40px -12px rgba(0, 0, 0, 0.66)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 24px -8px rgba(232, 168, 75, 0.28)',
    },
  },

  // Ocean — cool steel-blue identity
  ocean: {
    light: {
      bg: '#eef1f5',
      bgRaised: '#ffffff',
      bgCard: '#ffffff',
      bgCardHover: '#f4f7fa',
      bgSubtle: '#eaeef3',
      text: '#172029',
      textDim: '#5f6c7a',
      textFaint: '#9aa6b3',
      accent: '#2f7fd6',
      accentSoft: 'rgba(47, 127, 214, 0.12)',
      onAccent: '#ffffff',
      line: 'rgba(20, 30, 45, 0.08)',
      border: '#e3e8ee',
      positive: '#159a6e',
      positiveSoft: 'rgba(21, 154, 110, 0.12)',
      warning: '#e09112',
      warningSoft: 'rgba(224, 145, 18, 0.13)',
      danger: '#e0495a',
      dangerSoft: 'rgba(224, 73, 90, 0.11)',
      info: '#2f7fd6',
      infoSoft: 'rgba(47, 127, 214, 0.12)',
      shadowCard: '0 1px 3px rgba(20, 35, 60, 0.07)',
      shadowElevated: '0 12px 32px -8px rgba(20, 35, 60, 0.16)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 20px -8px rgba(47, 127, 214, 0.28)',
    },
    dark: {
      bg: '#0a0c10',
      bgRaised: '#0f1218',
      bgCard: '#12151c',
      bgCardHover: '#181c25',
      bgSubtle: '#1d2230',
      text: '#e8ecf2',
      textDim: '#8a9ab0',
      textFaint: '#566173',
      accent: '#5fa8e8',
      accentSoft: 'rgba(95, 168, 232, 0.16)',
      onAccent: '#06090f',
      line: 'rgba(232, 236, 242, 0.08)',
      border: 'rgba(232, 236, 242, 0.09)',
      positive: '#4dc596',
      positiveSoft: 'rgba(77, 197, 150, 0.16)',
      warning: '#e3b256',
      warningSoft: 'rgba(227, 178, 86, 0.16)',
      danger: '#e68086',
      dangerSoft: 'rgba(230, 128, 134, 0.16)',
      info: '#5fa8e8',
      infoSoft: 'rgba(95, 168, 232, 0.16)',
      shadowCard: '0 2px 12px -3px rgba(0, 0, 0, 0.6)',
      shadowElevated: '0 16px 40px -12px rgba(0, 0, 0, 0.72)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 24px -8px rgba(95, 168, 232, 0.30)',
    },
  },

  // Forest — muted green identity
  forest: {
    light: {
      bg: '#edf1ec',
      bgRaised: '#ffffff',
      bgCard: '#ffffff',
      bgCardHover: '#f3f7f2',
      bgSubtle: '#e8eee7',
      text: '#1b2620',
      textDim: '#5f6f64',
      textFaint: '#9aa89f',
      accent: '#3f9a63',
      accentSoft: 'rgba(63, 154, 99, 0.13)',
      onAccent: '#ffffff',
      line: 'rgba(24, 36, 28, 0.08)',
      border: '#e0e8e1',
      positive: '#2f9a5e',
      positiveSoft: 'rgba(47, 154, 94, 0.13)',
      warning: '#cf9120',
      warningSoft: 'rgba(207, 145, 32, 0.13)',
      danger: '#cf5746',
      dangerSoft: 'rgba(207, 87, 70, 0.11)',
      info: '#3f86a0',
      infoSoft: 'rgba(63, 134, 160, 0.13)',
      shadowCard: '0 1px 3px rgba(24, 45, 32, 0.07)',
      shadowElevated: '0 12px 32px -8px rgba(24, 45, 32, 0.16)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 20px -8px rgba(63, 154, 99, 0.28)',
    },
    dark: {
      bg: '#0c110d',
      bgRaised: '#121812',
      bgCard: '#161d17',
      bgCardHover: '#1d261e',
      bgSubtle: '#212c22',
      text: '#e9efe9',
      textDim: '#8ba091',
      textFaint: '#586860',
      accent: '#5cc486',
      accentSoft: 'rgba(92, 196, 134, 0.16)',
      onAccent: '#06120a',
      line: 'rgba(233, 239, 233, 0.08)',
      border: 'rgba(233, 239, 233, 0.09)',
      positive: '#5cc486',
      positiveSoft: 'rgba(92, 196, 134, 0.16)',
      warning: '#e0b455',
      warningSoft: 'rgba(224, 180, 85, 0.16)',
      danger: '#e6807a',
      dangerSoft: 'rgba(230, 128, 122, 0.16)',
      info: '#62b0c4',
      infoSoft: 'rgba(98, 176, 196, 0.16)',
      shadowCard: '0 2px 12px -3px rgba(0, 0, 0, 0.55)',
      shadowElevated: '0 16px 40px -12px rgba(0, 0, 0, 0.7)',
      shadowActive: '0 0 0 1px var(--accent-soft), 0 6px 24px -8px rgba(92, 196, 134, 0.30)',
    },
  },
};

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

/**
 * Resolve 'auto' to the concrete light/dark based on the OS preference.
 *
 * Pure function — the caller supplies `systemPrefersDark` (e.g. from
 * `window.matchMedia('(prefers-color-scheme: dark)').matches` in the browser,
 * or the platform's equivalent on mobile) so this module stays DOM-free.
 */
export function resolveThemeMode(mode: ThemeMode, systemPrefersDark: boolean): ResolvedMode {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemPrefersDark ? 'dark' : 'light';
}

// ---------------------------------------------------------------------------
// Accent-hue override
// ---------------------------------------------------------------------------

/**
 * Compute the `accent` / `accentSoft` / `onAccent` token overrides for a
 * custom accent hue (0–360), matching the HSL math the dashboard's
 * `applyTheme()` has always used. Mirrors the current inline override exactly:
 * lightness differs by resolved mode (60% dark / 50% light), saturation is
 * fixed at 78%, and the soft alpha differs by mode (0.16 dark / 0.12 light).
 */
export function accentOverride(
  hue: number,
  resolvedMode: ResolvedMode
): { accent: string; accentSoft: string; onAccent: string } {
  const isDark = resolvedMode === 'dark';
  const l = isDark ? 60 : 50;
  const s = 78;
  return {
    accent: `hsl(${hue}, ${s}%, ${l}%)`,
    accentSoft: `hsla(${hue}, ${s}%, ${l}%, ${isDark ? 0.16 : 0.12})`,
    onAccent: isDark ? '#140e04' : '#ffffff',
  };
}
