/*
# Seed: analyses (explainable intelligence records)

Pre-computes one OVERALL analysis per token plus typed sub-analyses. The
OVERALL analysis is an explainable research signal (NOT a buy score) composed
of: historical similarity, developer history, wallet age, meta history,
liquidity, momentum — each with a label and evidence.

This makes the dashboard and extension fast in V1 while remaining explainable.
V2 can regenerate these from live engines.
*/

-- OVERALL analyses
INSERT INTO analyses (token_id, analysis_type, version, score, confidence, result, evidence, expires_at)
SELECT t.id, 'OVERALL', 1,
  -- composite score 0..1
  LEAST(1.0, (
    0.20 * CASE WHEN t.symbol IN ('LOUIE','PEPE','DOGE') THEN 0.7 ELSE 0.4 END +
    0.20 * CASE WHEN d.name = 'Aurora Labs' THEN 0.8 WHEN d.name = 'Quiet Build' THEN 0.65 WHEN d.name = 'Fresh Mint' THEN 0.3 ELSE 0.45 END +
    0.15 * CASE WHEN w.first_seen_at < t.created_at - '180 days'::interval THEN 0.7 WHEN w.first_seen_at < t.created_at - '30 days'::interval THEN 0.5 ELSE 0.2 END +
    0.15 * 0.6 + -- meta history placeholder
    0.15 * 0.5 + -- liquidity
    0.15 * CASE WHEN lc.failure_type = 'HEALTHY' THEN 0.8 ELSE 0.3 END
  )),
  0.7,
  jsonb_build_object(
    'components', jsonb_build_array(
      jsonb_build_object('label','Historical similarity','value', CASE WHEN t.symbol IN ('LOUIE','PEPE','DOGE') THEN 'HIGH' ELSE 'LOW' END),
      jsonb_build_object('label','Developer history','value', CASE WHEN d.name = 'Aurora Labs' THEN 'STRONG' WHEN d.name = 'Quiet Build' THEN 'MEDIUM' WHEN d.name = 'Fresh Mint' THEN 'UNKNOWN' ELSE 'MEDIUM' END),
      jsonb_build_object('label','Wallet age','value', CASE WHEN w.first_seen_at < t.created_at - '180 days'::interval THEN 'OLD' WHEN w.first_seen_at < t.created_at - '30 days'::interval THEN 'ESTABLISHED' ELSE 'NEW' END),
      jsonb_build_object('label','Meta history','value', 'MEDIUM'),
      jsonb_build_object('label','Liquidity','value', 'MEDIUM'),
      jsonb_build_object('label','Momentum','value', CASE WHEN lc.failure_type = 'HEALTHY' THEN 'STRONG' ELSE 'WEAK' END)
    ),
    'overall', CASE
      WHEN lc.failure_type = 'HEALTHY' AND d.name IN ('Aurora Labs','Quiet Build') THEN 'RESEARCH_INTEREST_HIGH'
      WHEN lc.failure_type = 'HEALTHY' THEN 'RESEARCH_INTEREST_MEDIUM'
      WHEN d.name = 'Fresh Mint' THEN 'RESEARCH_INTEREST_LOW'
      ELSE 'RESEARCH_INTEREST_LOW' END
  ),
  lc.evidence,
  now() + '24 hours'::interval
FROM tokens t
JOIN wallets w ON w.id = t.creator_wallet_id
LEFT JOIN developers d ON d.primary_wallet_id = t.creator_wallet_id
JOIN token_lifecycles lc ON lc.token_id = t.id
WHERE NOT EXISTS (SELECT 1 FROM analyses a WHERE a.token_id = t.id AND a.analysis_type = 'OVERALL');

-- LIFECYCLE analyses
INSERT INTO analyses (token_id, analysis_type, version, score, confidence, result, evidence, expires_at)
SELECT t.id, 'LIFECYCLE', 1, lc.confidence, lc.confidence,
  jsonb_build_object('failure_type', lc.failure_type, 'peak_market_cap', lc.peak_market_cap),
  lc.evidence, now() + '24 hours'::interval
FROM tokens t
JOIN token_lifecycles lc ON lc.token_id = t.id
WHERE NOT EXISTS (SELECT 1 FROM analyses a WHERE a.token_id = t.id AND a.analysis_type = 'LIFECYCLE');

-- DEVELOPER_PROFILE analyses
INSERT INTO analyses (token_id, analysis_type, version, score, confidence, result, evidence, expires_at)
SELECT t.id, 'DEVELOPER_PROFILE', 1, 0.5, 0.6,
  jsonb_build_object('developer_name', d.name, 'launch_count', d.launch_count),
  '["Developer aggregation based on observed launches"]'::jsonb,
  now() + '24 hours'::interval
FROM tokens t
LEFT JOIN developers d ON d.primary_wallet_id = t.creator_wallet_id
WHERE d.id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM analyses a WHERE a.token_id = t.id AND a.analysis_type = 'DEVELOPER_PROFILE');

-- META_CLASSIFICATION analyses
INSERT INTO analyses (token_id, analysis_type, version, score, confidence, result, evidence, expires_at)
SELECT t.id, 'META_CLASSIFICATION', 1, 0.8, 0.8,
  (SELECT jsonb_object_agg(m.slug, tm.confidence)
   FROM token_metas tm JOIN metas m ON m.id = tm.meta_id WHERE tm.token_id = t.id),
  '["Rule-based classification from name, symbol, description, metadata"]'::jsonb,
  now() + '24 hours'::interval
FROM tokens t
WHERE NOT EXISTS (SELECT 1 FROM analyses a WHERE a.token_id = t.id AND a.analysis_type = 'META_CLASSIFICATION');
