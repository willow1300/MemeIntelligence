import { describe, expect, it } from 'vitest';
import { createHttpClient } from '../src/providers/http-client.ts';
import { ProviderError } from '../src/providers/errors.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function countingFetch(responses: Array<() => Response>) {
  let calls = 0;
  const impl = async (): Promise<Response> => {
    const r = responses[Math.min(calls, responses.length - 1)]();
    calls += 1;
    return r;
  };
  return { impl: impl as typeof fetch, calls: () => calls };
}

describe('HttpClient', () => {
  it('returns parsed JSON on success', async () => {
    const f = countingFetch([() => jsonResponse({ ok: 1 })]);
    const client = createHttpClient({ baseUrl: 'https://rpc.test', fetch: f.impl });
    await expect(client.post('/x', { a: 1 })).resolves.toEqual({ ok: 1 });
    expect(f.calls()).toBe(1);
  });

  it('retries transient 5xx with backoff and then succeeds', async () => {
    const f = countingFetch([
      () => jsonResponse({ e: 'boom' }, 500),
      () => jsonResponse({ e: 'boom' }, 500),
      () => jsonResponse({ ok: true }),
    ]);
    const client = createHttpClient({
      baseUrl: 'https://rpc.test',
      fetch: f.impl,
      maxRetries: 3,
      backoffBaseMs: 1,
      backoffMaxMs: 4,
    });
    await expect(client.post('/x', {})).resolves.toEqual({ ok: true });
    expect(f.calls()).toBe(3);
  });

  it('treats HTTP 429 as RATE_LIMITED and keeps retrying, then surfaces the error', async () => {
    const f = countingFetch([() => jsonResponse({ e: 'slow down' }, 429)]);
    const client = createHttpClient({
      baseUrl: 'https://rpc.test',
      fetch: f.impl,
      maxRetries: 2,
      backoffBaseMs: 1,
      backoffMaxMs: 4,
    });
    await expect(client.post('/x', {})).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
    expect(f.calls()).toBe(3); // initial + 2 retries
  });

  it('does NOT retry permanent 4xx errors', async () => {
    const f = countingFetch([() => jsonResponse({ e: 'bad request' }, 400)]);
    const client = createHttpClient({ baseUrl: 'https://rpc.test', fetch: f.impl, maxRetries: 3 });
    await expect(client.post('/x', {})).rejects.toMatchObject({ kind: 'PROVIDER_ERROR', retryable: false });
    expect(f.calls()).toBe(1);
  });

  it('surfaces TIMEOUT when the server never responds', async () => {
    const never = (_u: string | URL, _i?: RequestInit): Promise<Response> =>
      new Promise((_resolve) => setTimeout(() => undefined, 10_000));
    const client = createHttpClient({
      baseUrl: 'https://rpc.test',
      fetch: never as typeof fetch,
      maxRetries: 0,
      timeoutMs: 20,
    });
    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });

  it('handles malformed (non-JSON) responses without crashing', async () => {
    const f = countingFetch([() => new Response('not json at all', { status: 200 })]);
    const client = createHttpClient({ baseUrl: 'https://rpc.test', fetch: f.impl });
    const body = await client.get<{ error?: string }>('/x');
    expect(String(body.error)).toContain('non-JSON');
  });

  it('ProviderError carries structured, retryable classification', () => {
    const err = new ProviderError({ kind: 'NETWORK', message: 'offline', provider: 'unit' });
    expect(err.retryable).toBe(true);
    expect(err.kind).toBe('NETWORK');
  });
});
