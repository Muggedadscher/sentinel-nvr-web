/**
 * The immersive appearance (0.18.0) must not change the default page: ui.css starts with the default stylesheet, byte
 * for byte, and every rule after it is scoped to `[data-nvr-appearance='immersive']` or styles a class that only
 * renders when the host passes CameraTitle's new `live`/`at` (the badge next to the name).
 * A later release that changes the default rules on purpose updates DEFAULT_BYTES and DEFAULT_SHA256 (sha256 of the
 * part before the new rules) together with its CHANGELOG entry — 0.19.0 did (the section titles' optional icon, the
 * clip bar's first row that never wraps). The added part may hold only style rules (inside @media/@supports at most),
 * no other at-rules, nesting or sibling combinators.
 * 0.19.1: on phones the picture's card is sticky (iOS 26 takes it for the top bar). Only that rule positions the card,
 * the immersive part leaves its column as tall as the card (so it cannot move) and the stage's opaque background as
 * it is (the colour of the status bar).
 * 0.19.2 changed the default rules on purpose: the camera tile's picture box (`.nvr-camtile__pic`).
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// vitest runs from the package root
const CSS = readFileSync(resolve('src/ui/ui.css'));
const DEFAULT_BYTES = 45420;
const DEFAULT_SHA256 = '809233a8cf60214d698a9d1464794b612e91c0fe99dd9268a5503d7a035edf1b';
const SCOPE = "[data-nvr-appearance='immersive']";
/** classes CameraTitle renders only with `live`/`at` */
const NEW_PROP_CLASS = /^\.nvr-cam__(?:name|badge)(?:--[a-z]+)?(?![\w-])/;

interface Walk {
  /** selector lists of the style rules (inside @media/@supports too) */
  selectors: string[];
  /** the style rules: selector list, declarations, the @media/@supports preludes around them */
  rules: { sel: string; decl: string; within: string[] }[];
  /** every other at-rule, with or without a block (@layer, @keyframes, @property, `@layer a;` …) */
  atRules: string[];
  /** style rules that hold a nested rule (CSS nesting) */
  nested: string[];
}

/** Walks a stylesheet: comments removed, braces and semicolons inside strings neutralised (`content: '}'`),
 *  @media/@supports entered; anything else that could reach the default page is reported, not skipped. */
function walk(css: string): Walk {
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m.replace(/[{};]/g, '_'));
  const out: Walk = { selectors: [], rules: [], atRules: [], nested: [] };
  let i = 0;
  const nextStop = (): number => {
    const re = /[{};]/g;
    re.lastIndex = i;
    return re.exec(text)?.index ?? -1;
  };
  /** after a `{`: up to the matching `}`; `rule` = the style rule whose body this is (a `{` in it = nesting) */
  const body = (rule?: string): void => {
    for (let depth = 1; depth > 0 && i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 1 && rule !== undefined) out.nested.push(rule);
        depth++;
      } else if (text[i] === '}') depth--;
    }
  };
  const group = (within: string[]): void => {
    while (i < text.length) {
      const k = nextStop();
      if (k === -1) {
        i = text.length;
        return;
      }
      const prelude = text.slice(i, k).trim();
      const stop = text[k];
      i = k + 1;
      if (stop === '}') return;
      if (stop === ';') {
        if (prelude.startsWith('@')) out.atRules.push(prelude);
        continue;
      }
      if (/^@(media|supports)\b/.test(prelude)) group([...within, prelude]);
      else if (prelude.startsWith('@')) {
        out.atRules.push(prelude);
        body();
      } else {
        out.selectors.push(prelude);
        const from = i;
        body(prelude);
        out.rules.push({ sel: prelude, decl: text.slice(from, i - 1), within });
      }
    }
  };
  group([]);
  return out;
}

/** A selector list split at its top-level commas (`:is(a, b)` stays one). */
function split(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < list.length; k++) {
    const c = list[k];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(start, k));
      start = k + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((p) => p.replace(/\s+/g, ' ').trim());
}

