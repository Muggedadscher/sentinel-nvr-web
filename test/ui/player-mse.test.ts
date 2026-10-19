// @vitest-environment jsdom
/**
 * Recorded MSE: segments are fetched one after the other and appended chunk by chunk into one SourceBuffer, each with
 * its own timestampOffset. Lab 19.10.2026 (CT run 1 of 10 failed): on a fast network a 17 MB segment was downloaded
 * long before it was appended; a timeupdate then started the next segment, its timestampOffset was set while chunks of
 * the previous one still waited → InvalidStateError mid media segment → abort() fallback → the parser failed
 * (CHUNK_DEMUXER_ERROR_APPEND_FAILED, MEDIA_ERR_DECODE), the picture stood.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerController } from '../../src/player/controller';

type Chunk = Uint8Array & { seg?: number; last?: boolean };

/** a SourceBuffer that, like Chromium, refuses a timestampOffset between two chunks of one media segment */
class FakeSourceBuffer extends EventTarget {
  updating = false;
  log: string[] = [];
  private mid = false; // inside a media segment
  private off = 0;
  get timestampOffset() {
    return this.off;
  }
  set timestampOffset(v: number) {
    if (this.mid) {
      this.log.push(`offset ${v} REFUSED`);
      throw new DOMException('mid media segment', 'InvalidStateError');
    }
    this.log.push(`offset ${v}`);
    this.off = v;
  }
  appendBuffer(b: Chunk) {
    this.updating = true;
    this.log.push(`append ${b.seg}${b.last ? ' end' : ''}`);
    this.mid = !b.last;
    // appending takes longer than reading the (already downloaded) chunks
    setTimeout(() => {
      this.updating = false;
      this.dispatchEvent(new Event('updateend'));
    }, 0);
  }
  abort() {
    this.log.push('abort');
    this.mid = false;
  }
  remove() {
    /* not reached */
  }
}

function chunks(seg: number, n: number): Chunk[] {
  return Array.from({ length: n }, (_, i) => Object.assign(new Uint8Array(4), { seg, last: i === n - 1 }));
}

afterEach(() => vi.unstubAllGlobals());

describe('recorded MSE feed', () => {
  it('starts the next segment only after every chunk of the previous one is appended', async () => {
    const T = 1_790_000_000_000;
    const segs: Record<string, Chunk[]> = { a: chunks(1, 4), b: chunks(2, 4) };
    // the whole segment arrives at once (LAN): the download is done long before the appends
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        const id = /id=([^&]+)/.exec(u)![1]!;
        const list = [...segs[id]!];
        return {
          ok: true,
          body: {
            getReader: () => ({
              read: async () => (list.length ? { done: false, value: list.shift() } : { done: true }),
            }),
          },
        };
      }),
    );
    const ctl = new PlayerController({ url: (p: string) => p, corsMedia: true } as any, {} as any);
    const c = ctl as any;
    const sb = new FakeSourceBuffer();
    c.v = { currentTime: 0, buffered: { length: 0 }, readyState: 1, paused: false };
    c.clips = [
      { id: 'a', startTime: T, duration: 60000 },
      { id: 'b', startTime: T + 60900, duration: 60000 },
    ];
    Object.assign(c.M, { active: true, sb, ms: {}, base: T, nextIdx: 0, end: 0, mmsGo: true, q: [], feeding: false });
    // what mseStart wires up
    sb.addEventListener('updateend', () => {
      c.drain();
      if (!c.M.feeding && !c.M.q.length) c.feed();
    });
    c.feed();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 0));
      c.feed(); // timeupdate calls feed() all the time
    }
    expect(sb.log).not.toContain('abort');
    expect(sb.log.filter((l) => l.includes('REFUSED'))).toEqual([]);
    expect(sb.log).toEqual([
      'offset 0',
      'append 1',
      'append 1',
      'append 1',
      'append 1 end',
      'offset 60.9',
      'append 2',
      'append 2',
      'append 2',
      'append 2 end',
    ]);
  });
});
