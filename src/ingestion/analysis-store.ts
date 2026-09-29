// Phase 2B — Analysis store contract.
//
// Extends IngestionStore with the read/write surface the analysis runner and
// REST API need. Implemented by both SupabaseStore (real data) and MemoryStore
// (tests / offline demo) so intelligence behavior is IDENTICAL in both modes
// (Phase 2B spec §13 — no duplicated logic between modes).

import type { IngestionStore } from './store.ts';
import type {
  HolderSnapshot,
  Launch,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';

export interface MetaRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
}

export interface TokenMetaRow {
  meta_id: string;
  slug: string;
  name: string;
  confidence: number;
}

export interface SimilarityRow {
  similar_token_id: string;
  relationship_type: string;
  overall_score: number;
  time_difference_seconds: number | null;
}

export interface AnalysisRow {
  id: string;
  token_id: string;
  analysis_type: string;
  version: string;
  score: number | null;
  confidence: number;
  result: Record<string, unknown>;
  evidence: string[];
  created_at: string;
}

export interface NewAnalysis {
  token_id: string;
  analysis_type: string;
  version: string;
  score?: number | null;
  confidence: number;
  result: Record<string, unknown>;
  evidence: string[];
}

export interface DeveloperRow {
  id: string;
  name: string;
  primary_wallet_id: string | null;
}

export interface DeveloperLink {
  developer: DeveloperRow;
  relationship_type: string;
  confidence: number;
  evidence: string[];
}

export interface LaunchWithToken extends Launch {
  token: Token | null;
}

export interface AnalysisStore extends IngestionStore {
  // ---- reads ---------------------------------------------------------------
  listTokens(limit?: number): Promise<Token[]>;
  listWallets(): Promise<Wallet[]>;
  getLaunchByToken(tokenId: string): Promise<Launch | null>;
  listMarketSnapshots(tokenId: string): Promise<MarketSnapshot[]>;
  listHolderSnapshots(tokenId: string): Promise<HolderSnapshot[]>;
  getTokenMetadataByToken(tokenId: string): Promise<TokenMetadata | null>;
  listTransactionsByToken(tokenId: string): Promise<Transaction[]>;
  listTransactionsByWallet(walletId: string): Promise<Transaction[]>;

  // ---- metas ----------------------------------------------------------------
  listMetas(): Promise<MetaRow[]>;
  upsertMeta(meta: { slug: string; name: string; parentSlug: string | null; description?: string | null }): Promise<MetaRow>;
  /** Replace-all for the token (idempotent re-analysis). Resolves slugs -> ids. */
  setTokenMetas(tokenId: string, rows: Array<{ slug: string; confidence: number }>): Promise<TokenMetaRow[]>;
  listTokenMetas(tokenId: string): Promise<TokenMetaRow[]>;

  // ---- similarities ----------------------------------------------------------
  /** Replace-all for the token (idempotent re-analysis). */
  setTokenSimilarities(tokenId: string, rows: SimilarityRow[]): Promise<void>;

  // ---- analyses ---------------------------------------------------------------
  insertAnalysis(analysis: NewAnalysis): Promise<AnalysisRow>;
  listAnalyses(tokenId: string): Promise<AnalysisRow[]>;
  /** Latest row per analysis_type for the token. */
  latestAnalyses(tokenId: string): Promise<AnalysisRow[]>;

  // ---- developers ---------------------------------------------------------------
  ensureDeveloperByName(name: string): Promise<DeveloperRow>;
  getDeveloperByWallet(walletId: string): Promise<DeveloperLink | null>;
  getDeveloper(id: string): Promise<DeveloperRow | null>;
  upsertDeveloperWallet(developerId: string, walletId: string, relationshipType: string, confidence: number, evidence: string[]): Promise<void>;
  setLaunchDeveloper(launchId: string, developerId: string): Promise<void>;
  listLaunchesByDeveloper(developerId: string): Promise<LaunchWithToken[]>;
}
