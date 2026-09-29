import textwrap

def w(path, text):
    with open(path, 'w') as f:
        f.write(text)
    print('wrote', path, len(text), 'bytes')

PART1 = textwrap.dedent("""
// Phase 2B - In-memory AnalysisStore (tests + offline demo).
//
// Extends MemoryStore (which already implements every IngestionStore method)
// and adds the analysis-specific read/write surface the analysis runner and
// REST API need. Mirrors the Supabase implementation's upsert semantics with
// inspectable maps so intelligence behavior is IDENTICAL in both modes.

import type {
  AnalysisStore,
  AnalysisRow,
  DeveloperLink,
  DeveloperRow,
  LaunchWithToken,
  MetaRow,
  NewAnalysis,
  SimilarityRow,
  TokenMetaRow,
} from './analysis-store.ts';
import type {
  HolderSnapshot,
  Launch,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';
import { MemoryStore } from './memory-store.ts';

export class MemoryAnalysisStore extends MemoryStore implements AnalysisStore {
  readonly metas = new Map<string, MetaRow>();
  private readonly tokenMetas = new Map<string, TokenMetaRow & { tokenId: string }>();
  private readonly similarities = new Map<string, SimilarityRow & { sourceTokenId: string }>();
  private readonly analyses = new Map<string, AnalysisRow>();
  private readonly developers = new Map<string, DeveloperRow>();
  private readonly developersById = new Map<string, DeveloperRow>();
  private readonly developerWallets = new Map<string, { developer_id: string; wallet_id: string; relationship_type: string; confidence: number; evidence: string[] }>();
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async listTokens(limit?: number): Promise<Token[]> {
    const all = [...this.tokens.values()];
    return typeof limit === 'number' ? all.slice(0, limit) : all;
  }

  async listWallets(): Promise<Wallet[]> {
    return [...this.wallets.values()];
  }

  async getLaunchByToken(tokenId: string): Promise<Launch | null> {
    for (const launch of this.launches.values()) {
      if (launch.token_id === tokenId) return launch;
    }
    return null;
  }

  async listMarketSnapshots(tokenId: string): Promise<MarketSnapshot[]> {
    return [...this.marketSnapshots.values()].filter((s) => s.token_id === tokenId);
  }

  async listHolderSnapshots(tokenId: string): Promise<HolderSnapshot[]> {
    return [...this.holderSnapshots.values()].filter((h) => h.token_id === tokenId);
  }

  async getTokenMetadataByToken(tokenId: string): Promise<TokenMetadata | null> {
    return this.metadata.get(tokenId) ?? null;
  }

  async listTransactionsByToken(tokenId: string): Promise<Transaction[]> {
    return [...this.transactions.values()].filter((t) => t.token_id === tokenId);
  }

  async listTransactionsByWallet(walletId: string): Promise<Transaction[]> {
    return [...this.transactions.values()].filter((t) => t.wallet_id === walletId);
  }
""")

