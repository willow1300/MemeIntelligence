// Shared UI components for the MIE dashboard.

import { useState, type ReactNode } from 'react';
import { ChevronDown, AlertTriangle, ShieldCheck, ShieldAlert, Info } from 'lucide-react';
import { confidenceLabel, signalColor } from '@/lib/format';

// ---- Collapsible section ----
export function Collapsible({
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-800/40"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          />
          <span className="font-mono text-sm font-medium uppercase tracking-wider text-slate-300">
            {title}
          </span>
          {badge}
        </div>
      </button>
      {open && <div className="animate-fade-in border-t border-slate-800 px-4 py-4">{children}</div>}
    </div>
  );
}

// ---- Evidence block ----
export function EvidenceBlock({
  evidence,
  confidence,
}: {
  evidence: string[];
  confidence?: number;
}) {
  if (evidence.length === 0 && confidence == null) return null;
  return (
    <div className="space-y-2">
      {confidence != null && (
        <div className="flex items-center gap-2 text-xs">
          <span className="label-mono">Confidence</span>
          <span className={`badge ${confidence >= 0.7 ? 'badge-emerald' : confidence >= 0.5 ? 'badge-amber' : 'badge-rose'}`}>
            {confidenceLabel(confidence)} ({(confidence * 100).toFixed(0)}%)
          </span>
        </div>
      )}
      {evidence.length > 0 && (
        <div className="space-y-1">
          <span className="label-mono">Evidence</span>
          <ul className="space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-slate-600" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Signal pill ----
export function SignalPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-3 py-2">
      <span className="label-mono">{label}</span>
      <span className={`text-sm font-semibold ${signalColor(value)}`}>{value}</span>
    </div>
  );
}

// ---- Failure type badge ----
export function FailureTypeBadge({ type }: { type: string }) {
  const labels: Record<string, { class: string; icon: typeof ShieldCheck }> = {
    HEALTHY: { class: 'badge-emerald', icon: ShieldCheck },
    MOMENTUM_EXHAUSTION: { class: 'badge-amber', icon: AlertTriangle },
    DEV_SELLING: { class: 'badge-rose', icon: ShieldAlert },
    LIQUIDITY_EVENT: { class: 'badge-rose', icon: ShieldAlert },
    ASSOCIATED_WALLET_DISTRIBUTION: { class: 'badge-amber', icon: AlertTriangle },
    FAILED_LAUNCH: { class: 'badge-slate', icon: Info },
    META_EXHAUSTION: { class: 'badge-amber', icon: AlertTriangle },
    UNKNOWN: { class: 'badge-slate', icon: Info },
    OTHER: { class: 'badge-slate', icon: Info },
  };
  const config = labels[type] ?? labels.UNKNOWN;
  const Icon = config.icon;
  const display = type
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
  return (
    <span className={`badge ${config.class} gap-1`}>
      <Icon className="h-3 w-3" />
      {display}
    </span>
  );
}

// ---- Disclaimer ----
export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-500">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ---- Stat card ----
export function StatCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string | ReactNode;
  sublabel?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const accentClass =
    accent === 'emerald' ? 'text-emerald-400'
    : accent === 'amber' ? 'text-amber-400'
    : accent === 'rose' ? 'text-rose-400'
    : 'text-slate-100';
  return (
    <div className="card p-4">
      <div className="label-mono mb-1">{label}</div>
      <div className={`text-xl font-semibold ${accentClass}`}>{value}</div>
      {sublabel && <div className="mt-0.5 text-xs text-slate-500">{sublabel}</div>}
    </div>
  );
}

// ---- Loading ----
export function Loading({ label = 'Loading intelligence data...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-slate-400" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

// ---- Error state ----
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-rose-400">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}

// ---- Token image ----
export function TokenImage({
  src,
  alt,
  size = 'md',
}: {
  src: string | null | undefined;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'sm' ? 'h-8 w-8'
    : size === 'lg' ? 'h-16 w-16'
    : 'h-10 w-10';
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${sizeClass} rounded-full border border-slate-700 object-cover`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return (
    <div className={`${sizeClass} flex items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-slate-500`}>
      {alt.charAt(0).toUpperCase()}
    </div>
  );
}
