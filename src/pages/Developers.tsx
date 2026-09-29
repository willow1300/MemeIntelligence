import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchAllDevelopers } from '@/lib/data-access';
import { profileDeveloper } from '@/intelligence/developer';
import type { Developer, DeveloperStats } from '@/types';
import { Loading, ErrorState, StatCard, FailureTypeBadge, Disclaimer } from '@/components/ui';
import { formatMarketCap, formatTimestamp, formatMinutes, formatTimeAgo } from '@/lib/format';

export function DevelopersPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDev, setExpandedDev] = useState<string | null>(null);
  const [devStats, setDevStats] = useState<Map<string, DeveloperStats>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const devs = await fetchAllDevelopers();
        setDevelopers(devs);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load developers');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const expandDev = async (devId: string) => {
    if (expandedDev === devId) {
      setExpandedDev(null);
      return;
    }
    setExpandedDev(devId);
    if (!devStats.has(devId)) {
      const stats = await profileDeveloper(devId);
      if (stats) {
        const dev = developers.find((d) => d.id === devId);
        if (dev) stats.developer = dev;
        setDevStats(new Map(devStats).set(devId, stats));
      }
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Developers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Analytical entities grouping observed launches. Different wallets are not assumed to belong to the same person without evidence.
        </p>
      </div>

      <div className="space-y-2">
        {developers.map((dev) => {
          const stats = devStats.get(dev.id);
          const isOpen = expandedDev === dev.id;
          return (
            <div key={dev.id} className="card overflow-hidden">
              <button
                onClick={() => expandDev(dev.id)}
                className="card-hover flex w-full items-center gap-4 px-4 py-3 text-left"
              >
                <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-200">{dev.name}</div>
                  <div className="text-xs text-slate-500">
                    First observed {formatTimeAgo(dev.first_seen_at)} · {dev.launch_count} launches
                  </div>
                </div>
                {stats && (
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="label-mono">Median Peak</div>
                      <div className="text-sm text-slate-300">{formatMarketCap(stats.medianPeakMarketCap)}</div>
                    </div>
                    <div className="text-right">
                      <div className="label-mono">Success</div>
                      <div className="text-sm text-emerald-400">{stats.successfulLaunches}/{stats.launchCount}</div>
                    </div>
                  </div>
                )}
              </button>
              {isOpen && stats && (
                <div className="animate-fade-in border-t border-slate-800 px-4 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="Launches" value={stats.launchCount} />
                    <StatCard label="Highest Peak MC" value={formatMarketCap(stats.highestPeakMarketCap)} />
                    <StatCard label="Median Peak MC" value={formatMarketCap(stats.medianPeakMarketCap)} />
                    <StatCard label="Avg Peak MC" value={formatMarketCap(stats.averagePeakMarketCap)} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Strong Performers" value={stats.successfulLaunches} accent="emerald" />
                    <StatCard label="Failed" value={stats.failedLaunches} accent="rose" />
                    <StatCard label="Unknown" value={stats.unknownOutcomes} accent="slate" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <StatCard label="Avg Time to Peak" value={formatMinutes(stats.averageTimeToPeakMinutes)} />
                    <StatCard label="Median Time to Peak" value={formatMinutes(stats.medianTimeToPeakMinutes)} />
                    <StatCard label="Avg Lifespan" value={stats.averageLifespanMinutes ? formatMinutes(stats.averageLifespanMinutes) : '—'} />
                  </div>
                  <div>
                    <div className="label-mono mb-2">Outcome Breakdown</div>
                    <div className="flex flex-wrap gap-2">
                      {stats.outcomeBreakdown.map((o, i) => (
                        <FailureTypeBadge key={i} type={o.failureType} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="label-mono mb-2">Previous Launches</div>
                    <div className="space-y-1">
                      {stats.launches.map((dl, i) => (
                        <div key={i} className="flex items-center gap-3 rounded border border-slate-800 bg-slate-900/30 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-300 font-mono">{dl.tokenAddress.slice(0, 24)}...</div>
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
                          {dl.lifespanMinutes !== null && (
                            <div className="text-right">
                              <div className="text-xs text-slate-500">Lifespan</div>
                              <div className="text-sm text-slate-400">{formatMinutes(dl.lifespanMinutes)}</div>
                            </div>
                          )}
                          <FailureTypeBadge type={dl.failureType} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Disclaimer>Historical observations. Do not imply these numbers predict future performance.</Disclaimer>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
