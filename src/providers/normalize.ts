// Phase 2A — Normalization layer.
//
// Pure functions that convert RAW provider responses into MIE's internal
// normalized types. No I/O here — everything is testable with plain inputs.
//
// Layout rules honored:
//   - Token identity is chain_id + token_address ONLY. Names/symbols/images/
//     narratives are attributes, never identities.
//   - "first observed" is never called "creation time".
//   - Original provider payloads are preserved in raw_data, never replaced
//     by derived values.

import type {
  EventType,
  HolderSnapshot,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
  WalletType,
} from '../types/index.ts';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isValidSolanaAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  if (address.length < 32 || address.length > 44) return false;
  return BASE58.test(address);
}

/** Return an ISO-8601 string if the value parses, else null. */
export function toIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Keep only JSON-safe data so raw_data never stores undefined/functions. */
export function sanitizeJson(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return { value };
  try {
    JSON.parse(JSON.stringify(value));
    return value as Record<string, unknown>;
  } catch {
    return { serializationError: 'payload not JSON-serializable' };
  }
}

// ---------------------------------------------------------------------------
// Token normalization
// ---------------------------------------------------------------------------

export interface NormalizeTokenInput {
  chainId: string;
  address: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  firstSeenAt?: string | null;
  createdAt?: string | null;
  imageUrl?: string | null;
  websiteUrl?: string | null;
  raw: unknown;
}

/** Build a Token row keyed on (chain_id, address). Never trusts name/symbol as identity. */
export function normalizeToken(input: NormalizeTokenInput): Token {
  if (!input.chainId) throw new Error('normalizeToken: chainId is required');
  if (!isValidSolanaAddress(input.address)) {
    throw new Error(`normalizeToken: invalid token address "${input.address ?? ''}"`);
  }
  const fallbackSymbol = input.address.slice(0, 4).toUpperCase();
  return {
    id: '', // assigned by the store (insert) or ignored (update)
    chain_id: input.chainId,
    platform_id: null,
    address: input.address,
    name: (input.name || input.address.slice(0, 16)).trim(),
    symbol: (input.symbol || fallbackSymbol).trim().toUpperCase(),
    decimals: Number.isInteger(input.decimals ?? 9) ? input.decimals ?? 9 : 9,
    creator_wallet_id: null,
    created_at: input.createdAt || null,
    first_seen_at: input.firstSeenAt || null,
    image_url: input.imageUrl || null,
    website_url: input.websiteUrl || null,
    status: 'ACTIVE',
    created_at_db: '', // server default; '' is stripped before insert
    updated_at: '', // server default; '' is stripped before insert
    raw_data: sanitizeJson(input.raw),
  };
}

// ---------------------------------------------------------------------------
// Wallet normalization + first-seen merging
// ---------------------------------------------------------------------------

export interface NormalizeWalletInput {
  chainId: string;
  address: string;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  transactionCount?: number | null;
  walletType?: string | null;
  raw: unknown;
}

export function normalizeWallet(input: NormalizeWalletInput): Wallet {
  if (!isValidSolanaAddress(input.address)) {
    throw new Error(`normalizeWallet: invalid wallet address "${input.address ?? ''}"`);
  }
  return {
    id: '',
    chain_id: input.chainId,
    address: input.address,
    first_seen_at: input.firstSeenAt || null,
    last_seen_at: input.lastSeenAt || null,
    transaction_count: Math.max(0, Math.round(input.transactionCount ?? 0)),
    wallet_type: normalizeWalletType(input.walletType) as WalletType,
    created_at: '', // server default; '' is stripped before insert
    updated_at: '', // server default; '' is stripped before insert
    raw_data: sanitizeJson(input.raw),
  };
}

const WALLET_TYPES = new Set(['UNKNOWN', 'PERSONAL', 'PROGRAM', 'EXCHANGE', 'TREASURY', 'CONTRACT']);

export function normalizeWalletType(walletType: string | null | undefined): string {
  const t = (walletType ?? 'UNKNOWN').trim().toUpperCase();
  return WALLET_TYPES.has(t) ? t : 'UNKNOWN';
}

