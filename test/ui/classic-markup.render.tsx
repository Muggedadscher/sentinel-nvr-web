/**
 * Renders the parts 0.21.0 touched without the new props, for test/ui/classic-markup.test.tsx. The same file rendered
 * the fixture on 0.20.2 (`npx vitest run` with CLASSIC_FIXTURE=<file> in a checkout of v0.20.2), so the comparison
 * shows that Klassisch did not change.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import type { SentinelCamera, SentinelStats } from '../../src/api';
import { SentinelUiProvider } from '../../src/ui/context';
import { Hero, HistogramCard, StorageCard } from '../../src/ui/components/Stats';
import { AppearanceSection } from '../../src/ui/components/Appearance';
import { CameraGrid } from '../../src/ui/components/CameraGrid';

const cam = (id: string, extra: Partial<SentinelCamera> = {}): SentinelCamera => ({
  id,
  name: `Cam ${id}`,
  recording: true,
  online: true,
  eventsToday: 3,
  ...extra,
});
const stats = {
  cameras: 2,
  recording: 1,
  eventsToday: 1234,
  bytes: 2.5e11,
  diskTotal: 1e12,
  diskFree: 4e11,
  minFreeGb: 50,
  retentionDays: 14,
  recordingRate: 2e10,
  oldest: Date.UTC(2026, 9, 10),
  storageOk: true,
} as unknown as SentinelStats;

function html(node: ReactNode): string {
  const client = {
    snapshotUrl: (id: string, tick: number) => `snap/${id}?${tick}`,
    segmentThumbUrl: (id: string) => `thumb/${id}`,
    eventThumbUrl: (c: string, ts: number) => `ev/${c}/${ts}`,
  } as any;
  const div = document.createElement('div');
  const root = createRoot(div);
  act(() =>
    root.render(
      <SentinelUiProvider
        value={{
          client,
          t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k),
          locale: 'de-DE',
          nav: { openCamera: () => {} },
        }}
      >
        {node}
      </SentinelUiProvider>,
    ),
  );
  const out = div.innerHTML;
  act(() => root.unmount());
  return out;
}

export function renderClassic(): Record<string, string> {
  const cameras = [cam('1'), cam('2', { online: false })];
  const noop = () => {};
  return {
    hero: html(<Hero cameras={cameras} stats={stats} />),
    histogram: html(<HistogramCard histogram={Array.from({ length: 24 }, (_, i) => i % 5)} />),
    storage: html(<StorageCard stats={stats} />),
    grid: html(<CameraGrid cameras={cameras} />),
    appearance: html(
      <AppearanceSection
        theme="aurora"
        mode="light"
        language="auto"
        languages={[{ id: 'de', label: 'Deutsch' }]}
        onTheme={noop}
        onMode={noop}
        onAccent={noop}
        onLanguage={noop}
      />,
    ),
  };
}
