// Phase 2A — Mock provider.
//
// Deterministic provider implementation used for offline development and
// end-to-end pipeline tests. It mirrors the shape of the seeded mock dataset
// (tokens launched minutes-to-weeks before the anchor) so running the real
// ingestion pipeline against it exercises every code path without touching
// the network. Switching DATA_PROVIDER=mock|solana never changes engines.
//
// IMPORTANT: this is a PROVIDER, not the database. It returns normalized
// internal types exactly like the Solana provider — it does not read the DB.

import type {
  DetectedLaunch,
  BlockchainProvider,
  LaunchProvider,
  MarketDataProvider,
  ProviderConfig,
} from './interfaces.ts';
import type { HolderSnapshot, MarketSnapshot, Token, TokenMetadata, Transaction, Wallet } from '../types/index.ts';
import {
  isValidSolanaAddress,
  normalizeHolderSnapshot,
  normalizeMarketSnapshot,
  normalizeToken,
  normalizeTokenMetadata,
  normalizeTransaction,
  normalizeWallet,
} from './normalize.ts';

// Anchor mirrors the seed dataset anchor time (2026-08-16 12:00 UTC).
const ANCHOR = '2026-08-16T12:00:00.000Z';

function isoMinutesAgo(minutes: number): string {
  return new Date(new Date(ANCHOR).getTime() - minutes * 60_000).toISOString();
}

function stampOffset(days: number): string {
  return new Date(new Date(ANCHOR).getTime() - days * 86_400_000).toISOString();
}

// The README test-token addresses. Values mirror the seeded token seeds.
export const MOCK_TOKENS: Array<{
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  creatorWallet: string;
  minutesAgo: number;
  ttpMin: number;
  peakMc: number;
  failureType: string;
  status: string;
  description: string;
  imageUrl: string | null;
}> = [
  { address: 'LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1', name: 'Louie the Duck', symbol: 'LOUIE', decimals: 9, creatorWallet: 'FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9', minutesAgo: 40, ttpMin: 25, peakMc: 82000, failureType: 'HEALTHY', status: 'ACTIVE', description: 'A wholesome duck mascot for the community. Louie waddles to the moon.', imageUrl: null },
  { address: 'LoU1EauroraXXXXXXXXXXXXXXXXXXXXXXXXXXXoo2', name: 'Louie', symbol: 'LOUIE', decimals: 9, creatorWallet: 'AuroraPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1', minutesAgo: 101, ttpMin: 55, peakMc: 620000, failureType: 'MOMENTUM_EXHAUSTION', status: 'DEAD', description: 'The original wholesome duck. Louie says hi.', imageUrl: null },
  { address: 'PEPEprimeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo5', name: 'Pepe Prime', symbol: 'PEPE', decimals: 9, creatorWallet: 'AuroraPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1', minutesAgo: 8640, ttpMin: 120, peakMc: 1420000, failureType: 'MOMENTUM_EXHAUSTION', status: 'DEAD', description: 'The prime frog. Feels good man.', imageUrl: null },
  { address: 'MooNKdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXo11', name: 'Moon Kitty', symbol: 'MOONK', decimals: 9, creatorWallet: 'Dra1nCoLLectPr1marywa11etXXXXXXXXXXXXXXX5', minutesAgo: 1440, ttpMin: 45, peakMc: 260000, failureType: 'LIQUIDITY_EVENT', status: 'DEAD', description: 'A kitty headed to the moon.', imageUrl: null },
  { address: 'AURoRAcoinXXXXXXXXXXXXXXXXXXXXXXXXXXXXo22', name: 'Aurora Coin', symbol: 'AURORA', decimals: 9, creatorWallet: 'AuroraPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1', minutesAgo: 7200, ttpMin: 90, peakMc: 180000, failureType: 'HEALTHY', status: 'ACTIVE', description: 'A long-standing community token.', imageUrl: null },
];

/** Solana-shaped base58 mock wallet addresses (matches the seed dataset). */
export const MOCK_WALLETS = new Map<string, { type: string; firstDays: number; lastDays: number; txs: number }>([
  ['AuroraPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1', { type: 'PERSONAL', firstDays: 730, lastDays: 1, txs: 4210 }],
  ['FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9', { type: 'PERSONAL', firstDays: 1, lastDays: 0, txs: 6 }],
  ['Dra1nCoLLectPr1marywa11etXXXXXXXXXXXXXXX5', { type: 'PERSONAL', firstDays: 320, lastDays: 3, txs: 2110 }],
  ['Retai1Traderonewa11etXXXXXXXXXXXXXXXXXX16', { type: 'PERSONAL', firstDays: 120, lastDays: 7, txs: 190 }],
]);

function defFor(address: string) {
  return MOCK_TOKENS.find((t) => t.address === address);
}

export class MockProvider implements BlockchainProvider, MarketDataProvider, LaunchProvider {
  readonly name = 'mock';

  constructor(private readonly config: ProviderConfig) {}

  // ---------------------------------------------------------------- tokens
  async getToken(address: string): Promise<Token | null> {
    const def = defFor(address);
    if (!def) return null;
    const raw = { source: 'mock', symbol: def.symbol, name: def.name, peakMc: def.peakMc, failureType: def.failureType, status: def.status };
    return normalizeToken({
      chainId: 'solana-mainnet',
      address: def.address,
      name: def.name,
      symbol: def.symbol,
      decimals: def.decimals,
      firstSeenAt: isoMinutesAgo(def.minutesAgo),
      createdAt: isoMinutesAgo(def.minutesAgo),
      imageUrl: def.imageUrl,
      raw,
    });
  }

