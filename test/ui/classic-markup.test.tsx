/**
 * Klassisch stays as it was (0.21.0): the parts that got Glas props or classes render without them the markup of 0.20.2
 * (`fixtures/classic-0.20.2.json`, rendered by the same file on v0.20.2). The only intended difference: the stat cards
 * carry `nvr-statcard`, which no Klassisch rule styles.
 */
// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderClassic } from './classic-markup.render';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const FIXTURE = resolve(__dirname, 'fixtures/classic-0.20.2.json');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 9, 21, 12, 30));
  // the histogram marks the viewer's current hour: the same in every zone the tests run in
  vi.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('renders the markup of 0.20.2 without the new props', () => {
  const now = renderClassic();
  if (process.env.CLASSIC_FIXTURE) {
    writeFileSync(process.env.CLASSIC_FIXTURE, JSON.stringify(now, null, 1) + '\n');
    return;
  }
  const before = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string>;
  const intended = (s: string) => s.replace(/ nvr-statcard(?=")/g, '');
  expect(Object.keys(now)).toEqual(Object.keys(before));
  for (const k of Object.keys(before)) expect(intended(now[k]!), k).toBe(before[k]);
  expect(now.histogram).toContain('nvr-statcard');
  expect(now.storage).toContain('nvr-statcard');
});
