/**
 * Minimal translation core with the same dictionary semantics as HAPulse:
 * flat `key: string` dictionaries, `{name}` placeholders, plurals as
 * `key.one` / `key.other` (…any CLDR category) selected by `vars.count`.
 * Hosts with their own i18n layer can ignore this and pass their `t` to the provider.
 */
export type Dict = Record<string, string>;
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

const rulesCache = new Map<string, Intl.PluralRules>();
function plural(locale: string): Intl.PluralRules {
  let r = rulesCache.get(locale);
  if (!r) { try { r = new Intl.PluralRules(locale); } catch { r = new Intl.PluralRules('en'); } rulesCache.set(locale, r); }
  return r;
}

export function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(dict: Dict, fallback: Dict, locale: string, key: string, vars?: Record<string, string | number>): string {
  const candidates: string[] = [];
  if (typeof vars?.count === 'number') {
    candidates.push(`${key}.${plural(locale).select(vars.count)}`, `${key}.other`);
  }
  candidates.push(key);
  for (const c of candidates) {
    const hit = dict[c] ?? fallback[c];
    if (hit !== undefined) return interpolate(hit, vars);
  }
  return key;
}

/** Build a `t` for a locale from a dictionary (+ English fallback). */
export function createT(dict: Dict, fallback: Dict, locale: string): TFn {
  return (key, vars) => translate(dict, fallback, locale, key, vars);
}

/** Locales the package ships dictionaries for (`@sentinel-nvr/web/ui/locales/<code>.json`). */
export const UI_LOCALES = ['de', 'en', 'es', 'fr', 'it', 'pt', 'sv'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** Pick a shipped locale for a BCP-47 tag list (e.g. navigator.languages); English if none matches. */
export function pickLocale(tags: readonly string[]): UiLocale {
  for (const t of tags) {
    const base = t.toLowerCase().split('-')[0] as UiLocale;
    if ((UI_LOCALES as readonly string[]).includes(base)) return base;
  }
  return 'en';
}
