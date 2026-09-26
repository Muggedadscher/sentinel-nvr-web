import { describe, it, expect } from 'vitest';
import { THEMES, THEME_NAMES, resolveThemeMode, accentOverride } from '../../src/ui/themes-data';
import { TOKEN_TO_VAR } from '../../src/ui/theme';

describe('themes', () => {
  it('ships four identities with light + dark token sets', () => {
    expect(THEME_NAMES).toEqual(['aurora', 'sunset', 'ocean', 'forest']);
    for (const n of THEME_NAMES) {
      for (const m of ['light', 'dark'] as const) {
        for (const key of Object.keys(TOKEN_TO_VAR) as (keyof typeof TOKEN_TO_VAR)[])
          expect(THEMES[n][m][key], `${n}.${m}.${key}`).toBeTypeOf('string');
      }
    }
  });
  it('resolves auto from the system preference', () => {
    expect(resolveThemeMode('auto', true)).toBe('dark');
    expect(resolveThemeMode('auto', false)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
  });
  it('accent override keeps readable on-accent per mode', () => {
    expect(accentOverride(200, 'dark').onAccent).not.toBe(accentOverride(200, 'light').onAccent);
    expect(accentOverride(200, 'light').accent).toMatch(/^hsl\(200/);
  });
});
