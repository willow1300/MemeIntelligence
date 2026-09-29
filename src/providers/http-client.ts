// Phase 2A — Typed JSON HTTP client for provider RPC calls.
//
// Responsibilities:
//   - POST/GET JSON with a per-request timeout
//   - retry with exponential backoff + jitter for transient failures
//   - surface structured ProviderError for retryable vs permanent errors
//   - allow injected fetch (tests) so no network is needed
//   - never log auth headers / API keys

import { ProviderError, toProviderError } from './errors.ts';

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  headers?: Record<string, string>;
  /** Real fetch impl. Inject stubs in tests. */
  fetch?: typeof fetch;
}

export interface HttpClient {
  baseUrl: string;
  post<T>(path: string, body: unknown): Promise<T>;
  get<T>(path: string): Promise<T>;
  rawPost(path: string, body: unknown): Promise<{ status: number; body: unknown }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ClientConfig {
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  headers: Record<string, string>;
  fetchImpl: typeof fetch;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const config: ClientConfig = {
    timeoutMs: options.timeoutMs ?? 15_000,
    maxRetries: options.maxRetries ?? 3,
    backoffBaseMs: options.backoffBaseMs ?? 250,
    backoffMaxMs: options.backoffMaxMs ?? 8_000,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    fetchImpl: options.fetch ?? ((globalThis as { fetch?: typeof fetch }).fetch as typeof fetch),
  };

  if (typeof config.fetchImpl !== 'function') {
    throw new Error('HttpClient: no fetch implementation available (Node >= 18 or inject one)');
  }

  const base = options.baseUrl.replace(/\/+$/, '');

  return {
    baseUrl: base,
    post: <T>(path: string, body: unknown) => request<T>('POST', base, path, body, config),
    get: <T>(path: string) => request<T>('GET', base, path, undefined, config),
    rawPost: async (path: string, body: unknown) => {
      const url = `${base}${path}`;
      const res = await sendWithRetry(url, 'POST', body, config);
      return { status: res.status, body: res.body };
    },
  };
async function request<T>(
  method: 'GET' | 'POST',
  base: string,
  path: string,
  body: unknown,
  config: ClientConfig,
): Promise<T> {
  const url = `${base}${path}`;
  const res = await sendWithRetry(url, method, body, config);
  if (res.status >= 400) {
    throw new ProviderError({
      kind: 'PROVIDER_ERROR',
      message: `HTTP ${res.status} from ${method} ${path}`,
      provider: base,
      retryable: res.status >= 500 || res.status === 429,
      cause: res.body,
    });
  }
  return res.body as T;
}

interface RawResult {
  status: number;
  body: unknown;
}

async function sendWithRetry(
  url: string,
  method: 'GET' | 'POST',
  body: unknown,
  config: ClientConfig,
): Promise<RawResult> {
  let attempt = 0;
  let lastErr: ProviderError | null = null;

  while (attempt <= config.maxRetries) {
    try {
      const res = await trySend(url, method, body, config, attempt);
      if (res.status >= 500) {
        // 5xx is retryable: classify here so retries actually happen.
        const pErr = new ProviderError({
          kind: 'PROVIDER_ERROR',
          message: `HTTP ${res.status} from ${method} ${pathLabel(url)}`,
          provider: url,
          retryable: true,
          attempt,
          cause: res.body,
        });
        lastErr = pErr;
        if (attempt >= config.maxRetries) throw pErr;
        await sleep(backoffMs(config, attempt));
        attempt += 1;
        continue;
      }
      return res;
    } catch (err) {
      const pErr = toProviderError(err, url, attempt);
      lastErr = pErr;
      if (!pErr.retryable) throw pErr;
      if (attempt >= config.maxRetries) throw pErr;
      await sleep(backoffMs(config, attempt));
      attempt += 1;
    }
  }
  throw lastErr ?? new ProviderError({ kind: 'INTERNAL', message: 'request failed', provider: url });
}

function pathLabel(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '') || '/';
}

async function trySend(
  url: string,
  method: 'GET' | 'POST',
  body: unknown,
  config: ClientConfig,
  attempt: number,
): Promise<RawResult> {
  const timeout = withTimeout(config.fetchImpl, url, method, body, config, config.timeoutMs);
  const res = await timeout;

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    parsed = { error: `non-JSON response (${text.slice(0, 120)})` };
  }

  if (res.status === 429) {
    throw new ProviderError({
      kind: 'RATE_LIMITED',
      message: 'HTTP 429 rate limited',
      provider: url,
      retryable: true,
      attempt,
      cause: parsed,
    });
  }

  if (res.status >= 200 && res.status < 300) {
    return { status: res.status, body: parsed };
  }
  return { status: res.status, body: parsed };
}

async function timeoutRace<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError({ kind: 'TIMEOUT', message: `request timed out after ${ms}ms`, provider: 'http' })), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withTimeout(
  fetchImpl: typeof fetch,
  url: string,
  method: 'GET' | 'POST',
  body: unknown,
  config: ClientConfig,
  ms: number,
): Promise<Response> {
  const headers = config.headers;
  const init: RequestInit = {
    method,
    headers,
  };
  if (method === 'POST') init.body = JSON.stringify(body);
  return timeoutRace(fetchImpl(url, init), ms);
}

function backoffMs(config: ClientConfig, attempt: number): number {
  const exp = Math.min(config.backoffMaxMs, config.backoffBaseMs * Math.pow(2, attempt));
  // Full jitter: random between 0 and the exponential window.
  return Math.round(exp * 0.5 + exp * 0.5 * Math.random());
}
}