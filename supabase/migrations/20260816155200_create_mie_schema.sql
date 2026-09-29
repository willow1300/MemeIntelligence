/*
# Meme Intelligence Engine — Core Schema

Creates the full foundational schema for the Meme Intelligence Engine (MIE),
a research/intelligence platform for analyzing newly launched meme tokens.

## Design principles
- Raw observations (tokens, wallets, transactions, snapshots) are stored
  separately from analytical conclusions (similarities, lifecycles, analyses).
- Chain and platform are abstracted (never hard-coded to one provider).
- first_seen_at means "first observed by our system", NOT wallet creation time.

## New Tables
1. chains — supported blockchains (abstraction layer)
2. platforms — launch venues / DEXs / launchpads per chain
3. wallets — observed on-chain addresses with an analytical wallet_type
4. developers — analytical grouping entity for launches
5. developer_wallets — links wallets to developers with confidence + evidence
6. tokens — canonical tokens, unique on (chain_id, address)
7. token_metadata — descriptive + social metadata, raw JSON preserved
8. launches — a token launch event on a platform
9. transactions — observed on-chain events (buy/sell/liquidity/etc.)
10. market_snapshots — time-series market state for lifecycle reconstruction
11. holder_snapshots — time-series holder distribution
12. metas — hierarchical meme/narrative taxonomy (parent_id self-ref)
13. token_metas — many-to-many token<->meta with confidence
14. token_similarities — pairwise similarity scores + relationship type
15. token_lifecycles — reconstructed lifecycle + failure classification + evidence
16. analyses — versioned explainable analysis records with evidence
17. users — minimal user entity (foundation for trade history)
18. user_wallets — public addresses a user tracks
19. user_trades — recorded buys/sells for outcome analysis

## Security
- RLS enabled on every table.
- This is a no-sign-in research tool; all data is intentionally public/shared,
  so each table gets anon+authenticated SELECT policies, and write policies
  for the ingestion/demo flows.
*/

-- ============ Reference / abstraction ============
CREATE TABLE IF NOT EXISTS chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  chain_id text NOT NULL,
  native_symbol text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (chain_id)
);

CREATE TABLE IF NOT EXISTS platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (slug)
);

-- ============ Wallets / developers ============
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  address text NOT NULL,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  transaction_count integer DEFAULT 0,
  wallet_type text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (wallet_type IN ('UNKNOWN','PERSONAL','PROGRAM','EXCHANGE','TREASURY','CONTRACT')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (chain_id, address)
);

CREATE TABLE IF NOT EXISTS developers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  primary_wallet_id uuid REFERENCES wallets(id) ON DELETE SET NULL,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  launch_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS developer_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (relationship_type IN ('PRIMARY','DEPLOYER','FUNDER','ASSOCIATED','UNKNOWN')),
  confidence numeric DEFAULT 0,
  evidence jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (developer_id, wallet_id)
);

-- ============ Tokens ============
CREATE TABLE IF NOT EXISTS tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  platform_id uuid REFERENCES platforms(id) ON DELETE SET NULL,
  address text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  decimals integer DEFAULT 9,
  creator_wallet_id uuid REFERENCES wallets(id) ON DELETE SET NULL,
  created_at timestamptz,
  first_seen_at timestamptz,
  image_url text,
  website_url text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','DECLINING','DEAD','UNKNOWN')),
  created_at_db timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (chain_id, address)
);

CREATE TABLE IF NOT EXISTS token_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  description text,
  image_url text,
  website_url text,
  twitter_url text,
  telegram_url text,
  discord_url text,
  metadata_uri text,
  raw_metadata jsonb DEFAULT '{}'::jsonb,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE (token_id)
);

CREATE TABLE IF NOT EXISTS launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  developer_id uuid REFERENCES developers(id) ON DELETE SET NULL,
  platform_id uuid REFERENCES platforms(id) ON DELETE SET NULL,
  launch_time timestamptz NOT NULL,
  initial_liquidity numeric DEFAULT 0,
  initial_market_cap numeric DEFAULT 0,
  launch_transaction text,
  status text NOT NULL DEFAULT 'COMPLETED',
  created_at timestamptz DEFAULT now(),
  UNIQUE (token_id)
);

-- ============ Observed events / time-series ============
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  tx_hash text NOT NULL,
  block_number bigint,
  timestamp timestamptz NOT NULL,
  wallet_id uuid REFERENCES wallets(id) ON DELETE SET NULL,
  token_id uuid REFERENCES tokens(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'OTHER'
    CHECK (event_type IN ('TRANSFER','BUY','SELL','LIQUIDITY_ADD','LIQUIDITY_REMOVE','DEPLOY','MINT','BURN','OTHER')),
  token_amount numeric DEFAULT 0,
  native_amount numeric DEFAULT 0,
  usd_value numeric DEFAULT 0,
  direction text CHECK (direction IN ('IN','OUT')),
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  price numeric DEFAULT 0,
  market_cap numeric DEFAULT 0,
  volume numeric DEFAULT 0,
  liquidity numeric DEFAULT 0,
  buys integer DEFAULT 0,
  sells integer DEFAULT 0,
  transaction_count integer DEFAULT 0,
  holder_count integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS holder_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  holder_count integer DEFAULT 0,
  top_10_percentage numeric DEFAULT 0,
  top_20_percentage numeric DEFAULT 0,
  developer_percentage numeric DEFAULT 0
);

