// Phase 2A — Ingestion store contract.
//
// Narrow persistence interface used by the ingestion worker. Two
// implementations exist:
//   - SupabaseStore  -> the live PostgreSQL backend (via PostgREST)
//   - MemoryStore    -> deterministic in-memory store for offline tests
//
// Every write is idempotent at this layer:
//   - tokens/wallets keyed on (chain_id, address)
//   - launches keyed on token_id
//   - metadata keyed on token_id
//   - market/holder snapshots keyed on (token_id, timestamp)
//   - transactions deduplicated by tx_hash

import type {
  HolderSnapshot,
  Launch,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';

export interface TokenOutcome {
  id: string;
  created: boolean;
}

export interface WalletOutcome {
  id: string;
  created: boolean;
}

export interface LaunchOutcome {
  id: string;
  created: boolean;
}

export interface ChainInfo {
  id: string;
  chainId: string;
  nativeSymbol: string;
}

export interface Checkpoint {
  id: string;
  lastCursor: string | null;
  lastTimestamp: string | null;
  processedCount: number;
  state: Record<string, unknown>;
}

export interface IngestionStore {
  // ---- chain / platform resolution ---------------------------------
  ensureChain(chainId: string, nativeSymbol: string): Promise<ChainInfo>;
  ensurePlatform(chainId: string, slug: string, name: string, url?: string | null): Promise<string | null>;

  // ---- tokens ------------------------------------------------------
  getTokenByAddress(chainId: string, address: string): Promise<Token | null>;
  upsertToken(token: Token): Promise<TokenOutcome>;

  // ---- wallets ------------------------------------------------------
  getWalletByAddress(chainId: string, address: string): Promise<Wallet | null>;
  upsertWallet(wallet: Wallet): Promise<WalletOutcome>;

  // ---- launches -----------------------------------------------------
  upsertLaunch(launch: Launch): Promise<LaunchOutcome>;

  // ---- metadata -----------------------------------------------------
  upsertTokenMetadata(metadata: TokenMetadata): Promise<void>;

  // ---- snapshots ----------------------------------------------------
  upsertMarketSnapshot(snapshot: MarketSnapshot): Promise<void>;
  upsertHolderSnapshot(snapshot: HolderSnapshot): Promise<void>;

  // ---- transactions -------------------------------------------------
  transactionExists(txHash: string): Promise<boolean>;
  insertTransaction(transaction: Transaction): Promise<void>;

  // ---- jobs / checkpoints --------------------------------------------
  createJob(jobType: string, provider: string, tokenAddress?: string | null): Promise<string>;
  finishJob(jobId: string, status: 'SUCCEEDED' | 'FAILED' | 'PARTIAL', tokensProcessed: number, error?: string | null): Promise<void>;
  getCheckpoint(id: string): Promise<Checkpoint | null>;
  setCheckpoint(checkpoint: Checkpoint): Promise<void>;
}