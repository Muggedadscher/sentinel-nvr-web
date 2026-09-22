import { describe, expect, it } from 'vitest';
import { hexHue } from '../../src/ui/components/Appearance';
import { THEMES } from '../../src/ui/themes-data';

describe('hexHue', () => {
  it('maps pure colours to their hue', () => {
    expect(hexHue('#ff0000')).toBe(0);
    expect(hexHue('#00ff00')).toBe(120);
    expect(hexHue('#0000ff')).toBe(240);
    expect(hexHue('#808080')).toBe(0);
  });
  it('aurora accent is orange (≈ 34°), ocean accent is blue', () => {
    expect(hexHue(THEMES.aurora.light.accent)).toBeGreaterThan(20);
    expect(hexHue(THEMES.aurora.light.accent)).toBeLessThan(45);
    expect(hexHue(THEMES.ocean.light.accent)).toBeGreaterThan(190);
    expect(hexHue(THEMES.ocean.light.accent)).toBeLessThan(250);
  });
});
