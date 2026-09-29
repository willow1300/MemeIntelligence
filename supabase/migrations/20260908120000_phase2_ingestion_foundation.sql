/*
# Phase 2A — Real-data ingestion foundation

Adds database safety guarantees required by the ingestion worker:

1. raw_data JSONB on tokens / wallets / launches so every normalized row can
   preserve the original provider response (RAW -> NORMALIZED -> DERIVED).
   transactions already carries raw_data; token_metadata carries raw_metadata.
2. Deduplication constraints:
   - transactions: partial UNIQUE index on tx_hash (duplicate on-chain txs must
     never be stored twice).
   - market_snapshots / holder_snapshots: UNIQUE (token_id, timestamp) so
     re-running a snapshot fetch is idempotent.
3. backfill_checkpoints: persistence for the historical backfill worker so a
   paused/crashed backfill can resume where it left off.

Design notes:
- All additions are additive; nothing is rewritten or removed.
- Existing intelligence tables are untouched.
- No secrets are introduced here.
*/

-- ============ 1. Raw data preservation ============

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE launches ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE holder_snapshots ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ 2. Deduplication constraints ============

-- transactions: never store the same on-chain signature twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_tx_hash
  ON transactions (tx_hash)
  WHERE tx_hash IS NOT NULL;

-- market snapshots: one snapshot per token per timestamp
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_snapshots_token_time
  ON market_snapshots (token_id, timestamp);

-- holder snapshots: one snapshot per token per timestamp
CREATE UNIQUE INDEX IF NOT EXISTS uq_holder_snapshots_token_time
  ON holder_snapshots (token_id, timestamp);

-- ============ 3. Backfill checkpoints ============

CREATE TABLE IF NOT EXISTS backfill_checkpoints (
  id text PRIMARY KEY,
  last_cursor text,
  last_timestamp timestamptz,
  processed_count bigint NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 4. Ingestion job log (optional audit trail) ============

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,            -- 'live' | 'backfill'
  provider_name text NOT NULL,
  token_address text,
  status text NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','PARTIAL')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  tokens_processed integer NOT NULL DEFAULT 0,
  error jsonb
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_token ON ingestion_jobs (token_address);