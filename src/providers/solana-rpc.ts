// Phase 2A — Solana JSON-RPC client.
//
// Thin wrapper over the generic HttpClient for `https://api.mainnet-beta.solana.com`
// (or a configured RPC endpoint). Handles:
//   - JSON-RPC request/response envelope
//   - RPC-level errors mapped to structured ProviderError
//   - 429 responses (RATE_LIMITED, retryable)
//   - optional paginated signature listing for wallet/token account lookups
//   - injected fetch + rate limiter for offline tests

import { createHttpClient, type HttpClient } from './http-client.ts';
import { ProviderError } from './errors.ts';
import type { RateLimiter } from './rate-limiter.ts';

export interface SolanaRpcOptions {
  rpcUrl: string;
  apiKey?: string | null;
  httpClient?: HttpClient;
  rateLimiter?: RateLimiter;
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

export interface SolanaSignature {
  signature: string;
  blockTime: number | null;
  slot: number | null;
  err: unknown;
}

export interface SolanaRpcClient {
  /** Call an RPC method once (after acquiring a rate-limit token). */
  call<T>(method: string, params?: unknown[]): Promise<T>;
  /**
   * Page backward through all signatures for an address.
   * Stops when maxItems reached or no more results.
   */
  listSignatures(address: string, maxItems: number): Promise<SolanaSignature[]>;
}

export function createSolanaRpcClient(options: SolanaRpcOptions): SolanaRpcClient {
  const http = options.httpClient ?? createHttpClient({
    baseUrl: options.rpcUrl,
    maxRetries: Math.max(0, options.maxRetries ?? 2),
    backoffBaseMs: options.backoffBaseMs ?? 250,
    backoffMaxMs: options.backoffMaxMs ?? 6000,
    headers: { 'content-type': 'application/json' },
  });

  const limiter = options.rateLimiter;

  const client: SolanaRpcClient = {
    async call<T>(method: string, params?: unknown[]): Promise<T> {
      if (limiter) await limiter.acquire();
      const body = {
        jsonrpc: '2.0',
        id: reqCounter(),
        method,
        params: params ?? [],
      };
      const res = await http.rawPost('', body);
      const payload = res.body as {
        result?: T;
        error?: { code: number; message: string; data?: unknown };
      } | null;

      if (!payload || typeof payload !== 'object') {
        throw new ProviderError({ kind: 'MALFORMED_RESPONSE', message: `RPC ${method}: non-object response`, provider: http.baseUrl });
      }
      if (payload.error) {
        const msg = payload.error.message ?? `RPC ${method} failed`;
        // Common RPC errors that mean "address exists but is not a token mint":
        // -32003 method not found / -32602 invalid params / -32009 tx not found
        if (/not found|invalid params|method not found/.test(msg) && errCodeIsNotFound(payload.error.code)) {
          throw new ProviderError({ kind: 'NOT_FOUND', message: msg, provider: http.baseUrl, retryable: false });
        }
        throw new ProviderError({
          kind: 'PROVIDER_ERROR',
          message: `RPC ${method}: ${msg}`,
          provider: http.baseUrl,
          retryable: payload.error.code >= -32005 && payload.error.code <= -32001,
        });
      }
      return payload.result as T;
    },

    async listSignatures(address: string, maxItems: number): Promise<SolanaSignature[]> {
      const out: SolanaSignature[] = [];
      let before: string | null = null;
      let guard = 0;
      const pageSize = Math.min(1000, Math.max(1, maxItems));

      for (;;) {
        if (guard++ > 50) break; // hard safety valve
        const params: unknown[] = [address, { limit: pageSize, commitment: 'confirmed' }];
        if (before) (params[1] as Record<string, unknown>).before = before;

        let page: SolanaSignature[];
        try {
          page = await client.call<SolanaSignature[]>('getSignaturesForAddress', params);
        } catch (err) {
          if (err instanceof ProviderError && err.kind === 'NOT_FOUND') break; // address has no signatures
          throw err;
        }
        if (!Array.isArray(page) || page.length === 0) break;

        const known = page.filter((s) => s.signature && s.signature !== before);
        if (known.length === 0) break;
        out.push(...known);
        before = known[known.length - 1].signature;
        if (out.length >= maxItems) break;
      }
      return out.slice(0, maxItems);
    },
  };

  return client;
}

let _counter = 0;
function reqCounter(): string {
  _counter += 1;
  return `mie-${_counter}`;
}

function errCodeIsNotFound(code: number): boolean {
  // -32009 = "Transaction Not Found"; others that mean a non-token address.
  return code === -32009 || code === -32602 || code === -32003;
}