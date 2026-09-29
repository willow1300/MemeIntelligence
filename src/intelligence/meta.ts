// Meta Engine + Meta Performance
//
// V1 rule-based meta classification (read from pre-computed token_metas).
// Meta performance aggregates historical stats per meta.

import type { MetaPerformance, Meta } from '@/types';
import {
  fetchAllMetas, fetchTokensByMeta, fetchLifecycle,
} from '@/lib/data-access';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export async function computeMetaPerformance(metaId: string, meta: Meta): Promise<MetaPerformance> {
  const tokenIds = await fetchTokensByMeta(metaId);

  const peakMCs: number[] = [];
  const ttpMinutes: number[] = [];
  const lifespanMinutes: number[] = [];
  let successful = 0;

  for (const tokenId of tokenIds) {
    const lc = await fetchLifecycle(tokenId);
    if (!lc) continue;
    peakMCs.push(lc.peak_market_cap);
    if (lc.peak_time && lc.launch_time) {
      ttpMinutes.push(
        (new Date(lc.peak_time).getTime() - new Date(lc.launch_time).getTime()) / 60_000,
      );
    }
    if (lc.death_time && lc.launch_time) {
      lifespanMinutes.push(
        (new Date(lc.death_time).getTime() - new Date(lc.launch_time).getTime()) / 60_000,
      );
    }
    if (lc.failure_type === 'HEALTHY') successful++;
  }

  return {
    meta,
    launchCount: tokenIds.length,
    averagePeakMarketCap: average(peakMCs),
    medianPeakMarketCap: median(peakMCs),
    highestPeakMarketCap: Math.max(...peakMCs, 0),
    medianTimeToPeakMinutes: median(ttpMinutes),
    medianLifespanMinutes: median(lifespanMinutes),
    successRate: tokenIds.length > 0 ? successful / tokenIds.length : 0,
  };
}

export async function computeAllMetaPerformance(): Promise<MetaPerformance[]> {
  const metas = await fetchAllMetas();
  const results: MetaPerformance[] = [];
  for (const meta of metas) {
    // Only compute for leaf metas (children) to avoid double-counting
    const hasChildren = metas.some((m) => m.parent_id === meta.id);
    if (hasChildren) continue;
    const perf = await computeMetaPerformance(meta.id, meta);
    results.push(perf);
  }
  return results.sort((a, b) => b.launchCount - a.launchCount);
}

export function formatMetaLabels(metas: Meta[]): string {
  // Group by parent: show "Duck / Animal / Wholesome"
  const names = metas.map((m) => m.name);
  return names.join(' / ');
}