  async getWallet(address: string): Promise<Wallet | null> {
    if (!isValidSolanaAddress(address)) return null;
    const def = MOCK_WALLETS.get(address);
    return normalizeWallet({
      chainId: 'solana-mainnet',
      address,
      firstSeenAt: def ? stampOffset(def.firstDays) : isoMinutesAgo(0),
      lastSeenAt: def ? stampOffset(def.lastDays) : isoMinutesAgo(0),
      transactionCount: def?.txs ?? 0,
      walletType: def?.type ?? 'UNKNOWN',
      raw: { source: 'mock', known: Boolean(def) },
    });
  }

  async getTransactions(address: string): Promise<Transaction[]> {
    if (!isValidSolanaAddress(address)) return [];
    const n = Math.min(5, MOCK_WALLETS.get(address)?.txs ?? 2);
    const out: Transaction[] = [];
    for (let i = 0; i < n; i++) {
      out.push(normalizeTransaction({
        chainId: 'solana-mainnet',
        tokenId: '',
        txHash: `mock_${address.slice(0, 8)}_${i}`,
        timestampIso: isoMinutesAgo(i * 10),
        blockNumber: i,
        eventType: i % 2 === 0 ? 'BUY' : 'SELL',
        tokenAmount: 1000 * (i + 1),
        nativeAmount: 0.5 * (i + 1),
        direction: i % 2 === 0 ? 'IN' : 'OUT',
        raw: { source: 'mock' },
      }));
    }
    return out;
  }

  async getTokenTransactions(address: string): Promise<Transaction[]> {
    return this.getTransactions(address);
  }

  async getTokenHolders(address: string): Promise<HolderSnapshot[]> {
    const def = defFor(address);
    if (!def) return [];
    return [
      normalizeHolderSnapshot({
        tokenId: '',
        timestampIso: isoMinutesAgo(def.minutesAgo),
        holderCount: 320,
        top10Percentage: 0.35,
        top20Percentage: 0.55,
        developerPercentage: 0.12,
        raw: { source: 'mock' },
      }),
    ];
  }

  async getTokenMetadata(address: string): Promise<TokenMetadata | null> {
    const def = defFor(address);
    if (!def) return null;
    return normalizeTokenMetadata({
      tokenId: '',
      description: def.description,
      imageUrl: def.imageUrl,
      rawMetadata: { peakMc: def.peakMc, failureType: def.failureType, theme: 'duck' },
      raw: { source: 'mock' },
    });
  }
// ------------------------------------------------------------- market data
  async getTokenMarketData(address: string): Promise<MarketSnapshot | null> {
    const def = defFor(address);
    if (!def) return null;
    return normalizeMarketSnapshot({
      tokenId: '',
      timestampIso: isoMinutesAgo(def.minutesAgo - def.ttpMin),
      marketCap: def.peakMc * 0.06,
      price: 0.000001,
      liquidity: def.peakMc * 0.045,
      volume: def.peakMc * 0.02,
      buys: 5,
      sells: 1,
      transactionCount: 6,
      holderCount: 5,
      raw: { source: 'mock' },
    });
  }

  async getHistoricalMarketData(address: string, from?: string | null, to?: string | null): Promise<MarketSnapshot[]> {
    const current = await this.getTokenMarketData(address);
    if (!current) return [];
    const start = from ? new Date(from) : new Date(current.timestamp);
    const end = to ? new Date(to) : new Date(new Date(start).getTime() + 86_400_000);
    const out: MarketSnapshot[] = [];
    // t0 snapshot and a later snapshot to prove range handling.
    out.push(current);
    if (new Date(end).getTime() > new Date(current.timestamp).getTime()) {
      out.push({
        ...current,
        timestamp: new Date(end).toISOString(),
        market_cap: current.market_cap * 1.1,
        raw_data: { source: 'mock', snapshot: 'range-end' },
      } as MarketSnapshot);
    }
    return out;
  }

  async getLiquidity(address: string): Promise<number> {
    return (await this.getTokenMarketData(address))?.liquidity ?? 0;
  }

  async getVolume(address: string): Promise<number> {
    return (await this.getTokenMarketData(address))?.volume ?? 0;
  }

  // --------------------------------------------------------------- launches
  async getRecentLaunches(): Promise<DetectedLaunch[]> {
    return MOCK_TOKENS.map((t) => ({
      tokenAddress: t.address,
      launchTime: isoMinutesAgo(t.minutesAgo),
      creatorWalletAddress: t.creatorWallet,
      platform: { slug: 'pumplaunch', name: 'PumpLaunch' },
      initialLiquidity: Math.round(t.peakMc * 0.045),
      initialMarketCap: Math.round(t.peakMc * 0.06),
      raw: { source: 'mock' },
    }));
  }

  async getLaunch(tokenAddress: string): Promise<DetectedLaunch | null> {
    const t = defFor(tokenAddress);
    if (!t) return null;
    return {
      tokenAddress: t.address,
      launchTime: isoMinutesAgo(t.minutesAgo),
      creatorWalletAddress: t.creatorWallet,
      platform: { slug: 'pumplaunch', name: 'PumpLaunch' },
      initialLiquidity: Math.round(t.peakMc * 0.045),
      initialMarketCap: Math.round(t.peakMc * 0.06),
      raw: { source: 'mock', secondsBeforeAnchor: t.minutesAgo * 60 },
    };
  }

  async getPlatformInfo(): Promise<null> {
    // The mock platform row (pumplaunch) already exists in the seed data.
    return null;
  }
}

export function createMockProvider(config: ProviderConfig): MockProvider {
  return new MockProvider(config);
}