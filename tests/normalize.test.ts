import { describe, expect, it } from 'vitest';
import {
  earlierTimestamp,
  formatWalletAge,
  humanizeSeconds,
  isValidSolanaAddress,
  laterTimestamp,
  normalizeEventType,
  normalizeToken,
  normalizeWallet,
  normalizeWalletType,
  sanitizeJson,
} from '../src/providers/normalize.ts';

describe('address validation (token/wallet identity inputs)', () => {
  it('accepts valid base58 Solana addresses', () => {
    expect(isValidSolanaAddress('LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1')).toBe(true);
    expect(isValidSolanaAddress('FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9')).toBe(true);
  });

  it('rejects base58-invalid characters (0, O, I, l) and bad lengths', () => {
    expect(isValidSolanaAddress('Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1')).toBe(false);
    expect(isValidSolanaAddress('short')).toBe(false);
    expect(isValidSolanaAddress('')).toBe(false);
    expect(isValidSolanaAddress('X'.repeat(45))).toBe(false);
  });
});

describe('token identity (chain_id + token_address)', () => {
  const base = {
    chainId: 'solana-mainnet',
    address: 'LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1',
    decimals: 9,
  };

  it('normalizes to the canonical (chain_id, address) identity', () => {
    const t = normalizeToken({ ...base, name: 'Louie the Duck', symbol: 'LOUIE', raw: { source: 'test' } });
    expect(t.chain_id).toBe('solana-mainnet');
    expect(t.address).toBe('LoU1EheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXXoo1');
    expect(t.status).toBe('ACTIVE');
  });

  it('never derives identity from name/symbol/image — same address, different names, same identity', () => {
    const a = normalizeToken({ ...base, name: 'Name A', symbol: 'AAA', raw: {} });
    const b = normalizeToken({ ...base, name: 'Name B', symbol: 'BBB', imageUrl: 'https://x/y.png', raw: {} });
    // Identity fields are identical; descriptive fields are not.
    expect(a.chain_id).toBe(b.chain_id);
    expect(a.address).toBe(b.address);
    expect(a.name).not.toBe(b.name);
    expect(a.symbol).not.toBe(b.symbol);
  });

  it('preserves the raw provider payload verbatim', () => {
    const raw = { source: 'unit-test', nested: { ok: true } };
    const t = normalizeToken({ ...base, name: 'n', symbol: 's', raw });
    expect(t.raw_data).toEqual(raw);
  });
});

describe('wallet normalization', () => {
  it('defaults unknown wallet types and keeps valid ones', () => {
    expect(normalizeWalletType('PERSONAL')).toBe('PERSONAL');
    expect(normalizeWalletType('nonsense')).toBe('UNKNOWN');
    expect(normalizeWalletType(null)).toBe('UNKNOWN');
  });

  it('normalizes wallets with first-seen semantics (not "creation date")', () => {
    const w = normalizeWallet({
      chainId: 'solana-mainnet',
      address: 'FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9',
      firstSeenAt: '2026-09-08T17:20:11.000Z',
      transactionCount: 6,
      walletType: 'PERSONAL',
      raw: { known: true },
    });
    expect(w.first_seen_at).toBe('2026-09-08T17:20:11.000Z');
    expect(w.wallet_type).toBe('PERSONAL');
    expect(w.transaction_count).toBe(6);
    expect(w.chain_id).toBe('solana-mainnet');
  });

  it('rejects invalid wallet addresses', () => {
    expect(() => normalizeWallet({ chainId: 'c', address: 'Aur0rainvalid', raw: {} })).toThrow();
  });
});

describe('first-seen / last-seen merging', () => {
  it('earlierTimestamp keeps the oldest observation', () => {
    expect(earlierTimestamp('2026-01-02T00:00:00Z', '2025-01-01T00:00:00Z')).toBe('2025-01-01T00:00:00.000Z');
    expect(earlierTimestamp(null, '2025-01-01T00:00:00Z')).toBe('2025-01-01T00:00:00.000Z');
    expect(earlierTimestamp(null, null)).toBeNull();
  });

  it('laterTimestamp keeps the newest observation', () => {
    expect(laterTimestamp('2026-01-02T00:00:00Z', '2025-01-01T00:00:00Z')).toBe('2026-01-02T00:00:00.000Z');
    expect(laterTimestamp('2026-01-02T00:00:00Z', null)).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('wallet age at launch ("First observed on-chain")', () => {
  it('reports a 13-second-old wallet as fresh', () => {
    const age = formatWalletAge('2026-09-08T17:20:11.000Z', '2026-09-08T17:20:24.000Z');
    expect(age.label).toBe('13 seconds');
    expect(age.isFresh).toBe(true);
    expect(age.seconds).toBe(13);
  });

  it('reports a ~2.5-year-old wallet with a human label and not fresh', () => {
    const age = formatWalletAge('2024-03-10T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
    // Spec example: first observed 2024-03-10, launch 2026-09-08 -> ~2 years 6 months.
    expect(age.label).toBe('2 years 6 months');
    expect(age.isFresh).toBe(false);
    expect(age.seconds).toBeGreaterThan(2 * 365 * 86400);
  });

  it('returns Unknown when either timestamp is missing', () => {
    expect(formatWalletAge(null, '2026-01-01T00:00:00Z').label).toBe('Unknown');
    expect(formatWalletAge('2026-01-01T00:00:00Z', null).label).toBe('Unknown');
  });

  it('humanizes seconds across magnitudes', () => {
    expect(humanizeSeconds(59)).toBe('59 seconds');
    expect(humanizeSeconds(120)).toBe('2 minutes');
    expect(humanizeSeconds(7200)).toBe('2 hours');
    expect(humanizeSeconds(3 * 86400)).toBe('3 days');
    expect(humanizeSeconds(0)).toBe('0 seconds');
  });
});

describe('event type + raw json safety', () => {
  it('falls back to OTHER for unknown event types', () => {
    expect(normalizeEventType('BUY')).toBe('BUY');
    expect(normalizeEventType('liquidihy')).toBe('OTHER');
    expect(normalizeEventType(undefined)).toBe('OTHER');
  });

  it('sanitizeJson never throws and handles non-serializable input', () => {
    expect(sanitizeJson(null)).toEqual({});
    expect(sanitizeJson('str')).toEqual({ value: 'str' });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(sanitizeJson(cyclic)).toEqual({ serializationError: 'payload not JSON-serializable' });
  });
});
