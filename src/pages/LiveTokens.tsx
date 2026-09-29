import { useState, useEffect, useMemo } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { fetchTokens, fetchLifecycle } from '@/lib/data-access';
import type { Token, TokenLifecycle } from '@/types';
import { Loading, ErrorState, TokenImage, FailureTypeBadge } from '@/components/ui';
import { formatMarketCap, formatTimeAgo } from '@/lib/format';

type Filter = 'ALL' | 'ACTIVE' | 'DEAD' | 'HEALTHY' | 'FAILED';

export function LiveTokensPage({ onOpenToken }: { onOpenToken: (addr: string) => void }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [lifecycles, setLifecycles] = useState<Map<string, TokenLifecycle>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  useEffect(() => {
    (async () => {
      try {
        const toks = await fetchTokens();
        setTokens(toks);
        const lcMap = new Map<string, TokenLifecycle>();
        for (const t of toks) {
          const lc = await fetchLifecycle(t.id);
          if (lc) lcMap.set(t.id, lc);
        }
        setLifecycles(lcMap);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load tokens');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = tokens;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q),
      );
    }
    if (filter === 'ACTIVE') result = result.filter((t) => t.status === 'ACTIVE');
    else if (filter === 'DEAD') result = result.filter((t) => t.status === 'DEAD');
    else if (filter === 'HEALTHY') result = result.filter((t) => lifecycles.get(t.id)?.failure_type === 'HEALTHY');
    else if (filter === 'FAILED') {
      result = result.filter((t) => {
        const ft = lifecycles.get(t.id)?.failure_type;
        return ft && ft !== 'HEALTHY' && ft !== 'UNKNOWN';
      });
    }
    return [...result].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
  }, [tokens, search, filter, lifecycles]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const filters: Filter[] = ['ALL', 'ACTIVE', 'DEAD', 'HEALTHY', 'FAILED'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Live Tokens</h1>
        <p className="mt-1 text-sm text-slate-500">All tracked tokens across all platforms and developers.</p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ticker, name, or address..."
            className="w-full rounded-md border border-slate-800 bg-slate-900/50 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:border-emerald-500/30 focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Token list */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 gap-4 border-b border-slate-800 px-4 py-2 label-mono">
          <div className="col-span-4">Token</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Peak MC</div>
          <div className="col-span-2">Lifecycle</div>
          <div className="col-span-1">Launched</div>
          <div className="col-span-1"></div>
        </div>
        <div className="divide-y divide-slate-800/50">
          {filtered.map((token) => {
            const lc = lifecycles.get(token.id);
            return (
              <button
                key={token.id}
                onClick={() => onOpenToken(token.address)}
                className="card-hover grid w-full grid-cols-12 items-center gap-4 px-4 py-3 text-left"
              >
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <TokenImage src={token.image_url} alt={token.symbol} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-200">${token.symbol}</div>
                    <div className="text-xs text-slate-500 truncate">{token.name}</div>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className={`badge ${token.status === 'ACTIVE' ? 'badge-emerald' : token.status === 'DEAD' ? 'badge-slate' : 'badge-amber'}`}>
                    {token.status}
                  </span>
                </div>
                <div className="col-span-2 text-right text-sm text-slate-300">
                  {formatMarketCap(lc?.peak_market_cap)}
                </div>
                <div className="col-span-2">
                  {lc && <FailureTypeBadge type={lc.failure_type} />}
                </div>
                <div className="col-span-1 text-xs text-slate-500">
                  {formatTimeAgo(token.created_at)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <ArrowRight className="h-4 w-4 text-slate-600" />
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-600">No tokens match your search.</div>
        )}
      </div>
    </div>
  );
}
