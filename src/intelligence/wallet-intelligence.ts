// Phase 2B.1 — Wallet Intelligence over canonical AnalysisStore.
// Stored data only. "firstObservedOnChain" language; never "creation".
import type { AnalysisStore } from '../ingestion/analysis-store.ts';
import type { FailureType } from '../types/index.ts';
import { extractStoredOutcome, parseTime } from './developer-intelligence.ts';

export type WalletAgeSignal = 'VERY_NEW' | 'NEW' | 'ESTABLISHED' | 'LONG_ESTABLISHED' | 'UNKNOWN';
export interface WalletAgeAtLaunch { seconds: number; days: number; label: string; }
export interface WalletActivity {
  transactionCount: number; transactionsBeforeLaunch: number | null;
  transactionsAfterLaunch: number | null; firstObservedOnChain: string | null;
  lastObservedOnChain: string | null; uniqueTokensInteractedWith: number | null;
  observedLaunches: number | null;
}
export interface WalletLaunchSummary {
  tokenId: string; tokenAddress: string; tokenSymbol: string | null;
  launchTime: string | null; peakMarketCap: number | null; outcome: FailureType;
}
export interface WalletAssociation {
  walletId: string; walletAddress: string | null; relationshipType: string;
  confidence: number; evidence: string[];
}
export interface WalletIntelligence {
  walletId: string; walletAddress: string; firstObservedOnChain: string | null;
  lastObservedOnChain: string | null; launchTime: string | null;
  walletAgeAtLaunch: WalletAgeAtLaunch | null; ageSignal: WalletAgeSignal;
  activity: WalletActivity; previousLaunches: WalletLaunchSummary[];
  developerWallets: WalletAssociation[]; evidence: string[];
}
export interface WalletIntelligenceInput {
  walletId?: string; walletAddress?: string; chainId?: string;
  launchTime?: string; tokenId?: string;
}
export function classifyWalletAge(s: number | null): WalletAgeSignal {
  if (s === null || !Number.isFinite(s) || s < 0) return 'UNKNOWN';
  if (s < 3600) return 'VERY_NEW';
  if (s < 7 * 86400) return 'NEW';
  if (s <= 90 * 86400) return 'ESTABLISHED';
  return 'LONG_ESTABLISHED';
}
/** Build wallet age/activity/history from canonical store. */
export async function buildWalletIntelligence(s: AnalysisStore, i: WalletIntelligenceInput): Promise<WalletIntelligence> {
  const evidence: string[] = [];
  const wallets = await s.listWallets();
  let found = i.walletId ? wallets.find((x) => x.id === i.walletId) ?? null : null;
  if (!found && i.walletAddress) found = wallets.find((x) => x.address === i.walletAddress && (!i.chainId || x.chain_id === i.chainId)) ?? null;
  if (!found) throw new Error('wallet-intelligence: wallet not found in store');
  const wallet = found;
  const txs = await s.listTransactionsByWallet(wallet.id);
  const times = txs.map((t) => parseTime(t.timestamp)).filter((t): t is number => t !== null).sort((a, b) => a - b);
  const firstObservedOnChain = wallet.first_seen_at ?? (times.length > 0 ? new Date(times[0]).toISOString() : null);
  const lastObservedOnChain = wallet.last_seen_at ?? (times.length > 0 ? new Date(times[times.length - 1]).toISOString() : null);
  evidence.push(firstObservedOnChain ? `first observed on-chain: ${firstObservedOnChain}` : 'first observed unavailable: no first_seen_at, no txs');
  let launchTime: string | null = i.launchTime ?? null;
  if (!launchTime && i.tokenId) launchTime = (await s.getLaunchByToken(i.tokenId))?.launch_time ?? null;
  if (!launchTime) {
    const toks = await s.listTokens();
    const mine = toks.filter((t) => t.creator_wallet_id === wallet.id);
    const ts = mine.map((t) => parseTime(t.created_at ?? t.first_seen_at)).filter((t): t is number => t !== null);
    if (ts.length > 0) launchTime = new Date(Math.min(...ts)).toISOString();
  }
  evidence.push(launchTime ? `reference launch: ${launchTime}` : 'reference launch unavailable');
  const fMs = parseTime(firstObservedOnChain); const lMs = parseTime(launchTime);
  const walletAgeAtLaunch = fMs !== null && lMs !== null && lMs >= fMs
    ? { seconds: (lMs - fMs) / 1000, days: (lMs - fMs) / 86400000, label: ageLabel((lMs - fMs) / 1000) } : null;
  evidence.push(walletAgeAtLaunch ? `age at launch: ${walletAgeAtLaunch.label}` : 'age at launch unavailable');
  const ageSignal = classifyWalletAge(walletAgeAtLaunch ? walletAgeAtLaunch.seconds : null);
  evidence.push(`age signal ${ageSignal} (<1h VERY_NEW, 1h-7d NEW, 7-90d ESTABLISHED, >90d LONG_ESTABLISHED; descriptive only)`);
  let before: number | null = null; let after: number | null = null;
  if (lMs !== null) {
    before = 0; after = 0;
    for (const t of times) { if (t <= lMs) before += 1; else after += 1; }
    evidence.push(`${before} tx(s) at/before launch, ${after} after`);
  } else evidence.push('before/after unavailable: no launch timestamp');
  const uniq = new Set(txs.map((t) => t.token_id).filter((t): t is string => !!t));
  const toks = await s.listTokens();
  const mine = toks.filter((t) => t.creator_wallet_id === wallet.id);
  const previousLaunches: WalletLaunchSummary[] = [];
  for (const tok of mine) {
    const l = await s.getLaunchByToken(tok.id);
    const snaps = await s.listMarketSnapshots(tok.id);
    let peak: number | null = null;
    for (const x of snaps) { const mc = Number(x.market_cap); if (Number.isFinite(mc) && (peak === null || mc > peak)) peak = mc; }
    if (peak !== null && peak <= 0) peak = null;
    const an = await s.latestAnalyses(tok.id);
    previousLaunches.push({ tokenId: tok.id, tokenAddress: tok.address, tokenSymbol: tok.symbol ?? null, launchTime: l?.launch_time ?? tok.created_at ?? tok.first_seen_at ?? null, peakMarketCap: peak, outcome: extractStoredOutcome(an).outcome });
  }
  previousLaunches.sort((a, b) => {
    const ta = parseTime(a.launchTime); const tb = parseTime(b.launchTime);
    if (ta === null && tb === null) return 0; if (ta === null) return 1; if (tb === null) return -1; return ta - tb;
  });
  evidence.push(`${previousLaunches.length} launch(es) via stored tokens.creator_wallet_id`);
  const developerWallets: WalletAssociation[] = [];
  const link = await s.getDeveloperByWallet(wallet.id);
  if (link) {
    developerWallets.push({ walletId: wallet.id, walletAddress: wallet.address, relationshipType: link.relationship_type, confidence: link.confidence, evidence: link.evidence });
    evidence.push(`developer link "${link.developer.name}" (${link.relationship_type}, conf ${link.confidence}); no graph inference`);
  } else evidence.push('no stored developer_wallets association; none invented');
  const activity: WalletActivity = { transactionCount: txs.length, transactionsBeforeLaunch: before, transactionsAfterLaunch: after, firstObservedOnChain, lastObservedOnChain, uniqueTokensInteractedWith: uniq.size, observedLaunches: previousLaunches.length };
  return { walletId: wallet.id, walletAddress: wallet.address, firstObservedOnChain, lastObservedOnChain, launchTime, walletAgeAtLaunch, ageSignal, activity, previousLaunches, developerWallets, evidence };
}
function ageLabel(s: number): string {
  if (s < 60) return `${Math.round(s)} second(s)`;
  if (s < 3600) return `${Math.floor(s / 60)} minute(s)`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour(s)`;
  return `${Math.floor(s / 86400)} day(s)`;
}
