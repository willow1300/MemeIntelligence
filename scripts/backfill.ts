// CLI: run the historical backfill worker (separate job from live ingestion).
//
//   npm run backfill -- [--pages N] [--batch N] [--before ISO] [--checkpoint ID] [--dry-run]
//
// Bounded by BACKFILL_MAX_PAGES / BACKFILL_BATCH_SIZE env defaults plus the
// CLI flags. Never runs an uncontrolled full-chain scan. Progress is
// checkpointed after every batch so the run is restartable and idempotent.
import 'dotenv/config';
import { buildProviderSet } from '../src/providers/provider-factory.ts';
import { createSupabaseStore } from '../src/ingestion/supabase-store.ts';
import { MemoryStore } from '../src/ingestion/memory-store.ts';
import { IngestionWorker } from '../src/ingestion/worker.ts';
import {
  HistoricalBackfillWorker,
  launchProviderSource,
} from '../src/ingestion/backfill.ts';
import { createLogger } from '../src/ingestion/logger.ts';
import { createRateLimiter } from '../src/providers/rate-limiter.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const log = createLogger();
  const providers = buildProviderSet();
  const useSupabase = Boolean(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)
    && process.env.MIE_STORE !== 'memory';
  const store = useSupabase ? createSupabaseStore() : new MemoryStore();
  if (!useSupabase) {
    log.warn('no_database_configured', {
      hint: 'SUPABASE_URL missing (or MIE_STORE=memory) — using in-memory store; nothing will persist.',
    });
  }

  const worker = new IngestionWorker({ providers, store, logger: log });
  const backfill = new HistoricalBackfillWorker({
    worker,
    store,
    source: launchProviderSource(providers.launch),
    rateLimiter: createRateLimiter(Number(process.env.BACKFILL_RATE_LIMIT_RPS ?? 5)),
    logger: log,
    checkpointId: flag('--checkpoint') ?? process.env.BACKFILL_CHECKPOINT_ID ?? 'default',
    batchSize: Number(flag('--batch') ?? process.env.BACKFILL_BATCH_SIZE ?? 10),
    maxPages: Number(flag('--pages') ?? process.env.BACKFILL_MAX_PAGES ?? 5),
    beforeIso: flag('--before') ?? null,
  });

  const result = await backfill.run();
  console.log(JSON.stringify(result, null, 2));
  return result.failed > 0 ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