PART2 = textwrap.dedent("""
  async setTokenMetas(tokenId: string, rows: Array<{ slug: string; confidence: number }>): Promise<TokenMetaRow[]> {
    for (const [key, val] of this.tokenMetas) {
      if (val.tokenId === tokenId) this.tokenMetas.delete(key);
    }
    const result: TokenMetaRow[] = [];
    for (const row of rows) {
      const meta = this.metas.get(row.slug);
      if (!meta) continue;
      const entry: TokenMetaRow = { meta_id: meta.id, slug: row.slug, name: meta.name, confidence: row.confidence };
      this.tokenMetas.set(`${tokenId}:${meta.id}`, { ...entry, tokenId });
      result.push(entry);
    }
    return result;
  }

  async listTokenMetas(tokenId: string): Promise<TokenMetaRow[]> {
    return [...this.tokenMetas.values()].filter((t) => t.tokenId === tokenId);
  }

  async setTokenSimilarities(tokenId: string, rows: SimilarityRow[]): Promise<void> {
    for (const [key, val] of this.similarities) {
      if (val.sourceTokenId === tokenId) this.similarities.delete(key);
    }
    for (const row of rows) {
      this.similarities.set(`${tokenId}:${row.similar_token_id}`, { ...row, sourceTokenId: tokenId });
    }
  }

  async insertAnalysis(analysis: NewAnalysis): Promise<AnalysisRow> {
    const id = this.nextId('analysis');
    const row: AnalysisRow = {
      id,
      token_id: analysis.token_id,
      analysis_type: analysis.analysis_type,
      version: analysis.version,
      score: analysis.score ?? null,
      confidence: analysis.confidence,
      result: analysis.result,
      evidence: analysis.evidence,
      created_at: new Date().toISOString(),
    };
    this.analyses.set(`${analysis.token_id}:${analysis.analysis_type}`, row);
    return row;
  }

  async listAnalyses(tokenId: string): Promise<AnalysisRow[]> {
    return [...this.analyses.values()].filter((a) => a.token_id === tokenId);
  }

  async latestAnalyses(tokenId: string): Promise<AnalysisRow[]> {
    const latest = new Map<string, AnalysisRow>();
    for (const a of this.analyses.values()) {
      if (a.token_id !== tokenId) continue;
      const existing = latest.get(a.analysis_type);
      if (!existing || a.created_at > existing.created_at) {
        latest.set(a.analysis_type, a);
      }
    }
    return [...latest.values()];
  }

  async ensureDeveloperByName(name: string): Promise<DeveloperRow> {
    const existing = this.developers.get(name);
    if (existing) return existing;
    const row: DeveloperRow = { id: this.nextId('developer'), name, primary_wallet_id: null };
    this.developers.set(name, row);
    this.developersById.set(row.id, row);
    return row;
  }

  async getDeveloperByWallet(walletId: string): Promise<DeveloperLink | null> {
    for (const link of this.developerWallets.values()) {
      if (link.wallet_id === walletId) {
        const developer = this.developersById.get(link.developer_id);
        if (!developer) continue;
        return { developer, relationship_type: link.relationship_type, confidence: link.confidence, evidence: link.evidence };
      }
    }
    return null;
  }

  async getDeveloper(id: string): Promise<DeveloperRow | null> {
    return this.developersById.get(id) ?? null;
  }

  async upsertDeveloperWallet(developerId: string, walletId: string, relationshipType: string, confidence: number, evidence: string[]): Promise<void> {
    this.developerWallets.set(`${developerId}:${walletId}`, { developer_id: developerId, wallet_id: walletId, relationship_type: relationshipType, confidence, evidence });
  }

  async setLaunchDeveloper(launchId: string, developerId: string): Promise<void> {
    for (const launch of this.launches.values()) {
      if (launch.id === launchId) { launch.developer_id = developerId; return; }
    }
  }

  async listLaunchesByDeveloper(developerId: string): Promise<LaunchWithToken[]> {
    const result: LaunchWithToken[] = [];
    for (const launch of this.launches.values()) {
      if (launch.developer_id !== developerId) continue;
      const token = [...this.tokens.values()].find((t) => t.id === launch.token_id) ?? null;
      result.push({ ...launch, token });
    }
    return result;
  }

  async listMetas(): Promise<MetaRow[]> {
    return [...this.metas.values()];
  }

  async upsertMeta(meta: { slug: string; name: string; parentSlug: string | null; description?: string | null }): Promise<MetaRow> {
    const existing = this.metas.get(meta.slug);
    if (existing) {
      const updated: MetaRow = { ...existing, name: meta.name, parent_id: meta.parentSlug, description: meta.description ?? null };
      this.metas.set(meta.slug, updated);
      return updated;
    }
    const row: MetaRow = { id: this.nextId('meta'), slug: meta.slug, name: meta.name, parent_id: meta.parentSlug, description: meta.description ?? null };
    this.metas.set(meta.slug, row);
    return row;
  }
}

export function createMemoryAnalysisStore(): MemoryAnalysisStore {
  return new MemoryAnalysisStore();
}
""").lstrip()

w('/Users/user/Downloads/MemeIntelligence/src/ingestion/analysis-store-memory.ts', PART1 + PART2)
