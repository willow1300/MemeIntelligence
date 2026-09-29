// Similarity Engine
//
// Finds similar tokens for a given token using the pre-computed
// token_similarities table (V1 rule-based). For each candidate,
// resolves the token, lifecycle, metas, and determines "which came first".

import type { SimilarToken, Token } from '@/types';
import {
  fetchSimilaritiesForToken, fetchLifecycle, fetchMetasForToken,
} from '@/lib/data-access';
import { supabase } from '@/lib/supabase';

function formatTimeDifference(seconds: number, currentTokenCreatedFirst: boolean): string {
  const abs = Math.abs(seconds);
  let label: string;
  if (abs < 3600) label = `${Math.round(abs / 60)} minute${Math.round(abs / 60) !== 1 ? 's' : ''}`;
  else if (abs < 86400) label = `${Math.floor(abs / 3600)} hour${Math.floor(abs / 3600) !== 1 ? 's' : ''}`;
  else label = `${Math.floor(abs / 86400)} day${Math.floor(abs / 86400) !== 1 ? 's' : ''}`;

  return currentTokenCreatedFirst ? `${label} later` : `${label} earlier`;
}

export async function findSimilarTokens(currentToken: Token): Promise<SimilarToken[]> {
  const similarities = await fetchSimilaritiesForToken(currentToken.id);
  const results: SimilarToken[] = [];

  for (const sim of similarities) {
    const otherId = sim.token_a_id === currentToken.id ? sim.token_b_id : sim.token_a_id;
    // We need to fetch the other token. Since we don't have fetchTokenById,
    // we'll use the address from the similarity. But similarities store IDs.
    // Let's fetch all tokens and find by id — or better, add a lightweight query.
    // For now, use a direct supabase call.
    const { data: tokenData, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('id', otherId)
      .maybeSingle();
    if (error || !tokenData) continue;
    const otherToken = tokenData as Token;

    const [lifecycle, metas] = await Promise.all([
      fetchLifecycle(otherId),
      fetchMetasForToken(otherId),
    ]);

    // Determine which came first
    // time_difference_seconds is (b - a) in the DB.
    // If currentToken is token_a, positive means other (b) came later.
    // If currentToken is token_b, positive means current (b) came later, so other (a) came first.
    const currentIsA = sim.token_a_id === currentToken.id;
    const rawDiff = sim.time_difference_seconds;
    // signed diff: other - current
    const otherMinusCurrent = currentIsA ? rawDiff : -rawDiff;
    const cameFirst = otherMinusCurrent < 0; // other token was created before current
    const timeDifferenceLabel = formatTimeDifference(Math.abs(otherMinusCurrent), !cameFirst);

    results.push({
      similarity: sim,
      token: otherToken,
      lifecycle,
      metas,
      peakMarketCap: lifecycle?.peak_market_cap ?? 0,
      cameFirst,
      timeDifferenceLabel,
    });
  }

  // Sort by overall_score descending
  results.sort((a, b) => b.similarity.overall_score - a.similarity.overall_score);
  return results;
}
