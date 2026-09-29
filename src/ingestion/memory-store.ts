// Phase 2A — In-memory ingestion store.
//
// Deterministic implementation of IngestionStore for offline tests and dry
// runs. Mirrors SupabaseStore semantics (upsert on natural keys, tx_hash
// dedup, checkpoints), with counters so tests can assert idempotency
// (e.g. "duplicate ingestion created exactly one token row").

import type {
  HolderSnapshot,
  Launch,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';
import type { ChainInfo, Checkpoint, IngestionStore, LaunchOutcome, TokenOutcome, WalletOutcome } from './store.ts';

export class MemoryStore implements IngestionStore {
  tokens = new Map<string, Token>();
  wallets = new Map<string, Wallet>();
  launches = new Map<string, Launch>();
  metadata = new Map<string, TokenMetadata>();
  marketSnapshots = new Map<string, MarketSnapshot>();
  holderSnapshots = new Map<string, HolderSnapshot>();
  transactions = new Map<string, Transaction>();
  checkpoints = new Map<string, Checkpoint>();
  chains = new Map<string, ChainInfo>();
  platforms = new Map<string, string>();
  jobs: Array<Record<string, unknown>> = [];

  // ---------------------------------------------------------------- chains
  async ensureChain(chainId: string, nativeSymbol: string): Promise<ChainInfo> {
    const existing = this.chains.get(chainId);
    if (existing) return existing;
    const info: ChainInfo = { id: `chain-${chainId}`, chainId, nativeSymbol };
    this.chains.set(chainId, info);
    return info;
  }

  async ensurePlatform(chainId: string, slug: string, name: string, url?: string | null): Promise<string | null> {
    const existing = this.platforms.get(slug);
    if (existing) return existing;
    this.platforms.set(slug, `platform-${slug}`);
    void chainId; void name; void url;
    return `platform-${slug}`;
  }

  // ---------------------------------------------------------------- tokens
  async getTokenByAddress(chainId: string, address: string): Promise<Token | null> {
    return this.tokens.get(`${chainId}:${address}`) ?? null;
  }

  async upsertToken(token: Token): Promise<TokenOutcome> {
    const key = `${token.chain_id}:${token.address}`;
    const created = !this.tokens.has(key);
    const existing = this.tokens.get(key);
    const merged = created
      ? { ...token, id: token.id || `token-${key}` }
      : { ...existing, ...token, id: existing!.id, created_at_db: existing!.created_at_db, updated_at: existing!.updated_at };
    merged.raw_data = { ...(existing?.raw_data ?? {}), ...(token.raw_data ?? {}) };
    this.tokens.set(key, merged);
    return { id: merged.id, created };
  }

  // --------------------------------------------------------------- wallets
  async getWalletByAddress(chainId: string, address: string): Promise<Wallet | null> {
    return this.wallets.get(`${chainId}:${address}`) ?? null;
  }

  async upsertWallet(wallet: Wallet): Promise<WalletOutcome> {
    const key = `${wallet.chain_id}:${wallet.address}`;
    const created = !this.wallets.has(key);
    const existing = this.wallets.get(key);
    const merged = created
      ? { ...wallet, id: wallet.id || `wallet-${key}` }
      : { ...existing, ...wallet, id: existing!.id, created_at: existing!.created_at, updated_at: existing!.updated_at };
    merged.raw_data = { ...(existing?.raw_data ?? {}), ...(wallet.raw_data ?? {}) };
    this.wallets.set(key, merged);
    return { id: merged.id, created };
  }

  // -------------------------------------------------------------- launches
  async upsertLaunch(launch: Launch): Promise<LaunchOutcome> {
    const created = !this.launches.has(launch.token_id);
    const existing = this.launches.get(launch.token_id);
    const merged = existing ? { ...existing, ...launch, id: existing.id, created_at: existing.created_at } : { ...launch, id: launch.id || `launch-${launch.token_id}` };
    this.launches.set(launch.token_id, merged);
    return { id: merged.id, created };
  }

  // -------------------------------------------------------------- metadata
  async upsertTokenMetadata(metadata: TokenMetadata): Promise<void> {
    this.metadata.set(metadata.token_id, metadata);
  }

  // ------------------------------------------------------------- snapshots
  async upsertMarketSnapshot(snapshot: MarketSnapshot): Promise<void> {
    this.marketSnapshots.set(`${snapshot.token_id}:${snapshot.timestamp}`, snapshot);
  }

  async upsertHolderSnapshot(snapshot: HolderSnapshot): Promise<void> {
    this.holderSnapshots.set(`${snapshot.token_id}:${snapshot.timestamp}`, snapshot);
  }

  // ------------------------------------------------------------ transactions
  async transactionExists(txHash: string): Promise<boolean> {
    return this.transactions.has(txHash);
  }

  async insertTransaction(transaction: Transaction): Promise<void> {
    this.transactions.set(transaction.tx_hash, transaction);
  }

  // ------------------------------------------------------------- jobs/etc
  async createJob(jobType: string, provider: string, tokenAddress?: string | null): Promise<string> {
    const id = `job-${this.jobs.length + 1}`;
    this.jobs.push({ id, job_type: jobType, provider_name: provider, token_address: tokenAddress, status: 'RUNNING' });
    return id;
  }

  async finishJob(jobId: string, status: 'SUCCEEDED' | 'FAILED' | 'PARTIAL', tokensProcessed: number, errorMsg?: string | null): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = status;
      job.tokens_processed = tokensProcessed;
      job.finished_at = new Date().toISOString();
      if (errorMsg) job.error = { message: errorMsg };
    }
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(id) ?? null;
  }

  async setCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, { ...checkpoint });
  }
}