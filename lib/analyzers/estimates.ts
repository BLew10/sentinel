import type { FDAnalystEstimate, FDEarnings } from '../utils/types';

interface EstimateRevisionInput {
  currentEstimates: FDAnalystEstimate[];
  priorEstimates: FDAnalystEstimate[];
  earnings: FDEarnings | null;
  currentPrice: number | null;
}

export interface EstimateRevisionResult {
  score: number;
  forward_pe: number | null;
  eps_revision_pct: number | null;
  revenue_revision_pct: number | null;
  earnings_surprise_streak: number;
  next_earnings_date: string | null;
  days_to_earnings: number | null;
  flags: EstimateFlag[];
}

export type EstimateFlag =
  | 'EARNINGS_APPROACHING'
  | 'ESTIMATE_BEAT_STREAK'
  | 'EPS_REVISION_UP'
  | 'EPS_REVISION_DOWN'
  | 'REVENUE_REVISION_UP'
  | 'REVENUE_REVISION_DOWN';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function lerp(value: number, inLow: number, inHigh: number, outLow = 0, outHigh = 100): number {
  if (inHigh === inLow) return (outLow + outHigh) / 2;
  const t = (value - inLow) / (inHigh - inLow);
  return outLow + t * (outHigh - outLow);
}

function findNextFiscalPeriodEstimate(
  estimates: FDAnalystEstimate[],
): FDAnalystEstimate | null {
  const now = new Date();
  const future = estimates
    .filter((e) => new Date(e.fiscal_period) >= now)
    .sort((a, b) => new Date(a.fiscal_period).getTime() - new Date(b.fiscal_period).getTime());
  return future[0] ?? null;
}

function computeEpsSurpriseStreak(earnings: FDEarnings | null): number {
  if (!earnings?.quarterly?.eps_surprise) return 0;
  return earnings.quarterly.eps_surprise === 'BEAT' ? 1 : 0;
}

export function computeEstimateRevisionScore(
  input: EstimateRevisionInput,
): EstimateRevisionResult {
  const flags: EstimateFlag[] = [];
  const scores: number[] = [];

  const nextEstimate = findNextFiscalPeriodEstimate(input.currentEstimates);
  const priorNextEstimate = findNextFiscalPeriodEstimate(input.priorEstimates);

  let epsRevisionPct: number | null = null;
  let revenueRevisionPct: number | null = null;
  let forwardPe: number | null = null;

  // EPS revision momentum: compare current estimate to prior estimate for same period
  if (nextEstimate?.earnings_per_share != null && priorNextEstimate?.earnings_per_share != null
      && priorNextEstimate.earnings_per_share !== 0
      && nextEstimate.fiscal_period === priorNextEstimate.fiscal_period) {
    epsRevisionPct = (nextEstimate.earnings_per_share - priorNextEstimate.earnings_per_share)
      / Math.abs(priorNextEstimate.earnings_per_share);

    // +5% revision = strong bullish, -5% = strong bearish
    scores.push(clamp(lerp(epsRevisionPct, -0.05, 0.05, 15, 85)));

    if (epsRevisionPct > 0.02) flags.push('EPS_REVISION_UP');
    if (epsRevisionPct < -0.02) flags.push('EPS_REVISION_DOWN');
  }

  // Revenue revision momentum
  if (nextEstimate?.revenue != null && priorNextEstimate?.revenue != null
      && priorNextEstimate.revenue !== 0
      && nextEstimate.fiscal_period === priorNextEstimate.fiscal_period) {
    revenueRevisionPct = (nextEstimate.revenue - priorNextEstimate.revenue)
      / Math.abs(priorNextEstimate.revenue);

    scores.push(clamp(lerp(revenueRevisionPct, -0.03, 0.03, 20, 80)));

    if (revenueRevisionPct > 0.02) flags.push('REVENUE_REVISION_UP');
    if (revenueRevisionPct < -0.02) flags.push('REVENUE_REVISION_DOWN');
  }

  // Forward PE: current price / next quarter's estimated EPS (annualized)
  if (nextEstimate?.earnings_per_share != null && input.currentPrice != null
      && nextEstimate.earnings_per_share > 0) {
    const annualizedEps = nextEstimate.period === 'quarterly'
      ? nextEstimate.earnings_per_share * 4
      : nextEstimate.earnings_per_share;
    forwardPe = input.currentPrice / annualizedEps;
  }

  // Earnings surprise streak
  const surpriseStreak = computeEpsSurpriseStreak(input.earnings);
  if (surpriseStreak >= 1) {
    scores.push(clamp(lerp(surpriseStreak, 0, 3, 50, 80)));
    if (surpriseStreak >= 3) flags.push('ESTIMATE_BEAT_STREAK');
  }

  // Earnings proximity
  let nextEarningsDate: string | null = null;
  let daysToEarnings: number | null = null;

  if (input.earnings?.report_period) {
    const reportDate = new Date(input.earnings.report_period);
    const now = new Date();
    const daysDiff = Math.ceil((reportDate.getTime() - now.getTime()) / 86_400_000);

    // Only relevant if earnings are in the future or very recent
    if (daysDiff > -7 && daysDiff < 90) {
      nextEarningsDate = input.earnings.report_period;
      daysToEarnings = Math.max(0, daysDiff);

      if (daysDiff >= 0 && daysDiff <= 14) {
        flags.push('EARNINGS_APPROACHING');
      }
    }
  }

  // If we have no forward estimates at all, return neutral
  if (scores.length === 0) {
    return {
      score: 50,
      forward_pe: forwardPe,
      eps_revision_pct: null,
      revenue_revision_pct: null,
      earnings_surprise_streak: surpriseStreak,
      next_earnings_date: nextEarningsDate,
      days_to_earnings: daysToEarnings,
      flags,
    };
  }

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    score: clamp(avgScore),
    forward_pe: forwardPe,
    eps_revision_pct: epsRevisionPct,
    revenue_revision_pct: revenueRevisionPct,
    earnings_surprise_streak: surpriseStreak,
    next_earnings_date: nextEarningsDate,
    days_to_earnings: daysToEarnings,
    flags,
  };
}
