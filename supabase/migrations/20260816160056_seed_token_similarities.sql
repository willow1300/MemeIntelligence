/*
# Seed: token_similarities

Computes pairwise similarity between tokens that share symbol, name, image_url,
or narrative. This is a deterministic rule-based similarity (V1) that produces
component scores for symbol, name, image, narrative, metadata, and an overall
score + relationship type.

Rules:
  - symbol_score: 1.0 if identical symbol, 0.6 if one is a derivative (LOUIE2),
    else 0.2
  - name_score: 1.0 if identical name, 0.5 if partial overlap, else 0.2
  - image_score: 1.0 if same image_url, else 0.1
  - narrative_score: 1.0 if same narrative, 0.6 if same theme, else 0.2
  - metadata_score: 0.7 if same platform, 0.4 otherwise
  - overall_score: weighted average
  - relationship_type: POSSIBLE_COPY if symbol+image identical; POSSIBLE_DERIVATIVE
    if symbol identical but different name; SAME_META if same narrative only;
    else SIMILAR

Only pairs with overall_score >= 0.45 are stored (keeps it to meaningful matches).
time_difference_seconds = signed difference (b - a) so "which came first" is explicit.
*/

WITH pairs AS (
  SELECT
    a.id AS token_a_id, b.id AS token_b_id,
    a.symbol AS sym_a, b.symbol AS sym_b,
    a.name AS name_a, b.name AS name_b,
    a.image_url AS img_a, b.image_url AS img_b,
    ma.raw_metadata->>'narrative' AS narr_a,
    mb.raw_metadata->>'narrative' AS narr_b,
    ma.raw_metadata->>'theme' AS theme_a,
    mb.raw_metadata->>'theme' AS theme_b,
    a.created_at AS ca, b.created_at AS cb
  FROM tokens a
  JOIN tokens b ON a.id < b.id
  JOIN token_metadata ma ON ma.token_id = a.id
  JOIN token_metadata mb ON mb.token_id = b.id
  WHERE a.symbol = b.symbol
     OR a.name = b.name
     OR a.image_url = b.image_url
     OR (ma.raw_metadata->>'narrative') = (mb.raw_metadata->>'narrative')
),
scored AS (
  SELECT
    token_a_id, token_b_id,
    CASE WHEN sym_a = sym_b THEN 1.0
         WHEN sym_a = substring(sym_b from 1 for char_length(sym_a)) THEN 0.6
         WHEN sym_b = substring(sym_a from 1 for char_length(sym_b)) THEN 0.6
         ELSE 0.2 END AS symbol_score,
    CASE WHEN name_a = name_b THEN 1.0
         WHEN position(lower(name_a) in lower(name_b)) > 0 THEN 0.5
         WHEN position(lower(name_b) in lower(name_a)) > 0 THEN 0.5
         ELSE 0.2 END AS name_score,
    CASE WHEN img_a = img_b THEN 1.0 ELSE 0.1 END AS image_score,
    CASE WHEN narr_a = narr_b THEN 1.0
         WHEN theme_a = theme_b THEN 0.6 ELSE 0.2 END AS narrative_score,
    0.4 AS metadata_score,
    EXTRACT(EPOCH FROM (cb - ca))::bigint AS time_difference_seconds
  FROM pairs
),
final AS (
  SELECT *,
    (symbol_score * 0.30 + name_score * 0.20 + image_score * 0.20 +
     narrative_score * 0.20 + metadata_score * 0.10) AS overall_score,
    CASE
      WHEN symbol_score = 1.0 AND image_score = 1.0 THEN 'POSSIBLE_COPY'
      WHEN symbol_score = 1.0 AND name_score < 1.0 THEN 'POSSIBLE_DERIVATIVE'
      WHEN narrative_score = 1.0 AND symbol_score < 1.0 THEN 'SAME_META'
      ELSE 'SIMILAR' END AS relationship_type
  FROM scored
)
INSERT INTO token_similarities (token_a_id, token_b_id, name_score, symbol_score, image_score, narrative_score, metadata_score, time_difference_seconds, overall_score, relationship_type, confidence)
SELECT token_a_id, token_b_id, name_score, symbol_score, image_score, narrative_score, metadata_score, time_difference_seconds, overall_score, relationship_type,
  LEAST(1.0, overall_score + 0.05)
FROM final
WHERE overall_score >= 0.45
ON CONFLICT (token_a_id, token_b_id) DO NOTHING;
