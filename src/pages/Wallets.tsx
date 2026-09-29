import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchAllWallets } from '@/lib/data-access';
import { profileWallet } from '@/intelligence/wallet';
import type { Wallet } from '@/types';
import { Loading, ErrorState, StatCard, Disclaimer } from '@/components/ui';
import { formatTimeAgo, shortAddress } from '@/lib/format';

export function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Awaited<ReturnType<typeof profileWallet>>>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const w = await fetchAllWallets();
        setWallets(w);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load wallets');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!profiles.has(id)) {
      const w = wallets.find((x) => x.id === id);
      if (!w) return;
      const p = await profileWallet(w);
      setProfiles(new Map(profiles).set(id, p));
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Wallets</h1>
        <p className="mt-1 text-sm text-slate-500">
          Observed on-chain addresses. "First observed" is not the same as wallet creation time.
        </p>
      </div>

      <div className="space-y-1">
        {wallets.map((w) => {
          const p = profiles.get(w.id);
          const isOpen = expanded === w.id;
          const ageDays = w.first_seen_at ? (Date.now() - new Date(w.first_seen_at).getTime()) / 86400000 : 0;
          return (
            <div key={w.id} className="card overflow-hidden">
              <button onClick={() => toggle(w.id)} className="card-hover flex w-full items-center gap-4 px-4 py-3 text-left">
                <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-slate-300">{shortAddress(w.address, 10)}</div>
                  <div className="text-xs text-slate-500">First observed {formatTimeAgo(w.first_seen_at)} · {w.transaction_count} txs</div>
                </div>
                <span className={`badge ${w.wallet_type === 'EXCHANGE' ? 'badge-amber' : w.wallet_type === 'PROGRAM' ? 'badge-slate' : w.wallet_type === 'PERSONAL' ? 'badge-emerald' : 'badge-slate'}`}>
                  {w.wallet_type}
                </span>
                <div className="text-right">
                  <div className="label-mono">Age</div>
                  <div className={`text-sm ${ageDays < 1 ? 'text-rose-400' : ageDays > 180 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {ageDays < 1 ? 'NEW' : ageDays > 365 ? `${Math.floor(ageDays / 365)}y` : `${Math.floor(ageDays)}d`}
                  </div>
                </div>
              </button>
              {isOpen && p && (
                <div className="animate-fade-in border-t border-slate-800 px-4 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="First Observed" value={p.firstObservedAge} sublabel="Not creation time" />
                    <StatCard label="Last Seen" value={formatTimeAgo(p.wallet.last_seen_at)} />
                    <StatCard label="Transactions" value={p.transactionCount} />
                    <StatCard label="Launches" value={p.launchCount} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Activity Before Launch" value={p.activityBeforeLaunch} />
                    <StatCard label="Activity After Launch" value={p.activityAfterLaunch} />
                  </div>
                  {p.relationships.length > 0 && (
                    <div>
                      <div className="label-mono mb-2">Known Relationships</div>
                      <div className="space-y-1">
                        {p.relationships.map((rel, i) => (
                          <div key={i} className="flex items-center gap-3 rounded border border-slate-800 bg-slate-900/30 px-3 py-2">
                            <span className="badge badge-slate">{rel.relationshipType}</span>
                            <span className="text-sm text-slate-300">{rel.developerName}</span>
                            <span className="text-xs text-slate-500">Confidence: {(rel.confidence * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.isFreshWallet && (
                    <div className="rounded border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-400">
                      This wallet was first observed very recently — no meaningful on-chain history exists.
                    </div>
                  )}
                  <Disclaimer>"First observed" means first seen by our system, not necessarily when the wallet was created.</Disclaimer>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
