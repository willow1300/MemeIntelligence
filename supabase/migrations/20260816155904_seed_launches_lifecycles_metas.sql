/*
# Seed: launches, token_lifecycles, token_metas + developer aggregates

Derives analytical + launch records from the raw tokens/metadata already stored:

1. launches — one per token, developer resolved via creator wallet, initial
   market cap/liquidity estimated as a fraction of the observed peak.
2. token_lifecycles — launch/peak/death timing + failure classification with
   per-type confidence and evidence (evidence-first design).
3. token_metas — expands the theme/narrative/culture hints into hierarchical
   meta labels (child + parent) with confidence.
4. Updates developers.launch_count / first_seen / last_seen from their launches.

Lifespan multipliers (relative to time-to-peak) approximate how long each
failure mode typically takes to play out. HEALTHY tokens have no death_time.
*/

-- Launches
INSERT INTO launches (token_id, developer_id, platform_id, launch_time, initial_liquidity, initial_market_cap, launch_transaction, status)
SELECT t.id, d.id, t.platform_id, t.created_at,
       round((m.raw_metadata->>'peak_mc')::numeric * 0.045),
       round((m.raw_metadata->>'peak_mc')::numeric * 0.06),
       'deploytx_' || t.address, 'COMPLETED'
FROM tokens t
JOIN token_metadata m ON m.token_id = t.id
LEFT JOIN developers d ON d.primary_wallet_id = t.creator_wallet_id
ON CONFLICT (token_id) DO NOTHING;

-- Lifecycles
INSERT INTO token_lifecycles (token_id, launch_time, peak_time, peak_market_cap, death_time, failure_type, confidence, evidence)
SELECT t.id,
  t.created_at,
  t.created_at + ((m.raw_metadata->>'ttp_min')::int || ' minutes')::interval,
  (m.raw_metadata->>'peak_mc')::numeric,
  CASE (m.raw_metadata->>'failure_type')
    WHEN 'HEALTHY' THEN NULL
    ELSE t.created_at + (
      (m.raw_metadata->>'ttp_min')::int *
      CASE (m.raw_metadata->>'failure_type')
        WHEN 'FAILED_LAUNCH' THEN 3
        WHEN 'MOMENTUM_EXHAUSTION' THEN 8
        WHEN 'META_EXHAUSTION' THEN 10
        WHEN 'DEV_SELLING' THEN 5
        WHEN 'LIQUIDITY_EVENT' THEN 4
        WHEN 'ASSOCIATED_WALLET_DISTRIBUTION' THEN 6
        ELSE 7 END
      || ' minutes')::interval
  END,
  m.raw_metadata->>'failure_type',
  CASE (m.raw_metadata->>'failure_type')
    WHEN 'HEALTHY' THEN 0.66
    WHEN 'MOMENTUM_EXHAUSTION' THEN 0.78
    WHEN 'DEV_SELLING' THEN 0.81
    WHEN 'LIQUIDITY_EVENT' THEN 0.84
    WHEN 'ASSOCIATED_WALLET_DISTRIBUTION' THEN 0.72
    WHEN 'FAILED_LAUNCH' THEN 0.69
    ELSE 0.5 END,
  CASE (m.raw_metadata->>'failure_type')
    WHEN 'HEALTHY' THEN '["Holder count still growing","Liquidity stable since launch","No large creator-associated outflows observed"]'::jsonb
    WHEN 'MOMENTUM_EXHAUSTION' THEN '["Volume declined more than 70% from peak","Holder growth flattened","Liquidity remained relatively stable","No significant developer sell detected"]'::jsonb
    WHEN 'DEV_SELLING' THEN '["Large outflow from a developer-associated wallet","Price declined sharply after the transfer","Holder count fell alongside the outflow"]'::jsonb
    WHEN 'LIQUIDITY_EVENT' THEN '["Liquidity dropped sharply in a short window","A liquidity-removal event was observed","Price gapped down following the event"]'::jsonb
    WHEN 'ASSOCIATED_WALLET_DISTRIBUTION' THEN '["Coordinated distribution across associated wallets","Steady sell pressure from linked addresses","Holder concentration decreased unusually fast"]'::jsonb
    WHEN 'FAILED_LAUNCH' THEN '["Volume never established after launch","Holder count stayed low","Peak market cap reached within minutes then faded"]'::jsonb
    ELSE '["Insufficient signal for a confident classification"]'::jsonb
  END
FROM tokens t
JOIN token_metadata m ON m.token_id = t.id
ON CONFLICT (token_id) DO NOTHING;

-- token_metas: animal theme child + parent
INSERT INTO token_metas (token_id, meta_id, confidence, source)
SELECT t.id, mc.id, 0.95, 'RULE_BASED'
FROM tokens t JOIN token_metadata m ON m.token_id = t.id
JOIN metas mc ON mc.slug = (m.raw_metadata->>'theme')
WHERE (m.raw_metadata->>'theme') IN ('duck','dog','cat','frog')
ON CONFLICT (token_id, meta_id) DO NOTHING;

INSERT INTO token_metas (token_id, meta_id, confidence, source)
SELECT t.id, ap.id, 0.97, 'RULE_BASED'
FROM tokens t JOIN token_metadata m ON m.token_id = t.id
JOIN metas ap ON ap.slug = 'animal'
WHERE (m.raw_metadata->>'theme') IN ('duck','dog','cat','frog')
ON CONFLICT (token_id, meta_id) DO NOTHING;

-- narrative child + parent
INSERT INTO token_metas (token_id, meta_id, confidence, source)
SELECT t.id, mc.id, 0.82, 'RULE_BASED'
FROM tokens t JOIN token_metadata m ON m.token_id = t.id
JOIN metas mc ON mc.slug = (m.raw_metadata->>'narrative')
ON CONFLICT (token_id, meta_id) DO NOTHING;

INSERT INTO token_metas (token_id, meta_id, confidence, source)
SELECT t.id, np.id, 0.85, 'RULE_BASED'
FROM tokens t JOIN token_metadata m ON m.token_id = t.id
JOIN metas np ON np.slug = 'narrative'
ON CONFLICT (token_id, meta_id) DO NOTHING;

-- culture child + parent
INSERT INTO token_metas (token_id, meta_id, confidence, source)
SELECT t.id, mc.id, 0.7, 'RULE_BASED'
FROM tokens t JOIN token_metadata m ON m.token_id = t.id
JOIN metas mc ON mc.slug = (m.raw_metadata->>'culture')
ON CONFLICT (token_id, meta_id) DO NOTHING;

INSERT INTO token_metas (token_id, meta_id, confidence, source)
SELECT t.id, cp.id, 0.72, 'RULE_BASED'
FROM tokens t JOIN token_metadata m ON m.token_id = t.id
JOIN metas cp ON cp.slug = 'culture'
ON CONFLICT (token_id, meta_id) DO NOTHING;

-- Developer aggregates
UPDATE developers d SET
  launch_count = agg.cnt,
  first_seen_at = LEAST(d.first_seen_at, agg.first_launch),
  last_seen_at = GREATEST(d.last_seen_at, agg.last_launch)
FROM (
  SELECT l.developer_id, count(*) cnt, min(l.launch_time) first_launch, max(l.launch_time) last_launch
  FROM launches l GROUP BY l.developer_id
) agg
WHERE agg.developer_id = d.id;
