// Test double implementing all three provider interfaces with scripted data
// and call counts. Factories for common normalized shapes are appended below.
import type {
  BlockchainProvider,
  DetectedLaunch,
  LaunchProvider,
  MarketDataProvider,
  ProviderConfig,
} from '../../src/providers/interfaces.ts';
import type {
  MarketSnapshot,
  Platform,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../../src/types/index.ts';
import {
  normalizeToken,
  normalizeWallet,
  normalizeTransaction,
  normalizeMarketSnapshot,
  normalizeTokenMetadata,
} from '../../src/providers/normalize.ts';
import { ProviderError } from '../../src/providers/errors.ts';

export const ADDR = {
  token: 'Fg6PaGpoXfSLQBWcYQivqLWVdq3eH9wnGWSHo8VJkA5p',
  token2: 'MintTokenTwoAddressXXXXXXXXXXXXXXXXXXXXXo2',
  wallet: 'AuroraPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1',
};

export interface FakeProviderScript {
  token?: Token | null;
  wallet?: Wallet | null;
  metadata?: TokenMetadata | null;
  marketSnapshot?: MarketSnapshot | null;
  transactions?: Transaction[];
  tokenTransactions?: Transaction[];
  launch?: DetectedLaunch | null;
  recentLaunches?: DetectedLaunch[];
  /** method -> number of initial calls that throw a retryable NETWORK error */
  failTimes?: Record<string, number>;
  /** method -> fixed error thrown on every call */
  throwAlways?: Record<string, ProviderError>;
}

/** Alias kept for the existing test imports. */
export type FakeScript = FakeProviderScript;

export const fakeConfig: ProviderConfig = {
  dataProvider: 'mock',
  solanaRpcUrl: 'http://localhost',
  rateLimitRps: 0,
  maxTxPerIngest: 10,
  requestTimeoutMs: 1000,
  maxRetries: 0,
  backoffBaseMs: 1,
  backoffMaxMs: 4,
};

export class FakeProvider implements BlockchainProvider, MarketDataProvider, LaunchProvider {
  readonly name = 'fake';
  readonly chainId = 'solana-mainnet';
  calls: Record<string, number> = {};
  script: FakeProviderScript;

  constructor(script: FakeProviderScript = {}) {
    this.script = { ...script };
  }

  private async gate(method: string): Promise<void> {
    this.calls[method] = (this.calls[method] ?? 0) + 1;
    const always = this.script.throwAlways?.[method];
    if (always) throw always;
    const times = this.script.failTimes?.[method] ?? 0;
    if (this.calls[method] <= times) {
      throw new ProviderError({ kind: 'NETWORK', message: `${method} transient failure`, provider: 'fake', retryable: true });
    }
  }

  async getToken(address: string): Promise<Token | null> {
    await this.gate('getToken');
    const t = this.script.token ?? null;
    // Scripted token acts as a template: it answers for any requested address
    // so multi-launch backfill tests can use distinct addresses.
    return t ? { ...t, address } : null;
  }

  async getWallet(address: string): Promise<Wallet | null> {
    await this.gate('getWallet');
    const w = this.script.wallet ?? null;
    return w ? { ...w, address } : null;
  }

  async getTransactions(): Promise<Transaction[]> {
    await this.gate('getTransactions');
    return this.script.transactions ?? [];
  }

  async getTokenTransactions(): Promise<Transaction[]> {
    await this.gate('getTokenTransactions');
    return this.script.tokenTransactions ?? this.script.transactions ?? [];
  }

  async getTokenHolders(): Promise<never[]> {
    await this.gate('getTokenHolders');
    return [];
  }

  async getTokenMetadata(): Promise<TokenMetadata | null> {
    await this.gate('getTokenMetadata');
    return this.script.metadata ?? null;
  }

  async getTokenMarketData(): Promise<MarketSnapshot | null> {
    await this.gate('getTokenMarketData');
    return this.script.marketSnapshot ?? null;
  }

  async getHistoricalMarketData(): Promise<MarketSnapshot[]> {
    await this.gate('getHistoricalMarketData');
    const s = this.script.marketSnapshot;
    return s ? [s] : [];
  }

  async getLiquidity(): Promise<number> {
    return this.script.marketSnapshot?.liquidity ?? 0;
  }

  async getVolume(): Promise<number> {
    return this.script.marketSnapshot?.volume ?? 0;
  }

  async getRecentLaunches(): Promise<DetectedLaunch[]> {
    await this.gate('getRecentLaunches');
    return this.script.recentLaunches ?? (this.script.launch ? [this.script.launch] : []);
  }

  async getLaunch(tokenAddress: string): Promise<DetectedLaunch | null> {
    await this.gate('getLaunch');
    const l = this.script.launch;
    return l && l.tokenAddress === tokenAddress ? l : null;
  }

  async getPlatformInfo(): Promise<Platform | null> {
    await this.gate('getPlatformInfo');
    return null;
  }
}

export function fakeProviderSet(script?: FakeProviderScript) {
  const provider = new FakeProvider(script);
  return {
    name: 'fake',
    blockchain: provider,
    market: provider,
    launch: provider,
    chainSlug: 'solana-mainnet',
    nativeSymbol: 'SOL',
    provider,
  };
}

// ---- factories for common normalized shapes --------------------------------

export function makeToken(overrides: Partial<Token> = {}): Token {
  return normalizeToken({
    chainId: 'solana-mainnet',
    address: ADDR.token,
    name: 'Test Token',
    symbol: 'TEST',
    decimals: 9,
    firstSeenAt: '2026-09-08T17:20:11.000Z',
    raw: { source: 'fake' },
    ...overrides,
  } as never);
}

export function makeWallet(firstSeenAt: string, overrides: Partial<Wallet> = {}): Wallet {
  return normalizeWallet({
    chainId: 'solana-mainnet',
    address: ADDR.wallet,
    firstSeenAt,
    lastSeenAt: firstSeenAt,
    transactionCount: 3,
    walletType: 'PERSONAL',
    raw: { source: 'fake' },
    ...overrides,
  } as never);
}

export function makeMarketSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return normalizeMarketSnapshot({
    tokenId: '',
    timestampIso: '2026-09-08T17:20:30.000Z',
    price: 0.000001,
    marketCap: 42000,
    volume: 1000,
    liquidity: 8000,
    buys: 4,
    sells: 2,
    transactionCount: 6,
    holderCount: 9,
    raw: { source: 'fake' },
    ...overrides,
  } as never);
}

export function makeTransaction(i: number, overrides: Partial<Transaction> = {}): Transaction {
  return normalizeTransaction({
    chainId: 'solana-mainnet',
    tokenId: '',
    txHash: `sig${i}${'x'.repeat(24)}`,
    timestampIso: '2026-09-08T17:20:30.000Z',
    eventType: 'BUY',
    tokenAmount: 1000,
    nativeAmount: 0.5,
    raw: { source: 'fake', i },
    ...overrides,
  } as never);
}

export function makeMetadata(overrides: Partial<TokenMetadata> = {}): TokenMetadata {
  return normalizeTokenMetadata({
    tokenId: '',
    description: 'A test token',
    rawMetadata: { source: 'fake' },
    ...overrides,
  } as never);
}

export function makeLaunch(overrides: Partial<DetectedLaunch> = {}): DetectedLaunch {
  return {
    tokenAddress: ADDR.token,
    launchTime: '2026-09-08T17:20:24.000Z',
    creatorWalletAddress: ADDR.wallet,
    platform: { slug: 'pumplaunch', name: 'PumpLaunch' },
    initialLiquidity: 8000,
    initialMarketCap: 42000,
    raw: { source: 'fake' },
    ...overrides,
  };
}

