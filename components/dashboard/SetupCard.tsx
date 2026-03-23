import Link from 'next/link';
import type { Setup } from '@/lib/setups';
import { ScoreBadge } from '@/components/ui/ScoreBadge';

interface Props {
  symbol: string;
  name: string;
  sentinelScore: number | null;
  setup: Setup;
  sector?: string | null;
}

const SETUP_ICONS: Record<string, string> = {
  volatility_squeeze: '◉',
  accumulation_detected: '◈',
  pre_earnings_catalyst: '◎',
  reversal_forming: '↺',
  momentum_continuation: '▲',
  value_reversal: '◇',
};

function ConvictionDots({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Conviction: ${level}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < level ? 'bg-green' : 'bg-border'
          }`}
        />
      ))}
    </div>
  );
}

export function SetupCard({ symbol, name, sentinelScore, setup, sector }: Props) {
  return (
    <Link
      href={`/stock/${symbol}`}
      className="bg-bg-secondary rounded-lg border border-purple/20 p-5 hover:border-purple/40 transition-colors group flex flex-col"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-purple text-sm">{SETUP_ICONS[setup.type] ?? '◉'}</span>
            <span className="text-[10px] font-medium text-purple uppercase tracking-wider">
              {setup.name}
            </span>
            <ConvictionDots level={setup.conviction} />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-lg text-text-primary group-hover:text-green transition-colors">
              {symbol}
            </h3>
            <span className="text-text-tertiary text-xs truncate max-w-[160px]">{name}</span>
          </div>
        </div>
        <ScoreBadge score={sentinelScore} size="md" />
      </div>

      <p className="text-text-secondary text-xs leading-relaxed mb-3 line-clamp-3">
        {setup.thesis}
      </p>

      <div className="space-y-1.5 mb-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium">Watch for</p>
        {setup.watchFor.slice(0, 2).map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="text-green text-[10px] mt-0.5 shrink-0">›</span>
            <p className="text-text-secondary text-[11px] leading-snug">{item}</p>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between text-[10px] text-text-tertiary">
        <span>{sector ?? '—'}</span>
        <span className="font-display">{setup.timeframe}</span>
      </div>
    </Link>
  );
}