-- ============ Meta taxonomy ============
CREATE TABLE IF NOT EXISTS metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES metas(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  type text NOT NULL DEFAULT 'GENERAL',
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS token_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  meta_id uuid NOT NULL REFERENCES metas(id) ON DELETE CASCADE,
  confidence numeric DEFAULT 0,
  source text DEFAULT 'RULE_BASED',
  created_at timestamptz DEFAULT now(),
  UNIQUE (token_id, meta_id)
);

-- ============ Analytical conclusions ============
CREATE TABLE IF NOT EXISTS token_similarities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_a_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  token_b_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  name_score numeric DEFAULT 0,
  symbol_score numeric DEFAULT 0,
  image_score numeric DEFAULT 0,
  narrative_score numeric DEFAULT 0,
  metadata_score numeric DEFAULT 0,
  time_difference_seconds bigint DEFAULT 0,
  overall_score numeric DEFAULT 0,
  relationship_type text NOT NULL DEFAULT 'SIMILAR'
    CHECK (relationship_type IN ('SIMILAR','POSSIBLE_DERIVATIVE','SAME_META','POSSIBLE_COPY')),
  confidence numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (token_a_id, token_b_id)
);

CREATE TABLE IF NOT EXISTS token_lifecycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  launch_time timestamptz,
  peak_time timestamptz,
  peak_market_cap numeric DEFAULT 0,
  death_time timestamptz,
  failure_type text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (failure_type IN ('UNKNOWN','FAILED_LAUNCH','MOMENTUM_EXHAUSTION','META_EXHAUSTION','DEV_SELLING','LIQUIDITY_EVENT','ASSOCIATED_WALLET_DISTRIBUTION','OTHER','HEALTHY')),
  confidence numeric DEFAULT 0,
  evidence jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (token_id)
);

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  analysis_type text NOT NULL
    CHECK (analysis_type IN ('META_CLASSIFICATION','SIMILARITY','DEVELOPER_PROFILE','WALLET_PROFILE','HISTORICAL_COMPARISON','LIFECYCLE','OVERALL')),
  version integer DEFAULT 1,
  score numeric DEFAULT 0,
  confidence numeric DEFAULT 0,
  result jsonb DEFAULT '{}'::jsonb,
  evidence jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- ============ User history foundation ============
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  label text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, wallet_id)
);

CREATE TABLE IF NOT EXISTS user_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES wallets(id) ON DELETE SET NULL,
  side text NOT NULL CHECK (side IN ('BUY','SELL')),
  timestamp timestamptz NOT NULL,
  token_amount numeric DEFAULT 0,
  price numeric DEFAULT 0,
  market_cap numeric DEFAULT 0,
  usd_value numeric DEFAULT 0,
  tx_hash text,
  created_at timestamptz DEFAULT now()
);

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator_wallet_id);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_launches_dev ON launches(developer_id);
CREATE INDEX IF NOT EXISTS idx_launches_time ON launches(launch_time);
CREATE INDEX IF NOT EXISTS idx_tx_token ON transactions(token_id);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_msnap_token_time ON market_snapshots(token_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_hsnap_token_time ON holder_snapshots(token_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_token_metas_token ON token_metas(token_id);
CREATE INDEX IF NOT EXISTS idx_sim_a ON token_similarities(token_a_id);
CREATE INDEX IF NOT EXISTS idx_sim_b ON token_similarities(token_b_id);
CREATE INDEX IF NOT EXISTS idx_dw_dev ON developer_wallets(developer_id);
CREATE INDEX IF NOT EXISTS idx_user_trades_user ON user_trades(user_id);

-- ============ RLS (public research data) ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chains','platforms','wallets','developers','developer_wallets','tokens',
    'token_metadata','launches','transactions','market_snapshots','holder_snapshots',
    'metas','token_metas','token_similarities','token_lifecycles','analyses',
    'users','user_wallets','user_trades'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_select_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "public_select_%1$s" ON %1$I FOR SELECT TO anon, authenticated USING (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_insert_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "public_insert_%1$s" ON %1$I FOR INSERT TO anon, authenticated WITH CHECK (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_update_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "public_update_%1$s" ON %1$I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_delete_%1$s" ON %1$I;', t);
    EXECUTE format('CREATE POLICY "public_delete_%1$s" ON %1$I FOR DELETE TO anon, authenticated USING (true);', t);
  END LOOP;
END $$;
