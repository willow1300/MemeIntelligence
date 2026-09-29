// Scoring Engine — Explainable Research Signal
//
// V1 does NOT create a "buy score." Instead it composes an explainable
// research signal from multiple components, each with a label, score,
// confidence, and evidence. The overall label is "RESEARCH_INTEREST_*"
// — never a recommendation.

import type { ResearchSignal, Token, TokenLifecycle, WalletProfile, DeveloperStats, SimilarToken, MetaPerformance } from '@/types';

interface ScoringInputs {
  token: Token;
  lifecycle: TokenLifecycle | null;
  walletProfile: WalletProfile | null;
  developerStats: DeveloperStats | null;
  similarTokens: SimilarToken[];
  metaPerformances: MetaPerformance[];
}

function scoreToLabel(score: number): string {
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  if (score >= 0.3) return 'LOW';
  return 'VERY LOW';
}

function concernLabel(score: number): string {
  if (score >= 0.7) return 'LOW CONCERN';
  if (score >= 0.5) return 'MEDIUM';
  if (score >= 0.3) return 'CONCERN';
  return 'HIGH CONCERN';
}

export function buildResearchSignal(inputs: ScoringInputs): ResearchSignal {
  const { lifecycle, walletProfile, developerStats, similarTokens, metaPerformances } = inputs;
  const components: ResearchSignal['components'] = [];

  // 1. Historical similarity
  const highSimilarity = similarTokens.filter((s) => s.similarity.overall_score >= 0.7).length;
  const simScore = Math.min(1, similarTokens.length > 0 ? similarTokens[0].similarity.overall_score : 0);
  components.push({
    label: 'Historical similarity',
    value: similarTokens.length === 0 ? 'NONE FOUND' : `${scoreToLabel(simScore)} (${similarTokens.length} matches, ${highSimilarity} high)`,
    score: simScore,
    confidence: 0.8,
    evidence: similarTokens.slice(0, 3).map((s) =>
      `${s.token.symbol} — ${s.timeDifferenceLabel}, ${(s.similarity.overall_score * 100).toFixed(0)}% match, peak ${s.peakMarketCap >= 1000 ? '$' + (s.peakMarketCap / 1000).toFixed(0) + 'K' : '$' + s.peakMarketCap}`,
    ),
  });

  // 2. Developer history
  let devScore = 0.3;
  let devEvidence: string[] = ['No developer profile available'];
  if (developerStats) {
    const successRate = developerStats.launchCount > 0
      ? developerStats.successfulLaunches / developerStats.launchCount
      : 0;
    devScore = Math.min(1, 0.4 * successRate + 0.3 * Math.min(1, developerStats.launchCount / 10));
    devEvidence = [
      `${developerStats.launchCount} launches observed`,
      `${developerStats.successfulLaunches} strong, ${developerStats.failedLaunches} failed, ${developerStats.unknownOutcomes} unknown`,
      `Median peak MC: $${(developerStats.medianPeakMarketCap / 1000).toFixed(0)}K`,
    ];
  }
  components.push({
    label: 'Developer history',
    value: developerStats ? `${scoreToLabel(devScore)} (${developerStats.developer.name})` : 'UNKNOWN',
    score: devScore,
    confidence: developerStats ? 0.7 : 0.2,
    evidence: devEvidence,
  });

  // 3. Wallet age
  let walletScore = 0.5;
  let walletValue = 'UNKNOWN';
  let walletEvidence: string[] = ['Wallet age not available'];
  if (walletProfile) {
    if (walletProfile.isFreshWallet) {
      walletScore = 0.1;
      walletValue = 'NEW (seconds before launch)';
      walletEvidence = ['Wallet first observed seconds before launch', 'No prior on-chain history'];
    } else if (walletProfile.wallet.first_seen_at) {
      const ageDays = (Date.now() - new Date(walletProfile.wallet.first_seen_at).getTime()) / 86_400_000;
      if (ageDays > 180) {
        walletScore = 0.7;
        walletValue = 'OLD';
        walletEvidence = [`First observed ${Math.floor(ageDays / 365)} year(s) ago`, `${walletProfile.transactionCount} transactions observed`];
      } else if (ageDays > 30) {
        walletScore = 0.5;
        walletValue = 'ESTABLISHED';
        walletEvidence = [`First observed ${Math.floor(ageDays)} days ago`, `${walletProfile.transactionCount} transactions observed`];
      } else {
        walletScore = 0.25;
        walletValue = 'NEW';
        walletEvidence = [`First observed ${Math.floor(ageDays)} days ago`, 'Limited history'];
      }
    }
  }
  components.push({
    label: 'Wallet history',
    value: concernLabel(walletScore).replace('CONCERN', walletValue.includes('NEW') ? 'CONCERN' : 'CONFIDENCE'),
    score: walletScore,
    confidence: walletProfile ? 0.75 : 0.2,
    evidence: walletEvidence,
  });

  // 4. Meta history
  const relevantMetas = metaPerformances.filter((mp) => mp.launchCount > 0);
  const metaScore = relevantMetas.length > 0
    ? Math.min(1, average(relevantMetas.map((m) => m.successRate)) * 0.7 + 0.3)
    : 0.4;
  components.push({
    label: 'Meta history',
    value: relevantMetas.length > 0 ? scoreToLabel(metaScore) : 'INSUFFICIENT DATA',
    score: metaScore,
    confidence: 0.6,
    evidence: relevantMetas.slice(0, 3).map((m) =>
      `${m.meta.name}: ${m.launchCount} launches, ${(m.successRate * 100).toFixed(0)}% success, median peak $${(m.medianPeakMarketCap / 1000).toFixed(0)}K`,
    ),
  });

  // 5. Liquidity (from lifecycle as proxy)
  const liqScore = lifecycle ? (lifecycle.failure_type === 'LIQUIDITY_EVENT' ? 0.15 : 0.55) : 0.4;
  components.push({
    label: 'Liquidity',
    value: lifecycle?.failure_type === 'LIQUIDITY_EVENT' ? 'HIGH RISK' : scoreToLabel(liqScore),
    score: liqScore,
    confidence: 0.65,
    evidence: lifecycle?.failure_type === 'LIQUIDITY_EVENT'
      ? ['Previous liquidity-event observed for this token', 'Liquidity dropped sharply']
      : ['No liquidity events detected'],
  });

  // 6. Momentum / lifecycle
  const momScore = lifecycle
    ? lifecycle.failure_type === 'HEALTHY' ? 0.8 : lifecycle.failure_type === 'MOMENTUM_EXHAUSTION' ? 0.3 : 0.4
    : 0.4;
  components.push({
    label: 'Momentum',
    value: lifecycle ? (lifecycle.failure_type === 'HEALTHY' ? 'STRONG' : lifecycle.failure_type === 'MOMENTUM_EXHAUSTION' ? 'WEAK' : 'MEDIUM') : 'UNKNOWN',
    score: momScore,
    confidence: lifecycle?.confidence ?? 0.3,
    evidence: lifecycle?.evidence?.slice(0, 2) ?? ['No lifecycle data'],
  });

  const overallScore = average(components.map((c) => c.score));
  let overall: string;
  if (overallScore >= 0.65) overall = 'RESEARCH_INTEREST_HIGH';
  else if (overallScore >= 0.45) overall = 'RESEARCH_INTEREST_MEDIUM';
  else overall = 'RESEARCH_INTEREST_LOW';

  return { components, overall, overallScore };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
