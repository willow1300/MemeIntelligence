import { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, MinusCircle } from 'lucide-react';
import { computeTradeOutcomes } from '@/intelligence/tradeOutcome';
import type { TradeOutcomeResult } from '@/types';
import { Loading, ErrorState, TokenImage, EvidenceBlock, Disclaimer } from '@/components/ui';
import { formatMarketCap, formatTimestamp } from '@/lib/format';

const OUTCOME_CONFIG = {
  EARLY_EXIT: { class: 'badge-amber', icon: ArrowUpRight, label: 'Early Exit' },
  EXIT_BEFORE_SEVERE_FAILURE: { class: 'badge-emerald', icon: ArrowDownRight, label: 'Exit Before Severe Failure' },
  GOOD_EXIT: { class: 'badge-emerald', icon: ArrowUpRight, label: 'Good Exit' },
  STILL_HOLDING: { class: 'badge-slate', icon: MinusCircle, label: 'Still Holding' },
  UNKNOWN: { class: 'badge-slate', icon: MinusCircle, label: 'Unknown' },
};

export function HistoryPage({ onOpenToken }: { onOpenToken: (addr: string) => void }) {
  const [outcomes, setOutcomes] = useState<TradeOutcomeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const o = await computeTradeOutcomes();
        setOutcomes(o);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load trade history');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loading label="Computing trade outcomes..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">History</h1>
        <p className="mt-1 text-sm text-slate-500">
          User trade history with outcome analysis — distinguishing early exits from tokens that later failed.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4">
          <div className="label-mono mb-1">Total Trades</div>
          <div className="text-xl font-semibold text-slate-100">{outcomes.length}</div>
        </div>
        <div className="card p-4">
          <div className="label-mono mb-1">Early Exits</div>
          <div className="text-xl font-semibold text-amber-400">
            {outcomes.filter((o) => o.outcome === 'EARLY_EXIT').length}
          </div>
        </div>
        <div className="card p-4">
          <div className="label-mono mb-1">Exit Before Failure</div>
          <div className="text-xl font-semibold text-emerald-400">
            {outcomes.filter((o) => o.outcome === 'EXIT_BEFORE_SEVERE_FAILURE').length}
          </div>
        </div>
        <div className="card p-4">
          <div className="label-mono mb-1">Still Holding</div>
          <div className="text-xl font-semibold text-slate-400">
            {outcomes.filter((o) => o.outcome === 'STILL_HOLDING').length}
          </div>
        </div>
      </div>

      {/* Trade outcomes */}
      <div className="space-y-3">
        {outcomes.map((outcome, i) => {
          const config = OUTCOME_CONFIG[outcome.outcome] ?? OUTCOME_CONFIG.UNKNOWN;
          const Icon = config.icon;
          return (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-4">
                <TokenImage src={outcome.token.image_url} alt={outcome.token.symbol} size="md" />
                <button onClick={() => onOpenToken(outcome.token.address)} className="flex-1 text-left">
                  <div className="text-sm font-semibold text-emerald-400 hover:underline">${outcome.token.symbol}</div>
                  <div className="text-xs text-slate-500">{outcome.token.name}</div>
                </button>
                <span className={`badge ${config.class} gap-1`}>
                  <Icon className="h-3 w-3" />
                  {config.label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <div className="label-mono">Entry MC</div>
                  <div className="text-sm text-slate-300">{formatMarketCap(outcome.entryMarketCap)}</div>
                  <div className="text-xs text-slate-600">{formatTimestamp(outcome.entryTimestamp)}</div>
                </div>
                {outcome.exitTimestamp && (
                  <div>
                    <div className="label-mono">Exit MC</div>
                    <div className="text-sm text-slate-300">{formatMarketCap(outcome.exitMarketCap)}</div>
                    <div className="text-xs text-slate-600">{formatTimestamp(outcome.exitTimestamp)}</div>
                  </div>
                )}
                {outcome.peakAfterExit !== null && (
                  <div>
                    <div className="label-mono">Peak After Exit</div>
                    <div className="text-sm text-amber-400">{formatMarketCap(outcome.peakAfterExit)}</div>
                  </div>
                )}
                {outcome.lowestAfterExit !== null && (
                  <div>
                    <div className="label-mono">Lowest After Exit</div>
                    <div className="text-sm text-rose-400">{formatMarketCap(outcome.lowestAfterExit)}</div>
                  </div>
                )}
              </div>

              <div className="mt-3">
                <EvidenceBlock evidence={outcome.evidence} />
              </div>
            </div>
          );
        })}
      </div>

      <Disclaimer>
        Trade outcome analysis is historical observation, not financial advice. It does not evaluate whether a trade was "good" or "bad" — only what happened after the user's position was closed.
      </Disclaimer>
    </div>
  );
}
