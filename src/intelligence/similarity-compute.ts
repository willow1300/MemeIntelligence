// Phase 2B — Deterministic token similarity with component scores.
//
// Compares a subject token against historical candidates across symbol /
// name / image / narrative / metadata, produces a weighted overall score
// (0..1) plus the signed time difference and an explicit earliest-match
// winner. Ticker matching alone is never sufficient — components combine.

export interface SimilarityTokenLike {
  address: string;
  symbol?: string | null;
  name?: string | null;
  image_url?: string | null;
  description?: string | null;
  decimals?: number | null;
  created_at?: string | null;
  raw_metadata?: Record<string, unknown> | null;
}

export interface SimilarityComponents {
  name_score: number;
  symbol_score: number;
  image_score: number;
  narrative_score: number;
  metadata_score: number;
  overall_score: number;
}

export interface SimilarityComparison extends SimilarityComponents {
  time_difference_seconds: number | null;
  earlier_address: string | null;
}

/** Minimum overall score for a candidate to count as a similar token. */
export const SIMILARITY_THRESHOLD = 0.45;

const WEIGHTS = { symbol: 0.3, name: 0.25, narrative: 0.2, image: 0.15, metadata: 0.1 };

function normSymbol(s?: string | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function words(s?: string | null): Set<string> {
  return new Set((s ?? '').toLowerCase().split(/[^a-z0-9$]+/).filter((w) => w.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function toDate(v?: string | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function symbolScore(a?: string | null, b?: string | null): number {
  const x = normSymbol(a);
  const y = normSymbol(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.6;
  return 0;
}

function nameScore(a?: string | null, b?: string | null): number {
  const x = (a ?? '').trim().toLowerCase();
  const y = (b ?? '').trim().toLowerCase();
  if (!x || !y) return 0;
  if (x === y) return 1;
  return Math.min(0.95, jaccard(words(x), words(y)));
}

function imageScore(a?: string | null, b?: string | null): number {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x || !y) return 0;
  return x === y ? 1 : 0;
}

const NARRATIVE_KEYWORDS = new Set([
  'dog', 'doge', 'shib', 'puppy', 'inu', 'duck', 'quack', 'cat', 'kitty', 'meow',
  'frog', 'pepe', 'toad', 'ape', 'moon', 'rocket', 'space', 'mars', 'wholesome',
  'friendly', 'love', 'community', 'funny', 'lol', 'meme', 'tragic', 'sad', 'rip',
  'story', 'legend', 'saga', 'viral', 'coin', 'cash', 'gold', 'rich', 'money',
  'bank', 'internet', 'online',
]);

function narrativeTokens(t: SimilarityTokenLike): Set<string> {
  const all = words(`${t.name ?? ''} ${t.symbol ?? ''} ${t.description ?? ''}`);
  const out = new Set<string>();
  for (const w of all) if (NARRATIVE_KEYWORDS.has(w)) out.add(w);
  return out;
}

function narrativeScore(a: SimilarityTokenLike, b: SimilarityTokenLike): number {
  return jaccard(narrativeTokens(a), narrativeTokens(b));
}

function metadataScore(a: SimilarityTokenLike, b: SimilarityTokenLike): number {
  let score = 0;
  if (a.decimals != null && b.decimals != null && a.decimals === b.decimals) score += 0.25;
  const ax = normSymbol(a.symbol);
  const bx = normSymbol(b.symbol);
  if (ax && bx && ax !== bx && (ax.startsWith(bx.slice(0, 3)) || bx.startsWith(ax.slice(0, 3)))) score += 0.2;
  const aMeta = a.raw_metadata && Object.keys(a.raw_metadata).length > 0;
  const bMeta = b.raw_metadata && Object.keys(b.raw_metadata).length > 0;
  if (aMeta && bMeta) score += 0.25;
  const ta = toDate(a.created_at);
  const tb = toDate(b.created_at);
  if (ta != null && tb != null && Math.abs(ta - tb) <= 90 * 86400 * 1000) score += 0.3;
  return Math.min(1, score);
}

export function computeSimilarityComponents(a: SimilarityTokenLike, b: SimilarityTokenLike): SimilarityComponents {
  const symbol = symbolScore(a.symbol, b.symbol);
  const name = nameScore(a.name, b.name);
  const image = imageScore(a.image_url, b.image_url);
  const narrative = narrativeScore(a, b);
  const metadata = metadataScore(a, b);
  const overall =
    WEIGHTS.symbol * symbol + WEIGHTS.name * name + WEIGHTS.narrative * narrative +
    WEIGHTS.image * image + WEIGHTS.metadata * metadata;
  return {
    name_score: r4(name),
    symbol_score: r4(symbol),
    image_score: r4(image),
    narrative_score: r4(narrative),
    metadata_score: r4(metadata),
    overall_score: r4(overall),
  };
}

export function compareTokens(a: SimilarityTokenLike, b: SimilarityTokenLike): SimilarityComparison {
  const comps = computeSimilarityComponents(a, b);
  const ta = toDate(a.created_at);
  const tb = toDate(b.created_at);
  let time_difference_seconds: number | null = null;
  let earlier_address: string | null = null;
  if (ta != null && tb != null && ta !== tb) {
    time_difference_seconds = Math.round(Math.abs(ta - tb) / 1000);
    earlier_address = ta < tb ? a.address : b.address;
  }
  return { ...comps, time_difference_seconds, earlier_address };
}

export function relationshipFor(score: number): 'POSSIBLE_COPY' | 'POSSIBLE_DERIVATIVE' | 'SIMILAR' {
  if (score >= 0.85) return 'POSSIBLE_COPY';
  if (score >= 0.7) return 'POSSIBLE_DERIVATIVE';
  return 'SIMILAR';
}

export function pickEarliestMatch<T extends { created_at?: string | null }>(candidates: T[]): T | null {
  let earliest: T | null = null;
  let earliestT = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const t = toDate(c.created_at);
    if (t != null && t < earliestT) {
      earliestT = t;
      earliest = c;
    }
  }
  return earliest;
}
