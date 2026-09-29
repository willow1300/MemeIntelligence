import { Settings, Database, Radio, Shield } from 'lucide-react';
import { StatCard, Disclaimer } from '@/components/ui';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">System configuration and architecture overview.</p>
      </div>

      {/* System status */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-emerald-400" />
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">System Status</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Database" value="Connected" accent="emerald" sublabel="PostgreSQL via Supabase" />
          <StatCard label="Chain" value="Solana" sublabel="Mainnet (mock provider)" />
          <StatCard label="Provider" value="Mock V1" sublabel="Replaceable architecture" />
          <StatCard label="Version" value="V1" sublabel="Foundation build" />
        </div>
      </div>

      {/* Architecture */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-400" />
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">Architecture</h2>
        </div>
        <div className="space-y-2 text-sm text-slate-400">
          <p>The Meme Intelligence Engine is built as a modular system with clear separation between raw observations and analytical conclusions.</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded border border-slate-800 bg-slate-900/30 p-3">
              <div className="text-xs font-semibold text-slate-300 mb-1">Data Layer</div>
              <ul className="space-y-1 text-xs text-slate-500">
                <li>• chains, platforms, wallets, developers</li>
                <li>• tokens, token_metadata, launches</li>
                <li>• transactions, market_snapshots, holder_snapshots</li>
              </ul>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-3">
              <div className="text-xs font-semibold text-slate-300 mb-1">Intelligence Layer</div>
              <ul className="space-y-1 text-xs text-slate-500">
                <li>• Wallet profiling engine</li>
                <li>• Developer aggregation engine</li>
                <li>• Similarity engine (rule-based)</li>
                <li>• Meta classification engine</li>
                <li>• Lifecycle analysis engine</li>
                <li>• Scoring engine (explainable)</li>
                <li>• Trade outcome engine</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Provider interfaces */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400" />
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">Provider Interfaces</h2>
        </div>
        <div className="space-y-2 text-sm text-slate-400">
          <p>Providers are abstracted via interfaces so they can be replaced without rebuilding the system.</p>
          <div className="space-y-1">
            <div className="rounded border border-slate-800 bg-slate-900/30 px-3 py-2 text-xs">
              <span className="text-emerald-400 font-mono">BlockchainProvider</span> — getToken, getWallet, getTransactions, getTokenHolders, getTokenMetadata
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 px-3 py-2 text-xs">
              <span className="text-emerald-400 font-mono">MarketDataProvider</span> — getTokenMarketData, getHistoricalMarketData, getLiquidity, getVolume
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 px-3 py-2 text-xs">
              <span className="text-emerald-400 font-mono">LaunchProvider</span> — getRecentLaunches, getLaunch, getPlatformInfo
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-400" />
          <h2 className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">Security</h2>
        </div>
        <ul className="space-y-1.5 text-sm text-slate-400">
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" /> No private keys or seed phrases are ever requested</li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" /> Only public wallet addresses are accepted for tracking</li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" /> No automatic trading, wallet signing, or transaction execution</li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" /> All analytical conclusions are presented with evidence and confidence</li>
          <li className="flex items-start gap-2"><span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" /> Raw observations and analytical conclusions are stored separately</li>
        </ul>
      </div>

      <Disclaimer>
        MIE is a research and intelligence tool. It does not provide financial advice, trading signals, or guarantees of any kind.
      </Disclaimer>
    </div>
  );
}
