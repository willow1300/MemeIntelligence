import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Radio, Brain, Users, Wallet, Tags, GitCompare,
  History, Settings, Radar,
} from 'lucide-react';
import { OverviewPage } from '@/pages/Overview';
import { LiveTokensPage } from '@/pages/LiveTokens';
import { TokenIntelligencePage } from '@/pages/TokenIntelligence';
import { DevelopersPage } from '@/pages/Developers';
import { WalletsPage } from '@/pages/Wallets';
import { MetasPage } from '@/pages/Metas';
import { SimilarityPage } from '@/pages/Similarity';
import { HistoryPage } from '@/pages/History';
import { SettingsPage } from '@/pages/Settings';

type Page =
  | 'overview' | 'live' | 'token' | 'developers' | 'wallets'
  | 'metas' | 'similarity' | 'history' | 'settings';

const NAV_ITEMS: Array<{ key: Page; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'live', label: 'Live Tokens', icon: Radio },
  { key: 'token', label: 'Token Intelligence', icon: Brain },
  { key: 'developers', label: 'Developers', icon: Users },
  { key: 'wallets', label: 'Wallets', icon: Wallet },
  { key: 'metas', label: 'Metas', icon: Tags },
  { key: 'similarity', label: 'Similarity', icon: GitCompare },
  { key: 'history', label: 'History', icon: History },
  { key: 'settings', label: 'Settings', icon: Settings },
];

function App() {
  const [page, setPage] = useState<Page>('overview');
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);

  // Parse hash for deep linking (e.g. #token/LOUIEhero...)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash.startsWith('token/')) {
        const addr = hash.slice(6);
        setSelectedTokenAddress(addr);
        setPage('token');
      } else {
        const validPages = NAV_ITEMS.map((n) => n.key);
        if (validPages.includes(hash as Page)) {
          setPage(hash as Page);
        }
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const navigate = useCallback((p: Page) => {
    setPage(p);
    if (p !== 'token') {
      window.location.hash = p;
    }
  }, []);

  const openToken = useCallback((address: string) => {
    setSelectedTokenAddress(address);
    setPage('token');
    window.location.hash = `token/${address}`;
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'overview': return <OverviewPage onOpenToken={openToken} />;
      case 'live': return <LiveTokensPage onOpenToken={openToken} />;
      case 'token': return <TokenIntelligencePage address={selectedTokenAddress} onOpenToken={openToken} />;
      case 'developers': return <DevelopersPage />;
      case 'wallets': return <WalletsPage />;
      case 'metas': return <MetasPage onOpenToken={openToken} />;
      case 'similarity': return <SimilarityPage onOpenToken={openToken} />;
      case 'history': return <HistoryPage onOpenToken={openToken} />;
      case 'settings': return <SettingsPage />;
      default: return <OverviewPage onOpenToken={openToken} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0a0e14]">
      {/* Sidebar */}
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-slate-800 bg-[#0c1118]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Radar className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100">MIE</div>
            <div className="text-[10px] text-slate-500 leading-none">Meme Intelligence</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
                {item.key === 'live' && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 px-5 py-3">
          <div className="text-[10px] text-slate-600">
            V1 · Research tool
            <br />
            Not financial advice
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto scrollbar-thin">
        <div className="mx-auto max-w-7xl px-6 py-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

export default App;
