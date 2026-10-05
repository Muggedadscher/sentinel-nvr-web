/** Clip export calls of SentinelClient (fetch mocked) and the error code from a JSON body. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SentinelClient, SentinelHttpError, sentinelHasFeature } from '../../src/api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

function mockFetch(...answers: Response[]) {
  const f = vi.fn(async () => answers.shift() ?? new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', f);
  return f;
}

const c = new SentinelClient('https://nvr.example', 'tok');

describe('SentinelClient clip export', () => {
  it('startExport POSTs the range with camera and time zone in the query', async () => {
    const start = {
      id: 'x1',
      camera: '33',
      from: 1,
      to: 2,
      clipped: false,
      durationMs: 1,
      segments: 1,
      gaps: [],
      estBytes: 9,
      filename: 'a.mp4',
    };
    const f = mockFetch(json(202, start));
    await expect(c.startExport('33', 1000.4, 61000.6, 'Europe/Berlin')).resolves.toEqual(start);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(url).toBe(
      'https://nvr.example/endpoint/@local/sentinel-nvr/public/api/export?camera=33&from=1000&to=61001&tz=Europe%2FBerlin&token=tok',
    );
  });
  it('an error body becomes code + body of SentinelHttpError', async () => {
    mockFetch(json(413, { error: 'too long', maxMs: 1800000 }));
    const e = (await c.startExport('33', 0, 1).catch((x: unknown) => x)) as SentinelHttpError;
    expect(e).toBeInstanceOf(SentinelHttpError);
    expect(e.status).toBe(413);
    expect(e.code).toBe('too long');
    expect(e.body?.maxMs).toBe(1800000);
  });
  it('a plain-text 404 (older plugin) has no code', async () => {
    mockFetch(new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }));
    const e = (await c.startExport('33', 0, 1).catch((x: unknown) => x)) as SentinelHttpError;
    expect(e.status).toBe(404);
    expect(e.code).toBeUndefined();
  });
  it('a network error is status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    const e = (await c.startExport('33', 0, 1).catch((x: unknown) => x)) as SentinelHttpError;
    expect(e.status).toBe(0);
  });
  it('exportStatus GETs, exportFileUrl carries the token, cancelExport POSTs and never throws', async () => {
    const f = mockFetch(json(200, { id: 'x1', state: 'running', progress: 0.4, filename: 'a.mp4' }));
    await expect(c.exportStatus('x 1')).resolves.toMatchObject({ progress: 0.4 });
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('api/export-status?id=x%201&token=tok');
    expect(c.exportFileUrl('x1')).toBe(
      'https://nvr.example/endpoint/@local/sentinel-nvr/public/api/export-file?id=x1&token=tok',
    );
    const g = mockFetch(new Response(null, { status: 204 }));
    await expect(c.cancelExport('x1')).resolves.toBe(true);
    expect((g.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('POST');
    mockFetch(json(404, { error: 'unknown export' }));
    await expect(c.cancelExport('x1')).resolves.toBe(false);
  });
  it('getJson keeps throwing SentinelHttpError with the status (old callers)', async () => {
    mockFetch(new Response('nope', { status: 500 }));
    const e = (await c.getJson('api/stats').catch((x: unknown) => x)) as SentinelHttpError;
    expect(e.status).toBe(500);
    expect(e.message).toBe('500 api/stats');
  });
  it('the old two-argument constructor still works', () => {
    const e = new SentinelHttpError(401, 'api/x');
    expect([e.status, e.code, e.message]).toEqual([401, undefined, '401 api/x']);
  });
});

describe('sentinelHasFeature', () => {
  it('only an announced feature counts', () => {
    expect(sentinelHasFeature({ features: ['export'] }, 'export')).toBe(true);
    expect(sentinelHasFeature({ features: [] }, 'export')).toBe(false);
    expect(sentinelHasFeature({}, 'export')).toBe(false);
    expect(sentinelHasFeature(null, 'export')).toBe(false);
  });
});
