// Phase 2B — Rule-based meta (meme category) classification.
//
// Deterministic keyword/lexicon matching against the MIE meta taxonomy
// (hierarchical: Animal/Narrative/Culture roots -> leaf metas). Produces
// MULTIPLE classifications with confidence + evidence (Phase 2B spec §5).
// Pure functions over normalized MIE data — no ML, no network, no I/O.

export interface MetaMatch {
  slug: string;
  name: string;
  parentSlug: string | null;
  confidence: number;
  evidence: string[];
}

export interface MetaClassificationInput {
  name?: string | null;
  symbol?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  rawMetadata?: Record<string, unknown> | null;
}

export interface MetaClassification {
  /** All matches (leaf + root), sorted by confidence descending. */
  matches: MetaMatch[];
  /** Highest-confidence leaf match, if any. */
  primary: MetaMatch | null;
  /** Human-readable evidence summary lines. */
  evidence: string[];
}

interface LeafRule {
  slug: string;
  name: string;
  parentSlug: string;
  parentName: string;
  keywords: string[];
  base: number;
}

const LEAVES: LeafRule[] = [
  // Animal
  { slug: 'dog', name: 'Dog', parentSlug: 'animal', parentName: 'Animal', keywords: ['dog', 'doge', 'doggy', 'puppy', 'shiba', 'inu', 'husky', 'woof'], base: 0.93 },
  { slug: 'duck', name: 'Duck', parentSlug: 'animal', parentName: 'Animal', keywords: ['duck', 'ducky', 'quack', 'waddle', 'waddles'], base: 0.94 },
  { slug: 'cat', name: 'Cat', parentSlug: 'animal', parentName: 'Animal', keywords: ['cat', 'kitty', 'kitten', 'meow', 'nyan', 'purr'], base: 0.93 },
  { slug: 'frog', name: 'Frog', parentSlug: 'animal', parentName: 'Animal', keywords: ['frog', 'froge', 'pepe', 'toad', 'ribbit'], base: 0.94 },
  // Narrative
  { slug: 'wholesome', name: 'Wholesome', parentSlug: 'narrative', parentName: 'Narrative', keywords: ['wholesome', 'love', 'friend', 'friends', 'cute', 'adorable', 'hello', 'hi'], base: 0.85 },
  { slug: 'funny', name: 'Funny', parentSlug: 'narrative', parentName: 'Narrative', keywords: ['funny', 'meme', 'lol', 'lmao', 'joke', 'humor', 'fun'], base: 0.84 },
  { slug: 'tragic', name: 'Tragic', parentSlug: 'narrative', parentName: 'Narrative', keywords: ['tragic', 'sad', 'rip', 'lost', 'pain', 'tears', 'gone'], base: 0.83 },
  { slug: 'viral_story', name: 'Viral Story', parentSlug: 'narrative', parentName: 'Narrative', keywords: ['story', 'viral', 'lore', 'legend', 'tale', 'saga'], base: 0.82 },
  // Culture
  { slug: 'internet', name: 'Internet', parentSlug: 'culture', parentName: 'Culture', keywords: ['internet', 'online', 'web', 'pixel', 'cyber', 'coin'], base: 0.8 },
  { slug: 'community', name: 'Community', parentSlug: 'culture', parentName: 'Culture', keywords: ['community', 'army', 'gang', 'squad', 'club', 'crew'], base: 0.8 },
];

/** Collapse leetspeak + casing so "L0ui3" still matches "louie"-style lexicons. */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1|]/g, 'l')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't');
}

function fieldHits(field: string | null | undefined, keywords: string[]): string[] {
  if (!field) return [];
  const folded = foldText(String(field));
  return keywords.filter((kw) => new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`).test(folded));
}

/**
 * Classify a token into hierarchical metas using deterministic rules.
 * Confidence: leaf base boosted by field strength (symbol > name > description),
 * capped at 0.99. Root meta (e.g. Animal) inherits leaf confidence + 0.01.
 */
export function classifyTokenMeta(input: MetaClassificationInput): MetaClassification {
  const fields: Array<{ field: 'symbol' | 'name' | 'description'; value: string | null | undefined; boost: number }> = [
    { field: 'symbol', value: input.symbol, boost: 0.05 },
    { field: 'name', value: input.name, boost: 0.04 },
    { field: 'description', value: input.description, boost: 0.02 },
  ];

  const matches: MetaMatch[] = [];
  for (const leaf of LEAVES) {
    const hits: Array<{ keyword: string; field: string }> = [];
    let confidence = leaf.base;
    let matched = false;
    for (const f of fields) {
      const kws = fieldHits(f.value, leaf.keywords);
      if (kws.length > 0) {
        matched = true;
        confidence += f.boost;
        for (const keyword of kws) hits.push({ keyword, field: f.field });
      }
    }
    if (!matched) continue;
    confidence = Math.min(0.99, Number(confidence.toFixed(2)));
    matches.push({
      slug: leaf.slug,
      name: leaf.name,
      parentSlug: null,
      confidence: Math.min(0.99, Number((confidence + 0.01).toFixed(2))),
      evidence: hits.map((h) => `"${h.keyword}" matched in ${h.field}`),
    });
    matches.push({
      slug: leaf.slug,
      name: leaf.name,
      parentSlug: leaf.parentSlug,
      confidence,
      evidence: hits.map((h) => `"${h.keyword}" matched in ${h.field}`),
    });
  }

  matches.sort((a, b) => b.confidence - a.confidence);

  // De-duplicate root entries if two leaves share a parent (keep the max).
  const seenRoots = new Set<string>();
  const deduped = matches.filter((m) => {
    if (m.parentSlug === null) return true;
    if (seenRoots.has(m.parentSlug)) return false;
    seenRoots.add(m.parentSlug);
    return true;
  });

  const primary = deduped.find((m) => m.parentSlug !== null) ?? null;
  const evidence = deduped
    .filter((m) => m.parentSlug !== null)
    .map((m) => `Meta "${m.name}" (confidence ${m.confidence.toFixed(2)}) — ${m.evidence[0] ?? 'lexicon match'}`);
  if (primary) evidence.unshift(`Primary meta: ${primary.name} under ${LEAVES.find((l) => l.slug === primary.slug)?.parentName ?? 'root'}`);

  return { matches: deduped, primary, evidence };
}
