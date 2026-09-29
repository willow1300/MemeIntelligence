// Wallet Intelligence Engine
//
// Profiles a creator/deployer wallet from raw observations.
// Uses "first observed" language — never claims wallet creation time
// unless verified by a provider.

import type {
  Wallet, WalletProfile,
} from '@/types';
import {
  fetchWalletById, fetchDeveloperByWallet, fetchDeveloperWallets,
  fetchTransactionsByWallet, fetchLaunchesByWallet,
} from '@/lib/data-access';
import { formatTimeAgo } from '@/lib/format';

export async function profileWallet(
  wallet: Wallet,
  referenceTime?: string,
): Promise<WalletProfile> {
  const [developer, txs, launches] = await Promise.all([
    fetchDeveloperByWallet(wallet.id),
    fetchTransactionsByWallet(wallet.id),
    fetchLaunchesByWallet(wallet.id),
  ]);

  const relationships: WalletProfile['relationships'] = [];
  if (developer) {
    const devWallets = await fetchDeveloperWallets(developer.id);
    for (const dw of devWallets) {
      if (dw.wallet_id === wallet.id) continue;
      const linkedWallet = await fetchWalletById(dw.wallet_id);
      if (linkedWallet) {
        relationships.push({
          developerName: developer.name,
          relationshipType: dw.relationship_type,
          confidence: dw.confidence,
          evidence: dw.evidence ?? [],
        });
      }
    }
  }

  const refTs = referenceTime ? new Date(referenceTime).getTime() : Date.now();
  const firstSeen = wallet.first_seen_at ? new Date(wallet.first_seen_at).getTime() : null;

  const isFreshWallet = firstSeen !== null && refTs - firstSeen < 60_000; // < 1 minute before reference

  // activity before/after launch
  const launchTime = launches[0]?.launch_time;
  let activityBeforeLaunch = 0;
  let activityAfterLaunch = 0;
  if (launchTime) {
    const lt = new Date(launchTime).getTime();
    for (const tx of txs) {
      const tt = new Date(tx.timestamp).getTime();
      if (tt <= lt) activityBeforeLaunch++;
      else activityAfterLaunch++;
    }
  }

  return {
    wallet,
    firstObservedAge: firstSeen ? formatTimeAgo(wallet.first_seen_at) : 'Unknown',
    firstObservedAbsolute: wallet.first_seen_at,
    transactionCount: wallet.transaction_count,
    launchCount: launches.length,
    associatedTokenCount: launches.length,
    relationships,
    activityBeforeLaunch,
    activityAfterLaunch,
    isFreshWallet,
  };
}

export function walletAgeRelativeToLaunch(
  wallet: Wallet,
  launchTime: string,
): { label: string; secondsBefore: number; isFresh: boolean } {
  if (!wallet.first_seen_at) return { label: 'Unknown', secondsBefore: 0, isFresh: false };
  const firstSeen = new Date(wallet.first_seen_at).getTime();
  const launch = new Date(launchTime).getTime();
  const diff = launch - firstSeen;
  if (diff < 0) {
    const absSec = Math.abs(diff) / 1000;
    return {
      label: `${formatDurationFromSeconds(absSec)} before launch`,
      secondsBefore: absSec,
      isFresh: absSec < 60,
    };
  }
  return {
    label: `${formatDurationFromSeconds(diff / 1000)} before launch`,
    secondsBefore: diff / 1000,
    isFresh: diff < 60_000,
  };
}

function formatDurationFromSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} second${Math.round(seconds) !== 1 ? 's' : ''}`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) !== 1 ? 's' : ''}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour${Math.floor(seconds / 3600) !== 1 ? 's' : ''}`;
  const days = Math.floor(seconds / 86400);
  if (days < 365) return `${days} day${days !== 1 ? 's' : ''}`;
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? 's' : ''}`;
}
