// Data-access layer: fetches RAW observations from Supabase.
// All analytical conclusions are derived by the intelligence engines,
// not here. This separation is a core architectural principle.

import { supabase } from './supabase';
import type {
  Token, TokenMetadata, Launch, Transaction, MarketSnapshot, HolderSnapshot,
  Wallet, Developer, DeveloperWallet, Meta, TokenMeta, TokenSimilarity,
  TokenLifecycle, Analysis, UserTrade, Platform,
} from '@/types';

// ---- Tokens ----

export async function fetchTokens(): Promise<Token[]> {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Token[];
}

export async function fetchTokenByAddress(address: string): Promise<Token | null> {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('address', address)
    .maybeSingle();
  if (error) throw error;
  return data as Token | null;
}

export async function fetchTokenMetadata(tokenId: string): Promise<TokenMetadata | null> {
  const { data, error } = await supabase
    .from('token_metadata')
    .select('*')
    .eq('token_id', tokenId)
    .maybeSingle();
  if (error) throw error;
  return data as TokenMetadata | null;
}

// ---- Wallets / Developers ----

export async function fetchWalletByAddress(address: string): Promise<Wallet | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('address', address)
    .maybeSingle();
  if (error) throw error;
  return data as Wallet | null;
}

export async function fetchWalletById(id: string): Promise<Wallet | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Wallet | null;
}

export async function fetchDeveloperById(id: string): Promise<Developer | null> {
  const { data, error } = await supabase
    .from('developers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Developer | null;
}

export async function fetchDeveloperByWallet(walletId: string): Promise<Developer | null> {
  const { data, error } = await supabase
    .from('developers')
    .select('*')
    .eq('primary_wallet_id', walletId)
    .maybeSingle();
  if (error) throw error;
  return data as Developer | null;
}

export async function fetchDeveloperWallets(developerId: string): Promise<DeveloperWallet[]> {
  const { data, error } = await supabase
    .from('developer_wallets')
    .select('*')
    .eq('developer_id', developerId);
  if (error) throw error;
  return data as DeveloperWallet[];
}

export async function fetchAllDevelopers(): Promise<Developer[]> {
  const { data, error } = await supabase
    .from('developers')
    .select('*')
    .order('launch_count', { ascending: false });
  if (error) throw error;
  return data as Developer[];
}

export async function fetchAllWallets(): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .order('first_seen_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data as Wallet[];
}

// ---- Launches ----

export async function fetchLaunchByToken(tokenId: string): Promise<Launch | null> {
  const { data, error } = await supabase
    .from('launches')
    .select('*')
    .eq('token_id', tokenId)
    .maybeSingle();
  if (error) throw error;
  return data as Launch | null;
}

export async function fetchLaunchesByDeveloper(developerId: string): Promise<Launch[]> {
  const { data, error } = await supabase
    .from('launches')
    .select('*')
    .eq('developer_id', developerId)
    .order('launch_time', { ascending: false });
  if (error) throw error;
  return data as Launch[];
}

export async function fetchLaunchesByWallet(walletId: string): Promise<Launch[]> {
  const { data, error } = await supabase
    .from('launches')
    .select('*, tokens!inner(creator_wallet_id)')
    .eq('tokens.creator_wallet_id', walletId)
    .order('launch_time', { ascending: false });
  if (error) throw error;
  return data as Launch[];
}

// ---- Transactions ----

export async function fetchTransactionsByToken(tokenId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('token_id', tokenId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data as Transaction[];
}

export async function fetchTransactionsByWallet(walletId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('wallet_id', walletId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data as Transaction[];
}

// ---- Snapshots ----

export async function fetchMarketSnapshots(tokenId: string): Promise<MarketSnapshot[]> {
  const { data, error } = await supabase
    .from('market_snapshots')
    .select('*')
    .eq('token_id', tokenId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data as MarketSnapshot[];
}

export async function fetchHolderSnapshots(tokenId: string): Promise<HolderSnapshot[]> {
  const { data, error } = await supabase
    .from('holder_snapshots')
    .select('*')
    .eq('token_id', tokenId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data as HolderSnapshot[];
}

// ---- Metas ----

export async function fetchAllMetas(): Promise<Meta[]> {
  const { data, error } = await supabase
    .from('metas')
    .select('*')
    .order('name');
  if (error) throw error;
  return data as Meta[];
}

export async function fetchMetaBySlug(slug: string): Promise<Meta | null> {
  const { data, error } = await supabase
    .from('metas')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as Meta | null;
}

export async function fetchTokenMetas(tokenId: string): Promise<TokenMeta[]> {
  const { data, error } = await supabase
    .from('token_metas')
    .select('*')
    .eq('token_id', tokenId);
  if (error) throw error;
  return data as TokenMeta[];
}

export async function fetchMetasForToken(tokenId: string): Promise<Meta[]> {
  const { data, error } = await supabase
    .from('token_metas')
    .select('metas(*)')
    .eq('token_id', tokenId);
  if (error) throw error;
  return (data as unknown as Array<{ metas: Meta }>).map((r) => r.metas);
}

export async function fetchTokensByMeta(metaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('token_metas')
    .select('token_id')
    .eq('meta_id', metaId);
  if (error) throw error;
  return (data as Array<{ token_id: string }>).map((r) => r.token_id);
}

// ---- Similarities ----

export async function fetchSimilaritiesForToken(tokenId: string): Promise<TokenSimilarity[]> {
  // similarities are stored with token_a_id < token_b_id, so check both sides
  const [a, b] = await Promise.all([
    supabase.from('token_similarities').select('*').eq('token_a_id', tokenId),
    supabase.from('token_similarities').select('*').eq('token_b_id', tokenId),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return [...(a.data as TokenSimilarity[]), ...(b.data as TokenSimilarity[])] as TokenSimilarity[];
}

// ---- Lifecycles ----

export async function fetchLifecycle(tokenId: string): Promise<TokenLifecycle | null> {
  const { data, error } = await supabase
    .from('token_lifecycles')
    .select('*')
    .eq('token_id', tokenId)
    .maybeSingle();
  if (error) throw error;
  return data as TokenLifecycle | null;
}

// ---- Analyses ----

export async function fetchAnalyses(tokenId: string): Promise<Analysis[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('token_id', tokenId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Analysis[];
}

export async function fetchAnalysis(tokenId: string, type: string): Promise<Analysis | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('token_id', tokenId)
    .eq('analysis_type', type)
    .maybeSingle();
  if (error) throw error;
  return data as Analysis | null;
}

// ---- User trades ----

export async function fetchUserTrades(userId: string): Promise<UserTrade[]> {
  const { data, error } = await supabase
    .from('user_trades')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data as UserTrade[];
}

// ---- Platforms ----

export async function fetchPlatforms(): Promise<Platform[]> {
  const { data, error } = await supabase
    .from('platforms')
    .select('*');
  if (error) throw error;
  return data as Platform[];
}
