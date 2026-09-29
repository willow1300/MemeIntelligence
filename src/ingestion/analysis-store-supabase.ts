// Phase 2B — Supabase AnalysisStore.
//
// Extends SupabaseStore (all IngestionStore methods) and implements the
// analysis read/write surface against PostgreSQL. Every method maps to a
// single, simple query — no business logic lives here.

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
import { SupabaseStore, createSupabaseStore, type SupabaseStoreOptions } from './supabase-store.ts';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export class SupabaseAnalysisStore extends SupabaseStore implements AnalysisStore {
  // ---- token / wallet / launch reads -----------------------------------
  async listTokens(limit?: number): Promise<Token[]> {
    let q = this.client.from('tokens').select('*').order('created_at_db', { ascending: false });
    if (typeof limit === 'number') q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw this.dbError('list tokens', error.message);
    return (data ?? []).map(toToken);
  }

  async listWallets(): Promise<Wallet[]> {
    const { data, error } = await this.client.from('wallets').select('*');
    if (error) throw this.dbError('list wallets', error.message);
    return (data ?? []).map(toWallet);
  }

  async getLaunchByToken(tokenId: string): Promise<Launch | null> {
    const { data, error } = await this.client.from('launches').select('*').eq('token_id', tokenId).maybeSingle();
    if (error) throw this.dbError('get launch', error.message);
    return data ? toLaunch(data) : null;
  }

  async listMarketSnapshots(tokenId: string): Promise<MarketSnapshot[]> {
    const { data, error } = await this.client.from('market_snapshots').select('*').eq('token_id', tokenId);
    if (error) throw this.dbError('list market snapshots', error.message);
    return (data ?? []).map(toMarketSnapshot);
  }

  async listHolderSnapshots(tokenId: string): Promise<HolderSnapshot[]> {
    const { data, error } = await this.client.from('holder_snapshots').select('*').eq('token_id', tokenId);
    if (error) throw this.dbError('list holder snapshots', error.message);
    return (data ?? []).map(toHolderSnapshot);
  }

  async getTokenMetadataByToken(tokenId: string): Promise<TokenMetadata | null> {
    const { data, error } = await this.client.from('token_metadata').select('*').eq('token_id', tokenId).maybeSingle();
    if (error) throw this.dbError('get token metadata', error.message);
    return data ? toTokenMetadata(data) : null;
  }

  async listTransactionsByToken(tokenId: string): Promise<Transaction[]> {
    const { data, error } = await this.client.from('transactions').select('*').eq('token_id', tokenId);
    if (error) throw this.dbError('list token transactions', error.message);
    return (data ?? []).map(toTransaction);
  }

  async listTransactionsByWallet(walletId: string): Promise<Transaction[]> {
    const { data, error } = await this.client.from('transactions').select('*').eq('wallet_id', walletId);
    if (error) throw this.dbError('list wallet transactions', error.message);
    return (data ?? []).map(toTransaction);
  }

  // ---- metas --------------------------------------------------------------
  async listMetas(): Promise<MetaRow[]> {
    const { data, error } = await this.client.from('metas').select('*').order('name');
    if (error) throw this.dbError('list metas', error.message);
    return (data ?? []).map(toMetaRow);
  }

  async upsertMeta(meta: { slug: string; name: string; parentSlug: string | null; description?: string | null }): Promise<MetaRow> {
    const parentId = meta.parentSlug ? await this.resolveMetaId(meta.parentSlug) : null;
    const { data, error } = await this.client
      .from('metas')
      .upsert({ slug: meta.slug, name: meta.name, parent_id: parentId, description: meta.description ?? null }, { onConflict: 'slug' })
      .select('*')
      .single();
    if (error || !data) throw this.dbError('upsert meta', error?.message ?? 'no data');
    return toMetaRow(data);
  }

  async setTokenMetas(tokenId: string, rows: Array<{ slug: string; confidence: number }>): Promise<TokenMetaRow[]> {
    const { error: delErr } = await this.client.from('token_metas').delete().eq('token_id', tokenId);
    if (delErr) throw this.dbError('clear token metas', delErr.message);
    const result: TokenMetaRow[] = [];
    for (const row of rows) {
      const metaId = await this.resolveMetaId(row.slug);
      if (!metaId) continue;
      const { data, error } = await this.client
        .from('token_metas')
        .upsert({ token_id: tokenId, meta_id: metaId, confidence: row.confidence }, { onConflict: 'token_id,meta_id' })
        .select('meta_id, confidence, metas(name,slug)');
      if (error) throw this.dbError('set token meta', error.message);
      if (data && data.length > 0) {
        const r = data[0] as unknown as { meta_id: string; confidence: number; metas: { name: string; slug: string } };
        result.push({ meta_id: r.meta_id, slug: r.metas.slug, name: r.metas.name, confidence: r.confidence });
      }
    }
    return result;
  }

  async listTokenMetas(tokenId: string): Promise<TokenMetaRow[]> {
    const { data, error } = await this.client
      .from('token_metas')
      .select('meta_id, confidence, metas(name,slug)')
      .eq('token_id', tokenId);
    if (error) throw this.dbError('list token metas', error.message);
    return (data ?? []).map((r) => {
      const row = r as unknown as { meta_id: string; confidence: number; metas: { name: string; slug: string } };
      return { meta_id: row.meta_id, slug: row.metas.slug, name: row.metas.name, confidence: row.confidence };
    });
  }

  // ---- similarities ------------------------------------------------------
  async setTokenSimilarities(tokenId: string, rows: SimilarityRow[]): Promise<void> {
    const { error: delErr } = await this.client.from('token_similarities').delete().eq('token_a_id', tokenId);
    if (delErr) throw this.dbError('clear similarities', delErr.message);
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      token_a_id: tokenId,
      token_b_id: r.similar_token_id,
      overall_score: r.overall_score,
      time_difference_seconds: r.time_difference_seconds ?? 0,
      relationship_type: r.relationship_type,
    }));
    const { error } = await this.client.from('token_similarities').upsert(payload, { onConflict: 'token_a_id,token_b_id' });
    if (error) throw this.dbError('set similarities', error.message);
  }

  // ---- analyses -----------------------------------------------------------
  async insertAnalysis(analysis: NewAnalysis): Promise<AnalysisRow> {
    const { data, error } = await this.client
      .from('analyses')
      .insert({
        token_id: analysis.token_id,
        analysis_type: analysis.analysis_type,
        version: analysis.version,
        score: analysis.score ?? null,
        confidence: analysis.confidence,
        result: analysis.result ?? {},
        evidence: analysis.evidence ?? [],
      })
      .select('*')
      .single();
    if (error || !data) throw this.dbError('insert analysis', error?.message ?? 'no data');
    return toAnalysisRow(data);
  }

  async listAnalyses(tokenId: string): Promise<AnalysisRow[]> {
    const { data, error } = await this.client.from('analyses').select('*').eq('token_id', tokenId).order('created_at', { ascending: false });
    if (error) throw this.dbError('list analyses', error.message);
    return (data ?? []).map(toAnalysisRow);
  }

  async latestAnalyses(tokenId: string): Promise<AnalysisRow[]> {
    const { data, error } = await this.client
      .from('analyses')
      .select('*')
      .eq('token_id', tokenId)
      .order('created_at', { ascending: false });
    if (error) throw this.dbError('latest analyses', error.message);
    const seen = new Map<string, AnalysisRow>();
    for (const row of data ?? []) {
      const a = toAnalysisRow(row);
      if (!seen.has(a.analysis_type)) seen.set(a.analysis_type, a);
    }
    return [...seen.values()];
  }

  // ---- developers --------------------------------------------------------
  async ensureDeveloperByName(name: string): Promise<DeveloperRow> {
    const existing = await this.client.from('developers').select('*').eq('name', name).maybeSingle();
    if (existing.data) return toDeveloperRow(existing.data);
    const { data, error } = await this.client.from('developers').insert({ name, launch_count: 0 }).select('*').single();
    if (error || !data) throw this.dbError('ensure developer', error?.message ?? 'no data');
    return toDeveloperRow(data);
  }

  async getDeveloperByWallet(walletId: string): Promise<DeveloperLink | null> {
    const { data, error } = await this.client
      .from('developer_wallets')
      .select('relationship_type, confidence, evidence, developers(*)')
      .eq('wallet_id', walletId)
      .maybeSingle();
    if (error) throw this.dbError('get developer by wallet', error.message);
    if (!data) return null;
    const row = data as unknown as { relationship_type: string; confidence: number; evidence: unknown; developers: Record<string, unknown> };
    return { developer: toDeveloperRow(row.developers), relationship_type: row.relationship_type, confidence: row.confidence, evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [] };
  }

  async getDeveloper(id: string): Promise<DeveloperRow | null> {
    const { data, error } = await this.client.from('developers').select('*').eq('id', id).maybeSingle();
    if (error) throw this.dbError('get developer', error.message);
    return data ? toDeveloperRow(data) : null;
  }

  async upsertDeveloperWallet(developerId: string, walletId: string, relationshipType: string, confidence: number, evidence: string[]): Promise<void> {
    const { error } = await this.client
      .from('developer_wallets')
      .upsert({ developer_id: developerId, wallet_id: walletId, relationship_type: relationshipType, confidence, evidence }, { onConflict: 'developer_id,wallet_id' });
    if (error) throw this.dbError('upsert developer wallet', error.message);
  }

  async setLaunchDeveloper(launchId: string, developerId: string): Promise<void> {
    const { error } = await this.client.from('launches').update({ developer_id: developerId }).eq('id', launchId);
    if (error) throw this.dbError('set launch developer', error.message);
  }

  async listLaunchesByDeveloper(developerId: string): Promise<LaunchWithToken[]> {
    const { data, error } = await this.client.from('launches').select('*, tokens(*)').eq('developer_id', developerId);
    if (error) throw this.dbError('list launches by developer', error.message);
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown> & { tokens: Record<string, unknown> | null };
      return { ...toLaunch(r), token: r.tokens ? toToken(r.tokens) : null };
    });
  }

  private async resolveMetaId(slug: string): Promise<string | null> {
    const { data } = await this.client.from('metas').select('id').eq('slug', slug).maybeSingle();
    return data ? (data.id as string) : null;
  }
}

