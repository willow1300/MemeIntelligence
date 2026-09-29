import { useState, useEffect } from 'react';
import { Tags, ArrowRight } from 'lucide-react';
import { fetchAllMetas, fetchTokensByMeta, fetchLifecycle } from '@/lib/data-access';
import { supabase } from '@/lib/supabase';
import { computeAllMetaPerformance } from '@/intelligence/meta';
import type { Meta, MetaPerformance, TokenLifecycle, Token } from '@/types';
import { Loading, ErrorState, Disclaimer } from '@/components/ui';
import { formatMarketCap, formatMinutes, formatPercent } from '@/lib/format';

export function MetasPage({ onOpenToken }: { onOpenToken: (addr: string) => void }) {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [performances, setPerformances] = useState<MetaPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<string | null>(null);
  const [metaTokens, setMetaTokens] = useState<Array<{ token: Token; lifecycle: TokenLifecycle | null }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const m = await fetchAllMetas();
        setMetas(m);
        const perfs = await computeAllMetaPerformance();
        setPerformances(perfs);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load metas');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const viewMetaTokens = async (metaId: string) => {
    if (selectedMeta === metaId) { setSelectedMeta(null); return; }
    setSelectedMeta(metaId);
    setMetaTokens([]);
    const tokenIds = await fetchTokensByMeta(metaId);
    const results: Array<{ token: Token; lifecycle: TokenLifecycle | null }> = [];
    for (const tid of tokenIds) {
      const { data } = await supabase.from('tokens').select('*').eq('id', tid).maybeSingle();
      if (data) {
        const lc = await fetchLifecycle(tid);
        results.push({ token: data as Token, lifecycle: lc });
      }
    }
    setMetaTokens(results.sort((a, b) => (b.lifecycle?.peak_market_cap ?? 0) - (a.lifecycle?.peak_market_cap ?? 0)));
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  // Build tree: roots have no parent
  const roots = metas.filter((m) => !m.parent_id);
  const childrenOf = (parentId: string) => metas.filter((m) => m.parent_id === parentId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Metas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hierarchical meme/narrative taxonomy with historical performance per meta.
        </p>
      </div>

      {/* Tree */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Tags className="h-4 w-4 text-emerald-400" />
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">Taxonomy</h2>
        </div>
        <div className="space-y-1">
          {roots.map((root) => (
            <div key={root.id}>
              <div className="flex items-center gap-2 py-1">
                <span className="text-sm font-semibold text-slate-200">{root.name}</span>
                <span className="badge badge-slate">{root.type}</span>
              </div>
              <div className="ml-4 space-y-0.5 border-l border-slate-800 pl-3">
                {childrenOf(root.id).map((child) => {
                  const perf = performances.find((p) => p.meta.id === child.id);
                  return (
                    <div key={child.id}>
                      <button
                        onClick={() => perf && viewMetaTokens(child.id)}
                        className="card-hover flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
                      >
                        <span className="text-sm text-slate-400">{child.name}</span>
                        {perf && (
                          <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                            <span>{perf.launchCount} launches</span>
                            <span>Median: {formatMarketCap(perf.medianPeakMarketCap)}</span>
                            <span className={perf.successRate > 0.3 ? 'text-emerald-400' : 'text-slate-500'}>
                              {formatPercent(perf.successRate)} success
                            </span>
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                      {selectedMeta === child.id && metaTokens.length > 0 && (
                        <div className="ml-2 mt-1 mb-2 space-y-1 animate-fade-in">
                          {metaTokens.map(({ token, lifecycle }) => (
                            <button
                              key={token.id}
                              onClick={() => onOpenToken(token.address)}
                              className="card-hover flex w-full items-center gap-2 rounded border border-slate-800 px-3 py-2 text-left"
                            >
                              <span className="text-sm font-medium text-emerald-400">${token.symbol}</span>
                              <span className="text-xs text-slate-500 truncate">{token.name}</span>
                              <span className="ml-auto text-xs text-slate-400">
                                Peak: {formatMarketCap(lifecycle?.peak_market_cap)}
                              </span>
                              {lifecycle && (
                                <span className={`badge ${lifecycle.failure_type === 'HEALTHY' ? 'badge-emerald' : 'badge-slate'}`}>
                                  {lifecycle.failure_type.replace(/_/g, ' ').toLowerCase()}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance table */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-2 label-mono">Meta Performance</div>
        <div className="grid grid-cols-12 gap-2 border-b border-slate-800 px-4 py-2 label-mono">
          <div className="col-span-2">Meta</div>
          <div className="col-span-1 text-right">Launches</div>
          <div className="col-span-2 text-right">Median Peak</div>
          <div className="col-span-2 text-right">Avg Peak</div>
          <div className="col-span-2 text-right">Highest</div>
          <div className="col-span-1 text-right">TTP</div>
          <div className="col-span-2 text-right">Success Rate</div>
        </div>
        <div className="divide-y divide-slate-800/50">
          {performances.map((mp) => (
            <div key={mp.meta.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm">
              <div className="col-span-2 text-slate-300">{mp.meta.name}</div>
              <div className="col-span-1 text-right text-slate-400">{mp.launchCount}</div>
              <div className="col-span-2 text-right text-slate-400">{formatMarketCap(mp.medianPeakMarketCap)}</div>
              <div className="col-span-2 text-right text-slate-400">{formatMarketCap(mp.averagePeakMarketCap)}</div>
              <div className="col-span-2 text-right text-slate-300">{formatMarketCap(mp.highestPeakMarketCap)}</div>
              <div className="col-span-1 text-right text-slate-500">{formatMinutes(mp.medianTimeToPeakMinutes)}</div>
              <div className={`col-span-2 text-right ${mp.successRate > 0.3 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {formatPercent(mp.successRate)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Disclaimer>Historical observations, not predictions. Past meta performance does not guarantee future results.</Disclaimer>
    </div>
  );
}
