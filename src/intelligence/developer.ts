// Developer Intelligence Engine
//
// Given a developer, finds all previous launches, groups them, and
// calculates aggregate statistics (peak MC, time-to-peak, lifespan,
// success/failure breakdown). Does NOT imply predictions.

import type { DeveloperStats, DeveloperLaunch, FailureType } from '@/types';
import {
  fetchLaunchesByDeveloper, fetchLifecycle, fetchWalletById,
} from '@/lib/data-access';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

const SUCCESS_TYPES: FailureType[] = ['HEALTHY'];

export async function profileDeveloper(developerId: string): Promise<DeveloperStats | null> {
  const launches = await fetchLaunchesByDeveloper(developerId);
  if (launches.length === 0) return null;

  const developerLaunches: DeveloperLaunch[] = [];
  const peakMCs: number[] = [];
  const ttpMinutes: number[] = [];
  const lifespanMinutes: number[] = [];

  for (const launch of launches) {
    const lc = await fetchLifecycle(launch.token_id);
    const wallet = await fetchWalletById(developerId);
    // We need token info — fetch via the launch's token_id through a lightweight query
    // The data-access layer doesn't have fetchTokenById, so we derive from lifecycle + launch
    const tokenAddress = launch.launch_transaction?.replace('deploytx_', '') ?? '';
    const peakMC = lc?.peak_market_cap ?? 0;
    const ttp =
      lc?.peak_time && lc?.launch_time
        ? (new Date(lc.peak_time).getTime() - new Date(lc.launch_time).getTime()) / 60_000
        : 0;
    const lifespan =
      lc?.death_time && lc?.launch_time
        ? (new Date(lc.death_time).getTime() - new Date(lc.launch_time).getTime()) / 60_000
        : null;

    peakMCs.push(peakMC);
    if (ttp > 0) ttpMinutes.push(ttp);
    if (lifespan !== null) lifespanMinutes.push(lifespan);

    developerLaunches.push({
      tokenId: launch.token_id,
      tokenAddress,
      tokenName: '—',
      tokenSymbol: '—',
      tokenImageUrl: null,
      launchTime: launch.launch_time,
      peakMarketCap: peakMC,
      timeToPeakMinutes: ttp,
      lifespanMinutes: lifespan,
      failureType: lc?.failure_type ?? 'UNKNOWN',
      evidence: lc?.evidence ?? [],
    });
    void wallet;
  }

  // Sort launches by time descending (most recent first)
  developerLaunches.sort((a, b) => new Date(b.launchTime).getTime() - new Date(a.launchTime).getTime());

  // Outcome breakdown
  const breakdownMap = new Map<FailureType, number>();
  for (const dl of developerLaunches) {
    breakdownMap.set(dl.failureType, (breakdownMap.get(dl.failureType) ?? 0) + 1);
  }
  const outcomeBreakdown = Array.from(breakdownMap.entries())
    .map(([failureType, count]) => ({ failureType, count }))
    .sort((a, b) => b.count - a.count);

  const successfulLaunches = developerLaunches.filter((dl) =>
    SUCCESS_TYPES.includes(dl.failureType),
  ).length;
  const failedLaunches = developerLaunches.filter(
    (dl) => dl.failureType !== 'UNKNOWN' && !SUCCESS_TYPES.includes(dl.failureType),
  ).length;
  const unknownOutcomes = developerLaunches.length - successfulLaunches - failedLaunches;

  return {
    developer: {
      id: developerId,
      name: '',
      primary_wallet_id: null,
      first_seen_at: null,
      last_seen_at: null,
      launch_count: launches.length,
      created_at: '',
      updated_at: '',
    },
    launchCount: launches.length,
    highestPeakMarketCap: Math.max(...peakMCs, 0),
    medianPeakMarketCap: median(peakMCs),
    averagePeakMarketCap: average(peakMCs),
    averageTimeToPeakMinutes: average(ttpMinutes),
    medianTimeToPeakMinutes: median(ttpMinutes),
    averageLifespanMinutes: average(lifespanMinutes),
    successfulLaunches,
    failedLaunches,
    unknownOutcomes,
    outcomeBreakdown,
    launches: developerLaunches,
  };
}
