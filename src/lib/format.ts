// Formatting and time utilities for the MIE dashboard.

export function formatMarketCap(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeAgo(ts: string | null | undefined): string {
  if (!ts) return '—';
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 365) return `${Math.floor(days / 365)} year${Math.floor(days / 365) !== 1 ? 's' : ''} ago`;
  if (days >= 30) return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''} ago`;
  if (days >= 1) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (hours >= 1) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (minutes >= 1) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export function shortAddress(addr: string | null | undefined, chars = 6): string {
  if (!addr) return '—';
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function confidenceLabel(conf: number): string {
  if (conf >= 0.8) return 'HIGH';
  if (conf >= 0.6) return 'MEDIUM';
  if (conf >= 0.4) return 'LOW';
  return 'VERY LOW';
}

export function failureTypeLabel(ft: string): string {
  return ft
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function signalColor(value: string): string {
  const v = value.toUpperCase();
  if (v.includes('HIGH') || v.includes('STRONG') || v === 'OLD') return 'text-emerald-400';
  if (v.includes('MEDIUM') || v.includes('ESTABLISHED')) return 'text-amber-400';
  if (v.includes('LOW') || v.includes('WEAK') || v.includes('NEW') || v.includes('UNKNOWN') || v.includes('CONCERN'))
    return 'text-rose-400';
  return 'text-slate-300';
}
