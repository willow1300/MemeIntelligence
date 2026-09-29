// Phase 2B.1 fixtures: deterministic seeds into MemoryAnalysisStore.
import { MemoryAnalysisStore } from '../../src/ingestion/analysis-store-memory.ts';
import { normalizeMarketSnapshot, normalizeToken, normalizeTransaction, normalizeWallet } from '../../src/providers/normalize.ts';

export const CHAIN = 'solana-mainnet';
export const T0 = '2026-08-10T12:00:00.000Z';
export const W1 = 'AuroraPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1';
export const W2 = 'FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9';
export const W3 = 'Dra1nCoLLectPr1marywa11etXXXXXXXXXXXXXXX5';
export const TKA = 'ToKenA11111111111111111111111111111111111';
export const TKB = 'ToKenB22222222222222222222222222222222222';
export const TKC = 'ToKenC33333333333333333333333333333333333';
export const TKD = 'ToKenD44444444444444444444444444444444444';
export function min(iso: string, m: number): string {
  return new Date(Date.parse(iso) + m * 60_000).toISOString();
}
export function newStore(): MemoryAnalysisStore {
  return new MemoryAnalysisStore();
}
export async function putToken(store: MemoryAnalysisStore, a: string, creator: string | null, at: string, sym: string) {
  const t = normalizeToken({ chainId: CHAIN, address: a, name: `${sym} token`, symbol: sym, firstSeenAt: at, createdAt: at, raw: { source: 'fx' } } as never);
  t.id = `tok-${a.slice(0, 6)}`; t.creator_wallet_id = creator;
  await store.upsertToken(t);
  return store.tokens.get(`${CHAIN}:${a}`)!;
}

