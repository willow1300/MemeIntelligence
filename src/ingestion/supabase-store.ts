// Phase 2A — Supabase (PostgreSQL) ingestion store.
//
// Implements IngestionStore against the live backend via PostgREST.
// Uses process.env (NOT import.meta.env) so it runs under tsx in plain Node,
// and prefers SUPABASE_SERVICE_ROLE_KEY when present (falls back to anon for
// the intentionally open research DB).
//
// Idempotency strategy:
//   - tables with natural unique keys use `upsert(..., { onConflict })`
//   - transactions use app-level dedup (tx_hash) + a partial unique index as
//     a race-condition backstop.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  HolderSnapshot,
  Launch,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';
import type { ChainInfo, Checkpoint, IngestionStore, LaunchOutcome, TokenOutcome, WalletOutcome } from './store.ts';
import { IngestionError } from '../providers/errors.ts';

export interface SupabaseStoreOptions {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string | null;
  client?: SupabaseClient;
}

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : fallback;
}

export function createSupabaseStore(options?: SupabaseStoreOptions): SupabaseStore {
  // NOTE: use || (not ??) — env() returns '' for unset vars, which must fall through.
  const url = options?.url || env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceRole = options?.serviceRoleKey ?? (env('SUPABASE_SERVICE_ROLE_KEY') || null);
  const anonKey = options?.anonKey || env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY');
  const key = serviceRole || anonKey;

  if (!url || !key) {
    throw new IngestionError({
      kind: 'INVALID_ARGUMENT',
      message: 'Missing Supabase config: set SUPABASE_URL (+ SUPABASE_SERVICE_ROLE_KEY or anon key) in .env',
      tokenAddress: '',
    });
  }

  const client = options?.client ?? createClient(url, key, { auth: { persistSession: false } });
  return new SupabaseStore(client);
}

export class SupabaseStore implements IngestionStore {
  private chainCache = new Map<string, ChainInfo>();

  constructor(protected readonly client: SupabaseClient) {}

  // ---- chain / platform ------------------------------------------------
  async ensureChain(chainId: string, nativeSymbol: string): Promise<ChainInfo> {
    const cached = this.chainCache.get(chainId);
    if (cached) return cached;

    const { data, error } = await this.client
      .from('chains')
      .select('id, native_symbol')
      .eq('chain_id', chainId)
      .maybeSingle();
    if (!error && data) {
      const info: ChainInfo = { id: data.id, chainId, nativeSymbol: data.native_symbol };
      this.chainCache.set(chainId, info);
      return info;
    }

    const { data: inserted, error: insErr } = await this.client
      .from('chains')
      .insert({ name: chainId, chain_id: chainId, native_symbol: nativeSymbol })
      .select('id, native_symbol')
      .single();
    if (insErr || !inserted) {
      throw this.dbError('insert chain', insErr?.message ?? 'unknown');
    }
    const info: ChainInfo = { id: inserted.id, chainId, nativeSymbol: inserted.native_symbol };
    this.chainCache.set(chainId, info);
    return info;
  }

  async ensurePlatform(chainId: string, slug: string, name: string, url?: string | null): Promise<string | null> {
    const { data, error } = await this.client.from('platforms').select('id').eq('slug', slug).maybeSingle();
    if (!error && data) return data.id as string;

    const { data: inserted, error: insErr } = await this.client
      .from('platforms')
      .insert({ chain_id: chainId, slug, name, url: url ?? null })
      .select('id')
      .single();
    if (insErr) return null; // platform is optional; don't fail ingestion for it
    return inserted.id as string;
  }

  // ---- tokens ----------------------------------------------------------
  async getTokenByAddress(chainId: string, address: string): Promise<Token | null> {
    const { data, error } = await this.client
      .from('tokens')
      .select('*')
      .eq('chain_id', chainId)
      .eq('address', address)
      .maybeSingle();
    if (error || !data) return null;
    return data as Token;
  }

  async upsertToken(token: Token): Promise<TokenOutcome> {
    const created = (await this.getTokenByAddress(token.chain_id, token.address)) === null;
    const { error } = await this.client
      .from('tokens')
      .upsert(clean(token), { onConflict: 'chain_id,address' });
    if (error) throw this.dbError('upsert token', error.message);

    const row = await this.getTokenByAddress(token.chain_id, token.address);
    if (!row) throw this.dbError('readback token', 'row vanished after upsert');
    return { id: row.id, created };
  }

  // ---- wallets ----------------------------------------------------------
  async getWalletByAddress(chainId: string, address: string): Promise<Wallet | null> {
    const { data, error } = await this.client
      .from('wallets')
      .select('*')
      .eq('chain_id', chainId)
      .eq('address', address)
      .maybeSingle();
    if (error || !data) return null;
    return data as Wallet;
  }

