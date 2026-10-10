/**
 * The immersive appearance (0.18.0) must not change the default page: ui.css starts with the stylesheet of 0.17.1,
 * byte for byte, and every rule after it is scoped to `[data-nvr-appearance='immersive']` or styles a class that only
 * renders when the host passes CameraTitle's new `live`/`at` (the badge next to the name).
 * A later release that changes the default rules on purpose updates DEFAULT_BYTES and DEFAULT_SHA256 (sha256 of the
 * part before the new rules) together with its CHANGELOG entry.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// vitest runs from the package root
const CSS = readFileSync(resolve('src/ui/ui.css'));
const DEFAULT_BYTES = 44514;
const DEFAULT_SHA256 = '42ad35c6dcf818f4eeac5c2a9cd1775e1c10af5829ec7c6c2178dfdc6a3bf718';
const SCOPE = "[data-nvr-appearance='immersive']";
/** classes CameraTitle renders only with `live`/`at` */
const NEW_PROP_CLASS = /^\.nvr-cam__(?:name|badge)(?:--[a-z]+)?(?![\w-])/;

/** The selector lists of all style rules (comments removed, @media/@supports entered, @keyframes skipped). */
function selectorLists(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let i = 0;
  const skipBlock = () => {
    for (let depth = 1; depth > 0 && i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
  };
  const block = (): void => {
    while (i < text.length) {
      const open = text.indexOf('{', i);
      const close = text.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) {
        i = close + 1;
        return;
      }
      if (open === -1) {
        i = text.length;
        return;
      }
      const prelude = text.slice(i, open).trim();
      i = open + 1;
      if (/^@(media|supports)\b/.test(prelude)) block();
      else if (prelude.startsWith('@')) skipBlock();
      else {
        out.push(prelude);
        skipBlock();
      }
    }
  };
  block();
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

describe('ui.css: the immersive appearance is an addition', () => {
  it('starts with the stylesheet of 0.17.1, byte for byte', () => {
    const head = CSS.subarray(0, DEFAULT_BYTES);
    expect(createHash('sha256').update(head).digest('hex')).toBe(DEFAULT_SHA256);
    expect(head.toString('utf8')).not.toContain('data-nvr-appearance');
  });

  it('scopes every rule after it to the immersive page or to the new badge', () => {
    const added = selectorLists(CSS.subarray(DEFAULT_BYTES).toString('utf8')).flatMap(split);
    // the parser found the block (a broken walk would pass with nothing to check)
    expect(added.length).toBeGreaterThan(80);
    const unscoped = added.filter((sel) => !sel.includes(SCOPE) && !NEW_PROP_CLASS.test(sel));
    expect(unscoped).toEqual([]);
    // the immersive selectors start at the page root, so nothing outside a CameraPage matches
    for (const sel of added.filter((s) => s.includes(SCOPE))) expect(sel.startsWith(`.nvr-cam${SCOPE}`)).toBe(true);
  });

  it('the badge classes do not occur in the default markup', () => {
    const fixture = readFileSync(resolve('test/ui/fixtures/camerapage-default-0.17.1.html'), 'utf8');
    expect(fixture).not.toMatch(/nvr-cam__(?:name|badge)/);
  });
});
