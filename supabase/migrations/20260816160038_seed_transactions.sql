/*
# Seed: transactions

Generates observable on-chain events for every token so the wallet/developer
event analysis has data. For each token we emit:
  - DEPLOY by the creator wallet at launch_time
  - A few BUY events leading to peak
  - Failure-specific events (SELL, LIQUIDITY_REMOVE, TRANSFER to associated wallets)
  - For HEALTHY tokens, continued BUY activity after peak

This is deliberately synthetic but deterministic. It distinguishes:
  normal selling vs developer selling vs liquidity removal vs distribution.
*/

WITH td AS (
  SELECT
    t.id AS token_id, t.chain_id, t.address, t.creator_wallet_id,
    t.created_at AS launch_time,
    (m.raw_metadata->>'peak_mc')::numeric AS peak_mc,
    (m.raw_metadata->>'ttp_min')::int AS ttp_min,
    m.raw_metadata->>'failure_type' AS failure_type,
    lc.peak_time, lc.death_time
  FROM tokens t
  JOIN token_metadata m ON m.token_id = t.id
  JOIN token_lifecycles lc ON lc.token_id = t.id
  WHERE t.creator_wallet_id IS NOT NULL
)
-- DEPLOY event by creator
INSERT INTO transactions (chain_id, tx_hash, block_number, timestamp, wallet_id, token_id, event_type, token_amount, native_amount, usd_value, direction, raw_data)
SELECT td.chain_id, 'deploy_' || td.address, 1, td.launch_time, td.creator_wallet_id, td.token_id,
  'DEPLOY', 1000000000, 0.05, 0, 'OUT', '{}'::jsonb FROM td
UNION ALL
-- BUY at ~25% to peak (momentum building)
SELECT td.chain_id, 'buy1_' || td.address, 2, td.launch_time + (td.ttp_min * 0.25 || ' minutes')::interval,
  td.creator_wallet_id, td.token_id, 'BUY', 5000000, 2, td.peak_mc * 0.05, 'IN', '{}'::jsonb FROM td
UNION ALL
-- BUY at peak
SELECT td.chain_id, 'buyPeak_' || td.address, 3, td.peak_time,
  td.creator_wallet_id, td.token_id, 'BUY', 3000000, 5, td.peak_mc * 0.12, 'IN', '{}'::jsonb FROM td
UNION ALL
-- Failure-specific events at death_time
SELECT td.chain_id,
  CASE td.failure_type
    WHEN 'DEV_SELLING' THEN 'devsell_' || td.address
    WHEN 'LIQUIDITY_EVENT' THEN 'liqrem_' || td.address
    WHEN 'ASSOCIATED_WALLET_DISTRIBUTION' THEN 'dist_' || td.address
    WHEN 'MOMENTUM_EXHAUSTION' THEN 'sell_' || td.address
    WHEN 'FAILED_LAUNCH' THEN 'fadesell_' || td.address
    ELSE 'sell_' || td.address END,
  4, td.death_time, td.creator_wallet_id, td.token_id,
  CASE td.failure_type
    WHEN 'LIQUIDITY_EVENT' THEN 'LIQUIDITY_REMOVE'
    WHEN 'DEV_SELLING' THEN 'SELL'
    WHEN 'ASSOCIATED_WALLET_DISTRIBUTION' THEN 'TRANSFER'
    ELSE 'SELL' END,
  CASE td.failure_type WHEN 'LIQUIDITY_EVENT' THEN 0 ELSE 8000000 END,
  CASE td.failure_type WHEN 'LIQUIDITY_EVENT' THEN 0 ELSE 3 END,
  td.peak_mc * 0.08,
  'OUT', '{}'::jsonb
FROM td WHERE td.death_time IS NOT NULL;
