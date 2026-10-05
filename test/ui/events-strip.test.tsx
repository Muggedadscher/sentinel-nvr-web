/**
 * Overview events strip: the strip reaches 24 h back, so events before the viewer's midnight carry "yesterday" (the
 * locale's own word from Intl) in front of the time; older ones a short date. Calendar days of the viewer's time zone.
 */
// @vitest-environment jsdom
process.env.TZ = 'Europe/Berlin';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fmtDayPrefix } from '../../src/api';
import { SentinelUiProvider } from '../../src/ui/context';
import { EventsStrip } from '../../src/ui/components/EventsStrip';

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min).getTime();

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('fmtDayPrefix', () => {
  const now = d(2026, 10, 5, 0, 30);
  it('says nothing on today, also for a clock running ahead', () => {
    expect(fmtDayPrefix(d(2026, 10, 5, 0, 0), 'de', now)).toBe('');
    expect(fmtDayPrefix(d(2026, 10, 5, 0, 29), 'de', now)).toBe('');
    expect(fmtDayPrefix(d(2026, 10, 5, 0, 45), 'de', now)).toBe('');
    expect(fmtDayPrefix(d(2026, 10, 6, 1, 0), 'de', now)).toBe('');
  });
  it('yesterday in the locale’s own word, from 00:00 to 23:59', () => {
    expect(fmtDayPrefix(d(2026, 10, 4, 23, 59), 'de', now)).toBe('gestern');
    expect(fmtDayPrefix(d(2026, 10, 4, 0, 0), 'de', now)).toBe('gestern');
    expect(fmtDayPrefix(d(2026, 10, 4, 19, 41), 'en', now)).toBe('yesterday');
    expect(fmtDayPrefix(d(2026, 10, 4, 19, 41), 'sv', now)).toBe('i går');
    expect(fmtDayPrefix(d(2026, 10, 4, 19, 41), 'fr', now)).toBe('hier');
  });
  it('older days with a short date', () => {
    expect(fmtDayPrefix(d(2026, 10, 3, 23, 59), 'de', now)).toBe('3.10.');
    expect(fmtDayPrefix(d(2026, 10, 3, 23, 59), 'en', now)).toBe('10/3');
  });
  it('counts calendar days across the DST changes (25.10. has 25 h, 29.03. 23 h)', () => {
    // the morning after the 25-h day: both 02:30 of 25.10. (CEST and CET) are yesterday
    const after = d(2026, 10, 26, 0, 30);
    expect(fmtDayPrefix(d(2026, 10, 25, 0, 30), 'de', after)).toBe('gestern');
    expect(fmtDayPrefix(d(2026, 10, 25, 2, 30), 'de', after)).toBe('gestern');
    expect(fmtDayPrefix(d(2026, 10, 25, 2, 30) + 3600e3, 'de', after)).toBe('gestern');
    expect(fmtDayPrefix(d(2026, 10, 24, 23, 59), 'de', after)).toBe('24.10.');
    // late on the 25-h day: 24 h back is still the same calendar day, 24.10. evening is yesterday
    expect(fmtDayPrefix(d(2026, 10, 25, 0, 10), 'de', d(2026, 10, 25, 23, 30))).toBe('');
    expect(fmtDayPrefix(d(2026, 10, 24, 23, 59), 'de', d(2026, 10, 25, 23, 30))).toBe('gestern');
    // after the 23-h day
    expect(fmtDayPrefix(d(2026, 3, 29, 0, 5), 'de', d(2026, 3, 30, 0, 10))).toBe('gestern');
    expect(fmtDayPrefix(d(2026, 3, 28, 23, 59), 'de', d(2026, 3, 30, 0, 10))).toBe('28.3.');
  });
});

describe('EventsStrip', () => {
  function render(locale: string) {
    const ev = (ts: number) => ({ camera: '33', cameraName: 'Einfahrt', ts, classes: ['person'], score: 0.9 });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    act(() =>
      root.render(
        <SentinelUiProvider
          value={{
            client: { eventThumbUrl: () => '' } as any,
            t: (k: string) => k,
            locale,
            nav: {
              openCamera: () => {
                /* */
              },
            },
          }}
        >
          <EventsStrip events={[ev(d(2026, 10, 5, 7, 50)), ev(d(2026, 10, 4, 19, 41))]} />
        </SentinelUiProvider>,
      ),
    );
    return [...div.querySelectorAll('.nvr-strip__item')] as HTMLButtonElement[];
  }

  it('today: time only; yesterday: "gestern" in front, also in the accessible label', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 8, 0));
    const [today, yesterday] = render('de-DE');
    expect(today!.querySelector('.nvr-strip__time')!.textContent).toBe('07:50');
    expect(today!.querySelector('.nvr-strip__day')).toBeNull();
    expect(today!.getAttribute('aria-label')).toMatch(/ · Einfahrt · 07:50$/);
    expect(yesterday!.querySelector('.nvr-strip__time')!.textContent).toBe('gestern 19:41');
    expect(yesterday!.querySelector('.nvr-strip__day')!.textContent).toBe('gestern');
    expect(yesterday!.querySelector('.nvr-strip__clock')!.textContent).toBe('19:41');
    expect(yesterday!.getAttribute('aria-label')).toMatch(/ · Einfahrt · gestern 19:41$/);
  });

  it('English keeps its 12-hour clock after the word', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 8, 0));
    const [, yesterday] = render('en');
    expect(yesterday!.querySelector('.nvr-strip__day')!.textContent).toBe('yesterday');
    expect(yesterday!.querySelector('.nvr-strip__clock')!.textContent).toMatch(/^07:41\sPM$/);
  });
});
