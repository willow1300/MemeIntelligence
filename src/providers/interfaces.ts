// Phase 2A — Provider interfaces.
//
// These are the ONLY contact points between external data sources and the
// rest of MIE. Every implementation must:
//   - accept raw provider responses internally,
//   - return MIE's own normalized types,
//   - never leak provider-specific shapes to the rest of the application,
//   - never require the intelligence layer to talk to a provider directly.
//
// The intelligence layer reads from PostgreSQL only (src/lib/data-access.ts).
// Providers feed the ingestion worker (src/ingestion/), which writes to
// PostgreSQL. That one-way dependency is enforced by convention and by these
// interfaces.

import type {
  HolderSnapshot,
  Launch,
  MarketSnapshot,
  Platform,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';

export interface BlockchainProvider {
  /** Canonical token lookup by on-chain token address. Null when not a token / unknown. */
  getToken(address: string): Promise<Token | null>;
  /** Wallet lookup by on-chain wallet address. Null when unknown. */
  getWallet(address: string): Promise<Wallet | null>;
  /** All activity for a wallet address (paginated by the provider). */
  getTransactions(address: string): Promise<Transaction[]>;
  /** On-chain activity for a token's mint address (paginated by the provider). */
  getTokenTransactions(tokenAddress: string): Promise<Transaction[]>;
  /** Holder distribution snapshots for a token. May be empty when the provider cannot resolve holders. */
  getTokenHolders(tokenAddress: string): Promise<HolderSnapshot[]>;
  /** Off-chain descriptive metadata for a token. Null when unavailable. */
  getTokenMetadata(tokenAddress: string): Promise<TokenMetadata | null>;
}

export interface MarketDataProvider {
  /** Latest market snapshot for a token. Null when unavailable. */
  getTokenMarketData(address: string): Promise<MarketSnapshot | null>;
  /** Historical market snapshots within an optional time range. */
  getHistoricalMarketData(
    address: string,
    from?: string | null,
    to?: string | null,
  ): Promise<MarketSnapshot[]>;
  /** Pool liquidity in USD. 0 when the method is unavailable (callers must treat 0 as "unknown"). */
  getLiquidity(address: string): Promise<number>;
  /** 24h trading volume in USD. 0 when the method is unavailable. */
  getVolume(address: string): Promise<number>;
}

/**
 * A launch "detected" by a provider — the normalized trigger for ingestion.
 * Address is the only identity used downstream.
 */
export interface DetectedLaunch {
  tokenAddress: string;
  /** ISO-8601 timestamp when the launch was observed, if known. */
  launchTime: string | null;
  /** Creator / deployer wallet address when the provider can attribute one. Null otherwise. */
  creatorWalletAddress: string | null;
  platform: {
    slug: string;
    name: string;
    url?: string | null;
  } | null;
  initialLiquidity: number | null;
  initialMarketCap: number | null;
  /** Native/provider fields that don't map to the schema, preserved verbatim. */
  raw?: Record<string, unknown>;
}

export interface LaunchProvider {
  /** Recently detected launches (provider decides the window). May be empty. */
  getRecentLaunches(): Promise<DetectedLaunch[]>;
  /** Fetch a specific detected launch by token address. Null when no launch found. */
  getLaunch(tokenAddress: string): Promise<DetectedLaunch | null>;
  /** Resolve a platform slug to the normalized Platform row (may be null). */
  getPlatformInfo(platformSlug: string): Promise<Platform | null>;
}

/** A full provider set: one of each interface, sharing a single config/chain context. */
export interface ProviderSet {
  name: string;
  blockchain: BlockchainProvider;
  market: MarketDataProvider;
  launch: LaunchProvider;
  /** Chain abbreviation used for the tokens.chain_id FK lookup (e.g. 'solana-mainnet'). */
  chainSlug: string;
  nativeSymbol: string;
}

/** Configuration every provider derives from (env-driven in production). */
export interface ProviderConfig {
  dataProvider: 'mock' | 'solana';
  solanaRpcUrl: string;
  apiKey?: string | null;
  rateLimitRps: number;
  maxTxPerIngest: number;
  requestTimeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export type { HolderSnapshot, Launch, MarketSnapshot, Platform, Token, TokenMetadata, Transaction, Wallet };