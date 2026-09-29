/*
# Seed: market_snapshots + holder_snapshots

Generates time-series snapshots for every token so the lifecycle can be
reconstructed in the UI. For each token we emit snapshots at:
  t0 (launch), t_peak, and a post-peak/death point (for failed tokens).

Values are derived deterministically from token_metadata.raw_metadata:
  - peak_mc, ttp_min, failure_type
  - initial market cap = ~6% of peak
  - death market cap depends on failure type (liquidity events collapse most)

holder_snapshots track concentration over time.
*/

WITH token_data AS (
  SELECT
    t.id AS token_id,
    t.created_at AS launch_time,
    (m.raw_metadata->>'peak_mc')::numeric AS peak_mc,
    (m.raw_metadata->>'ttp_min')::int AS ttp_min,
    m.raw_metadata->>'failure_type' AS failure_type,
    lc.peak_time,
    lc.death_time
  FROM tokens t
  JOIN token_metadata m ON m.token_id = t.id
  JOIN token_lifecycles lc ON lc.token_id = t.id
),
death_mc(failure_type, factor) AS (
  VALUES
    ('HEALTHY', 0.80),
    ('MOMENTUM_EXHAUSTION', 0.12),
    ('META_EXHAUSTION', 0.10),
    ('DEV_SELLING', 0.06),
    ('LIQUIDITY_EVENT', 0.03),
    ('ASSOCIATED_WALLET_DISTRIBUTION', 0.08),
    ('FAILED_LAUNCH', 0.15),
    ('UNKNOWN', 0.20),
    ('OTHER', 0.20)
)
INSERT INTO market_snapshots (token_id, timestamp, price, market_cap, volume, liquidity, buys, sells, transaction_count, holder_count)
-- t0 launch snapshot
SELECT td.token_id, td.launch_time,
  0.000001, td.peak_mc * 0.06, td.peak_mc * 0.02, td.peak_mc * 0.045,
  5, 1, 6, 5
FROM token_data td
UNION ALL
-- peak snapshot
SELECT td.token_id, td.peak_time,
  0.000001 * (td.peak_mc / (td.peak_mc * 0.06)), td.peak_mc,
  td.peak_mc * 0.30, td.peak_mc * 0.05,
  120, 45, 165, 320
FROM token_data td
UNION ALL
-- death/decline snapshot (only for non-HEALTHY)
SELECT td.token_id, td.death_time,
  0.000001 * (td.peak_mc * dm.factor / (td.peak_mc * 0.06)),
  td.peak_mc * dm.factor,
  td.peak_mc * 0.05, td.peak_mc * 0.015,
  8, 60, 68, 180
FROM token_data td
JOIN death_mc dm ON dm.failure_type = td.failure_type
WHERE td.death_time IS NOT NULL;

-- Holder snapshots
WITH token_data AS (
  SELECT
    t.id AS token_id,
    t.created_at AS launch_time,
    lc.peak_time,
    lc.death_time,
    m.raw_metadata->>'failure_type' AS failure_type
  FROM tokens t
  JOIN token_metadata m ON m.token_id = t.id
  JOIN token_lifecycles lc ON lc.token_id = t.id
)
INSERT INTO holder_snapshots (token_id, timestamp, holder_count, top_10_percentage, top_20_percentage, developer_percentage)
SELECT td.token_id, td.launch_time, 5, 0.85, 0.95, 0.65 FROM token_data td
UNION ALL
SELECT td.token_id, td.peak_time, 320, 0.35, 0.55, 0.12 FROM token_data td
UNION ALL
SELECT td.token_id, td.death_time, 180, 0.55, 0.72, 0.28
FROM token_data td WHERE td.death_time IS NOT NULL;