export async function putWallet(store: MemoryAnalysisStore, a: string, first: string | null, last: string | null) {
  const w = normalizeWallet({ chainId: CHAIN, address: a, firstSeenAt: first, lastSeenAt: last, transactionCount: 0, raw: { source: 'fx' } } as never);
  w.id = `wal-${a.slice(0, 6)}`;
  await store.upsertWallet(w);
  return store.wallets.get(`${CHAIN}:${a}`)!;
}
export async function putLaunch(store: MemoryAnalysisStore, tokenId: string, time: string, devId: string | null) {
  const row = { id: `launch-${tokenId}`, token_id: tokenId, developer_id: devId, platform_id: null, launch_time: time, initial_liquidity: 1000, initial_market_cap: 5000, launch_transaction: null, status: 'ACTIVE', created_at: time };
  await store.upsertLaunch(row as never);
}
export async function putSnap(store: MemoryAnalysisStore, tokenId: string, ts: string, mc: number) {
  const s = normalizeMarketSnapshot({ tokenId, timestampIso: ts, marketCap: mc, price: 1, raw: { source: 'fx' } } as never);
  s.id = `snap-${tokenId}-${ts}`;
  await store.upsertMarketSnapshot(s);
}
export async function putOutcome(store: MemoryAnalysisStore, tokenId: string, ft: string, lifespanMin?: number) {
  const result: Record<string, unknown> = { failure_type: ft };
  if (lifespanMin !== undefined) result.lifespanMinutes = lifespanMin;
  await store.insertAnalysis({ token_id: tokenId, analysis_type: 'LIFECYCLE', version: 'fx-1', confidence: 0.9, result, evidence: [`fixture ${ft}`] });
}
export async function putTx(store: MemoryAnalysisStore, hash: string, walletId: string | null, tokenId: string | null, ts: string) {
  const t = normalizeTransaction({ chainId: CHAIN, tokenId: tokenId ?? '', txHash: hash, timestampIso: ts, eventType: 'BUY', raw: { source: 'fx' } } as never);
  t.wallet_id = walletId; t.token_id = tokenId; t.id = `tx-${hash.slice(0, 8)}`;
  await store.insertTransaction(t);
}
export async function fxNoHistory() {
  const store = newStore();
  const w = await putWallet(store, W2, min(T0, -30), min(T0, -30));
  const t = await putToken(store, TKA, w.id, T0, 'NOHIST');
  await putLaunch(store, t.id, T0, null);
  return { store, tokenId: t.id };
}
export async function fxOnePrevious() {
  const store = newStore();
  const w = await putWallet(store, W1, '2024-01-01T00:00:00.000Z', T0);
  const dev = await store.ensureDeveloperByName('Aurora');
  await store.upsertDeveloperWallet(dev.id, w.id, 'PRIMARY', 0.99, ['fixture primary']);
  const old = await putToken(store, TKB, w.id, '2026-08-01T12:00:00.000Z', 'OLD');
  await putLaunch(store, old.id, '2026-08-01T12:00:00.000Z', dev.id);
  await store.setLaunchDeveloper(`launch-${old.id}`, dev.id);
  await putSnap(store, old.id, '2026-08-01T12:00:00.000Z', 10_000);
  await putSnap(store, old.id, '2026-08-01T13:00:00.000Z', 60_000);
  await putSnap(store, old.id, '2026-08-01T14:00:00.000Z', 20_000);
  await putOutcome(store, old.id, 'MOMENTUM_EXHAUSTION', 120);
  const cur = await putToken(store, TKA, w.id, T0, 'CUR');
  await putLaunch(store, cur.id, T0, dev.id);
  await store.setLaunchDeveloper(`launch-${cur.id}`, dev.id);
  return { store, currentTokenId: cur.id, devId: dev.id };
}
export async function fxMulti() {
  const store = newStore();
  const w = await putWallet(store, W3, '2023-05-01T00:00:00.000Z', T0);
  const dev = await store.ensureDeveloperByName('Drain');
  await store.upsertDeveloperWallet(dev.id, w.id, 'PRIMARY', 0.9, ['fixture']);
  const mk = async (addr: string, sym: string, day: string, peak: number | null, oc: string | null, ttp: number) => {
    const t = await putToken(store, addr, w.id, `${day}T12:00:00.000Z`, sym);
    await putLaunch(store, t.id, `${day}T12:00:00.000Z`, dev.id);
    await store.setLaunchDeveloper(`launch-${t.id}`, dev.id);
    if (peak !== null) {
      await putSnap(store, t.id, `${day}T12:00:00.000Z`, Math.round(peak * 0.1));
      await putSnap(store, t.id, min(`${day}T12:00:00.000Z`, ttp), peak);
      await putSnap(store, t.id, min(`${day}T12:00:00.000Z`, ttp + 60), Math.round(peak * 0.3));
    }
    if (oc) await putOutcome(store, t.id, oc);
    return t;
  };
  await mk(TKA, 'AAA', '2026-07-01', 100_000, 'HEALTHY', 90);
  await mk(TKB, 'BBB', '2026-07-10', 200_000, 'DEV_SELLING', 45);
  await mk(TKC, 'CCC', '2026-07-20', null, null, 0);
  const cur = await putToken(store, TKD, w.id, T0, 'CUR');
  await putLaunch(store, cur.id, T0, dev.id);
  await store.setLaunchDeveloper(`launch-${cur.id}`, dev.id);
  return { store, currentTokenId: cur.id, devId: dev.id };
}
export async function fxBrandNew() {
  const store = newStore();
  const w = await putWallet(store, W2, min(T0, -0.5), min(T0, -0.5));
  const t = await putToken(store, TKA, w.id, T0, 'NEW');
  await putLaunch(store, t.id, T0, null);
  await putTx(store, 'sigNEW11111111111111111111111x', w.id, t.id, min(T0, -0.5));
  await putTx(store, 'sigNEW22222222222222222222222x', w.id, t.id, min(T0, 5));
  return { store, walletId: w.id, tokenId: t.id };
}
export async function fxEstablished() {
  const store = newStore();
  const w = await putWallet(store, W1, '2025-07-06T12:00:00.000Z', T0);
  const t = await putToken(store, TKA, w.id, T0, 'EST');
  await putLaunch(store, t.id, T0, null);
  const old = await putToken(store, TKB, w.id, '2026-01-01T12:00:00.000Z', 'OLD');
  await putLaunch(store, old.id, '2026-01-01T12:00:00.000Z', null);
  await putSnap(store, old.id, '2026-01-01T13:00:00.000Z', 50_000);
  await putOutcome(store, old.id, 'LIQUIDITY_EVENT');
  await putTx(store, 'sigEST11111111111111111111111x', w.id, old.id, '2025-08-01T00:00:00.000Z');
  await putTx(store, 'sigEST22222222222222222222222x', w.id, t.id, min(T0, -60));
  await putTx(store, 'sigEST33333333333333333333333x', w.id, t.id, min(T0, 60));
  return { store, walletId: w.id, tokenId: t.id };
}
export async function fxNoFirstSeen() {
  const store = newStore();
  const w = await putWallet(store, W3, null, null);
  const t = await putToken(store, TKC, w.id, T0, 'NOF');
  await putLaunch(store, t.id, T0, null);
  return { store, walletId: w.id, tokenId: t.id };
}
export async function fxWithDev() {
  const store = newStore();
  const w = await putWallet(store, W1, '2024-06-01T00:00:00.000Z', T0);
  const dev = await store.ensureDeveloperByName('Aurora');
  await store.upsertDeveloperWallet(dev.id, w.id, 'PRIMARY', 0.95, ['seeded primary link']);
  const t = await putToken(store, TKA, w.id, T0, 'DEV');
  await putLaunch(store, t.id, T0, dev.id);
  await store.setLaunchDeveloper(`launch-${t.id}`, dev.id);
  return { store, walletId: w.id, tokenId: t.id };
}