import { useState, useEffect } from 'react';
import { Radio, TrendingUp, AlertTriangle, Users, Brain, ArrowRight } from 'lucide-react';
import { fetchTokens, fetchAllDevelopers, fetchLifecycle } from '@/lib/data-access';
import type { Token, Developer, TokenLifecycle } from '@/types';
import { Loading, ErrorState, StatCard, TokenImage, FailureTypeBadge } from '@/components/ui';
import { formatMarketCap, formatTimeAgo } from '@/lib/format';

export function OverviewPage({ onOpenToken }: { onOpenToken: (addr: string) => void }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [lifecycles, setLifecycles] = useState<Map<string, TokenLifecycle>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [toks, devs] = await Promise.all([fetchTokens(), fetchAllDevelopers()]);
        setTokens(toks);
        setDevelopers(devs);
        const lcMap = new Map<string, TokenLifecycle>();
        for (const t of toks) {
          const lc = await fetchLifecycle(t.id);
          if (lc) lcMap.set(t.id, lc);
        }
        setLifecycles(lcMap);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const activeTokens = tokens.filter((t) => t.status === 'ACTIVE');
  const deadTokens = tokens.filter((t) => t.status === 'DEAD');
  const healthyCount = Array.from(lifecycles.values()).filter((lc) => lc.failure_type === 'HEALTHY').length;
  const liquidityEvents = Array.from(lifecycles.values()).filter((lc) => lc.failure_type === 'LIQUIDITY_EVENT').length;
  const recentTokens = [...tokens].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  ).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Meme Intelligence Engine — analyzing newly launched tokens and their surrounding ecosystem.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tokens Tracked" value={tokens.length} sublabel={`${activeTokens.length} active · ${deadTokens.length} dead`} />
        <StatCard label="Developers" value={developers.length} sublabel={`${developers.reduce((s, d) => s + d.launch_count, 0)} total launches`} />
        <StatCard label="Healthy Launches" value={healthyCount} accent="emerald" sublabel="Strong performers" />
        <StatCard label="Liquidity Events" value={liquidityEvents} accent="rose" sublabel="Detected failures" />
      </div>

      {/* Recent tokens */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400" />
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">
            Recently Launched
          </h2>
        </div>
        <div className="space-y-1">
          {recentTokens.map((token) => {
            const lc = lifecycles.get(token.id);
            return (
              <button
                key={token.id}
                onClick={() => onOpenToken(token.address)}
                className="card-hover flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left"
              >
                <TokenImage src={token.image_url} alt={token.symbol} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">${token.symbol}</span>
                    <span className="text-xs text-slate-500 truncate">{token.name}</span>
                  </div>
                  <div className="text-xs text-slate-600">{formatTimeAgo(token.created_at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Peak MC</div>
                    <div className="text-sm font-medium text-slate-300">
                      {formatMarketCap(lc?.peak_market_cap)}
                    </div>
                  </div>
                  {lc && <FailureTypeBadge type={lc.failure_type} />}
                  <ArrowRight className="h-4 w-4 text-slate-600" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickLinkCard
          icon={Brain}
          title="Token Intelligence"
          desc="Deep analysis of any token with similarity, developer history, and lifecycle"
          onClick={() => onOpenToken('LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001')}
        />
        <QuickLinkCard
          icon={Users}
          title="Developer Profiles"
          desc={`${developers.length} developers with launch history and outcome analysis`}
          onClick={() => (window.location.hash = 'developers')}
        />
        <QuickLinkCard
          icon={AlertTriangle}
          title="Failure Analysis"
          desc={`${liquidityEvents} liquidity events detected across all tracked tokens`}
          onClick={() => (window.location.hash = 'similarity')}
        />
      </div>
    </div>
  );
}

function QuickLinkCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof TrendingUp;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card card-hover p-4 text-left"
    >
      <Icon className="h-5 w-5 text-emerald-400 mb-2" />
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{desc}</p>
    </button>
  );
}
