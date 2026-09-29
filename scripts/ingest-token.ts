// CLI: ingest a single token through the full Phase 2A pipeline.
//
//   npm run ingest -- <tokenAddress> [--dry-run]
//
// Provider is chosen by DATA_PROVIDER (mock | solana). The store is Supabase
// when SUPABASE_URL is configured; otherwise an in-memory store is used with a
// loud warning (data is discarded — useful for provider smoke tests).
// Structured logs go to stderr; the final result summary goes to stdout.
import 'dotenv/config';
import { buildProviderSet } from '../src/providers/provider-factory.ts';
import { createSupabaseStore } from '../src/ingestion/supabase-store.ts';
import { MemoryStore } from '../src/ingestion/memory-store.ts';
import { IngestionWorker } from '../src/ingestion/worker.ts';
import { createLogger } from '../src/ingestion/logger.ts';
import { isValidSolanaAddress } from '../src/providers/normalize.ts';

async function main(): Promise<number> {
  const address = process.argv[2] ?? '';
  const dryRun = process.argv.includes('--dry-run');

  if (!isValidSolanaAddress(address)) {
    console.error(`Usage: npm run ingest -- <tokenAddress> [--dry-run]\nInvalid Solana address: "${address}"`);
    return 2;
  }

  const providers = buildProviderSet();
  const log = createLogger();
  log.info('provider_request', { provider: providers.name, op: 'ingest-cli', chainSlug: providers.chainSlug });

  const useSupabase = Boolean(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)
    && process.env.MIE_STORE !== 'memory';
  const store = useSupabase ? createSupabaseStore() : new MemoryStore();
  if (!useSupabase) {
    log.warn('no_database_configured', {
      hint: 'SUPABASE_URL missing (or MIE_STORE=memory) — using in-memory store; nothing will persist.',
    });
  }

  const worker = new IngestionWorker({
    providers,
    store,
    logger: log,
    dryRun,
    maxRetries: Number(process.env.INGEST_MAX_RETRIES ?? 3),
    backoffBaseMs: Number(process.env.INGEST_BACKOFF_BASE_MS ?? 250),
    backoffMaxMs: Number(process.env.INGEST_BACKOFF_MAX_MS ?? 8000),
  });

  try {
    const result = await worker.ingest(address);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    log.error('ingestion_failed', {
      tokenAddress: address,
      message: err instanceof Error ? err.message : String(err),
    });
    return 1;
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
