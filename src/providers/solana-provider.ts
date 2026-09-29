// Phase 2A — Real Solana provider.
//
// Implements BlockchainProvider / MarketDataProvider / LaunchProvider against
// a Solana JSON-RPC endpoint. What this phase supports:
//   - getToken:        getTokenSupply + getAccountInfo (decimals, mint authority)
//   - getWallet:       getSignaturesForAddress-derived first/last-seen + count
//   - getTransactions: paginated getSignaturesForAddress + getTransaction
//   - getTokenTransactions: token balance deltas for a mint (when signatures exist)
//
// Deliberately NOT implemented in this phase (return null/[]/0, worker logs):
//   - off-chain metadata (name/image/social)      -> getTokenMetadata => null
//   - market snapshots / liquidity / volume       -> getTokenMarketData etc => null/0
//   - holder distribution snapshots               -> getTokenHolders => []
//   - a "recent launches" index feed              -> getRecentLaunches => []
// These need external indexes (DAS/GeckoTerminal/Birdeye) or full-chain scanning,
// which are out of scope for the Phase 2A bridge. On-chain data IS preserved raw.

import type {
  DetectedLaunch,
  BlockchainProvider,
  LaunchProvider,
  MarketDataProvider,
} from './interfaces.ts';
import type {
  HolderSnapshot,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';
import { base58Encode, base64ToBytes } from './base58.ts';
import { ProviderError } from './errors.ts';
import { isValidSolanaAddress, normalizeTransaction, normalizeToken, normalizeWallet, toIso } from './normalize.ts';
import type { RateLimiter } from './rate-limiter.ts';
import { createSolanaRpcClient, type SolanaRpcClient } from './solana-rpc.ts';
import { createHttpClient, type HttpClient } from './http-client.ts';

export interface SolanaProviderOptions {
  rpcUrl: string;
  apiKey?: string | null;
  chainId?: string;
  maxTxPerIngest?: number;
  rateLimiter?: RateLimiter;
  httpClient?: HttpClient;
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Parse an SPL-Token MINT account (base64 from getAccountInfo) to extract the
 * mint authority (creator/deployer) and decimals. Best-effort: returns null
 * when the layout doesn't match expectations.
 */
export function parseMintAccount(value: string): { mintAuthority: string | null; decimals: number | null } | null {
  try {
    const raw = base64ToBytes(value);
    if (raw.length < 74) return null; // need authority(32)+freeze(32)+supply(8)+init(1)+decimals(1)
    // 0..31 mint_authority, 32..63 freeze_authority, 64..71 minted_supply u64le,
    // 72 is_initialized, 73 decimals
    const authorityBytes = Array.from(raw.slice(0, 32));
    const hasAuthority = authorityBytes.some((b) => b !== 0);
    const mintAuthority = hasAuthority ? base58Encode(authorityBytes) : null;
    const decimals = raw[73];
    return { mintAuthority, decimals };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transaction-level helpers (token balance deltas from a signed tx)
// ---------------------------------------------------------------------------

interface UiTokenAmount {
  amount: string; // raw amount as string (full units)
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

interface TokenBalance {
  mint?: string;
  uiTokenAmount?: UiTokenAmount;
  [k: string]: unknown;
}

interface TxMeta {
  err?: unknown;
  fee?: number;
  preTokenBalances?: TokenBalance[];
  postTokenBalances?: TokenBalance[];
  preBalances?: number[];
  postBalances?: number[];
  [k: string]: unknown;
}

export interface ParsedSolanaTransaction {
  txHash: string;
  blockNumber: number | null;
  blockTime: number | null;
  meta: TxMeta | null;
  raw: Record<string, unknown>;
}

/** Compute net token balance delta for a given mint across all accounts. */
export function tokenDeltaForMint(meta: TxMeta | null, mint: string, decimals: number): number {
  if (!meta) return 0;
  const sum = (balances?: TokenBalance[]) => {
    if (!balances) return 0n;
    let total = 0n;
    for (const b of balances) {
      if (b.mint === mint && b.uiTokenAmount) {
        try {
          total += BigInt(b.uiTokenAmount.amount);
        } catch {
          /* ignore malformed amount */
        }
      }
    }
    return total;
  };
  const pre = sum(meta.preTokenBalances);
  const post = sum(meta.postTokenBalances);
  const delta = post - pre;
  return Number(delta) / 10 ** decimals;
}

/**
 * Build a compact raw payload for a transaction so we preserve provider data
 * without shipping the entire (sometimes multi-hundred-KB) signed transaction.
 */
export function compactTxRaw(tx: Record<string, unknown>, signature: string): Record<string, unknown> {
  const meta = tx.meta as TxMeta | null;
  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    meta: meta
      ? {
          fee: meta.fee,
          err: meta.err,
          preTokenBalances: meta.preTokenBalances,
          postTokenBalances: meta.postTokenBalances,
          preBalances: meta.preBalances,
          postBalances: meta.postBalances,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class SolanaProvider implements BlockchainProvider, MarketDataProvider, LaunchProvider {
  readonly name = 'solana';
  readonly chainId: string;
  private readonly rpc: SolanaRpcClient;
  private readonly maxTxPerIngest: number;

  constructor(options: SolanaProviderOptions) {
    this.chainId = options.chainId ?? 'solana-mainnet';
    this.maxTxPerIngest = Math.max(1, options.maxTxPerIngest ?? 50);
    const http = options.httpClient ?? createHttpClient({
      baseUrl: options.rpcUrl,
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      backoffBaseMs: options.backoffBaseMs ?? 250,
      backoffMaxMs: options.backoffMaxMs ?? 6000,
    });
    this.rpc = createSolanaRpcClient({
      rpcUrl: options.rpcUrl,
      apiKey: options.apiKey,
      httpClient: http,
      rateLimiter: options.rateLimiter,
      maxRetries: options.maxRetries,
      backoffBaseMs: options.backoffBaseMs,
      backoffMaxMs: options.backoffMaxMs,
    });
  }

  // ---------------------------------------------------------------- tokens
  async getToken(address: string): Promise<Token | null> {
    ensureAddress(address);
    let supply: { decimals?: number; supply?: string } | null = null;
    try {
      // Real RPC envelope: { context: { slot }, value: { decimals, supply, uiAmount } }
      const res = await this.rpc.call<{ context?: unknown; value?: { decimals: number; supply: string; uiAmount?: number | null } | null }>(
        'getTokenSupply',
        [address, { commitment: 'confirmed' }],
      );
      supply = res?.value ?? null;
    } catch (err) {
      if (err instanceof ProviderError && err.kind === 'NOT_FOUND') return null;
      throw err;
    }

    const decimals = Number.isInteger(supply?.decimals) ? (supply?.decimals ?? 9) : 9;

    // Mint account -> mint authority (creator/deployer) when parseable.
    let mintAuthority: string | null = null;
    try {
      const acct = await this.rpc.call<{ value: { data?: unknown } | null }>('getAccountInfo', [
        address,
        { encoding: 'base64', commitment: 'confirmed' },
      ]);
      const data = acct?.value?.data;
      if (Array.isArray(data) && typeof data[0] === 'string') {
        mintAuthority = parseMintAccount(data[0])?.mintAuthority ?? null;
      }
    } catch {
      /* authority is best-effort; absence must not fail ingestion */
    }

    // Earliest on-chain observation (oldest signature blocktime) when available.
    let firstSeenAt: string | null = null;
    try {
      const sigs = await this.rpc.listSignatures(address, 1000);
      const times = sigs.map((s) => s.blockTime).filter((t): t is number => typeof t === 'number' && Number.isFinite(t)).sort((a, b) => a - b);
      if (times.length > 0) firstSeenAt = toIso(times[0]);
    } catch {
      /* no signatures -> first seen stays null */
    }

    const shortName = `Token ${address.slice(0, 6)}`;
    return normalizeToken({
      chainId: this.chainId,
      address,
      name: shortName,
      symbol: address.slice(0, 4),
      decimals,
      firstSeenAt,
      raw: {
        source: 'solana-rpc',
        supply: supply?.supply ?? null,
        decimals: supply?.decimals ?? null,
        mintAuthority,
      },
    });
  }

  async getWallet(address: string): Promise<Wallet | null> {
    ensureAddress(address);
    const sigs = await this.safeSignatures(address);
    const times = sigs.map((s) => s.blockTime).filter((t): t is number => typeof t === 'number' && Number.isFinite(t)).sort((a, b) => a - b);
    return normalizeWallet({
      chainId: this.chainId,
      address,
      firstSeenAt: times.length > 0 ? toIso(times[0]) : null,
      lastSeenAt: times.length > 0 ? toIso(times[times.length - 1]) : null,
      transactionCount: sigs.length,
      walletType: 'UNKNOWN',
      raw: { source: 'solana-rpc', signaturesFetched: sigs.length },
    });
  }

  private async safeSignatures(address: string) {
    try {
      return await this.rpc.listSignatures(address, this.maxTxPerIngest);
    } catch (err) {
      if (err instanceof ProviderError && err.kind === 'NOT_FOUND') return [];
      throw err;
    }
  }
// ------------------------------------------------------- transactions
  async getTransactions(address: string): Promise<Transaction[]> {
    ensureAddress(address);
    const sigs = await this.safeSignatures(address);
    const out: Transaction[] = [];
    for (const sig of sigs.slice(0, this.maxTxPerIngest)) {
      try {
        const tx = await this.rpc.call<Record<string, unknown>>('getTransaction', [
          sig.signature,
          { maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
        ]);
        if (!tx || typeof tx !== 'object') continue;
        const meta = tx.meta as TxMeta | null;
        const blockTime = Number.isFinite(tx.blockTime) ? Number(tx.blockTime) : null;
        // Wallet-level view: we cannot reliably attribute BUY/SELL here without
        // knowing which tokens were exchanged; record as TRANSFER with the fee.
        out.push(normalizeTransaction({
          chainId: this.chainId,
          tokenId: '',
          txHash: sig.signature,
          timestampIso: toIso(blockTime),
          blockNumber: Number.isFinite(tx.slot) ? Number(tx.slot) : null,
          eventType: 'TRANSFER',
          nativeAmount: meta?.fee ? meta.fee / LAMPORTS_PER_SOL : 0,
          direction: null,
          raw: compactTxRaw(tx, sig.signature),
        }));
      } catch {
        // Individual tx resolution failures are non-fatal: some signatures may
        // not be resolvable from the RPC node's cache.
        continue;
      }
    }
    return out;
  }

  async getTokenTransactions(tokenAddress: string): Promise<Transaction[]> {
    ensureAddress(tokenAddress);
    const token = await this.getToken(tokenAddress);
    if (!token) return [];
    const decimals = token.decimals;
    const sigs = await this.safeSignatures(tokenAddress);
    const out: Transaction[] = [];

    for (const sig of sigs.slice(0, this.maxTxPerIngest)) {
      try {
        const tx = await this.rpc.call<Record<string, unknown>>('getTransaction', [
          sig.signature,
          { maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
        ]);
        if (!tx || typeof tx !== 'object') continue;
        const meta = tx.meta as TxMeta | null;
        const blockTime = Number.isFinite(tx.blockTime) ? Number(tx.blockTime) : null;
        const delta = tokenDeltaForMint(meta, tokenAddress, decimals);
        const eventType = delta > 0 ? 'BUY' : delta < 0 ? 'SELL' : 'TRANSFER';
        out.push(normalizeTransaction({
          chainId: this.chainId,
          tokenId: '',
          txHash: sig.signature,
          timestampIso: toIso(blockTime),
          blockNumber: Number.isFinite(tx.slot) ? Number(tx.slot) : null,
          eventType,
          tokenAmount: Math.abs(delta),
          nativeAmount: meta?.fee ? meta.fee / LAMPORTS_PER_SOL : 0,
          direction: delta > 0 ? 'IN' : delta < 0 ? 'OUT' : null,
          raw: compactTxRaw(tx, sig.signature),
        }));
      } catch {
        continue;
      }
    }
    return out;
  }

  // ------------------------------------------------ not-in-scope methods
  async getTokenHolders(): Promise<HolderSnapshot[]> {
    // Requires a holder index (e.g. DAS / token account enumeration). Empty
    // for Phase 2A — worker logs HOLDERS_MISSING.
    return [];
  }

  async getTokenMetadata(): Promise<TokenMetadata | null> {
    // Off-chain metadata is outside the RPC interface. Worker logs METADATA_MISSING.
    return null;
  }

  async getTokenMarketData(): Promise<MarketSnapshot | null> {
    return null;
  }

  async getHistoricalMarketData(): Promise<MarketSnapshot[]> {
    return [];
  }

  async getLiquidity(): Promise<number> {
    return 0;
  }

  async getVolume(): Promise<number> {
    return 0;
  }

  // --------------------------------------------------------------- launches
  async getRecentLaunches(): Promise<DetectedLaunch[]> {
    // A live launch-index feed is not part of the Phase 2A bridge. Ingest via
    // explicit address (scripts/ingest.ts) or the backfill worker.
    return [];
  }

  async getLaunch(tokenAddress: string): Promise<DetectedLaunch | null> {
    const token = await this.getToken(tokenAddress);
    if (!token) return null;
    const { mintAuthority } = token.raw_data as { mintAuthority?: string | null };
    return {
      tokenAddress,
      // Creation time is not derivable from RPC alone in this phase; anchor the
      // launch record on the earliest on-chain observation ("first seen"), never
      // claiming it as the true creation date.
      launchTime: token.first_seen_at,
      creatorWalletAddress: mintAuthority ?? null,
      platform: null,
      initialLiquidity: null,
      initialMarketCap: null,
      raw: { source: 'solana-rpc' },
    };
  }

  async getPlatformInfo(): Promise<null> {
    return null;
  }
}

export function createSolanaProvider(options: SolanaProviderOptions): SolanaProvider {
  return new SolanaProvider(options);
}

function ensureAddress(address: string): void {
  if (!isValidSolanaAddress(address)) {
    throw new ProviderError({
      kind: 'INVALID_ARGUMENT',
      message: `Invalid Solana address "${address ?? ''}"`,
      provider: 'solana',
      retryable: false,
    });
  }
}