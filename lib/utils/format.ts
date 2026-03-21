export function formatCurrency(
  value: number,
  options?: { compact?: boolean; decimals?: number }
): string {
  const { compact = false, decimals = 2 } = options ?? {};

  if (compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(
  value: number,
  options?: { compact?: boolean; decimals?: number }
): string {
  const { compact = false, decimals = 0 } = options ?? {};

  return new Intl.NumberFormat('en-US', {
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

export function formatPercentRaw(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatDate(date: string | Date, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const styles: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: 'numeric', day: 'numeric' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  };

  return d.toLocaleDateString('en-US', styles[style]);
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d, 'short');
}

export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return formatCurrency(value, { compact: true });
}

export function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toString();
}

export function scoreColor(score: number): string {
  if (score >= 75) return 'text-green';
  if (score >= 60) return 'text-amber';
  if (score >= 40) return 'text-text-secondary';
  return 'text-red';
}

export function scoreBgColor(score: number): string {
  if (score >= 75) return 'bg-green-bg';
  if (score >= 60) return 'bg-amber-bg';
  if (score >= 40) return 'bg-bg-tertiary';
  return 'bg-red-bg';
}

export function sentimentColor(sentiment: string): string {
  switch (sentiment) {
    case 'bullish':
    case 'positive':
      return 'text-green';
    case 'bearish':
    case 'negative':
      return 'text-red';
    default:
      return 'text-amber';
  }
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// --- Actionable score interpretation ---

export type ScoreVerdict = 'Strong Buy' | 'Bullish' | 'Neutral' | 'Caution' | 'Bearish';

export function scoreVerdict(score: number | null): ScoreVerdict {
  if (score == null) return 'Neutral';
  if (score >= 80) return 'Strong Buy';
  if (score >= 65) return 'Bullish';
  if (score >= 45) return 'Neutral';
  if (score >= 30) return 'Caution';
  return 'Bearish';
}

export function verdictColor(verdict: ScoreVerdict): string {
  switch (verdict) {
    case 'Strong Buy': return 'text-green';
    case 'Bullish': return 'text-green/80';
    case 'Neutral': return 'text-amber';
    case 'Caution': return 'text-amber';
    case 'Bearish': return 'text-red';
  }
}

export function verdictBgColor(verdict: ScoreVerdict): string {
  switch (verdict) {
    case 'Strong Buy': return 'bg-green-bg border-green/30';
    case 'Bullish': return 'bg-green-bg/50 border-green/20';
    case 'Neutral': return 'bg-amber-bg/50 border-amber/20';
    case 'Caution': return 'bg-amber-bg border-amber/30';
    case 'Bearish': return 'bg-red-bg border-red/30';
  }
}

export const COLUMN_EXPLANATIONS: Record<string, string> = {
  sentinel_score: 'Composite score (0-100) combining technical, fundamental, insider, and AI signals. Higher = more bullish conviction.',
  technical_score: 'Measures price trend, momentum (RSI/MACD), and relative strength. 75+ = strong uptrend.',
  fundamental_score: 'Evaluates valuation (PE), growth (revenue/earnings), margins, and balance sheet health.',
  earnings_ai_score: 'AI analysis of fundamentals + technicals + price action. Higher = AI sees more upside.',
  insider_score: 'Tracks insider buying/selling patterns. 70+ = meaningful insider accumulation.',
  institutional_score: 'Monitors hedge fund and institutional ownership changes.',
  rsi_14: 'Relative Strength Index — momentum oscillator. Below 30 = oversold (potential bounce). Above 70 = overbought (potential pullback).',
  price_vs_sma50: 'How far price is from the 50-day moving average. Positive = above trend. Negative = below trend.',
  pct_from_52w_high: 'Distance from 52-week high. Near 0% = at highs (strength). -30%+ = deeply corrected.',
  volume_ratio_50d: 'Today\'s volume relative to 50-day average. Above 2.0 = unusual interest / institutional activity.',
  rs_rank_3m: 'Relative strength percentile vs. all stocks over 3 months. 90+ = top performer.',
  pe_ratio: 'Price-to-Earnings ratio. Lower = cheaper. Negative = unprofitable. Compare within sector.',
  revenue_growth_yoy: 'Year-over-year revenue growth. 20%+ = high growth. Negative = shrinking business.',
  market_cap: 'Total market value of the company. Mega (>$200B), Large ($10-200B), Mid ($2-10B), Small (<$2B).',
};

// --- Divergence / Leading Indicator Detection ---

export interface Divergence {
  type: DivergenceType;
  label: string;
  detail: string;
  strength: 'high' | 'medium';
}

export type DivergenceType =
  | 'INSIDER_BUY_WEAK_PRICE'
  | 'CONTRARIAN_INSIDER'
  | 'FUNDAMENTAL_LEADS_PRICE'
  | 'AI_SEES_VALUE'
  | 'GROWTH_UNNOTICED'
  | 'OVERSOLD_QUALITY'
  | 'QUIET_ACCUMULATION'
  | 'SMART_MONEY_EARLY'
  | 'DEEP_VALUE_IGNORED';

export interface DivergenceInput {
  sentinel_score: number | null;
  technical_score: number | null;
  fundamental_score: number | null;
  insider_score: number | null;
  institutional_score: number | null;
  earnings_ai_score: number | null;
  rsi_14: number | null;
  price_vs_sma50: number | null;
  price_vs_sma200: number | null;
  pct_from_52w_high: number | null;
  volume_ratio_50d: number | null;
  revenue_growth_yoy: number | null;
  earnings_growth_yoy: number | null;
  pe_ratio: number | null;
}

export function detectDivergences(row: DivergenceInput): Divergence[] {
  const divergences: Divergence[] = [];
  const tech = row.technical_score ?? 50;
  const fund = row.fundamental_score ?? 50;
  const insider = row.insider_score ?? 50;
  const inst = row.institutional_score ?? 50;
  const ai = row.earnings_ai_score ?? 50;
  const from52h = row.pct_from_52w_high;
  const rsi = row.rsi_14;
  const vsSma50 = row.price_vs_sma50;

  // Insider buying into weak price — the classic leading signal
  if (insider >= 65 && tech < 45) {
    divergences.push({
      type: 'INSIDER_BUY_WEAK_PRICE',
      label: 'Insider buying into weakness',
      detail: 'Insiders are accumulating while the stock is technically weak — they see value the market hasn\'t priced in yet',
      strength: insider >= 75 ? 'high' : 'medium',
    });
  }

  // Contrarian insider buy — buying into a significant drawdown
  if (insider >= 65 && from52h != null && from52h < -0.2) {
    divergences.push({
      type: 'CONTRARIAN_INSIDER',
      label: 'Contrarian insider buying',
      detail: `Insiders buying ${Math.abs(from52h * 100).toFixed(0)}% off highs — historically one of the strongest predictive signals`,
      strength: from52h < -0.3 ? 'high' : 'medium',
    });
  }

  // Strong fundamentals but price hasn't caught up
  if (fund >= 65 && tech < 45) {
    const parts: string[] = [];
    if (row.revenue_growth_yoy != null && row.revenue_growth_yoy > 0.15) parts.push(`${(row.revenue_growth_yoy * 100).toFixed(0)}% revenue growth`);
    if (row.earnings_growth_yoy != null && row.earnings_growth_yoy > 0.15) parts.push(`${(row.earnings_growth_yoy * 100).toFixed(0)}% earnings growth`);
    divergences.push({
      type: 'FUNDAMENTAL_LEADS_PRICE',
      label: 'Fundamentals ahead of price',
      detail: `Business is performing well${parts.length > 0 ? ' (' + parts.join(', ') + ')' : ''} but price hasn't reflected it — potential re-rating candidate`,
      strength: fund >= 75 ? 'high' : 'medium',
    });
  }

  // AI sees value but price is bearish
  if (ai >= 68 && tech < 45) {
    divergences.push({
      type: 'AI_SEES_VALUE',
      label: 'AI conviction vs. weak price',
      detail: 'AI analysis is bullish based on the full data profile, but the market hasn\'t recognized it yet',
      strength: ai >= 78 ? 'high' : 'medium',
    });
  }

  // Growing revenue/earnings but stock is far from highs
  if (row.revenue_growth_yoy != null && row.revenue_growth_yoy > 0.15 &&
      from52h != null && from52h < -0.15) {
    divergences.push({
      type: 'GROWTH_UNNOTICED',
      label: 'Growth not reflected in price',
      detail: `Revenue growing ${(row.revenue_growth_yoy * 100).toFixed(0)}% YoY but stock is ${Math.abs(from52h * 100).toFixed(0)}% off highs — mispricing if growth sustains`,
      strength: row.revenue_growth_yoy > 0.25 && from52h < -0.25 ? 'high' : 'medium',
    });
  }

  // Oversold stock with quality fundamentals
  if (rsi != null && rsi < 35 && fund >= 60) {
    divergences.push({
      type: 'OVERSOLD_QUALITY',
      label: 'Oversold quality company',
      detail: `RSI at ${rsi.toFixed(0)} on a fundamentally sound business — selling may be exhausted, watch for reversal confirmation`,
      strength: rsi < 25 && fund >= 70 ? 'high' : 'medium',
    });
  }

  // Volume picking up while price is still below trend
  if (row.volume_ratio_50d != null && row.volume_ratio_50d >= 1.5 &&
      vsSma50 != null && vsSma50 < 0 && tech < 50) {
    divergences.push({
      type: 'QUIET_ACCUMULATION',
      label: 'Accumulation under the surface',
      detail: `Volume is ${row.volume_ratio_50d.toFixed(1)}x above average while price is still below trend — potential institutional accumulation before a move`,
      strength: row.volume_ratio_50d >= 2.0 ? 'high' : 'medium',
    });
  }

  // Institutional accumulation + weak price
  if (inst >= 65 && tech < 48) {
    divergences.push({
      type: 'SMART_MONEY_EARLY',
      label: 'Institutional positioning early',
      detail: 'Institutional investors are adding positions before the price trend has confirmed — following smart money',
      strength: inst >= 75 ? 'high' : 'medium',
    });
  }

  // Deep value not recognized — cheap stock with decent business
  if (row.pe_ratio != null && row.pe_ratio > 0 && row.pe_ratio < 12 &&
      fund >= 55 && from52h != null && from52h < -0.15) {
    divergences.push({
      type: 'DEEP_VALUE_IGNORED',
      label: 'Deep value being ignored',
      detail: `PE of ${row.pe_ratio.toFixed(1)} with sound fundamentals, trading ${Math.abs(from52h * 100).toFixed(0)}% off highs — classic value setup`,
      strength: row.pe_ratio < 8 ? 'high' : 'medium',
    });
  }

  divergences.sort((a, b) => (a.strength === 'high' ? 0 : 1) - (b.strength === 'high' ? 0 : 1));
  return divergences;
}

export function hasDivergence(row: DivergenceInput): boolean {
  return detectDivergences(row).length > 0;
}

// --- Signal Summary (divergences first, then confirmation) ---

interface SignalSummaryInput extends DivergenceInput {
  sentinel_score: number | null;
}

export function generateSignalSummary(row: SignalSummaryInput): string {
  const divergences = detectDivergences(row);

  // Lead with divergences — these are the real edge
  if (divergences.length > 0) {
    const labels = divergences.slice(0, 2).map(d => d.label.toLowerCase());
    const joined = labels.join(' · ');
    return '⚡ ' + joined.charAt(0).toUpperCase() + joined.slice(1);
  }

  // Fall back to confirmation signals
  const signals: string[] = [];

  if ((row.technical_score ?? 0) >= 75 && (row.pct_from_52w_high ?? -1) > -0.05) {
    signals.push('strong uptrend near highs');
  } else if ((row.technical_score ?? 0) >= 65) {
    signals.push('healthy technical setup');
  } else if ((row.technical_score ?? 100) < 35) {
    signals.push('weak technicals');
  }

  if ((row.revenue_growth_yoy ?? 0) > 0.25 && (row.earnings_growth_yoy ?? 0) > 0.25) {
    signals.push('accelerating growth');
  } else if ((row.fundamental_score ?? 0) >= 70) {
    signals.push('solid fundamentals');
  }

  if ((row.insider_score ?? 50) >= 70) {
    signals.push('insider buying');
  }

  if ((row.volume_ratio_50d ?? 0) >= 2.0) {
    signals.push('unusual volume');
  }

  if ((row.rsi_14 ?? 50) < 30) {
    signals.push('oversold bounce candidate');
  } else if ((row.rsi_14 ?? 50) > 70) {
    signals.push('overbought — watch for pullback');
  }

  if ((row.earnings_ai_score ?? 50) >= 75) {
    signals.push('AI bullish');
  }

  if (signals.length === 0) {
    return 'No standout signals';
  }

  const joined = signals.slice(0, 3).join(' · ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export function generateActionSummary(
  scores: { sentinel_score: number | null; technical_score: number | null; fundamental_score: number | null; insider_score: number | null; earnings_ai_score: number | null; institutional_score: number | null; news_sentiment_score: number | null; options_flow_score: number | null; rank: number | null; percentile: number | null } | null,
  technicals: { rsi_14: number | null; price_vs_sma50: number | null; price_vs_sma200: number | null; pct_from_52w_high: number | null; volume_ratio_50d: number | null; rs_rank_3m: number | null } | null,
  fundamentals: { pe_ratio: number | null; revenue_growth_yoy: number | null; earnings_growth_yoy: number | null; gross_margin: number | null; net_margin: number | null; roe: number | null; debt_to_equity: number | null } | null,
  technicalFlags: string[],
  fundamentalFlags: string[],
): { verdict: ScoreVerdict; headline: string; bullets: string[]; divergences: Divergence[] } {
  const score = scores?.sentinel_score ?? 50;
  const verdict = scoreVerdict(score);
  const bullets: string[] = [];

  // Detect divergences first — these are the edge
  const divInput: DivergenceInput = {
    sentinel_score: scores?.sentinel_score ?? null,
    technical_score: scores?.technical_score ?? null,
    fundamental_score: scores?.fundamental_score ?? null,
    insider_score: scores?.insider_score ?? null,
    institutional_score: scores?.institutional_score ?? null,
    earnings_ai_score: scores?.earnings_ai_score ?? null,
    rsi_14: technicals?.rsi_14 ?? null,
    price_vs_sma50: technicals?.price_vs_sma50 ?? null,
    price_vs_sma200: technicals?.price_vs_sma200 ?? null,
    pct_from_52w_high: technicals?.pct_from_52w_high ?? null,
    volume_ratio_50d: technicals?.volume_ratio_50d ?? null,
    revenue_growth_yoy: fundamentals?.revenue_growth_yoy ?? null,
    earnings_growth_yoy: fundamentals?.earnings_growth_yoy ?? null,
    pe_ratio: fundamentals?.pe_ratio ?? null,
  };
  const divergences = detectDivergences(divInput);

  // Add divergence bullets first — these are what make a stock interesting
  for (const div of divergences.slice(0, 3)) {
    bullets.push(div.detail);
  }

  // Technical situation
  const techScore = scores?.technical_score ?? 50;
  const rsi = technicals?.rsi_14;
  const vsSma50 = technicals?.price_vs_sma50;
  const from52h = technicals?.pct_from_52w_high;

  if (techScore >= 75) {
    let detail = 'Price is in a strong uptrend';
    if (from52h != null && from52h > -0.05) detail += ' near 52-week highs';
    if (vsSma50 != null && vsSma50 > 0) detail += `, ${(vsSma50 * 100).toFixed(0)}% above the 50-day average`;
    bullets.push(detail);
  } else if (techScore < 40 && divergences.length === 0) {
    let detail = 'Price action is weak';
    if (vsSma50 != null && vsSma50 < 0) detail += ` — trading ${Math.abs(vsSma50 * 100).toFixed(0)}% below the 50-day average`;
    bullets.push(detail);
  }

  if (rsi != null && !divergences.some(d => d.type === 'OVERSOLD_QUALITY')) {
    if (rsi < 30) bullets.push(`RSI at ${rsi.toFixed(0)} indicates oversold conditions — potential bounce setup if support holds`);
    else if (rsi > 70) bullets.push(`RSI at ${rsi.toFixed(0)} is overbought — consider waiting for a pullback before adding`);
  }

  // Fundamental situation (only if not already covered by divergences)
  const fundScore = scores?.fundamental_score ?? 50;
  const revGrowth = fundamentals?.revenue_growth_yoy;
  const earnGrowth = fundamentals?.earnings_growth_yoy;
  const pe = fundamentals?.pe_ratio;

  if (fundScore >= 70 && !divergences.some(d => d.type === 'FUNDAMENTAL_LEADS_PRICE' || d.type === 'GROWTH_UNNOTICED')) {
    const parts: string[] = ['Fundamentals are strong'];
    if (revGrowth != null && revGrowth > 0.2) parts.push(`revenue growing ${(revGrowth * 100).toFixed(0)}% YoY`);
    if (earnGrowth != null && earnGrowth > 0.2) parts.push(`earnings up ${(earnGrowth * 100).toFixed(0)}%`);
    bullets.push(parts.join(' — '));
  } else if (fundScore < 35) {
    const issues: string[] = [];
    if (fundamentals?.net_margin != null && fundamentals.net_margin < -0.05) issues.push('negative margins');
    if (fundamentals?.debt_to_equity != null && fundamentals.debt_to_equity > 2.5) issues.push('high leverage');
    bullets.push(`Fundamental concerns${issues.length > 0 ? ': ' + issues.join(', ') : ' — below-average financial health'}`);
  }

  if (pe != null && pe > 0 && pe < 12 && !divergences.some(d => d.type === 'DEEP_VALUE_IGNORED')) {
    bullets.push(`PE ratio of ${pe.toFixed(1)} suggests value pricing — verify it's not a value trap with growth trends`);
  }

  // Insider signal (only if not already a divergence)
  const insiderScore = scores?.insider_score ?? 50;
  if (insiderScore >= 70 && !divergences.some(d => d.type === 'INSIDER_BUY_WEAK_PRICE' || d.type === 'CONTRARIAN_INSIDER')) {
    bullets.push('Insiders are buying — management has skin in the game');
  } else if (insiderScore < 30) {
    bullets.push('Insider selling is elevated — watch for fundamental deterioration');
  }

  // AI signal (only if not already a divergence)
  const aiScore = scores?.earnings_ai_score ?? 50;
  if (aiScore >= 75 && !divergences.some(d => d.type === 'AI_SEES_VALUE')) {
    bullets.push('AI analysis is bullish based on the overall data profile');
  } else if (aiScore < 35) {
    bullets.push('AI analysis flags concerns across the data');
  }

  // Notable flags
  const bullishFlags = technicalFlags.filter(f => ['GOLDEN_CROSS', 'BREAKING_OUT', 'STAGE2_UPTREND', 'NEW_52W_HIGH'].includes(f));
  const bearishFlags = technicalFlags.filter(f => ['DEATH_CROSS', 'BELOW_SMA200'].includes(f));
  const fundBullish = fundamentalFlags.filter(f => ['HIGH_GROWTH', 'ACCELERATING_REVENUE', 'ACCELERATING_EARNINGS', 'CASH_MACHINE'].includes(f));

  if (bullishFlags.length > 0) {
    const names = bullishFlags.map(f => f.replace(/_/g, ' ').toLowerCase()).join(', ');
    bullets.push(`Active bullish signals: ${names}`);
  }
  if (bearishFlags.length > 0) {
    const names = bearishFlags.map(f => f.replace(/_/g, ' ').toLowerCase()).join(', ');
    bullets.push(`Warning signals: ${names}`);
  }
  if (fundBullish.length > 0 && !bullets.some(b => b.includes('Fundamentals are strong'))) {
    const names = fundBullish.map(f => f.replace(/_/g, ' ').toLowerCase()).join(', ');
    bullets.push(`Fundamental strengths: ${names}`);
  }

  // Headline — divergences override the standard verdict headlines
  let headline: string;
  if (divergences.length >= 2 && divergences.some(d => d.strength === 'high')) {
    headline = 'Multiple leading indicators diverge from price — this is where the edge lives';
  } else if (divergences.length > 0) {
    headline = 'Non-price signals are ahead of the chart — worth investigating before price catches up';
  } else if (verdict === 'Strong Buy') {
    headline = 'Multiple signals align bullishly — this is a high-conviction setup';
  } else if (verdict === 'Bullish') {
    headline = 'Majority of signals are positive — worth a closer look';
  } else if (verdict === 'Neutral') {
    headline = 'Mixed signals — no clear edge in either direction';
  } else if (verdict === 'Caution') {
    headline = 'More negatives than positives — proceed with caution';
  } else {
    headline = 'Significant headwinds across multiple dimensions — defensive positioning recommended';
  }

  return { verdict, headline, bullets: bullets.slice(0, 6), divergences };
}
