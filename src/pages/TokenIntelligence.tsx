import { useState, useEffect } from 'react';
import { Brain, Search } from 'lucide-react';
import type {
  Token, TokenMetadata, TokenLifecycle, Wallet, Developer, DeveloperStats,
  SimilarToken, MetaPerformance, MarketSnapshot, Meta, ResearchSignal, WalletProfile,
} from '@/types';
import {
  fetchTokenByAddress, fetchTokenMetadata, fetchLifecycle, fetchWalletById,
  fetchDeveloperByWallet, fetchMarketSnapshots, fetchMetasForToken,
} from '@/lib/data-access';
import { profileWallet } from '@/intelligence/wallet';
import { profileDeveloper } from '@/intelligence/developer';
import { findSimilarTokens } from '@/intelligence/similarity';
import { computeMetaPerformance } from '@/intelligence/meta';
import { analyzeLifecycle, getMomentumLabel } from '@/intelligence/lifecycle';
import { buildResearchSignal } from '@/intelligence/scoring';
import {
  Loading, ErrorState, TokenImage, Collapsible, EvidenceBlock, SignalPill,
  FailureTypeBadge, StatCard, Disclaimer,
} from '@/components/ui';
import {
  formatMarketCap, formatTimeAgo, formatTimestamp, formatMinutes, formatPercent,
  shortAddress, confidenceLabel,
} from '@/lib/format';