  async upsertWallet(wallet: Wallet): Promise<WalletOutcome> {
    const created = (await this.getWalletByAddress(wallet.chain_id, wallet.address)) === null;
    const { error } = await this.client
      .from('wallets')
      .upsert(clean(wallet), { onConflict: 'chain_id,address' });
    if (error) throw this.dbError('upsert wallet', error.message);

    const row = await this.getWalletByAddress(wallet.chain_id, wallet.address);
    if (!row) throw this.dbError('readback wallet', 'row vanished after upsert');
    return { id: row.id, created };
  }

  // ---- launches ----------------------------------------------------------
  async upsertLaunch(launch: Launch): Promise<LaunchOutcome> {
    const { data: existing } = await this.client.from('launches').select('id').eq('token_id', launch.token_id).maybeSingle();
    const created = !existing;
    const { error } = await this.client
      .from('launches')
      .upsert(clean(launch), { onConflict: 'token_id' });
    if (error) throw this.dbError('upsert launch', error.message);
    const { data: row } = await this.client.from('launches').select('id').eq('token_id', launch.token_id).maybeSingle();
    return { id: row?.id ?? '', created };
  }

  // ---- metadata ----------------------------------------------------------
  async upsertTokenMetadata(metadata: TokenMetadata): Promise<void> {
    const { error } = await this.client
      .from('token_metadata')
      .upsert(clean(metadata), { onConflict: 'token_id' });
    if (error) throw this.dbError('upsert token_metadata', error.message);
  }
// ---- snapshots ----------------------------------------------------------
  async upsertMarketSnapshot(snapshot: MarketSnapshot): Promise<void> {
    const { error } = await this.client
      .from('market_snapshots')
      .upsert(clean(snapshot), { onConflict: 'token_id,timestamp' });
    if (error) {
      if (error.code === '23505') return; // unique index backstop
      throw this.dbError('upsert market_snapshot', error.message);
    }
  }

  async upsertHolderSnapshot(snapshot: HolderSnapshot): Promise<void> {
    const { error } = await this.client
      .from('holder_snapshots')
      .upsert(clean(snapshot), { onConflict: 'token_id,timestamp' });
    if (error) {
      if (error.code === '23505') return;
      throw this.dbError('upsert holder_snapshot', error.message);
    }
  }

  // ---- transactions ---------------------------------------------------------
  async transactionExists(txHash: string): Promise<boolean> {
    const { data } = await this.client.from('transactions').select('id').eq('tx_hash', txHash).maybeSingle();
    return data !== null;
  }

  async insertTransaction(transaction: Transaction): Promise<void> {
    if (transaction.tx_hash && (await this.transactionExists(transaction.tx_hash))) return;
    const { error } = await this.client.from('transactions').insert(clean(transaction));
    if (error) {
      if (error.code === '23505') return; // duplicate race on partial tx_hash index
      throw this.dbError('insert transaction', error.message);
    }
  }

  // ---- jobs / checkpoints ----------------------------------------------------
  async createJob(jobType: string, provider: string, tokenAddress?: string | null): Promise<string> {
    const { data, error } = await this.client
      .from('ingestion_jobs')
      .insert({ job_type: jobType, provider_name: provider, token_address: tokenAddress ?? null, status: 'RUNNING' })
      .select('id')
      .single();
    if (error || !data) return ''; // job log is advisory — never fail on it
    return data.id as string;
  }

  async finishJob(jobId: string, status: 'SUCCEEDED' | 'FAILED' | 'PARTIAL', tokensProcessed: number, errorMsg?: string | null): Promise<void> {
    if (!jobId) return;
    const payload: Record<string, unknown> = { status, finished_at: new Date().toISOString(), tokens_processed: tokensProcessed };
    if (errorMsg) payload.error = { message: errorMsg };
    await this.client.from('ingestion_jobs').update(payload).eq('id', jobId);
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    const { data, error } = await this.client.from('backfill_checkpoints').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      lastCursor: data.last_cursor,
      lastTimestamp: data.last_timestamp,
      processedCount: Number(data.processed_count ?? 0),
      state: data.state ?? {},
    };
  }

  async setCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const { error } = await this.client
      .from('backfill_checkpoints')
      .upsert(
        {
          id: checkpoint.id,
          last_cursor: checkpoint.lastCursor,
          last_timestamp: checkpoint.lastTimestamp,
          processed_count: checkpoint.processedCount,
          state: checkpoint.state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    if (error) throw this.dbError('set checkpoint', error.message);
  }

  protected dbError(op: string, message: string): IngestionError {
    return new IngestionError({ kind: 'STORAGE', message: `${op}: ${message}`, tokenAddress: '' });
  }
}

/** Strip null/undefined/empty-id fields so PostgREST uses DB defaults. */
function clean(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined || v === '') continue;
    if (k === 'id' && v === '') continue;
    if (k === 'created_at_db' && v === null) continue;
    if (k === 'updated_at' && v === null) continue;
    out[k] = v;
  }
  return out;
}