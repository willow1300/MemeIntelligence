import { useState, useEffect } from 'react';
import { GitCompare, ArrowRight } from 'lucide-react';
import { fetchTokens, fetchSimilaritiesForToken, fetchLifecycle, fetchMetasForToken } from '@/lib/data-access';
import { supabase } from '@/lib/supabase';
import type { Token, TokenSimilarity, TokenLifecycle, Meta } from '@/types';
import { Loading, ErrorState, TokenImage, FailureTypeBadge } from '@/components/ui';
import { formatMarketCap } from '@/lib/format';

export function SimilarityPage({ onOpenToken }: { onOpenToken: (addr: string) => void }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [similarities, setSimilarities] = useState<Array<{
    sim: TokenSimilarity;
    otherToken: Token;
    lifecycle: TokenLifecycle | null;
    metas: Meta[];
    cameFirst: boolean;
    timeLabel: string;
  }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const t = await fetchTokens();
        setTokens(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadSimilarities = async (tokenId: string) => {
    setSelectedToken(tokenId);
    setSimilarities([]);
    const sims = await fetchSimilaritiesForToken(tokenId);
    const results = [];
    for (const sim of sims) {
      const otherId = sim.token_a_id === tokenId ? sim.token_b_id : sim.token_a_id;
      const { data } = await supabase.from('tokens').select('*').eq('id', otherId).maybeSingle();
      if (!data) continue;
      const [lc, metas] = await Promise.all([fetchLifecycle(otherId), fetchMetasForToken(otherId)]);
      const currentIsA = sim.token_a_id === tokenId;
      const otherMinusCurrent = currentIsA ? sim.time_difference_seconds : -sim.time_difference_seconds;
      const cameFirst = otherMinusCurrent < 0;
      const abs = Math.abs(otherMinusCurrent);
      const label = abs < 3600 ? `${Math.round(abs / 60)}m` : abs < 86400 ? `${Math.floor(abs / 3600)}h` : `${Math.floor(abs / 86400)}d`;
      const timeLabel = cameFirst ? `${label} earlier` : `${label} later`;
      results.push({ sim, otherToken: data as Token, lifecycle: lc, metas, cameFirst, timeLabel });
    }
    results.sort((a, b) => b.sim.overall_score - a.sim.overall_score);
    setSimilarities(results);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Similarity</h1>
        <p className="mt-1 text-sm text-slate-500">
          Token similarity engine — compares tickers, names, images, narratives, and metadata across historical tokens.
        </p>
      </div>

      {/* Token selector */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-emerald-400" />
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">Select Token</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {tokens.slice(0, 20).map((t) => (
            <button
              key={t.id}
              onClick={() => loadSimilarities(t.id)}
              className={`card-hover flex items-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors ${
                selectedToken === t.id ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <TokenImage src={t.image_url} alt={t.symbol} size="sm" />
              <span className="font-medium">${t.symbol}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {selectedToken && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-2 label-mono">
            Similar Tokens ({similarities.length} matches)
          </div>
          {similarities.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-600">No similar tokens found for this token.</div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {similarities.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onOpenToken(s.otherToken.address)}
                  className="card-hover flex w-full items-center gap-4 px-4 py-3 text-left"
                >
                  <span className="label-mono">#{i + 1}</span>
                  <TokenImage src={s.otherToken.image_url} alt={s.otherToken.symbol} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200">${s.otherToken.symbol}</div>
                    <div className="text-xs text-slate-500 truncate">{s.otherToken.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="label-mono">Similarity</div>
                    <div className="text-sm font-semibold text-slate-200">{(s.sim.overall_score * 100).toFixed(0)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="label-mono">Created</div>
                    <div className={`text-sm ${s.cameFirst ? 'text-amber-400' : 'text-emerald-400'}`}>{s.timeLabel}</div>
                  </div>
                  <div className="text-right">
                    <div className="label-mono">Peak MC</div>
                    <div className="text-sm text-slate-300">{formatMarketCap(s.lifecycle?.peak_market_cap)}</div>
                  </div>
                  <span className={`badge ${s.sim.relationship_type === 'POSSIBLE_COPY' ? 'badge-rose' : s.sim.relationship_type === 'POSSIBLE_DERIVATIVE' ? 'badge-amber' : 'badge-slate'}`}>
                    {s.sim.relationship_type.replace(/_/g, ' ')}
                  </span>
                  {s.lifecycle && <FailureTypeBadge type={s.lifecycle.failure_type} />}
                  <ArrowRight className="h-4 w-4 text-slate-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
