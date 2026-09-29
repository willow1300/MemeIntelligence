// Lifecycle Engine
//
// Reconstructs a token's lifecycle from raw market snapshots and
// the pre-computed token_lifecycle record. Calculates drawdown,
// time-to-peak, and surfaces evidence.

import type { LifecycleAnalysis, MarketSnapshot } from '@/types';
import { fetchMarketSnapshots, fetchLifecycle } from '@/lib/data-access';

export async function analyzeLifecycle(tokenId: string): Promise<LifecycleAnalysis | null> {
  const [lifecycle, snapshots] = await Promise.all([
    fetchLifecycle(tokenId),
    fetchMarketSnapshots(tokenId),
  ]);

  if (!lifecycle) return null;

  const timeToPeak =
    lifecycle.peak_time && lifecycle.launch_time
      ? (new Date(lifecycle.peak_time).getTime() - new Date(lifecycle.launch_time).getTime()) / 60_000
      : null;

  // drawdown from peak: (peak - lowest_after_peak) / peak
  let lowestAfterPeak = lifecycle.peak_market_cap;
  if (lifecycle.peak_time) {
    const peakTs = new Date(lifecycle.peak_time).getTime();
    for (const snap of snapshots) {
      if (new Date(snap.timestamp).getTime() > peakTs && snap.market_cap < lowestAfterPeak) {
        lowestAfterPeak = snap.market_cap;
      }
    }
  }
  const drawdownFromPeak =
    lifecycle.peak_market_cap > 0
      ? (lifecycle.peak_market_cap - lowestAfterPeak) / lifecycle.peak_market_cap
      : 0;

  return {
    lifecycle,
    timeToPeakMinutes: timeToPeak,
    drawdownFromPeak,
    snapshots,
  };
}

export function getMomentumLabel(snapshots: MarketSnapshot[]): { label: string; volumeChange: number } {
  if (snapshots.length < 2) return { label: 'UNKNOWN', volumeChange: 0 };
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const change = first.volume > 0 ? (last.volume - first.volume) / first.volume : 0;
  if (change > 0.2) return { label: 'STRONG', volumeChange: change };
  if (change > -0.3) return { label: 'MEDIUM', volumeChange: change };
  return { label: 'WEAK', volumeChange: change };
}
