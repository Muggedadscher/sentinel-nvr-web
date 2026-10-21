/**
 * The Glas stylesheet (0.21.0, `src/ui/glas.css`) can only ever reach Glas and only the package's parts: every rule sits
 * under `:root[data-style='glas']`, values only through variables (no hex), no @layer, `!important` only for the fades
 * under reduced motion, a tint on `:hover` only under `@media (hover: hover)` (on a touch screen a hover state sticks
 * after a tap), keyframes named `g-*`, no other at-rules than @media/@supports/@container/@keyframes, and every class
 * it names is the package's (or `nvr-overview`, which the host sets). Klassisch: none of the classes the Glas
 * components and the new props bring (`nvr-gl*`, `nvr-tafel*`, `nvr-glass*`, `nvr-statcard`, `nvr-overview`) is styled
 * in ui.css.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';

const ROOT = ":root[data-style='glas']";
const GLAS = postcss.parse(readFileSync(resolve('src/ui/glas.css'), 'utf8'));
const UI = postcss.parse(readFileSync(resolve('src/ui/ui.css'), 'utf8'));

const ats = (node: Rule | AtRule): AtRule[] => {
  const out: AtRule[] = [];
  for (let p = node.parent; p && p.type === 'atrule'; p = p.parent) out.unshift(p as AtRule);
  return out;
};
const rules: Rule[] = [];
GLAS.walkRules((r) => {
  if (!ats(r).some((a) => /keyframes$/.test(a.name))) rules.push(r);
});
const classesIn = (t: string) => [...t.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
const sources = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
/** every class the package names: ui.css and the components' markup */
const pkgClasses = new Set<string>();
UI.walkRules((r) => classesIn(r.selector).forEach((c) => pkgClasses.add(c)));
for (const f of sources(resolve('src/ui'))) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(/className=\{?[`'"]([^`'"]+)[`'"]/g)) m[1]!.split(/\s+/).forEach((c) => pkgClasses.add(c));
  for (const m of t.matchAll(/['"` ](nvr-[\w-]+)/g)) pkgClasses.add(m[1]!);
}

describe('glas.css', () => {
  it('has the rules (a broken parser would pass with nothing to check)', () => {
    expect(rules.length).toBeGreaterThan(150);
  });

  it('every selector sits under the Glas root', () => {
    const bad = rules.flatMap((r) => r.selectors).filter((s) => !s.startsWith(ROOT));
    expect(bad).toEqual([]);
  });

  it('no hex values, no @layer, only @media/@supports/@container/@keyframes', () => {
    const hex: string[] = [];
    GLAS.walkDecls((d) => {
      if (/#[0-9a-f]{3,8}\b/i.test(d.value)) hex.push(`${d.prop}: ${d.value}`);
    });
    expect(hex).toEqual([]);
    const other: string[] = [];
    GLAS.walkAtRules((a) => {
      if (!['media', 'supports', 'container', 'keyframes'].includes(a.name)) other.push(`@${a.name} ${a.params}`);
    });
    expect(other).toEqual([]);
  });

  it('keyframes are named g-* and every animation names one of them', () => {
    const names: string[] = [];
    GLAS.walkAtRules('keyframes', (a) => void names.push(a.params));
    expect(names.every((n) => n.startsWith('g-'))).toBe(true);
    const used: string[] = [];
    GLAS.walkDecls(/^animation(-name)?$/, (d) => {
      for (const w of d.value.split(/[\s,]+/)) if (w.startsWith('g-')) used.push(w);
    });
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((u) => !names.includes(u))).toEqual([]);
  });

  it('!important only under reduced motion', () => {
    const bad: string[] = [];
    GLAS.walkDecls((d) => {
      if (d.important && !ats(d.parent as Rule).some((a) => /prefers-reduced-motion/.test(a.params)))
        bad.push(`${(d.parent as Rule).selector} ${d.prop}`);
    });
    expect(bad).toEqual([]);
  });

  it('a tint on :hover only under @media (hover: hover)', () => {
    const tint = (prop: string, value: string) =>
      /--g-hover\b|--g-fill-2\b|brightness\(/.test(value) || (prop === 'opacity' && parseFloat(value) < 1);
    const bad = rules
      .filter((r) => r.selectors.some((s) => s.includes(':hover')))
      .filter((r) => !ats(r).some((a) => /\(hover:\s*hover\)/.test(a.params)))
      .filter((r) => r.nodes.some((n) => n.type === 'decl' && tint(n.prop, n.value)))
      .map((r) => r.selector);
    expect(bad).toEqual([]);
  });

  it('names only the package’s classes (and the host’s nvr-overview)', () => {
    const named = new Set(rules.flatMap((r) => classesIn(r.selector)));
    const foreign = [...named].filter((c) => c !== 'nvr-overview' && !pkgClasses.has(c));
    expect(foreign).toEqual([]);
  });
});

describe('Klassisch', () => {
  it('ui.css styles none of the classes Glas brings', () => {
    const glasOnly = /^nvr-(?:gl\b|gl-|gl__|tafel|glass|statcard$|overview$)/;
    const hit: string[] = [];
    UI.walkRules((r) => {
      for (const c of classesIn(r.selector)) if (glasOnly.test(c)) hit.push(`${r.selector} (${c})`);
    });
    expect(hit).toEqual([]);
  });
});
