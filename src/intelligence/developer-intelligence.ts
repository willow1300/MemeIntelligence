// Phase 2B.1 — Developer Intelligence over canonical AnalysisStore.
// Stored data only. No RPCs. Missing values -> null/UNKNOWN, never guessed.
import type { AnalysisRow, AnalysisStore, LaunchWithToken } from '../ingestion/analysis-store.ts';
import type { FailureType, MarketSnapshot } from '../types/index.ts';

export const VALID_OUTCOMES: ReadonlySet<FailureType> = new Set<FailureType>([
  'UNKNOWN','FAILED_LAUNCH','MOMENTUM_EXHAUSTION','META_EXHAUSTION','DEV_SELLING',
  'LIQUIDITY_EVENT','ASSOCIATED_WALLET_DISTRIBUTION','OTHER','HEALTHY',
]);
const SUCCESS_OUTCOMES: ReadonlySet<FailureType> = new Set(['HEALTHY']);

export interface DeveloperHistoricalLaunch {
  tokenId: string; tokenAddress: string; tokenName: string | null;
  tokenSymbol: string | null; tokenImageUrl: string | null;
  launchTime: string | null; peakMarketCap: number | null;
  finalMarketCap: number | null; timeToPeakMinutes: number | null;
  lifespanMinutes: number | null; outcome: FailureType;
  outcomeSource: 'lifecycle-analysis' | 'unknown'; evidence: string[];
}
export interface DeveloperStatistics {
  launchCount: number; previousLaunchCount: number;
  observedPeakMarketCapCount: number; peakMarketCapAverage: number | null;
  peakMarketCapMedian: number | null; highestPeakMarketCap: number | null;
  observedTimeToPeakCount: number; timeToPeakAverage: number | null;
  timeToPeakMedian: number | null;
}
export interface DeveloperOutcomes {
  successfulObservedLaunches: number; failedLaunches: number;
  momentumExhaustionCount: number; devSellingCount: number;
  liquidityEventCount: number; unknownOutcomeCount: number;
  countsByOutcome: Array<{ outcome: FailureType; count: number }>;
}
export interface DeveloperIntelligence {
  developerId: string | null; developerName: string | null;
  creatorWalletId: string | null; creatorWalletAddress: string | null;
  launchCount: number; previousLaunchCount: number;
  statistics: DeveloperStatistics; outcomes: DeveloperOutcomes;
  previousLaunches: DeveloperHistoricalLaunch[]; evidence: string[];
}
export interface DeveloperIntelligenceInput { tokenId?: string; developerId?: string; }

