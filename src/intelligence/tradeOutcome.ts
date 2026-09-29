// Trade Outcome Engine
//
// Analyzes the user's trade history to determine what happened after
// they exited a position. Distinguishes:
//   EARLY_EXIT — user sold, token later pumped
//   EXIT_BEFORE_SEVERE_FAILURE — user sold, token later collapsed
//   GOOD_EXIT — user sold near or after peak
//   STILL_HOLDING — user bought but hasn't sold
//
// This is historical analysis, NOT financial advice.

import type { TradeOutcomeResult, TradeOutcome, UserTrade, Token } from '@/types';
import { fetchUserTrades, fetchMarketSnapshots } from '@/lib/data-access';
import { supabase } from '@/lib/supabase';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function computeTradeOutcomes(): Promise<TradeOutcomeResult[]> {
  const trades = await fetchUserTrades(DEMO_USER_ID);

  // Group trades by token
  const byToken = new Map<string, UserTrade[]>();
  for (const trade of trades) {
    const arr = byToken.get(trade.token_id) ?? [];
    arr.push(trade);
    byToken.set(trade.token_id, arr);
  }

  const results: TradeOutcomeResult[] = [];

  for (const [tokenId, tokenTrades] of byToken) {
    const sorted = tokenTrades.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const entry = sorted.find((t) => t.side === 'BUY');
    const exit = sorted.find((t) => t.side === 'SELL');

    if (!entry) continue;

    // Fetch token and snapshots to determine post-exit performance
    const { data: tokenData } = await supabase
      .from('tokens')
      .select('*')
      .eq('id', tokenId)
      .maybeSingle();
    const token = tokenData as Token;
    if (!token) continue;

    const snapshots = await fetchMarketSnapshots(tokenId);
    const sortedSnaps = [...snapshots].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let peakAfterExit: number | null = null;
    let lowestAfterExit: number | null = null;

    if (exit) {
      const exitTs = new Date(exit.timestamp).getTime();
      const afterExit = sortedSnaps.filter((s) => new Date(s.timestamp).getTime() > exitTs);
      if (afterExit.length > 0) {
        peakAfterExit = Math.max(...afterExit.map((s) => s.market_cap));
        lowestAfterExit = Math.min(...afterExit.map((s) => s.market_cap));
      }
    }

    const outcome = classifyOutcome(entry, exit, peakAfterExit, lowestAfterExit);
    const evidence = buildEvidence(entry, exit, peakAfterExit, lowestAfterExit, outcome);

    results.push({
      token,
      entryTimestamp: entry.timestamp,
      entryMarketCap: entry.market_cap,
      exitTimestamp: exit?.timestamp ?? null,
      exitMarketCap: exit?.market_cap ?? null,
      peakAfterExit,
      lowestAfterExit,
      outcome,
      evidence,
    });
  }

  return results.sort((a, b) => new Date(b.entryTimestamp).getTime() - new Date(a.entryTimestamp).getTime());
}

function classifyOutcome(
  entry: UserTrade,
  exit: UserTrade | undefined,
  peakAfterExit: number | null,
  lowestAfterExit: number | null,
): TradeOutcome {
  if (!exit) return 'STILL_HOLDING';

  if (peakAfterExit === null || lowestAfterExit === null) return 'UNKNOWN';

  const exitMC = exit.market_cap;
  const peakRatio = peakAfterExit / exitMC;
  const lowRatio = lowestAfterExit / exitMC;

  // Token pumped significantly after exit => early exit
  if (peakRatio > 2) return 'EARLY_EXIT';
  // Token collapsed severely after exit => exited before failure
  if (lowRatio < 0.3) return 'EXIT_BEFORE_SEVERE_FAILURE';
  // Exit was near peak => good exit
  if (exitMC >= entry.market_cap && peakRatio < 1.5) return 'GOOD_EXIT';

  return 'UNKNOWN';
}

function buildEvidence(
  entry: UserTrade,
  exit: UserTrade | undefined,
  peakAfterExit: number | null,
  lowestAfterExit: number | null,
  outcome: TradeOutcome,
): string[] {
  const ev: string[] = [];
  ev.push(`Entered at $${(entry.market_cap / 1000).toFixed(0)}K MC`);
  if (exit) {
    ev.push(`Exited at $${(exit.market_cap / 1000).toFixed(0)}K MC`);
  }
  if (peakAfterExit !== null) {
    ev.push(`Token later reached $${(peakAfterExit / 1000).toFixed(0)}K MC`);
  }
  if (lowestAfterExit !== null) {
    ev.push(`Token later dropped to $${(lowestAfterExit / 1000).toFixed(0)}K MC`);
  }
  switch (outcome) {
    case 'EARLY_EXIT':
      ev.push('Position was closed before a significant upward move');
      break;
    case 'EXIT_BEFORE_SEVERE_FAILURE':
      ev.push('Position was closed before the token collapsed');
      break;
    case 'GOOD_EXIT':
      ev.push('Exit was near or after the token peak');
      break;
    case 'STILL_HOLDING':
      ev.push('No sell recorded — position still open');
      break;
    default:
      ev.push('Outcome could not be confidently classified');
  }
  return ev;
}
