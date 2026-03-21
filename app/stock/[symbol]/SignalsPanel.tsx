'use client';

import type { DetectedSignal, SignalSeverity } from '@/lib/utils/types';

const SEVERITY_STYLES: Record<SignalSeverity, { bg: string; text: string; label: string }> = {
  HIGH: { bg: 'bg-red/10 border-red/30', text: 'text-red', label: 'HIGH' },
  INVESTIGATE: { bg: 'bg-purple/10 border-purple/30', text: 'text-purple', label: 'INVESTIGATE' },
  CAUTION: { bg: 'bg-amber/10 border-amber/30', text: 'text-amber', label: 'CAUTION' },
  RISK: { bg: 'bg-red/10 border-red/30', text: 'text-red', label: 'RISK' },
  WATCH: { bg: 'bg-amber/10 border-amber/30', text: 'text-amber', label: 'WATCH' },
};

const DIRECTION_COLOR: Record<string, string> = {
  bullish: 'text-green',
  bearish: 'text-red',
  neutral: 'text-text-secondary',
};

function SeverityBadge({ severity }: { severity: SignalSeverity }) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider border ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function SignalRow({ signal }: { signal: DetectedSignal }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-bg-tertiary/30 transition-colors">
      <span className="text-base shrink-0 mt-0.5">{signal.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${DIRECTION_COLOR[signal.direction]}`}>
            {signal.label}
          </span>
          <SeverityBadge severity={signal.severity} />
          <span className="text-text-tertiary text-[10px] ml-auto shrink-0">{signal.date}</span>
        </div>
        <p className="text-text-secondary text-xs mt-0.5 leading-relaxed">{signal.description}</p>
      </div>
    </div>
  );
}

export function SignalsPanel({ signals }: { signals: DetectedSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-text-tertiary text-base">📡</span>
          <span className="font-display font-bold text-text-secondary">Signals</span>
        </div>
        <p className="text-text-tertiary text-sm">No unusual signals detected</p>
      </div>
    );
  }

  const highCount = signals.filter((s) => s.severity === 'HIGH' || s.severity === 'INVESTIGATE').length;

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">📡</span>
        <span className="font-display font-bold text-text-primary">Detected Signals</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary border border-border text-text-tertiary font-medium">
          {signals.length}
        </span>
        {highCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red/10 border border-red/20 text-red font-bold ml-auto">
            {highCount} HIGH PRIORITY
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        {signals.map((signal) => (
          <SignalRow key={signal.id} signal={signal} />
        ))}
      </div>
    </div>
  );
}
