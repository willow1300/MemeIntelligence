// Phase 2A — Provider factory.
//
// Reads DATA_PROVIDER from the environment (or explicit config) and builds the
// matching provider set. Switching providers NEVER changes the intelligence
// engines — they only ever read PostgreSQL through src/lib/data-access.ts.

import type { ProviderConfig, ProviderSet } from './interfaces.ts';
import { ProviderError } from './errors.ts';
import { createMockProvider, MockProvider } from './mock-provider.ts';
import { createSolanaProvider, SolanaProvider } from './solana-provider.ts';
import { createRateLimiter, type RateLimiter } from './rate-limiter.ts';
import type { HttpClient } from './http-client.ts';

export interface ProviderBuildOptions {
  dataProvider?: string;
  /** Inject a limiter (tests / CLI policy). Falls back to env-driven rps. */
  rateLimiter?: RateLimiter | null;
  /** Inject an http client (tests only). */
  httpClient?: HttpClient | null;
}

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : fallback;
}

function num(name: string, fallback: number): number {
  const v = Number(env(name, String(fallback)));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function normalizeProviderName(name: string | undefined): 'mock' | 'solana' {
  const v = (name ?? '').trim().toLowerCase();
  if (v !== 'mock' && v !== 'solana') {
    throw new ProviderError({
      kind: 'INVALID_ARGUMENT',
      message: `DATA_PROVIDER must be "mock" or "solana", got "${v}"`,
      provider: 'env',
      retryable: false,
    });
  }
  return v;
}

/**
 * Build provider configuration from env vars. All credentials must come from
 * the environment (see .env.example) — never from source.
 */
export function buildProviderConfig(overrideDataProvider?: string): ProviderConfig {
  const providerName = overrideDataProvider !== undefined && overrideDataProvider !== ''
    ? normalizeProviderName(overrideDataProvider)
    : normalizeProviderName(env('DATA_PROVIDER', 'mock'));
  return {
    dataProvider: providerName,
    solanaRpcUrl: env('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
    apiKey: env('SOLANA_API_KEY') || null,
    rateLimitRps: num('SOLANA_RATE_LIMIT_RPS', 5),
    maxTxPerIngest: Math.max(1, Math.round(num('SOLANA_MAX_TX_PER_INGEST', 50))),
    requestTimeoutMs: Math.max(1000, Math.round(num('INGEST_REQUEST_TIMEOUT_MS', 15_000))),
    maxRetries: Math.max(0, Math.round(num('INGEST_MAX_RETRIES', 3))),
    backoffBaseMs: Math.max(50, Math.round(num('INGEST_BACKOFF_BASE_MS', 250))),
    backoffMaxMs: Math.max(250, Math.round(num('INGEST_BACKOFF_MAX_MS', 8_000))),
  };
}

/**
 * Build the full ProviderSet for the configured DATA_PROVIDER.
 * Fails fast (INVALID_ARGUMENT) for unknown provider names.
 */
export function buildProviderSet(options?: ProviderBuildOptions): ProviderSet {
  const opts = options ?? {};
  const config = buildProviderConfig(opts.dataProvider);
  const limiter = opts.rateLimiter !== null && opts.rateLimiter !== undefined
    ? opts.rateLimiter
    : createRateLimiter(config.rateLimitRps);

  switch (config.dataProvider) {
    case 'mock': {
      const provider = createMockProvider(config);
      return toSet('mock', provider, provider, provider);
    }
    case 'solana': {
      const provider = createSolanaProvider({
        rpcUrl: config.solanaRpcUrl,
        apiKey: config.apiKey,
        chainId: 'solana-mainnet',
        maxTxPerIngest: config.maxTxPerIngest,
        rateLimiter: limiter,
        httpClient: opts.httpClient ?? undefined,
        maxRetries: config.maxRetries,
        backoffBaseMs: config.backoffBaseMs,
        backoffMaxMs: config.backoffMaxMs,
      });
      return toSet('solana', provider, provider, provider);
    }
    default:
      // Unreachable: buildProviderConfig validates the value.
      throw new ProviderError({ kind: 'INTERNAL', message: 'unreachable provider branch', provider: 'env' });
  }
}

function toSet(
  name: string,
  blockchain: ProviderSet['blockchain'],
  market: ProviderSet['market'],
  launch: ProviderSet['launch'],
): ProviderSet {
  return {
    name,
    blockchain,
    market,
    launch,
    chainSlug: 'solana-mainnet',
    nativeSymbol: 'SOL',
  };
}

export { MockProvider, SolanaProvider };