// ---- row mappers -----------------------------------------------------------

function toToken(r: Record<string, unknown>): Token {
  return {
    id: r.id as string,
    chain_id: r.chain_id as string,
    platform_id: (r.platform_id as string) ?? null,
    address: r.address as string,
    name: r.name as string,
    symbol: r.symbol as string,
    decimals: num(r.decimals),
    creator_wallet_id: (r.creator_wallet_id as string) ?? null,
    created_at: (r.created_at as string) ?? null,
    first_seen_at: (r.first_seen_at as string) ?? null,
    image_url: (r.image_url as string) ?? null,
    website_url: (r.website_url as string) ?? null,
    status: (r.status as Token['status']) ?? 'UNKNOWN',
    created_at_db: (r.created_at_db as string) ?? '',
    updated_at: (r.updated_at as string) ?? '',
    raw_data: (r.raw_data as Record<string, unknown>) ?? {},
  };
}

function toWallet(r: Record<string, unknown>): Wallet {
  return {
    id: r.id as string,
    chain_id: r.chain_id as string,
    address: r.address as string,
    first_seen_at: (r.first_seen_at as string) ?? null,
    last_seen_at: (r.last_seen_at as string) ?? null,
    transaction_count: num(r.transaction_count),
    wallet_type: (r.wallet_type as Wallet['wallet_type']) ?? 'UNKNOWN',
    created_at: (r.created_at as string) ?? '',
    updated_at: (r.updated_at as string) ?? '',
    raw_data: (r.raw_data as Record<string, unknown>) ?? {},
  };
}

