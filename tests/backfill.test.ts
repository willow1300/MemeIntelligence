// Phase 2A — Historical backfill worker tests (MemoryStore + FakeProvider).
// Covers: pagination, checkpointing, restartability, maxPages/maxItems bounds,
// beforeIso filtering, rate-limiter usage, partial failure handling, and
// idempotent re-runs (no duplicate rows).
import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../src/ingestion/memory-store.ts';
import { IngestionWorker } from '../src/ingestion/worker.ts';
import { HistoricalBackfillWorker, launchProviderSource } from '../src/ingestion/backfill.ts';
import type { StructuredLogger } from '../src/ingestion/logger.ts';
import type { RateLimiter } from '../src/providers/rate-limiter.ts';
import {
  ADDR, fakeProviderSet, makeToken, makeWallet, makeLaunch,
  makeTransaction, type FakeScript,
} from './helpers/fake-provider.ts';

const silentLogger: StructuredLogger = {
  debug() {}, info() {}, warn() {}, error() {},
  child() { return silentLogger; },
};

const FIRST_SEEN = '2026-09-08T17:20:11.000Z';

function fullScript(n: number): FakeScript {
  return {
    token: makeToken(),
    wallet: makeWallet(FIRST_SEEN),
    recentLaunches: Array.from({ length: n }, (_, i) =>
      makeLaunch({
        // base58-safe suffix ('0' is not in the base58 alphabet)
        tokenAddress: i === 0 ? ADDR.token : ADDR.token.slice(0, -2) + 'z' + String(i),
        launchTime: '2026-09-08T17:2' + i + ':24.000Z',
      })),
    transactions: [makeTransaction(1)],
  };
}

function setup(script: FakeScript) {
  const store = new MemoryStore();
  const set = fakeProviderSet(script);
  const worker = new IngestionWorker({
    providers: set, store, logger: silentLogger,
    maxRetries: 1, backoffBaseMs: 1, backoffMaxMs: 2,
  });
  const source = launchProviderSource(set.provider);
  return { store, worker, source };
}

function countingLimiter() {
  let calls = 0;
  const limiter: RateLimiter = {
    async acquire() { calls += 1; },
    snapshot() { return { remaining: 0, queued: calls }; },
  };
  return { limiter, count: () => calls };
}

describe('HistoricalBackfillWorker', () => {
  it('pages through the feed, ingests every launch, finishes, and checkpoints', async () => {
    const { store, worker, source } = setup(fullScript(5));
    const { limiter, count } = countingLimiter();
    const bf = new HistoricalBackfillWorker({
      worker, store, source, logger: silentLogger, rateLimiter: limiter,
      checkpointId: 'bf-full', batchSize: 2, maxPages: 10,
    });
    const r = await bf.run();

    expect(r.ingested).toBe(5);
    expect(r.failed).toBe(0);
    expect(r.finished).toBe(true);
    expect(r.pagesProcessed).toBe(3); // ceil(5/2)
    expect(r.lastCursor).toBeNull();
    expect(count()).toBe(3); // one acquire per page

    const cp = await store.getCheckpoint('bf-full');
    expect(cp?.processedCount).toBe(5);
    expect(cp?.lastCursor).toBeNull();
    expect(cp?.state.finished).toBe(true);
    expect(store.jobs[0]?.status).toBe('SUCCEEDED');
  });

  it('respects maxItems and reports an unfinished run', async () => {
    const { store, worker, source } = setup(fullScript(5));
    const bf = new HistoricalBackfillWorker({
      worker, store, source, logger: silentLogger,
      checkpointId: 'bf-cap', batchSize: 2, maxPages: 10, maxItems: 3,
    });
    const r = await bf.run();
    expect(r.ingested).toBe(3);
    expect(r.finished).toBe(false);
    expect(r.lastCursor).not.toBeNull();
  });

  it('honors maxPages as a hard stop', async () => {
    const { store, worker, source } = setup(fullScript(9));
    const bf = new HistoricalBackfillWorker({
      worker, store, source, logger: silentLogger,
      checkpointId: 'bf-pages', batchSize: 2, maxPages: 2,
    });
    const r = await bf.run();
    expect(r.pagesProcessed).toBe(2);
    expect(r.ingested).toBe(4);
    expect(r.finished).toBe(false);
  });
});