/** Earliest observed timestamp (ISO) from an existing + a new value. */
export function earlierTimestamp(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const a = toIso(existing);
  const b = toIso(incoming);
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** Latest observed timestamp (ISO) from an existing + a new value. */
export function laterTimestamp(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const a = toIso(existing);
  const b = toIso(incoming);
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export interface WalletAgeResult {
  label: string;
  seconds: number;
  isFresh: boolean;
}

/** Wallet age between first observation and launch, humanized. */
export function formatWalletAge(
  firstSeenAtIso: string | null | undefined,
  launchTimeIso: string | null | undefined,
): WalletAgeResult {
  const first = toIso(firstSeenAtIso);
  const launch = toIso(launchTimeIso);
  if (!first || !launch) return { label: 'Unknown', seconds: 0, isFresh: false };

  const seconds = Math.max(0, (new Date(launch).getTime() - new Date(first).getTime()) / 1000);
  return {
    label: humanizeSeconds(seconds),
    seconds,
    // Fresh = observed within 60 seconds of launch (matches wallet.ts engine threshold).
    isFresh: seconds < 60,
  };
}

export function humanizeSeconds(seconds: number): string {
  if (seconds < 0) return 'Unknown';
  if (seconds < 60) {
    const s = Math.round(seconds);
    return `${s} second${s === 1 ? '' : 's'}`;
  }
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const days = Math.floor(seconds / 86400);
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  const years = Math.floor(days / 365);
  const months = Math.max(0, Math.floor((days % 365) / 30));
  if (years <= 0) return `${months} month${months === 1 ? '' : 's'}`;
  if (months <= 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} year${years === 1 ? '' : 's'} ${months} month${months === 1 ? '' : 's'}`;
}
// ---------------------------------------------------------------------------
// Transaction normalization
// ---------------------------------------------------------------------------

export const EVENT_TYPES = new Set([
  'TRANSFER', 'BUY', 'SELL', 'LIQUIDITY_ADD', 'LIQUIDITY_REMOVE',
  'DEPLOY', 'MINT', 'BURN', 'OTHER',
]);

export function normalizeEventType(value: unknown): string {
  const t = (typeof value === 'string' ? value : 'OTHER').trim().toUpperCase();
  return EVENT_TYPES.has(t) ? t : 'OTHER';
}

export interface NormalizeTransactionInput {
  chainId: string;
  tokenId: string;
  txHash: string;
  timestampIso?: string | null;
  blockNumber?: number | null;
  eventType?: string | null;
  tokenAmount?: number | null;
  nativeAmount?: number | null;
  usdValue?: number | null;
  direction?: 'IN' | 'OUT' | null;
  walletId?: string | null;
  raw: unknown;
}

export function normalizeTransaction(input: NormalizeTransactionInput): Transaction {
  if (!input.txHash) throw new Error('normalizeTransaction: txHash is required');
  return {
    id: '',
    chain_id: input.chainId,
    tx_hash: input.txHash,
    block_number: input.blockNumber ?? null,
    timestamp: input.timestampIso ?? new Date(0).toISOString(),
    wallet_id: input.walletId ?? null,
    token_id: input.tokenId,
    event_type: normalizeEventType(input.eventType) as EventType,
    token_amount: Math.max(0, Number(input.tokenAmount ?? 0)),
    native_amount: Math.max(0, Number(input.nativeAmount ?? 0)),
    usd_value: Math.max(0, Number(input.usdValue ?? 0)),
    direction: input.direction === 'IN' || input.direction === 'OUT' ? input.direction : null,
    raw_data: sanitizeJson(input.raw),
    created_at: '', // server default; '' is stripped before insert
  };
}

// ---------------------------------------------------------------------------
// Market / holder / metadata normalization
// ---------------------------------------------------------------------------

export interface NormalizeSnapshotInput {
  tokenId: string;
  timestampIso?: string | null;
  price?: number | null;
  marketCap?: number | null;
  volume?: number | null;
  liquidity?: number | null;
  buys?: number | null;
  sells?: number | null;
  transactionCount?: number | null;
  holderCount?: number | null;
  raw: unknown;
}

export function normalizeMarketSnapshot(input: NormalizeSnapshotInput): MarketSnapshot {
  const ts = toIso(input.timestampIso) ?? new Date(0).toISOString();
  return {
    id: '',
    token_id: input.tokenId,
    timestamp: ts,
    price: Math.max(0, Number(input.price ?? 0)),
    market_cap: Math.max(0, Number(input.marketCap ?? 0)),
    volume: Math.max(0, Number(input.volume ?? 0)),
    liquidity: Math.max(0, Number(input.liquidity ?? 0)),
    buys: Math.max(0, Math.round(input.buys ?? 0)),
    sells: Math.max(0, Math.round(input.sells ?? 0)),
    transaction_count: Math.max(0, Math.round(input.transactionCount ?? 0)),
    holder_count: Math.max(0, Math.round(input.holderCount ?? 0)),
    raw_data: sanitizeJson(input.raw),
  };
}

export interface NormalizeHolderSnapshotInput {
  tokenId: string;
  timestampIso?: string | null;
  holderCount?: number | null;
  top10Percentage?: number | null;
  top20Percentage?: number | null;
  developerPercentage?: number | null;
  raw: unknown;
}

export function normalizeHolderSnapshot(input: NormalizeHolderSnapshotInput): HolderSnapshot {
  const ts = toIso(input.timestampIso) ?? new Date(0).toISOString();
  return {
    id: '',
    token_id: input.tokenId,
    timestamp: ts,
    holder_count: Math.max(0, Math.round(input.holderCount ?? 0)),
    top_10_percentage: Math.max(0, Math.min(1, Number(input.top10Percentage ?? 0))),
    top_20_percentage: Math.max(0, Math.min(1, Number(input.top20Percentage ?? 0))),
    developer_percentage: Math.max(0, Math.min(1, Number(input.developerPercentage ?? 0))),
  };
}

export interface NormalizeMetadataInput {
  tokenId: string;
  description?: string | null;
  imageUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  discordUrl?: string | null;
  metadataUri?: string | null;
  rawMetadata?: unknown;
  raw?: unknown;
}

export function normalizeTokenMetadata(input: NormalizeMetadataInput): TokenMetadata {
  return {
    id: '',
    token_id: input.tokenId,
    description: input.description || null,
    image_url: input.imageUrl || null,
    website_url: input.websiteUrl || null,
    twitter_url: input.twitterUrl || null,
    telegram_url: input.telegramUrl || null,
    discord_url: input.discordUrl || null,
    metadata_uri: input.metadataUri || null,
    raw_metadata: sanitizeJson(input.rawMetadata ?? {}),
    fetched_at: new Date().toISOString(),
  };
}