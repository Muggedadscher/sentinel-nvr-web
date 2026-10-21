/**
 * `@sentinel-nvr/web/glas` (0.21.0): applyAppearance writes the classic theme and, in Glas, the Glas variables, the
 * attributes the Glas CSS keys on, the dark subtree and the browser colour; switching back to Klassisch leaves nothing
 * of Glas behind and hands the browser colour to the host.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAppearance,
  darkScopeCss,
  DARK_SCOPE_ID,
  effectiveStrength,
  GLAS_COLORS,
  glasCssVars,
  setAppearanceHost,
  setImmersiveThemeColor,
  styleFields,
  type AppearanceInput,
  type MediaEnv,
} from '../../src/glas';

const ENV: MediaEnv = { contrastMore: false, reducedTransparency: false, supportsLinear: true };
const base: AppearanceInput = {
  theme: 'aurora',
  mode: 'light',
  uiStyle: 'classic',
  glassStrength: 'clear',
  reduceTransparency: false,
};
const root = () => document.documentElement;
const meta = () => document.querySelector('meta[name="theme-color"]')!;

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#123456">';
  setAppearanceHost({});
  setImmersiveThemeColor(false);
});

describe('applyAppearance', () => {
  it('Glas writes the variables, the attributes, the dark subtree and the browser colour', () => {
    applyAppearance({ ...base, uiStyle: 'glas' }, ENV);
    const vars = glasCssVars({ mode: 'light', strength: 'clear', contrastMore: false, supportsLinear: true });
    expect(root().getAttribute('data-style')).toBe('glas');
    expect(root().getAttribute('data-glass')).toBe('clear');
    expect(root().hasAttribute('data-contrast')).toBe(false);
    for (const [k, v] of Object.entries(vars).slice(0, 20)) expect(root().style.getPropertyValue(k)).toBe(v);
    expect(document.getElementById(DARK_SCOPE_ID)?.textContent).toContain("[data-glas-scheme='dark']");
    expect(meta().getAttribute('content')).toBe(GLAS_COLORS.light.bg);
    setImmersiveThemeColor(true);
    expect(meta().getAttribute('content')).toBe(GLAS_COLORS.dark.bg);
  });

  it('Klassisch afterwards: nothing of Glas stays, the page’s browser colour comes back', () => {
    applyAppearance({ ...base, uiStyle: 'glas', mode: 'dark' }, { ...ENV, contrastMore: true });
    expect(root().getAttribute('data-contrast')).toBe('more');
    expect(root().getAttribute('data-glass')).toBe('opaque');
    applyAppearance(base, ENV);
    expect(root().getAttribute('data-style')).toBe('classic');
    expect(root().hasAttribute('data-glass')).toBe(false);
    expect(root().hasAttribute('data-contrast')).toBe(false);
    const left = [...root().style].filter((n) => n.startsWith('--g-'));
    expect(left).toEqual([]);
    expect(document.getElementById(DARK_SCOPE_ID)).toBeNull();
    expect(meta().getAttribute('content')).toBe('#123456');
  });

  it('the host’s rules: floating surfaces in the dark subtree, its own Klassisch browser colour', () => {
    const classic = vi.fn();
    setAppearanceHost({ floating: ['.my-dialog'], classicThemeColor: classic });
    applyAppearance({ ...base, uiStyle: 'glas' }, ENV);
    expect(document.getElementById(DARK_SCOPE_ID)?.textContent).toContain(
      ":root[data-style='glas'][data-g-immersive] .my-dialog",
    );
    applyAppearance(base, ENV);
    expect(classic).toHaveBeenCalled();
  });
});

describe('pure parts', () => {
  it('strength: the switch, the system or more contrast make it opaque', () => {
    expect(effectiveStrength({ glassStrength: 'tinted', reduceTransparency: false }, ENV)).toBe('tinted');
    expect(effectiveStrength({ glassStrength: 'tinted', reduceTransparency: true }, ENV)).toBe('opaque');
    expect(
      effectiveStrength({ glassStrength: 'clear', reduceTransparency: false }, { ...ENV, reducedTransparency: true }),
    ).toBe('opaque');
  });

  it('stored fields are normalised; anything unknown is Klassisch', () => {
    expect(styleFields(null)).toEqual({ uiStyle: 'classic', glassStrength: 'clear', reduceTransparency: false });
    expect(styleFields({ uiStyle: 'glas', glassStrength: 'opaque', reduceTransparency: true })).toEqual({
      uiStyle: 'glas',
      glassStrength: 'opaque',
      reduceTransparency: true,
    });
    expect(styleFields({ uiStyle: 'x', glassStrength: 'y' }).uiStyle).toBe('classic');
  });

  it('the dark subtree without floating surfaces names only the scheme attribute', () => {
    expect(darkScopeCss({ '--a': '1' })).toBe(
      ":root[data-style='glas'] [data-glas-scheme='dark'] { color-scheme: dark; --a: 1; }",
    );
  });
});