function toLaunch(r: Record<string, unknown>): Launch {
  return {
    id: r.id as string,
    token_id: r.token_id as string,
    developer_id: (r.developer_id as string) ?? null,
    platform_id: (r.platform_id as string) ?? null,
    launch_time: r.launch_time as string,
    initial_liquidity: num(r.initial_liquidity),
    initial_market_cap: num(r.initial_market_cap),
    launch_transaction: (r.launch_transaction as string) ?? null,
    status: (r.status as string) ?? 'COMPLETED',
    created_at: (r.created_at as string) ?? '',
    raw_data: (r.raw_data as Record<string, unknown>) ?? {},
  };
}

function toMarketSnapshot(r: Record<string, unknown>): MarketSnapshot {
  return {
    id: r.id as string,
    token_id: r.token_id as string,
    timestamp: r.timestamp as string,
    price: num(r.price),
    market_cap: num(r.market_cap),
    volume: num(r.volume),
    liquidity: num(r.liquidity),
    buys: num(r.buys),
    sells: num(r.sells),
    transaction_count: num(r.transaction_count),
    holder_count: num(r.holder_count),
    raw_data: (r.raw_data as Record<string, unknown>) ?? {},
  };
}

function toHolderSnapshot(r: Record<string, unknown>): HolderSnapshot {
  return {
    id: r.id as string,
    token_id: r.token_id as string,
    timestamp: r.timestamp as string,
    holder_count: num(r.holder_count),
    top_10_percentage: num(r.top_10_percentage),
    top_20_percentage: num(r.top_20_percentage),
    developer_percentage: num(r.developer_percentage),
  };
}

