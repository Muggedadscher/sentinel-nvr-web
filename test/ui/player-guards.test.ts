import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldHandleKey, stageStatus } from '../../src/ui/camera-logic';

const el = (tagName: string, attrs: Record<string, string> = {}, editable = false) =>
  ({ tagName, isContentEditable: editable, getAttribute: (n: string) => attrs[n] ?? null }) as unknown as HTMLElement;
const key = (k: string, target: HTMLElement | null, mods: Partial<KeyboardEvent> = {}) =>
  ({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, ...mods }) as KeyboardEvent;

describe('shouldHandleKey', () => {
  it('plain keys on the page body are shortcuts', () => {
    expect(shouldHandleKey(key(' ', el('BODY')))).toBe(true);
    expect(shouldHandleKey(key('n', el('DIV')))).toBe(true);
  });
  it('not with modifiers (Ctrl+P prints), not when already handled', () => {
    expect(shouldHandleKey(key('p', el('BODY'), { ctrlKey: true }))).toBe(false);
    expect(shouldHandleKey(key('l', el('BODY'), { metaKey: true }))).toBe(false);
    expect(shouldHandleKey(key('ArrowLeft', el('BODY'), { altKey: true }))).toBe(false);
    expect(shouldHandleKey(key(' ', el('BODY'), { defaultPrevented: true }))).toBe(false);
  });
  it('not in form fields / editable content; SPACE stays with a focused button or link', () => {
    expect(shouldHandleKey(key('n', el('INPUT')))).toBe(false);
    expect(shouldHandleKey(key('n', el('DIV', {}, true)))).toBe(false);
    expect(shouldHandleKey(key(' ', el('BUTTON')))).toBe(false);
    expect(shouldHandleKey(key(' ', el('DIV', { role: 'button' })))).toBe(false);
    expect(shouldHandleKey(key('ArrowRight', el('BUTTON')))).toBe(true);
  });
});

describe('stageStatus fallback transport', () => {
  const t = (k: string) => `[${k}]`;
  it('recorded playback on MSE / native says so; relay and live do not', () => {
    const now = new Date(2026, 8, 26, 12).getTime();
    expect(stageStatus({ live: false, label: 'playing', playhead: now, transport: 'mse' }, t, 'de-DE', false, now)).toBe('[nvr.player.playing] ([nvr.player.fallbackMode]) · 12:00:00');
    expect(stageStatus({ live: false, label: 'playing', playhead: now, transport: 'relay' }, t, 'de-DE', false, now)).toBe('[nvr.player.playing] · 12:00:00');
    expect(stageStatus({ live: true, label: 'liveMse', playhead: null, transport: 'mse' }, t, 'de-DE', false, now)).toBe('[nvr.player.liveMse]');
  });
});

describe('rlog rate limit', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); vi.resetModules(); vi.stubGlobal('navigator', { userAgent: 'test' }); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('the same tag at most every 5 s, 20 lines per minute, dropped lines reported with the next one', async () => {
    const { rlog, setRlogClient } = await import('../../src/player/rlog');
    const lines: string[] = [];
    setRlogClient({ postText: (_p: string, l: string) => lines.push(l) } as never, 'test');
    for (let i = 0; i < 10; i++) rlog('play-fail', { i });       // autoplay blocked, every poll
    expect(lines).toHaveLength(1);
    vi.advanceTimersByTime(5001);
    rlog('play-fail', { i: 99 });
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).d.dropped).toBe(9);
    for (let i = 0; i < 40; i++) rlog(`tag${i}`);
    expect(lines.length).toBe(20);
  });
});
