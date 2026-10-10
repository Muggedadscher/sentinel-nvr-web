/**
 * Counts on the overview read in the UI language (0.18.0): the events of today in the hero and the segments in the
 * storage card are grouped ("48.210" in German, "48,210" in English).
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { SentinelCamera, SentinelStats } from '../../src/api';
import { SentinelUiProvider } from '../../src/ui/context';
import { Hero, StorageCard } from '../../src/ui/components/Stats';
import { createT } from '../../src/ui/i18n';
import de from '../../src/ui/locales/de.json';
import en from '../../src/ui/locales/en.json';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const cam: SentinelCamera = { id: '1', name: 'Cam 1', recording: true, online: true, eventsToday: 48210 };
const stats: SentinelStats = {
  cameras: 1,
  recording: 1,
  eventsToday: 48210,
  segments: 48210,
  bytes: 1e11,
  retentionDays: 14,
  diskFree: 1e12,
  diskTotal: 2e12,
  minFreeBytes: 1e10,
};

function render(node: React.ReactNode, lang: 'de' | 'en') {
  const client = { snapshotUrl: () => '', segmentThumbUrl: () => '' } as any;
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() =>
    root.render(
      <SentinelUiProvider
        value={{
          client,
          t: lang === 'de' ? createT(de, en, 'de') : createT(en, en, 'en'),
          locale: lang === 'de' ? 'de-DE' : 'en-US',
          nav: {
            openCamera: () => {
              /* */
            },
          },
        }}
      >
        {node}
      </SentinelUiProvider>,
    ),
  );
  return { div, done: () => act(() => root.unmount()) };
}

describe('overview counts in the UI language', () => {
  it('hero: events of today', () => {
    for (const [lang, want] of [
      ['de', '48.210'],
      ['en', '48,210'],
    ] as const) {
      const { div, done } = render(<Hero cameras={[cam]} stats={stats} />, lang);
      expect(div.querySelector('.nvr-hero__primary-value')?.textContent).toBe(want);
      done();
    }
  });

  it('storage card: segments', () => {
    for (const [lang, want] of [
      ['de', '48.210'],
      ['en', '48,210'],
    ] as const) {
      const { div, done } = render(<StorageCard stats={stats} />, lang);
      const row = [...div.querySelectorAll('.nvr-kv li')].find((li) =>
        li.textContent?.startsWith(lang === 'de' ? de['nvr.storage.segments'] : en['nvr.storage.segments']),
      );
      expect(row?.querySelector('b')?.textContent).toBe(want);
      done();
    }
  });
});