/** The selector without its parenthesised and bracketed parts (`:is(…)`, `[attr~=…]`). */
function topLevel(sel: string): string {
  let depth = 0;
  let out = '';
  for (const c of sel) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0) out += c;
  }
  return out;
}

/** Whether the selector's last compound is the element with this class itself (not a pseudo-element of it). */
function targets(sel: string, cls: string): boolean {
  const last =
    topLevel(sel)
      .trim()
      .split(/\s*[\s>+~]\s*/)
      .pop() ?? '';
  return new RegExp(`\\.${cls}(?![\\w-])`).test(last) && !/::|:(?:before|after|first-line|first-letter)\b/.test(last);
}

/** The style rules of a stylesheet (default: all of ui.css) that target the class and set one of the properties. */
function setting(cls: string, props: RegExp, css = CSS.toString('utf8')) {
  const prop = new RegExp(`(?:^|;)\\s*(?:${props.source})\\s*:`);
  return walk(css).rules.filter((r) => split(r.sel).some((sel) => targets(sel, cls)) && prop.test(r.decl));
}

/** What the scope check needs from an added part of the stylesheet. */
function check(css: string) {
  const w = walk(css);
  const added = w.selectors.flatMap(split);
  return {
    added,
    atRules: w.atRules,
    nested: w.nested,
    unscoped: added.filter((sel) => !sel.includes(SCOPE) && !NEW_PROP_CLASS.test(sel)),
    // a sibling combinator or nesting could reach elements outside the page
    reaching: added.filter((sel) => /[~+&]/.test(topLevel(sel))),
    // the immersive selectors start at the page root, so nothing outside a CameraPage matches
    offRoot: added.filter((sel) => sel.includes(SCOPE) && !sel.startsWith(`.nvr-cam${SCOPE}`)),
  };
}

