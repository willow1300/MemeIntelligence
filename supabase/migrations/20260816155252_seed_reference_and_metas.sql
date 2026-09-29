/*
# Seed: chains, platforms, meta taxonomy

Inserts foundational reference data:
1. One chain (Solana) via the chain abstraction.
2. Four launch platforms (launchpads + DEXs).
3. Hierarchical meme/meta taxonomy under three roots: Animal, Narrative, Culture.

All inserts are idempotent via ON CONFLICT on natural keys.
*/

INSERT INTO chains (name, chain_id, native_symbol)
VALUES ('Solana', 'solana-mainnet', 'SOL')
ON CONFLICT (chain_id) DO NOTHING;

INSERT INTO platforms (chain_id, name, slug, url)
SELECT c.id, v.name, v.slug, v.url
FROM chains c
CROSS JOIN (VALUES
  ('PumpLaunch', 'pumplaunch', 'https://example-pumplaunch.test'),
  ('MoonPad', 'moonpad', 'https://example-moonpad.test'),
  ('RaySwap', 'rayswap', 'https://example-rayswap.test'),
  ('BondingWorks', 'bondingworks', 'https://example-bondingworks.test')
) AS v(name, slug, url)
WHERE c.chain_id = 'solana-mainnet'
ON CONFLICT (slug) DO NOTHING;

-- Root metas
INSERT INTO metas (name, slug, type, description) VALUES
  ('Animal', 'animal', 'CATEGORY', 'Animal-themed meme tokens'),
  ('Narrative', 'narrative', 'CATEGORY', 'Storytelling / emotional narrative themes'),
  ('Culture', 'culture', 'CATEGORY', 'Internet, celebrity and community culture')
ON CONFLICT (slug) DO NOTHING;

-- Child metas
INSERT INTO metas (parent_id, name, slug, type, description)
SELECT p.id, v.name, v.slug, v.type, v.description
FROM metas p
JOIN (VALUES
  ('animal', 'Dog', 'dog', 'ANIMAL', 'Dog / doge derivatives'),
  ('animal', 'Duck', 'duck', 'ANIMAL', 'Duck-themed tokens'),
  ('animal', 'Cat', 'cat', 'ANIMAL', 'Cat-themed tokens'),
  ('animal', 'Frog', 'frog', 'ANIMAL', 'Frog / pepe adjacent tokens'),
  ('narrative', 'Wholesome', 'wholesome', 'NARRATIVE', 'Feel-good wholesome stories'),
  ('narrative', 'Tragic', 'tragic', 'NARRATIVE', 'Tragic / emotional stories'),
  ('narrative', 'Funny', 'funny', 'NARRATIVE', 'Comedy / joke driven'),
  ('narrative', 'Viral Story', 'viral-story', 'NARRATIVE', 'Tied to a viral event or story'),
  ('culture', 'Internet', 'internet', 'CULTURE', 'Internet culture / memes'),
  ('culture', 'Celebrity', 'celebrity', 'CULTURE', 'Celebrity driven'),
  ('culture', 'Community', 'community', 'CULTURE', 'Community driven movements')
) AS v(parent_slug, name, slug, type, description)
  ON p.slug = v.parent_slug
ON CONFLICT (slug) DO NOTHING;
