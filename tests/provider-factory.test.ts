import { describe, expect, it } from 'vitest';
import { buildProviderConfig, buildProviderSet } from '../src/providers/provider-factory.ts';
import { MockProvider } from '../src/providers/mock-provider.ts';
import { SolanaProvider } from '../src/providers/solana-provider.ts';

describe('provider factory (DATA_PROVIDER switch)', () => {
  it('builds the mock provider set by default', () => {
    process.env.DATA_PROVIDER = 'mock';
    const set = buildProviderSet();
    expect(set.name).toBe('mock');
    expect(set.blockchain).toBeInstanceOf(MockProvider);
    expect(set.market).toBeInstanceOf(MockProvider);
    expect(set.launch).toBeInstanceOf(MockProvider);
    expect(set.chainSlug).toBe('solana-mainnet');
  });

  it('builds the real Solana provider set when configured', () => {
    process.env.DATA_PROVIDER = 'solana';
    process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
    const set = buildProviderSet();
    expect(set.name).toBe('solana');
    expect(set.blockchain).toBeInstanceOf(SolanaProvider);
    expect(set.chainSlug).toBe('solana-mainnet');
    process.env.DATA_PROVIDER = 'mock';
  });

  it('rejects unknown provider names with a structured error', () => {
    process.env.DATA_PROVIDER = 'ethereum';
    expect(() => buildProviderConfig()).toThrowError(/DATA_PROVIDER must be/);
    process.env.DATA_PROVIDER = 'mock';
  });
});
