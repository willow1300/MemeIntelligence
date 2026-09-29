// Phase 2A — Ingestion worker tests (MemoryStore + FakeProvider).
// Covers: token/wallet/launch/snapshot/metadata creation, idempotency,
// tx dedup, wallet first-seen merge, missing data tolerance, retries,
// permanent failures, and dry-run.
import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../src/ingestion/memory-store.ts';
import { IngestionWorker } from '../src/ingestion/worker.ts';
import type { StructuredLogger } from '../src/ingestion/logger.ts';
import {
  ADDR, fakeProviderSet, makeToken, makeWallet, makeLaunch,
  makeMarketSnapshot, makeTransaction, makeMetadata, type FakeScript
} from './helpers/fake-provider.ts';

const silentLogger: StructuredLogger = {
  debug() {}, info() {}, warn() {}, error() {},
  child() { return silentLogger; },
};

function setup(script: FakeScript = {}) {
  const store = new MemoryStore();
  const set = fakeProviderSet(script);
  const worker = new IngestionWorker({
    providers: set, store, logger: silentLogger,
    maxRetries: 2, backoffBaseMs: 1, backoffMaxMs: 4,
  });
  return { store, worker, provider: set.provider };
}

const FIRST_SEEN = '2026-09-08T17:20:11.000Z';

function fullScript(overrides: FakeScript = {}): FakeScript {
  return {
    token: makeToken(),
    wallet: makeWallet(FIRST_SEEN),
    launch: makeLaunch(),
    metadata: makeMetadata(),
    marketSnapshot: makeMarketSnapshot(),
    transactions: [makeTransaction(1), makeTransaction(2)],
    ...overrides,
  };
}

describe('IngestionWorker (end-to-end over MemoryStore)', () => {
  it('ingests a token: token, wallet, launch, metadata, snapshot, transactions', async () => {
    const { store, worker } = setup(fullScript());
    const r = await worker.ingest(ADDR.token);

    expect(r.token?.created).toBe(true);
    expect(r.wallet.address).toBe(ADDR.wallet);
    expect(r.wallet.created).toBe(true);
    // 17:20:11 first observed -> 17:20:24 launch = 13 seconds
    expect(r.wallet.ageAtLaunch?.seconds).toBe(13);
    expect(r.wallet.ageAtLaunch?.label).toBe('13 seconds');
    expect(r.launch?.created).toBe(true);
    expect(r.metadata).toBe(true);
    expect(r.marketSnapshot).toBe(true);
    expect(r.transactionsStored).toBe(2);
    expect(r.jobId).toBeTruthy();
    expect(r.events).toContain('launch_detected');

    expect(store.tokens.size).toBe(1);
    expect(store.wallets.size).toBe(1);
    expect(store.launches.size).toBe(1);
    expect(store.metadata.size).toBe(1);
    expect(store.marketSnapshots.size).toBe(1);
    expect(store.transactions.size).toBe(2);
  });

  it('is idempotent: re-ingesting the same token creates no duplicates', async () => {
    const { store, worker } = setup(fullScript());
    const first = await worker.ingest(ADDR.token);
    const second = await worker.ingest(ADDR.token);

    expect(second.token?.created).toBe(false);
    expect(second.wallet.created).toBe(false);
    expect(second.launch?.created).toBe(false);
    expect(second.events).toContain('token_updated');
    expect(second.events).toContain('launch_updated');

    expect(store.tokens.size).toBe(1);
    expect(store.wallets.size).toBe(1);
    expect(store.launches.size).toBe(1);
    expect(store.metadata.size).toBe(1);
    expect(store.marketSnapshots.size).toBe(1);
    expect(store.transactions.size).toBe(2); // tx dedup by tx_hash
    expect(second.tokenId).toBe(first.tokenId);
  });
  it('deduplicates transactions with identical tx_hash', async () => {
    const { store, worker } = setup(fullScript({
      transactions: [makeTransaction(1), makeTransaction(1), makeTransaction(1)],
    }));
    const r = await worker.ingest(ADDR.token);
    expect(r.transactionsStored).toBe(1);
    expect(store.transactions.size).toBe(1);
  });

  it('keeps the earliest first_seen_at when a later wallet observation arrives', async () => {
    const { store, worker, provider } = setup(fullScript());
    await worker.ingest(ADDR.token);
    // Same store, later observation of the same wallet.
    provider.script.wallet = makeWallet('2026-09-08T18:30:00.000Z');
    await worker.ingest(ADDR.token);
    const w = store.wallets.get(`chain-solana-mainnet:${ADDR.wallet}`);
    expect(w?.first_seen_at).toBe(FIRST_SEEN);
    expect(w?.last_seen_at).toBe('2026-09-08T18:30:00.000Z');
  });

  it('tolerates missing metadata', async () => {
    const { worker } = setup(fullScript({ metadata: null }));
    const r = await worker.ingest(ADDR.token);
    expect(r.metadata).toBe(false);
    expect(r.token?.created).toBe(true);
  });

  it('tolerates missing market data', async () => {
    const { worker } = setup(fullScript({ marketSnapshot: null }));
    const r = await worker.ingest(ADDR.token);
    expect(r.marketSnapshot).toBe(false);
    expect(r.events).toContain('market_data_missing');
    expect(r.token?.created).toBe(true);
  });

  it('skips the launch record when no launch was detected', async () => {
    const { store, worker } = setup(fullScript({ launch: null }));
    const r = await worker.ingest(ADDR.token);
    expect(r.launch).toBeNull();
    expect(store.launches.size).toBe(0);
    expect(r.token?.created).toBe(true);
  });

  it('retries transient provider failures and then succeeds', async () => {
    const { worker, provider } = setup(fullScript({ failTimes: { getToken: 1 } }));
    const r = await worker.ingest(ADDR.token);
    expect(r.token?.created).toBe(true);
    expect(provider.calls.getToken).toBe(2); // 1 failed attempt + 1 success
  });

  it('fails safely on a permanent error: nothing written', async () => {
    const { store, worker } = setup(fullScript({ token: null }));
    await expect(worker.ingest(ADDR.token)).rejects.toThrow(/not a token mint/i);
    expect(store.tokens.size).toBe(0);
    expect(store.wallets.size).toBe(0);
    expect(store.transactions.size).toBe(0);
  });

  it('dry-run resolves and normalizes but writes nothing', async () => {
    const store = new MemoryStore();
    const set = fakeProviderSet(fullScript());
    const worker = new IngestionWorker({
      providers: set, store, logger: silentLogger, dryRun: true,
      maxRetries: 0, backoffBaseMs: 1, backoffMaxMs: 4,
    });
    const r = await worker.ingest(ADDR.token);
    expect(r.dryRun).toBe(true);
    expect(r.token?.created).toBe(true);
    expect(store.tokens.size).toBe(0);
    expect(store.wallets.size).toBe(0);
    expect(store.launches.size).toBe(0);
    expect(store.transactions.size).toBe(0);
  });

  it('refuses invalid token addresses', async () => {
    const { worker } = setup(fullScript());
    await expect(worker.ingest('!!!not-base58!!!')).rejects.toThrow(/invalid token address/i);
  });
});
