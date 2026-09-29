// Mock provider tests: the mock dataset must be drop-in compatible with the
// real ingestion path — valid base58 identities, normalized types, and
// deterministic results (same query -> same data).
import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../src/providers/mock-provider.ts';
import { fakeConfig } from './helpers/fake-provider.ts';

const provider = createMockProvider(fakeConfig);

describe('MockProvider', () => {
  it('is registered under the mock provider name', () => {
    expect(provider.name).toBe('mock');
  });

  it('returns a normalized token with a valid base58 address identity', async () => {
    const token = await provider.getToken('LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1');
    expect(token).not.toBeNull();
    expect(token!.chain_id).toBe('solana-mainnet');
    expect(token!.symbol).toBe('LOUIE');
    expect(token!.decimals).toBe(9);
    expect(token!.first_seen_at).not.toBeNull();
    expect(token!.raw_data).toBeTruthy();
  });

  it('returns null for unknown token addresses instead of throwing', async () => {
    await expect(provider.getToken('Fg6PaGpoXfSLQBWcYQivqLWVdq3eH9wnGWSHo8VJkA5p')).resolves.toBeNull();
  });

  it('rejects structurally invalid addresses', async () => {
    await expect(provider.getToken('0xInvalid')).resolves.toBeNull();
    await expect(provider.getWallet('short')).resolves.toBeNull();
  });

  it('reports creator wallets with first-seen data that predates their launches', async () => {
    const wallet = await provider.getWallet('AuroraPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1');
    expect(wallet).not.toBeNull();
    expect(wallet!.first_seen_at).not.toBeNull();
    expect(wallet!.transaction_count).toBeGreaterThan(0);
    // Aurora Labs wallet is ~2 years old at dataset anchor time.
    const first = new Date(wallet!.first_seen_at!).getTime();
    const now = Date.now();
    expect(now - first).toBeGreaterThan(365 * 86400_000);
  });

  it('produces token transactions and metadata for known tokens', async () => {
    const address = 'LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1';
    const txs = await provider.getTokenTransactions(address);
    expect(txs.length).toBeGreaterThan(0);
    for (const tx of txs) {
      expect(tx.chain_id).toBe('solana-mainnet');
      expect(tx.tx_hash).toBeTruthy();
      expect(['BUY', 'SELL']).toContain(tx.event_type);
    }
    const metadata = await provider.getTokenMetadata(address);
    expect(metadata).not.toBeNull();
    expect(metadata!.description).toContain('duck');
  });

  it('returns a market snapshot with the full normalized shape', async () => {
    const snap = await provider.getTokenMarketData('LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1');
    expect(snap).not.toBeNull();
    expect(snap!.market_cap).toBeGreaterThan(0);
    expect(snap!.liquidity).toBeGreaterThan(0);
    expect(snap!.timestamp).not.toBe('');
  });

  it('exposes the full mock dataset as detected launches', async () => {
    const launches = await provider.getRecentLaunches();
    expect(launches.length).toBe(5);
    for (const l of launches) {
      expect(l.tokenAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(l.creatorWalletAddress).toBeTruthy();
      expect(l.platform?.slug).toBe('pumplaunch');
    }
  });

  it('is deterministic across identical calls', async () => {
    const a = await provider.getToken('LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1');
    const b = await provider.getToken('LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1');
    expect(a).toEqual(b);
  });
});
