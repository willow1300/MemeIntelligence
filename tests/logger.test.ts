// Logger tests: structured output + strict secret redaction (Phase 2A §9).
// Domain fields (tokenAddress, tokenId, token_amount) must stay visible;
// credentials (api keys, secrets, JWT values) must never appear.
import { describe, it, expect } from 'vitest';
import { createLogger, memorySink, redact } from '../src/ingestion/logger.ts';

describe('redact', () => {
  it('redacts credential keys', () => {
    const input = {
      apiKey: 'abc123',
      API_KEY: 'abc123',
      api_key: 'abc123',
      secret: 's3cr3t',
      password: 'hunter2',
      AUTH_TOKEN: 't0k3n',
      'private-key': 'raw-bytes',
      seed_phrase: 'words words words',
      mnemonic: 'words words words',
      Authorization: 'Bearer xyz',
      token: 'opaque-session-token',
      SUPABASE_ANON_KEY: 'jwt-value',
    };
    const out = redact(input) as Record<string, unknown>;
    for (const k of Object.keys(input)) expect(out[k]).toBe('[REDACTED]');
  });

  it('keeps domain fields visible', () => {
    const input = {
      tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      tokenId: 'token-123',
      token_id: 'token-123',
      tokenAmount: 42,
      token_amount: 42,
      author: 'someone',
      authority: 'mint-authority',
      keyboard: 'qwerty',
      monkey: 'banana',
      walletId: 'wallet-1',
    };
    expect(redact(input)).toEqual(input);
  });

  it('redacts JWT / API-key shaped values regardless of key name', () => {
    const input = {
      whatever: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
      other: 'sk-live-1234567890',
      bearer_thing: 'Bearer abc',
    };
    const out = redact(input) as Record<string, unknown>;
    expect(out.whatever).toBe('[REDACTED]');
    expect(out.other).toBe('[REDACTED]');
    expect(out.bearer_thing).toBe('[REDACTED]');
  });

  it('redacts inside nested objects and arrays, caps depth', () => {
    const out = redact({ a: { b: [{ client_secret: 'x' }] }, deep: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } }) as Record<string, unknown>;
    const nested = ((out.a as Record<string, unknown>).b as Array<Record<string, unknown>>)[0];
    expect(nested.client_secret).toBe('[REDACTED]');
    expect(JSON.stringify(out.deep)).toContain('[...]');
  });
});

describe('createLogger', () => {
  it('emits single-line JSON with ts/level/event and redacted fields', () => {
    const { sink, lines } = memorySink();
    const log = createLogger(sink);
    log.info('token_created', { tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', apiKey: 'k' });
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]);
    expect(rec.level).toBe('info');
    expect(rec.event).toBe('token_created');
    expect(rec.tokenAddress).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(rec.apiKey).toBe('[REDACTED]');
    expect(typeof rec.ts).toBe('string');
  });

  it('child() merges context and keeps redaction', () => {
    const { sink, lines } = memorySink();
    const log = createLogger(sink).child({ provider: 'solana' });
    log.warn('provider_failure', { secret: 'x', attempt: 2 });
    const rec = JSON.parse(lines[0]);
    expect(rec.provider).toBe('solana');
    expect(rec.secret).toBe('[REDACTED]');
    expect(rec.attempt).toBe(2);
  });
});
