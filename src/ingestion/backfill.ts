// Phase 2A — Historical backfill worker (separate from live ingestion).
//
// Bounded, checkpointed, restartable, idempotent. It NEVER runs an
// uncontrolled full-chain scan: every run is limited by maxPages/maxItems and
// an optional time bound (beforeIso). Live ingestion and backfill are separate
// jobs (different job_type, separate checkpoint ids).
//
//   provider pages -> validate -> IngestionWorker.ingest(address) -> checkpoint
//
// The checkpoint row (backfill_checkpoints) is written after EVERY batch, so a
// crash anywhere is resumable. Re-running a partially-completed run is safe at
// two levels: the cursor skips batches already checkpointed, and even a batch
// lost between "processed" and "checkpoint saved" is harmless because the
// ingestion worker itself is idempotent (no duplicate rows are possible).

import type { DetectedLaunch, LaunchProvider } from '../providers/interfaces.ts';
import type { IngestionStore } from './store.ts';
import { NoopRateLimiter, type RateLimiter } from '../providers/rate-limiter.ts';
import type { IngestionWorker } from './worker.ts';
import { createLogger, type StructuredLogger } from './logger.ts';

export interface LaunchPage {
  items: DetectedLaunch[];
  /** Cursor to resume from, or null when the feed is exhausted. */
  nextCursor: string | null;
}

/**
 * A paged view over launches. Implementations must be deterministic for a
 * given cursor so restarts never skip or double-count items.
 */
export interface LaunchPageSource {
  fetchPage(cursor: string | null, limit: number): Promise<LaunchPage>;
}

/**
 * Default source: windows the LaunchProvider's recent-launch feed. The feed is
 * captured once per run and ordered deterministically (oldest first, then by
 * address), then paged by numeric-offset cursor. When a provider gains a real
 * cursor API (Phase 2B+), only this adapter changes.
 */
export function launchProviderSource(provider: LaunchProvider): LaunchPageSource {
  let feed: DetectedLaunch[] | null = null;
  return {
    async fetchPage(cursor: string | null, limit: number): Promise<LaunchPage> {
      if (!feed) {
        const all = await provider.getRecentLaunches();
        feed = [...all].sort((a, b) => {
          const ta = a.launchTime ?? '';
          const tb = b.launchTime ?? '';
          if (ta !== tb) return ta < tb ? -1 : 1;
          if (a.tokenAddress !== b.tokenAddress) return a.tokenAddress < b.tokenAddress ? -1 : 1;
          return 0;
        });
      }
      const start = cursor === null ? 0 : Math.max(0, Number.parseInt(cursor, 10) || 0);
      const items = feed.slice(start, start + limit);
      const next = start + limit < feed.length ? String(start + limit) : null;
      return { items, nextCursor: next };
    },
  };
}

export interface BackfillOptions {
  worker: IngestionWorker;
  store: IngestionStore;
  source: LaunchPageSource;
  rateLimiter?: RateLimiter;
  logger?: StructuredLogger;
  /** Checkpoint row id. Use distinct ids per logical backfill. */
  checkpointId?: string;
  batchSize?: number;
  /** Hard page cap — the main protection against uncontrolled scans. */
  maxPages?: number;
  /** Extra cap on total launches ingested per run. */
  maxItems?: number;
  /** Skip launches observed after this ISO timestamp (historical ranges only). */
  beforeIso?: string | null;
}

export interface BackfillResult {
  checkpointId: string;
  pagesProcessed: number;
  launchesSeen: number;
  ingested: number;
  failed: number;
  finished: boolean;
  lastCursor: string | null;
}

export class HistoricalBackfillWorker {
  private readonly worker: IngestionWorker;
  private readonly store: IngestionStore;
  private readonly source: LaunchPageSource;
  private readonly rateLimiter: RateLimiter;
  private readonly logger: StructuredLogger;
  private readonly checkpointId: string;
  private readonly batchSize: number;
  private readonly maxPages: number;
  private readonly maxItems: number;
  private readonly beforeIso: string | null;

  constructor(options: BackfillOptions) {
    this.worker = options.worker;
    this.store = options.store;
    this.source = options.source;
    this.rateLimiter = options.rateLimiter ?? new NoopRateLimiter();
    this.logger = options.logger ?? createLogger();
    this.checkpointId = options.checkpointId ?? 'default';
    this.batchSize = Math.max(1, options.batchSize ?? 10);
    this.maxPages = Math.max(1, options.maxPages ?? 5);
    this.maxItems = Math.max(1, options.maxItems ?? 250);
    this.beforeIso = options.beforeIso ?? null;
  }

  async run(): Promise<BackfillResult> {
    const log = this.logger.child({ job: 'backfill', checkpointId: this.checkpointId });
    const cp = await this.store.getCheckpoint(this.checkpointId);
    let cursor = cp?.lastCursor ?? null;
    let processedCount = cp?.processedCount ?? 0;
    let pagesProcessed = 0;
    let ingested = 0;
    let failed = 0;
    let finished = false;

    await this.store.setCheckpoint({
      id: this.checkpointId,
      lastCursor: cursor,
      lastTimestamp: new Date().toISOString(),
      processedCount,
      state: { running: true, finished: cp?.state?.finished === true },
    });

    const jobId = await this.store.createJob('BACKFILL', 'backfill-worker', null);

    try {
      while (pagesProcessed < this.maxPages && ingested < this.maxItems) {
        await this.rateLimiter.acquire();
        const page = await this.source.fetchPage(cursor, this.batchSize);
        if (page.items.length === 0) {
          finished = true;
          break;
        }

        for (const launch of page.items) {
          if (this.beforeIso && launch.launchTime && launch.launchTime > this.beforeIso) {
            log.debug('backfill_skipped_future', { tokenAddress: launch.tokenAddress });
            continue;
          }
          if (ingested >= this.maxItems) break;
          try {
            await this.worker.ingest(launch.tokenAddress);
            ingested += 1;
            log.info('backfill_item_ingested', { tokenAddress: launch.tokenAddress });
          } catch (err) {
            failed += 1;
            log.warn('backfill_item_failed', {
              tokenAddress: launch.tokenAddress,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          processedCount += 1;
        }

        pagesProcessed += 1;
        cursor = page.nextCursor;
        if (cursor === null) finished = true;

        // Persist progress after every batch — this is what makes the run
        // restartable. A crash before this write reprocesses only one batch.
        await this.store.setCheckpoint({
          id: this.checkpointId,
          lastCursor: cursor,
          lastTimestamp: new Date().toISOString(),
          processedCount,
          state: { running: !finished, finished },
        });

        if (finished) break;
      }
      const status = failed === 0 ? 'SUCCEEDED' : 'PARTIAL';
      await this.store.finishJob(jobId, status, ingested, failed > 0 ? `${failed} item(s) failed` : null);
    } catch (err) {
      await this.store.finishJob(jobId, 'FAILED', ingested, err instanceof Error ? err.message : String(err));
      throw err;
    }

    log.info('backfill_completed', { pagesProcessed, ingested, failed, finished, lastCursor: cursor });
    return {
      checkpointId: this.checkpointId,
      pagesProcessed,
      launchesSeen: processedCount,
      ingested,
      failed,
      finished,
      lastCursor: cursor,
    };
  }
}

