// Real Solana provider adapter tests. All RPC traffic is stubbed at the fetch
// boundary inside a REAL HttpClient — no network, but retry/backoff/429 paths
// are genuinely exercised. Verifies normalization into MIE types and
// structured errors.
import { describe, expect, it } from 'vitest';
import { SolanaProvider } from '../src/providers/solana-provider.ts';
import { createHttpClient, type HttpClient } from '../src/providers/http-client.ts';
import { tokenDeltaForMint, compactTxRaw } from '../src/providers/solana-provider.ts';
import { ADDR } from './helpers/fake-provider.ts';

/**
 * Scripted JSON-RPC fetch wrapped in a real HttpClient so counters include
 * transport-level retries and status-code mapping is real.
 */
function stubRpc(
  respond: (method: string, params: unknown[], call: number) => unknown,
  clientOptions: { maxRetries?: number; backoffBaseMs?: number; backoffMaxMs?: number } = {},
) {
  const counters: Record<string, number> = {};
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string; params?: unknown[] };
    const method = body.method ?? '';
    const params = Array.isArray(body.params) ? body.params : [];
    counters[method] = (counters[method] ?? 0) + 1;
    let result: unknown;
    try {
      result = respond(method, params, counters[method]);
    } catch (err) {
      // Structured errors thrown by the script become HTTP statuses so the
      // HttpClient's real status handling (429 retry etc.) kicks in.
      const kind = (err as { kind?: string }).kind;
      const status = kind === 'RATE_LIMITED' ? 429 : kind === 'PROVIDER_ERROR' ? 403 : 500;
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'rpc error' }), { status });
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 'test', result }), { status: 200 });
  };
  const client: HttpClient = createHttpClient({ baseUrl: 'https://rpc.test', fetch: fetchImpl, ...clientOptions });
  return { client, counters };
}

const MINT = ADDR.token;
const AUTHORITY = ADDR.wallet;

describe('SolanaProvider (adapter)', () => {
  it('normalizes getTokenSupply into a Token with provider raw payload preserved', async () => {
    const { client } = stubRpc((method) => {
      if (method === 'getTokenSupply') return { context: { slot: 1 }, value: { decimals: 6, supply: '1234567890', uiAmount: 1234.56789 } };
      return null;
    });
    const provider = new SolanaProvider({ rpcUrl: 'https://rpc.test', httpClient: client });
    const token = await provider.getToken(MINT);
    expect(token).not.toBeNull();
    expect(token!.chain_id).toBe('solana-mainnet');
    expect(token!.address).toBe(MINT);
    expect(token!.decimals).toBe(6);
    expect((token!.raw_data as Record<string, unknown>).supply).toBe('1234567890');
  });

  it('derives wallet first/last seen from signature history', async () => {
    const { client } = stubRpc((method, params) => {
      if (method === 'getSignaturesForAddress') {
        const opts = (params[1] ?? {}) as { before?: string };
        if (opts.before) return []; // single page of history in this test
        return [
          { signature: 'sig1', blockTime: 1_700_000_200, slot: 3 },
          { signature: 'sig2', blockTime: 1_700_000_100, slot: 2 },
        ];
      }
      return null;
    });
    const provider = new SolanaProvider({ rpcUrl: 'https://rpc.test', httpClient: client });
    const wallet = await provider.getWallet(AUTHORITY);
    expect(wallet!.first_seen_at).toBe(new Date(1_700_000_100 * 1000).toISOString());
    expect(wallet!.last_seen_at).toBe(new Date(1_700_000_200 * 1000).toISOString());
    expect(wallet!.transaction_count).toBe(2);
    expect(wallet!.wallet_type).toBe('UNKNOWN'); // never guessed
  });

  it('rejects invalid addresses with a non-retryable INVALID_ARGUMENT', async () => {
    const { client, counters } = stubRpc(() => ({}));
    const provider = new SolanaProvider({ rpcUrl: 'https://rpc.test', httpClient: client });
    await expect(provider.getToken('0xNope')).rejects.toMatchObject({ kind: 'INVALID_ARGUMENT', retryable: false });
    expect(Object.keys(counters).length).toBe(0); // no RPC call wasted
  });

  it('retries through a single 429 rate-limit response and still succeeds', async () => {
    const { client, counters } = stubRpc((method) => {
      if (method === 'getTokenSupply') {
        if (counters.getTokenSupply === 1) {
          throw Object.assign(new Error('HTTP 429 rate limited'), { kind: 'RATE_LIMITED' });
        }
        return { value: { decimals: 9, supply: '1000' } };
      }
      return null;
    }, { maxRetries: 2, backoffBaseMs: 1, backoffMaxMs: 2 });
    const provider = new SolanaProvider({ rpcUrl: 'https://rpc.test', httpClient: client });
    const token = await provider.getToken(MINT);
    expect(token!.decimals).toBe(9);
    expect(counters.getTokenSupply).toBeGreaterThanOrEqual(2);
  });

  it('surfaces permanent provider failures as structured, non-retryable errors', async () => {
    const { client } = stubRpc(() => {
      throw Object.assign(new Error('HTTP 403 forbidden'), { kind: 'PROVIDER_ERROR' });
    });
    const provider = new SolanaProvider({ rpcUrl: 'https://rpc.test', httpClient: client });
    await expect(provider.getWallet(AUTHORITY)).rejects.toMatchObject({ kind: 'PROVIDER_ERROR', retryable: false });
  });

  it('computes net token deltas from pre/post token balances', () => {
    const meta = {
      preTokenBalances: [{ mint: MINT, uiTokenAmount: { amount: '1000000000', decimals: 9, uiAmount: 1, uiAmountString: '1' } }],
      postTokenBalances: [
        { mint: MINT, uiTokenAmount: { amount: '1500000000', decimals: 9, uiAmount: 1.5, uiAmountString: '1.5' } },
      ],
    };
    expect(tokenDeltaForMint(meta, MINT, 9)).toBe(0.5); // 5e8 raw units / 10^9
    expect(tokenDeltaForMint(meta, 'OtherMint11111111111111111111111111111111111', 9)).toBe(0);
    expect(tokenDeltaForMint(null, MINT, 9)).toBe(0);
  });

  it('compacts raw transactions, preserving balances and dropping bodies', () => {
    const tx = {
      slot: 42,
      blockTime: 1_700_000_000,
      meta: { fee: 5000, err: null, preBalances: [1, 2], postBalances: [3, 4] },
      transaction: { message: { accountKeys: ['huge-payload'] } },
    };
    const raw = compactTxRaw(tx, 'sigX');
    expect(raw.signature).toBe('sigX');
    expect(raw.slot).toBe(42);
    expect((raw.meta as Record<string, unknown>).fee).toBe(5000);
    expect('transaction' in raw).toBe(false); // full tx body dropped
  });
});