describe('ui.css: the immersive appearance is an addition', () => {
  it('starts with the default stylesheet, byte for byte', () => {
    const head = CSS.subarray(0, DEFAULT_BYTES);
    expect(createHash('sha256').update(head).digest('hex')).toBe(DEFAULT_SHA256);
    expect(head.toString('utf8')).not.toContain('data-nvr-appearance');
  });

  it('scopes every rule after it to the immersive page or to the new badge', () => {
    const r = check(CSS.subarray(DEFAULT_BYTES).toString('utf8'));
    // the parser found the block (a broken walk would pass with nothing to check)
    expect(r.added.length).toBeGreaterThan(80);
    expect(r.unscoped).toEqual([]);
    expect(r.offRoot).toEqual([]);
    expect(r.reaching).toEqual([]);
    // no @keyframes, @property, @layer … (they act on the whole document), no nested rules
    expect(r.atRules).toEqual([]);
    expect(r.nested).toEqual([]);
  });

  it('the check itself catches what would reach the default page', () => {
    const S = `.nvr-cam${SCOPE}`;
    expect(check(`@layer x { .a { color: red } }`).atRules).toEqual(['@layer x']);
    expect(check(`@layer a; .b { color: red }`)).toMatchObject({ atRules: ['@layer a'], unscoped: ['.b'] });
    expect(check(`@keyframes nvr-span-run { from { opacity: 0 } }`).atRules).toEqual(['@keyframes nvr-span-run']);
    expect(check(`@property --nvr-overlay { inherits: false }`).atRules).toEqual(['@property --nvr-overlay']);
    expect(check(`${S} .c { content: '}'; } .d { color: red }`).unscoped).toEqual(['.d']);
    expect(check(`${S} .e { & .f { color: red } }`).nested).toEqual([`${S} .e`]);
    expect(check(`${S} ~ .x { color: red }`).reaching).toEqual([`${S} ~ .x`]);
    expect(check(`.nvr-cam__badge + .x { color: red }`).reaching).toEqual(['.nvr-cam__badge + .x']);
    expect(check(`.x ${S} { color: red }`).offRoot).toEqual([`.x ${S}`]);
    expect(check(`@media (hover: hover) { .g { color: red } }`).unscoped).toEqual(['.g']);
    // allowed: attribute operators and :is() lists
    expect(check(`${S} [class~='a'] :is(.b, .c) { color: red }`)).toMatchObject({ reaching: [], unscoped: [] });
  });

  it('phones: the picture card is sticky, no other rule positions it (iOS 26 takes it for the top bar, 0.19.1)', () => {
    const pos = setting('nvr-stage-card', /position/);
    expect(pos.map((r) => [r.within, split(r.sel)])).toEqual([
      [['@media (max-width: 899px)'], [`.nvr-cam${SCOPE} .nvr-stage-card`]],
    ]);
    expect(pos[0]!.decl).toMatch(/\bposition: sticky;/);
    expect(pos[0]!.decl).toMatch(/\btop: 0;/);
  });

  it('phones: the card cannot move, keeps its width and lies on the stage, opaque as before', () => {
    const added = CSS.subarray(DEFAULT_BYTES).toString('utf8');
    // its column stays as tall as the card: nothing immersive makes it taller or dissolves it
    const column = /display|flex(?:-grow|-basis)?|(?:min-)?(?:height|block-size)|padding(?:-[a-z-]+)?/;
    expect(setting('nvr-cam__left', column, added)).toEqual([]);
    // the card keeps its width and place (WebKit takes it only when it is at least 90 % as wide as the viewport)
    const size = /(?:min-|max-)?(?:width|inline-size)|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?/;
    expect(setting('nvr-stage-card', size, added)).toEqual([]);
    // the stage's background in the default stylesheet is opaque (the colour iOS gives the status bar) …
    expect(CSS.subarray(0, DEFAULT_BYTES).toString('utf8')).toMatch(
      /\n\.nvr-stage \{[^}]*\bbackground: color-mix\(in srgb, var\(--bg\) 35%, black\);/,
    );
    // … and the immersive part leaves it as it is (its gradients are pseudo-elements)
    expect(setting('nvr-stage', /background(?:-color|-image)?/, added)).toEqual([]);
  });

  it('the card checks themselves find what they look for', () => {
    const S = `.nvr-cam${SCOPE}`;
    const pos = (css: string) => setting('nvr-stage-card', /position/, css).map((r) => r.sel);
    expect(pos(`.nvr-stage-card { position: relative }`)).toEqual(['.nvr-stage-card']);
    expect(pos(`@media (x) { ${S} .a > .nvr-stage-card:hover { color: red; position: fixed } }`)).toEqual([
      `${S} .a > .nvr-stage-card:hover`,
    ]);
    expect(pos(`.a, ${S} :is(.b, .c) .nvr-stage-card { position: static }`)).toHaveLength(1);
    // not the card itself: a pseudo-element, an element inside it, another class, another property
    expect(pos(`.nvr-stage-card::before { position: absolute } .nvr-stage-card .x { position: absolute }`)).toEqual([]);
    expect(pos(`.nvr-stage-cards { position: absolute } .nvr-stage-card { --position: 1; inset: 0 }`)).toEqual([]);
    expect(
      setting('nvr-cam__left', /padding(?:-[a-z-]+)?/, `${S} .nvr-cam__left { padding-bottom: 1px }`),
    ).toHaveLength(1);
    const bg = `${S} .nvr-stage { background-color: red } ${S} .nvr-stage::before { background: red }`;
    expect(setting('nvr-stage', /background(?:-color|-image)?/, bg)).toHaveLength(1);
  });

  it('the badge classes do not occur in the default markup', () => {
    const fixture = readFileSync(resolve('test/ui/fixtures/camerapage-default-0.17.1.html'), 'utf8');
    expect(fixture).not.toMatch(/nvr-cam__(?:name|badge)/);
  });
});
