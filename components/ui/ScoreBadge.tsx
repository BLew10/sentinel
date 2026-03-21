'use client';

import { scoreVerdict, verdictColor } from '@/lib/utils/format';

interface ScoreBadgeProps {
  score: number | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ScoreBadge({ score, size = 'md', showLabel = false }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-bg-tertiary text-text-tertiary text-xs w-8 h-8">
        —
      </span>
    );
  }

  const color =
    score >= 75
      ? 'text-green bg-green-bg border-green/20'
      : score >= 50
        ? 'text-amber bg-amber-bg border-amber/20'
        : 'text-red bg-red-bg border-red/20';

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };

  const verdict = scoreVerdict(score);

  if (showLabel) {
    return (
      <div className="inline-flex flex-col items-center gap-0.5">
        <span
          className={`inline-flex items-center justify-center rounded-full border font-display font-bold ${color} ${sizeClasses[size]}`}
        >
          {score}
        </span>
        <span className={`text-[9px] font-medium ${verdictColor(verdict)}`}>
          {verdict}
        </span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border font-display font-bold ${color} ${sizeClasses[size]}`}
      title={verdict}
    >
      {score}
    </span>
  );
}