describe('HistoricalBackfillWorker (restart / filter / failure)', () => {
  it('restarts from the persisted checkpoint without reprocessing earlier batches', async () => {
    const { store, worker, source } = setup(fullScript(6));
    const ingestedAddresses: string[] = [];
    const realIngest = worker.ingest.bind(worker);
    worker.ingest = async (address: string) => {
      ingestedAddresses.push(address);
      return realIngest(address);
    };

    const run1 = await new HistoricalBackfillWorker({
      worker, store, source, logger: silentLogger,
      checkpointId: 'bf-resume', batchSize: 2, maxPages: 1,
    }).run();
    expect(run1.ingested).toBe(2);
    expect(run1.lastCursor).toBe('2');
    expect(run1.finished).toBe(false);

    // Fresh worker instance = simulated process restart; same store + checkpoint id.
    const run2 = await new HistoricalBackfillWorker({
      worker, store, source, logger: silentLogger,
      checkpointId: 'bf-resume', batchSize: 2, maxPages: 10,
    }).run();
    expect(run2.ingested).toBe(4);
    expect(run2.finished).toBe(true);
    // cursor resumed at 2 => first two launches never re-ingested
    expect(ingestedAddresses.filter((a) => a === fullScript(6).recentLaunches![0].tokenAddress)).toHaveLength(1);
    expect(ingestedAddresses).toHaveLength(6);
  });

  it('skips launches newer than beforeIso', async () => {
    const script = fullScript(4);
    const { store, worker, source } = setup(script);
    const bf = new HistoricalBackfillWorker({
      worker, store, source, logger: silentLogger,
      checkpointId: 'bf-before', batchSize: 10, maxPages: 5,
      beforeIso: '2026-09-08T17:22:00.000Z', // 17:20:24 and 17:21:24 pass, 17:22:24+ skipped
    });
    const r = await bf.run();
    expect(r.ingested).toBe(2);
  });

  it('marks the job PARTIAL when some items fail, and keeps going', async () => {
    const script = fullScript(3);
    const { store, worker, source } = setup(script);
    const realIngest = worker.ingest.bind(worker);
    worker.ingest = async (address: string) => {
      if (address === script.recentLaunches![1].tokenAddress) throw new Error('boom');
      return realIngest(address);
    };
    const r = await new HistoricalBackfillWorker({
      worker, store, source, logger: silentLogger,
      checkpointId: 'bf-partial', batchSize: 10, maxPages: 5,
    }).run();
    expect(r.ingested).toBe(2);
    expect(r.failed).toBe(1);
    expect(store.jobs[0]?.status).toBe('PARTIAL');
  });

  it('re-running a finished backfill is idempotent (no duplicate rows)', async () => {
    const { store, worker, source } = setup(fullScript(4));
    const opts = {
      worker, store, source, logger: silentLogger,
      checkpointId: 'bf-idem', batchSize: 3, maxPages: 10,
    } as const;
    await new HistoricalBackfillWorker(opts).run();
    const tokensAfter1 = store.tokens.size;
    const txsAfter1 = store.transactions.size;
    const launchesAfter1 = store.launches.size;

    const r2 = await new HistoricalBackfillWorker(opts).run();
    expect(r2.ingested).toBe(4); // re-processed, but...
    expect(store.tokens.size).toBe(tokensAfter1); // ...no new rows
    expect(store.transactions.size).toBe(txsAfter1);
    expect(store.launches.size).toBe(launchesAfter1);
  });
});

