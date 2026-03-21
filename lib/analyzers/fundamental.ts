import type { Fundamentals } from '../utils/types';

export type FundamentalFlag =
  | 'DEEP_VALUE'
  | 'HIGH_GROWTH'
  | 'ACCELERATING_REVENUE'
  | 'ACCELERATING_EARNINGS'
  | 'MARGIN_EXPANSION'
  | 'HIGH_ROE'
  | 'OVER_LEVERAGED'
  | 'NEGATIVE_EARNINGS'
  | 'CASH_MACHINE';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function lerp(value: number, inLow: number, inHigh: number, outLow = 0, outHigh = 100): number {
  if (inHigh === inLow) return (outLow + outHigh) / 2;
  const t = (value - inLow) / (inHigh - inLow);
  return outLow + t * (outHigh - outLow);
}

function scoreMetric(
  value: number | null | undefined,
  low: number,
  high: number,
  invert = false,
): number | null {
  if (value == null) return null;
  const raw = lerp(value, low, high);
  return invert ? 100 - clamp(raw) : clamp(raw);
}

export function computeFundamentalScore(f: Fundamentals): number {
  const scores: number[] = [];

  // Valuation: lower PE/PEG is better (inverted)
  const pe = scoreMetric(f.pe_ratio, 5, 60, true);
  if (pe != null && f.pe_ratio != null && f.pe_ratio > 0) scores.push(pe);

  const peg = scoreMetric(f.peg_ratio, 0, 3, true);
  if (peg != null && f.peg_ratio != null && f.peg_ratio > 0) scores.push(peg);

  const ps = scoreMetric(f.ps_ratio, 0.5, 20, true);
  if (ps != null && f.ps_ratio != null && f.ps_ratio > 0) scores.push(ps);

  // Growth: higher is better
  const revYoY = scoreMetric(f.revenue_growth_yoy, -0.1, 0.4);
  if (revYoY != null) scores.push(revYoY);

  const earnYoY = scoreMetric(f.earnings_growth_yoy, -0.2, 0.5);
  if (earnYoY != null) scores.push(earnYoY);

  const revQoQ = scoreMetric(f.revenue_growth_qoq, -0.05, 0.15);
  if (revQoQ != null) scores.push(revQoQ);

  // Profitability: higher margins are better
  const gm = scoreMetric(f.gross_margin, 0.1, 0.7);
  if (gm != null) scores.push(gm);

  const om = scoreMetric(f.operating_margin, -0.05, 0.35);
  if (om != null) scores.push(om);

  const nm = scoreMetric(f.net_margin, -0.1, 0.25);
  if (nm != null) scores.push(nm);

  // Returns: higher is better
  const roe = scoreMetric(f.roe, 0, 0.4);
  if (roe != null) scores.push(roe);

  // Balance sheet: lower leverage is better
  const de = scoreMetric(f.debt_to_equity, 0, 3, true);
  if (de != null && f.debt_to_equity != null && f.debt_to_equity >= 0) scores.push(de);

  const cr = scoreMetric(f.current_ratio, 0.5, 3);
  if (cr != null) scores.push(cr);

  if (scores.length === 0) return 50;
  return clamp(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function detectFundamentalFlags(f: Fundamentals): FundamentalFlag[] {
  const flags: FundamentalFlag[] = [];

  if (f.pe_ratio != null && f.pe_ratio > 0 && f.pe_ratio < 12 &&
      f.pb_ratio != null && f.pb_ratio < 2) {
    flags.push('DEEP_VALUE');
  }

  if (f.revenue_growth_yoy != null && f.revenue_growth_yoy > 0.25 &&
      f.earnings_growth_yoy != null && f.earnings_growth_yoy > 0.25) {
    flags.push('HIGH_GROWTH');
  }

  if (f.revenue_growth_qoq != null && f.revenue_growth_yoy != null &&
      f.revenue_growth_qoq > f.revenue_growth_yoy && f.revenue_growth_qoq > 0.05) {
    flags.push('ACCELERATING_REVENUE');
  }

  if (f.earnings_growth_qoq != null && f.earnings_growth_yoy != null &&
      f.earnings_growth_qoq > f.earnings_growth_yoy && f.earnings_growth_qoq > 0.1) {
    flags.push('ACCELERATING_EARNINGS');
  }

  if (f.operating_margin != null && f.gross_margin != null &&
      f.operating_margin > 0.2 && f.gross_margin > 0.5) {
    flags.push('MARGIN_EXPANSION');
  }

  if (f.roe != null && f.roe > 0.25) {
    flags.push('HIGH_ROE');
  }

  if (f.debt_to_equity != null && f.debt_to_equity > 2.5) {
    flags.push('OVER_LEVERAGED');
  }

  if (f.net_margin != null && f.net_margin < -0.05) {
    flags.push('NEGATIVE_EARNINGS');
  }

  if (f.net_margin != null && f.net_margin > 0.15 &&
      f.roe != null && f.roe > 0.2 &&
      f.debt_to_equity != null && f.debt_to_equity < 1) {
    flags.push('CASH_MACHINE');
  }

  return flags;
}
