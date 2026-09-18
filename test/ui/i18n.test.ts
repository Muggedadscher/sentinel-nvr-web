import { describe, it, expect } from 'vitest';
import { translate, createT, interpolate, pickLocale } from '../../src/ui/i18n';
import de from '../../src/ui/locales/de.json';
import en from '../../src/ui/locales/en.json';

describe('ui i18n', () => {
  it('interpolates {vars} and leaves unknown placeholders', () => {
    expect(interpolate('Ziel {days} Tage', { days: 14 })).toBe('Ziel 14 Tage');
    expect(interpolate('{a} {b}', { a: 'x' })).toBe('x {b}');
  });
  it('selects plural categories by count (de)', () => {
    const t = createT(de, en, 'de');
    expect(t('nvr.hero.offline', { count: 1 })).toBe('1 Kamera offline');
    expect(t('nvr.hero.offline', { count: 3 })).toBe('3 Kameras offline');
  });
  it('falls back to English, then to the key', () => {
    expect(translate({}, en, 'de', 'nvr.events.title')).toBe(en['nvr.events.title']);
    expect(translate({}, {}, 'de', 'nvr.nope')).toBe('nvr.nope');
  });
  it('all shipped locales cover every English key', async () => {
    for (const l of ['de', 'es', 'fr', 'it', 'pt', 'sv']) {
      const d = (await import(`../../src/ui/locales/${l}.json`)).default as Record<string, string>;
      for (const k of Object.keys(en)) expect(d[k], `${l}:${k}`).toBeTypeOf('string');
    }
  });
  it('pickLocale maps navigator tags to a shipped locale', () => {
    expect(pickLocale(['de-DE', 'en-US'])).toBe('de');
    expect(pickLocale(['pt-BR'])).toBe('pt');
    expect(pickLocale(['ja-JP'])).toBe('en');
  });
});