function toTokenMetadata(r: Record<string, unknown>): TokenMetadata {
  return {
    id: r.id as string,
    token_id: r.token_id as string,
    description: (r.description as string) ?? null,
    image_url: (r.image_url as string) ?? null,
    website_url: (r.website_url as string) ?? null,
    twitter_url: (r.twitter_url as string) ?? null,
    telegram_url: (r.telegram_url as string) ?? null,
    discord_url: (r.discord_url as string) ?? null,
    metadata_uri: (r.metadata_uri as string) ?? null,
    raw_metadata: (r.raw_metadata as Record<string, unknown>) ?? {},
    fetched_at: (r.fetched_at as string) ?? new Date().toISOString(),
  };
}

function toTransaction(r: Record<string, unknown>): Transaction {
  return {
    id: r.id as string,
    chain_id: r.chain_id as string,
    tx_hash: r.tx_hash as string,
    block_number: (r.block_number as number) ?? null,
    timestamp: r.timestamp as string,
    wallet_id: (r.wallet_id as string) ?? null,
    token_id: (r.token_id as string) ?? null,
    event_type: (r.event_type as Transaction['event_type']) ?? 'OTHER',
    token_amount: num(r.token_amount),
    native_amount: num(r.native_amount),
    usd_value: num(r.usd_value),
    direction: (r.direction as Transaction['direction']) ?? null,
    raw_data: (r.raw_data as Record<string, unknown>) ?? {},
    created_at: (r.created_at as string) ?? '',
  };
}

function toMetaRow(r: Record<string, unknown>): MetaRow {
  return {
    id: r.id as string,
    parent_id: (r.parent_id as string) ?? null,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string) ?? null,
  };
}

function toAnalysisRow(r: Record<string, unknown>): AnalysisRow {
  return {
    id: r.id as string,
    token_id: r.token_id as string,
    analysis_type: r.analysis_type as string,
    version: r.version as string,
    score: (r.score as number) ?? null,
    confidence: num(r.confidence),
    result: (r.result as Record<string, unknown>) ?? {},
    evidence: Array.isArray(r.evidence) ? (r.evidence as string[]) : [],
    created_at: (r.created_at as string) ?? new Date().toISOString(),
  };
}

function toDeveloperRow(r: Record<string, unknown>): DeveloperRow {
  return {
    id: r.id as string,
    name: r.name as string,
    primary_wallet_id: (r.primary_wallet_id as string) ?? null,
  };
}

export function createSupabaseAnalysisStore(options?: SupabaseStoreOptions): SupabaseAnalysisStore {
  const base = createSupabaseStore(options);
  // Re-wrap: SupabaseAnalysisStore needs the same client instance.
  const wrapped = Object.create(SupabaseAnalysisStore.prototype) as SupabaseAnalysisStore;
  Object.assign(wrapped, base);
  return wrapped;
}