export function TokenIntelligencePage({
  address,
  onOpenToken,
}: {
  address: string | null;
  onOpenToken: (addr: string) => void;
}) {
  const [searchAddr, setSearchAddr] = useState(address ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TokenAnalysisData | null>(null);

  useEffect(() => {
    if (address) {
      setSearchAddr(address);
      loadAnalysis(address);
    }
  }, [address]);

  const loadAnalysis = async (addr: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const token = await fetchTokenByAddress(addr);
      if (!token) {
        setError(`Token not found: ${addr}`);
        setLoading(false);
        return;
      }
      const [metadata, lifecycle, wallet, snapshots, tokenMetas] = await Promise.all([
        fetchTokenMetadata(token.id),
        fetchLifecycle(token.id),
        token.creator_wallet_id ? fetchWalletById(token.creator_wallet_id) : Promise.resolve(null),
        fetchMarketSnapshots(token.id),
        fetchMetasForToken(token.id),
      ]);

      let developer: Developer | null = null;
      let walletProfile: WalletProfile | null = null;
      if (wallet) {
        developer = await fetchDeveloperByWallet(wallet.id);
        walletProfile = await profileWallet(wallet, token.created_at ?? undefined);
      }

      let developerStats: DeveloperStats | null = null;
      if (developer) {
        developerStats = await profileDeveloper(developer.id);
        if (developerStats) {
          developerStats.developer = developer;
        }
      }

      const similarTokens = await findSimilarTokens(token);

      // Meta performance for the token's metas
      const metaPerformances: MetaPerformance[] = [];
      for (const meta of tokenMetas) {
        const perf = await computeMetaPerformance(meta.id, meta);
        metaPerformances.push(perf);
      }

      const lifecycleAnalysis = await analyzeLifecycle(token.id);
      const momentum = getMomentumLabel(snapshots);

      const researchSignal = buildResearchSignal({
        token,
        lifecycle,
        walletProfile,
        developerStats,
        similarTokens,
        metaPerformances,
      });

      setData({
        token, metadata, lifecycle, wallet, developer, walletProfile, developerStats,
        similarTokens, metaPerformances, tokenMetas, snapshots, lifecycleAnalysis,
        momentum, researchSignal,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Token Intelligence</h1>
        <p className="mt-1 text-sm text-slate-500">
          Deep analysis of a token's history, developer, similarity, meta, and lifecycle.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={searchAddr}
            onChange={(e) => setSearchAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchAddr && loadAnalysis(searchAddr)}
            placeholder="Enter token address (e.g. LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001)"
            className="w-full rounded-md border border-slate-800 bg-slate-900/50 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:border-emerald-500/30 focus:outline-none"
          />
        </div>
        <button
          onClick={() => searchAddr && loadAnalysis(searchAddr)}
          className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          Analyze
        </button>
      </div>

      {loading && <Loading label="Running intelligence engines..." />}
      {error && <ErrorState message={error} />}
      {!loading && !error && !data && (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-600">
          <Brain className="h-8 w-8 mb-3 text-slate-700" />
          <p className="text-sm">Enter a token address above to begin analysis.</p>
          <p className="text-xs mt-1 text-slate-700">
            Try: <button onClick={() => loadAnalysis('LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001')} className="text-emerald-500 hover:underline">LOUIEhero...001</button>
          </p>
        </div>
      )}

      {data && <AnalysisResult data={data} onOpenToken={onOpenToken} />}
    </div>
  );
}

interface TokenAnalysisData {
  token: Token;
  metadata: TokenMetadata | null;
  lifecycle: TokenLifecycle | null;
  wallet: Wallet | null;
  developer: Developer | null;
  walletProfile: WalletProfile | null;
  developerStats: DeveloperStats | null;
  similarTokens: SimilarToken[];
  metaPerformances: MetaPerformance[];
  tokenMetas: Meta[];
  snapshots: MarketSnapshot[];
  lifecycleAnalysis: ReturnType<typeof analyzeLifecycle> extends Promise<infer T> ? T : never;
  momentum: { label: string; volumeChange: number };
  researchSignal: ResearchSignal;
}

function AnalysisResult({ data, onOpenToken }: { data: TokenAnalysisData; onOpenToken: (addr: string) => void }) {
  const { token, metadata, lifecycle, wallet, walletProfile, developerStats, similarTokens, metaPerformances, tokenMetas, snapshots, lifecycleAnalysis, momentum, researchSignal } = data;
  const latestSnap = snapshots[snapshots.length - 1];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Token header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <TokenImage src={token.image_url} alt={token.symbol} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-100">${token.symbol}</h2>
              <span className="text-sm text-slate-500">{token.name}</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{metadata?.description ?? 'No description available'}</p>
            <div className="mt-2 text-xs text-slate-600">
              Address: <span className="font-mono text-slate-500">{token.address}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeaderStat label="Current MC" value={formatMarketCap(latestSnap?.market_cap)} />
            <HeaderStat label="Peak MC" value={formatMarketCap(lifecycle?.peak_market_cap)} />
            <HeaderStat label="Liquidity" value={formatMarketCap(latestSnap?.liquidity)} />
            <HeaderStat label="Volume" value={formatMarketCap(latestSnap?.volume)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Launched: {formatTimestamp(token.created_at)}</span>
          <span>·</span>
          <span>{formatTimeAgo(token.created_at)}</span>
          <span>·</span>
          <span>Status: <span className={token.status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-400'}>{token.status}</span></span>
          {wallet && (
            <>
              <span>·</span>
              <span>Creator: <span className="font-mono text-slate-400">{shortAddress(wallet.address)}</span></span>
            </>
          )}
        </div>
      </div>

      {/* Research Summary */}
      <Collapsible title="Research Summary" badge={<span className={`badge ${researchSignal.overall.includes('HIGH') ? 'badge-emerald' : researchSignal.overall.includes('MEDIUM') ? 'badge-amber' : 'badge-rose'}`}>{researchSignal.overall.replace(/_/g, ' ')}</span>} defaultOpen>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {researchSignal.components.map((c, i) => (
              <SignalPill key={i} label={c.label} value={c.value} />
            ))}
          </div>
          <Disclaimer>
            This is an explainable research signal, NOT a recommendation to buy or sell. Each component is derived from historical observations with associated confidence levels.
          </Disclaimer>
          <div className="mt-3 space-y-3">
            {researchSignal.components.map((c, i) => (
              <div key={i} className="rounded border border-slate-800 bg-slate-900/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-300">{c.label}</span>
                  <span className="text-xs text-slate-500">Confidence: {confidenceLabel(c.confidence)}</span>
                </div>
                <EvidenceBlock evidence={c.evidence} />
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* Similar Tokens */}
      <Collapsible title="Similar Tokens" badge={similarTokens.length > 0 ? <span className="badge badge-slate">{similarTokens.length} found</span> : undefined} defaultOpen>
        {similarTokens.length === 0 ? (
          <p className="text-sm text-slate-500">No similar tokens found in the historical dataset.</p>
        ) : (
          <div className="space-y-2">
            {similarTokens.slice(0, 10).map((sim, i) => (
              <div key={i} className="rounded border border-slate-800 bg-slate-900/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="label-mono">#{i + 1}</span>
                    <TokenImage src={sim.token.image_url} alt={sim.token.symbol} size="sm" />
                    <div>
                      <button onClick={() => onOpenToken(sim.token.address)} className="text-sm font-semibold text-emerald-400 hover:underline">
                        ${sim.token.symbol}
                      </button>
                      <div className="text-xs text-slate-500">{sim.token.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="label-mono">Similarity</div>
                      <div className="text-sm font-semibold text-slate-200">{(sim.similarity.overall_score * 100).toFixed(0)}%</div>
                    </div>
                    <div className="text-right">
                      <div className="label-mono">Created</div>
                      <div className={`text-sm ${sim.cameFirst ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {sim.timeDifferenceLabel}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="label-mono">Peak MC</div>
                      <div className="text-sm text-slate-300">{formatMarketCap(sim.peakMarketCap)}</div>
                    </div>
                    {sim.lifecycle && <FailureTypeBadge type={sim.lifecycle.failure_type} />}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`badge ${sim.similarity.relationship_type === 'POSSIBLE_COPY' ? 'badge-rose' : sim.similarity.relationship_type === 'POSSIBLE_DERIVATIVE' ? 'badge-amber' : 'badge-slate'}`}>
                    {sim.similarity.relationship_type.replace(/_/g, ' ')}
                  </span>
                  {sim.metas.slice(0, 3).map((m, j) => (
                    <span key={j} className="badge badge-slate">{m.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* Developer History */}
      {developerStats && (
        <Collapsible title="Developer History" badge={<span className="badge badge-slate">{developerStats.developer.name}</span>} defaultOpen>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Launches" value={developerStats.launchCount} />
              <StatCard label="Highest Peak MC" value={formatMarketCap(developerStats.highestPeakMarketCap)} />
              <StatCard label="Median Peak MC" value={formatMarketCap(developerStats.medianPeakMarketCap)} />
              <StatCard label="Avg Peak MC" value={formatMarketCap(developerStats.averagePeakMarketCap)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Strong Performers" value={developerStats.successfulLaunches} accent="emerald" />
              <StatCard label="Failed Launches" value={developerStats.failedLaunches} accent="rose" />
              <StatCard label="Unknown" value={developerStats.unknownOutcomes} accent="slate" />
            </div>
            <div className="space-y-1">
              <div className="label-mono mb-2">Previous Launches</div>
              {developerStats.launches.slice(0, 10).map((dl, i) => (
                <div key={i} className="card-hover flex items-center gap-3 rounded border border-slate-800 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => onOpenToken(dl.tokenAddress)} className="text-sm text-emerald-400 hover:underline">
                      {dl.tokenAddress.slice(0, 20)}...
                    </button>
                    <div className="text-xs text-slate-500">{formatTimestamp(dl.launchTime)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Peak</div>
                    <div className="text-sm text-slate-300">{formatMarketCap(dl.peakMarketCap)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">TTP</div>
                    <div className="text-sm text-slate-400">{formatMinutes(dl.timeToPeakMinutes)}</div>
                  </div>
                  <FailureTypeBadge type={dl.failureType} />
                </div>
              ))}
            </div>
            <Disclaimer>
              These are historical observations. They do not predict future performance of any launch.
            </Disclaimer>
          </div>
        </Collapsible>
      )}

      {/* Wallet Profile */}
      {walletProfile && (
        <Collapsible title="Wallet Intelligence" badge={<span className={`badge ${walletProfile.isFreshWallet ? 'badge-rose' : 'badge-emerald'}`}>{walletProfile.isFreshWallet ? 'FRESH WALLET' : 'ESTABLISHED'}</span>}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="First Observed" value={walletProfile.firstObservedAge} sublabel="Not creation time" />
              <StatCard label="Transactions" value={walletProfile.transactionCount} />
              <StatCard label="Launches" value={walletProfile.launchCount} />
              <StatCard label="Wallet Type" value={walletProfile.wallet.wallet_type} />
            </div>
            {walletProfile.relationships.length > 0 && (
              <div>
                <div className="label-mono mb-2">Known Relationships</div>
                <div className="space-y-1">
                  {walletProfile.relationships.map((rel, i) => (
                    <div key={i} className="flex items-center gap-3 rounded border border-slate-800 bg-slate-900/30 px-3 py-2">
                      <span className="badge badge-slate">{rel.relationshipType}</span>
                      <span className="text-sm text-slate-300">{rel.developerName}</span>
                      <span className="text-xs text-slate-500">Confidence: {(rel.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Disclaimer>
              "First observed" means first seen by our system, not necessarily when the wallet was created. Do not assume wallet ownership without evidence.
            </Disclaimer>
          </div>
        </Collapsible>
      )}

      {/* Meta Performance */}
      {metaPerformances.length > 0 && (
        <Collapsible title="Meta Performance" badge={<span className="badge badge-slate">{tokenMetas.map(m => m.name).join(' / ')}</span>}>
          <div className="space-y-2">
            {metaPerformances.filter(mp => mp.launchCount > 0).map((mp, i) => (
              <div key={i} className="rounded border border-slate-800 bg-slate-900/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-200">{mp.meta.name}</span>
                  <span className="text-xs text-slate-500">{mp.launchCount} historical launches</span>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <MiniStat label="Median Peak MC" value={formatMarketCap(mp.medianPeakMarketCap)} />
                  <MiniStat label="Avg Peak MC" value={formatMarketCap(mp.averagePeakMarketCap)} />
                  <MiniStat label="Highest" value={formatMarketCap(mp.highestPeakMarketCap)} />
                  <MiniStat label="Success Rate" value={formatPercent(mp.successRate)} />
                </div>
              </div>
            ))}
            <Disclaimer>Historical observations, not predictions.</Disclaimer>
          </div>
        </Collapsible>
      )}

      {/* Lifecycle */}
      {lifecycleAnalysis && (
        <Collapsible title="Lifecycle" badge={<FailureTypeBadge type={lifecycleAnalysis.lifecycle.failure_type} />} defaultOpen>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Time to Peak" value={lifecycleAnalysis.timeToPeakMinutes ? formatMinutes(lifecycleAnalysis.timeToPeakMinutes) : '—'} />
              <StatCard label="Peak MC" value={formatMarketCap(lifecycleAnalysis.lifecycle.peak_market_cap)} />
              <StatCard label="Drawdown" value={formatPercent(lifecycleAnalysis.drawdownFromPeak)} accent={lifecycleAnalysis.drawdownFromPeak > 0.8 ? 'rose' : 'amber'} />
              <StatCard label="Momentum" value={momentum.label} accent={momentum.label === 'STRONG' ? 'emerald' : momentum.label === 'WEAK' ? 'rose' : 'amber'} />
            </div>
            <EvidenceBlock evidence={lifecycleAnalysis.lifecycle.evidence} confidence={lifecycleAnalysis.lifecycle.confidence} />
            {/* Mini chart */}
            {snapshots.length > 0 && <MiniChart snapshots={snapshots} />}
          </div>
        </Collapsible>
      )}

      {/* Evidence */}
      {lifecycle && (
        <Collapsible title="Evidence" defaultOpen>
          <div className="space-y-3">
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-200">Classification: {lifecycle.failure_type.replace(/_/g, ' ')}</span>
                <span className={`badge ${lifecycle.confidence >= 0.7 ? 'badge-emerald' : 'badge-amber'}`}>
                  {confidenceLabel(lifecycle.confidence)}
                </span>
              </div>
              <EvidenceBlock evidence={lifecycle.evidence} confidence={lifecycle.confidence} />
            </div>
            <Disclaimer>
              All classifications are analytical conclusions based on observable evidence. They do not constitute legal accusations or financial advice.
            </Disclaimer>
          </div>
        </Collapsible>
      )}
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="label-mono">{label}</div>
      <div className="text-sm font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-mono text-[10px]">{label}</div>
      <div className="text-sm text-slate-300">{value}</div>
    </div>
  );
}

function MiniChart({ snapshots }: { snapshots: MarketSnapshot[] }) {
  const sorted = [...snapshots].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const maxMC = Math.max(...sorted.map((s) => s.market_cap), 1);
  const points = sorted.map((s, i) => {
    const x = (i / (sorted.length - 1 || 1)) * 100;
    const y = 100 - (s.market_cap / maxMC) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="mt-3">
      <div className="label-mono mb-2">Market Cap History</div>
      <svg viewBox="0 0 100 100" className="h-32 w-full" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="rgb(52, 211, 153)"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