export function parseTime(v: string | null | undefined): number | null {
  if (!v) return null; const t = Date.parse(v); return Number.isFinite(t) ? t : null;
}
function finiteNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function average(v: number[]): number | null {
  return v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length;
}
function median(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function snapsAsc(snaps: MarketSnapshot[]): MarketSnapshot[] {
  return [...snaps].sort((a, b) => {
    const ta = parseTime(a.timestamp); const tb = parseTime(b.timestamp);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1; if (tb === null) return -1; return ta - tb;
  });
}
/** Classify outcome from STORED lifecycle analyses only. Else UNKNOWN. */
export function extractStoredOutcome(a: AnalysisRow[]): { outcome: FailureType; source: 'lifecycle-analysis' | 'unknown' } {
  const pref = ['LIFECYCLE', 'OVERALL', 'HISTORICAL_COMPARISON', 'DEVELOPER_PROFILE'];
  const byType = new Map(a.map((x) => [x.analysis_type, x]));
  const rest = a.filter((x) => !pref.includes(x.analysis_type));
  const ordered: AnalysisRow[] = [];
  for (const t of pref) { const r = byType.get(t); if (r) ordered.push(r); }
  ordered.push(...rest);
  for (const row of ordered) {
    const r = (row.result ?? {}) as Record<string, unknown>;
    const raw = r.failure_type ?? r.failureType ?? r.outcome;
    if (typeof raw === 'string') {
      const u = raw.trim().toUpperCase() as FailureType;
      if (VALID_OUTCOMES.has(u)) return { outcome: u, source: 'lifecycle-analysis' };
    }
  }
  return { outcome: 'UNKNOWN', source: 'unknown' };
}
function extractStoredLifespan(a: AnalysisRow[]): number | null {
  for (const row of a) {
    const r = (row.result ?? {}) as Record<string, unknown>;
    const d = finiteNumber(r.lifespanMinutes ?? r.lifespan_minutes);
    if (d !== null && d >= 0) return d;
    const death = parseTime(r.death_time as string | null);
    const launch = parseTime(r.launch_time as string | null);
    if (death !== null && launch !== null && death >= launch) return (death - launch) / 60_000;
  }
  return null;
}
async function summarizeLaunch(store: AnalysisStore, launch: LaunchWithToken): Promise<DeveloperHistoricalLaunch> {
  const token = launch.token; const tokenId = launch.token_id; const evidence: string[] = [];
  const snaps = snapsAsc(await store.listMarketSnapshots(tokenId));
  const analyses = await store.latestAnalyses(tokenId);
  let peakMarketCap: number | null = null; let peakTime: number | null = null;
  let finalMarketCap: number | null = null;
  if (snaps.length > 0) {
    let best = -Infinity;
    for (const s of snaps) {
      const mc = finiteNumber(s.market_cap); if (mc === null) continue;
      if (mc > best) { best = mc; peakTime = parseTime(s.timestamp); }
    }
    if (best > 0 && Number.isFinite(best)) { peakMarketCap = best; evidence.push(`peak ${best} across ${snaps.length} snapshot(s)`); }
    else evidence.push(`no usable market-cap across ${snaps.length} snapshot(s)`);
    const lastMc = finiteNumber(snaps[snaps.length - 1].market_cap); finalMarketCap = lastMc;
    evidence.push(lastMc === null ? 'final market cap unavailable' : `final ${lastMc} at ${snaps[snaps.length - 1].timestamp}`);
  } else evidence.push('no stored market snapshots: peak/final unavailable');
  const launchMs = parseTime(launch.launch_time);
  const ttp = peakTime !== null && launchMs !== null && peakTime >= launchMs ? (peakTime - launchMs) / 60_000 : null;
  evidence.push(ttp === null ? 'time to peak unavailable' : `time to peak ${ttp} min`);
  const lifespanMinutes = extractStoredLifespan(analyses);
  evidence.push(lifespanMinutes === null ? 'lifespan unavailable: no stored lifecycle analysis' : `lifespan ${lifespanMinutes} min from stored analysis`);
  const oc = extractStoredOutcome(analyses);
  evidence.push(oc.source === 'unknown' ? 'outcome UNKNOWN: no stored classification' : `outcome ${oc.outcome} from stored analysis`);
  return {
    tokenId, tokenAddress: token?.address ?? '', tokenName: token?.name ?? null,
    tokenSymbol: token?.symbol ?? null, tokenImageUrl: token?.image_url ?? null,
    launchTime: launch.launch_time ?? null, peakMarketCap, finalMarketCap,
    timeToPeakMinutes: ttp, lifespanMinutes, outcome: oc.outcome, outcomeSource: oc.source, evidence,
  };
}
/** Build developer history/stats/outcomes. Provide tokenId (preferred) or developerId. */
export async function buildDeveloperIntelligence(store: AnalysisStore, input: DeveloperIntelligenceInput): Promise<DeveloperIntelligence> {
  const evidence: string[] = [];
  let developerId: string | null = input.developerId ?? null;
  let developerName: string | null = null;
  let creatorWalletId: string | null = null;
  let creatorWalletAddress: string | null = null;
  const currentTokenId: string | null = input.tokenId ?? null;
  if (currentTokenId) {
    const tokens = await store.listTokens();
    const token = tokens.find((t) => t.id === currentTokenId) ?? null;
    if (!token) throw new Error(`developer-intelligence: token not found: ${currentTokenId}`);
    creatorWalletId = token.creator_wallet_id;
    if (creatorWalletId) {
      const wallets = await store.listWallets();
      creatorWalletAddress = wallets.find((w) => w.id === creatorWalletId)?.address ?? null;
    }
    evidence.push(creatorWalletAddress ? `creator wallet ${creatorWalletAddress} from stored token` : 'creator wallet unavailable: no creator_wallet_id');
    const launch = await store.getLaunchByToken(currentTokenId);
    if (launch?.developer_id) {
      const dev = await store.getDeveloper(launch.developer_id);
      if (dev) { developerId = dev.id; developerName = dev.name; evidence.push(`developer "${dev.name}" via stored launch.developer_id`); }
    }
    if (!developerId && creatorWalletId) {
      const link = await store.getDeveloperByWallet(creatorWalletId);
      if (link) { developerId = link.developer.id; developerName = link.developer.name; evidence.push(`developer "${link.developer.name}" via stored link (${link.relationship_type}, conf ${link.confidence})`); }
    }
    if (!developerId) evidence.push('no stored developer record for this launch');
  } else if (developerId) {
    const dev = await store.getDeveloper(developerId);
    if (!dev) throw new Error(`developer-intelligence: developer not found: ${developerId}`);
    developerName = dev.name; creatorWalletId = dev.primary_wallet_id;
    if (creatorWalletId) {
      const wallets = await store.listWallets();
      creatorWalletAddress = wallets.find((w) => w.id === creatorWalletId)?.address ?? null;
    }
    evidence.push(`developer "${dev.name}" via direct lookup`);
  } else throw new Error('developer-intelligence: provide tokenId or developerId');
  const launches: LaunchWithToken[] = developerId ? await store.listLaunchesByDeveloper(developerId) : [];
  evidence.push(developerId ? `${launches.length} historical launch(es) in store` : '0 launches: no developer identity');
  const summaries: DeveloperHistoricalLaunch[] = [];
  for (const l of launches) summaries.push(await summarizeLaunch(store, l));
  const cmp = (x: DeveloperHistoricalLaunch, y: DeveloperHistoricalLaunch) => {
    const tx = parseTime(x.launchTime); const ty = parseTime(y.launchTime);
    if (tx === null && ty === null) return 0; if (tx === null) return 1; if (ty === null) return -1; return ty - tx;
  };
  summaries.sort(cmp);
  const previousLaunches = summaries.filter((s) => (currentTokenId ? s.tokenId !== currentTokenId : true)).sort((a, b) => -cmp(a, b));
  const peaks = summaries.flatMap((s) => (s.peakMarketCap !== null ? [s.peakMarketCap] : []));
  const ttps = summaries.flatMap((s) => (s.timeToPeakMinutes !== null ? [s.timeToPeakMinutes] : []));
  const statistics: DeveloperStatistics = {
    launchCount: launches.length, previousLaunchCount: previousLaunches.length,
    observedPeakMarketCapCount: peaks.length, peakMarketCapAverage: average(peaks),
    peakMarketCapMedian: median(peaks), highestPeakMarketCap: peaks.length > 0 ? Math.max(...peaks) : null,
    observedTimeToPeakCount: ttps.length, timeToPeakAverage: average(ttps), timeToPeakMedian: median(ttps),
  };
  evidence.push(`peak observed for ${peaks.length}/${summaries.length} launch(es)` + (peaks.length === 0 ? ': averages unavailable' : ''));
  let ok = 0; let fail = 0; let mom = 0; let dv = 0; let liq = 0; let unk = 0;
  const byOutcome = new Map<FailureType, number>();
  for (const s of summaries) {
    byOutcome.set(s.outcome, (byOutcome.get(s.outcome) ?? 0) + 1);
    if (s.outcome === 'UNKNOWN') unk += 1;
    else if (SUCCESS_OUTCOMES.has(s.outcome)) ok += 1;
    else fail += 1;
    if (s.outcome === 'MOMENTUM_EXHAUSTION') mom += 1;
    if (s.outcome === 'DEV_SELLING') dv += 1;
    if (s.outcome === 'LIQUIDITY_EVENT') liq += 1;
  }
  const outcomes: DeveloperOutcomes = {
    successfulObservedLaunches: ok, failedLaunches: fail, momentumExhaustionCount: mom,
    devSellingCount: dv, liquidityEventCount: liq, unknownOutcomeCount: unk,
    countsByOutcome: [...byOutcome.entries()].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count),
  };
  evidence.push(`outcomes: ${ok} successful, ${fail} failed, ${unk} unknown across ${summaries.length}`);
  return { developerId, developerName, creatorWalletId, creatorWalletAddress, launchCount: launches.length, previousLaunchCount: previousLaunches.length, statistics, outcomes, previousLaunches, evidence };
}
