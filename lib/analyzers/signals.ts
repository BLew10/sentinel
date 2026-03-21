import { detectVolumeAnomalies, detectPriceSpikeReversal } from '../indicators';
import { detectFilingFlags } from './sec-filings';
import { detectInsiderFlags } from './insider';
import { formatVolume } from '../utils/format';
import type {
  PriceBar,
  FDSECFiling,
  InsiderTrade,
  InsiderFlag,
  DetectedSignal,
  VolumeAnomaly,
  FilingFlag,
  SignalSeverity,
} from '../utils/types';

interface DetectAllSignalsInput {
  symbol: string;
  prices: PriceBar[];
  filings: FDSECFiling[];
  insiderTrades: InsiderTrade[];
  marketCap: number | null;
}

const SEVERITY_ORDER: Record<SignalSeverity, number> = {
  HIGH: 0,
  INVESTIGATE: 1,
  CAUTION: 2,
  RISK: 3,
  WATCH: 4,
};

function volumeAnomalyToSignal(a: VolumeAnomaly): DetectedSignal {
  const ratioStr = a.volume_ratio >= 1000
    ? `${Math.round(a.volume_ratio / 100) * 100}x`
    : `${Math.round(a.volume_ratio)}x`;

  return {
    id: `vol-${a.date}`,
    type: 'VOLUME_SPIKE',
    label: a.anomaly_severity === 'extreme' ? 'Extreme Volume Spike' : 'Volume Spike',
    severity: a.anomaly_severity === 'extreme' ? 'HIGH' : 'HIGH',
    direction: 'neutral',
    description: `${formatVolume(a.volume)} shares traded (${ratioStr} normal)`,
    date: a.date,
    icon: '⚡',
  };
}

function filingFlagToSignal(f: FilingFlag): DetectedSignal {
  const configs: Record<string, { label: string; severity: SignalSeverity; direction: DetectedSignal['direction']; icon: string; desc: string }> = {
    DILUTION_FILING: {
      label: 'Dilution Filing',
      severity: 'CAUTION',
      direction: 'bearish',
      icon: '📄',
      desc: `${f.filing.filing_type} prospectus filed`,
    },
    '13D_AMENDMENT': {
      label: '13D Amendment',
      severity: 'WATCH',
      direction: 'neutral',
      icon: '📄',
      desc: 'Major shareholder filing',
    },
    INSIDER_FORM4: {
      label: 'Insider Form 4',
      severity: 'WATCH',
      direction: 'neutral',
      icon: '👔',
      desc: 'Insider ownership change',
    },
  };

  const cfg = configs[f.type] ?? {
    label: f.type,
    severity: 'WATCH' as SignalSeverity,
    direction: 'neutral' as const,
    icon: '📄',
    desc: f.filing.filing_type,
  };

  return {
    id: `filing-${f.type}-${f.filing.filing_date}`,
    type: f.type,
    label: cfg.label,
    severity: cfg.severity,
    direction: cfg.direction,
    description: cfg.desc,
    date: f.filing.filing_date,
    icon: cfg.icon,
  };
}

const INSIDER_FLAG_CONFIG: Record<InsiderFlag, { label: string; severity: SignalSeverity; direction: DetectedSignal['direction']; icon: string; desc: string }> = {
  CLUSTER_BUY: { label: 'Insider Cluster Buy', severity: 'HIGH', direction: 'bullish', icon: '👔', desc: 'Multiple insiders buying simultaneously' },
  CLUSTER_SELL: { label: 'Insider Cluster Sell', severity: 'CAUTION', direction: 'bearish', icon: '👔', desc: 'Multiple insiders selling simultaneously' },
  CEO_BUY: { label: 'CEO Purchase', severity: 'HIGH', direction: 'bullish', icon: '👔', desc: 'CEO buying shares on the open market' },
  CEO_SELL: { label: 'CEO Sale', severity: 'WATCH', direction: 'bearish', icon: '👔', desc: 'CEO selling shares' },
  LARGE_BUY: { label: 'Large Insider Buy', severity: 'WATCH', direction: 'bullish', icon: '👔', desc: 'Insider purchase over $500K' },
  MEGA_BUY: { label: 'Mega Insider Buy', severity: 'HIGH', direction: 'bullish', icon: '👔', desc: 'Insider purchase over $1M' },
  CONTRARIAN_BUY: { label: 'Contrarian Buy', severity: 'INVESTIGATE', direction: 'bullish', icon: '👔', desc: 'Insider buying while stock is falling' },
  FIRST_BUY_12MO: { label: 'First Buy in 12 Months', severity: 'WATCH', direction: 'bullish', icon: '👔', desc: 'First insider buy in 12+ months' },
  ACCELERATING_SELLS: { label: 'Accelerating Insider Sells', severity: 'CAUTION', direction: 'bearish', icon: '👔', desc: 'Insider selling pace increasing' },
};

function insiderFlagToSignal(flag: InsiderFlag, latestTradeDate: string): DetectedSignal {
  const cfg = INSIDER_FLAG_CONFIG[flag];
  return {
    id: `insider-${flag}`,
    type: flag,
    label: cfg.label,
    severity: cfg.severity,
    direction: cfg.direction,
    description: cfg.desc,
    date: latestTradeDate,
    icon: cfg.icon,
  };
}

/**
 * Detect all actionable signals for a stock from its available data.
 * Returns signals sorted by severity (HIGH first), then by date (most recent first).
 */
export function detectAllSignals(input: DetectAllSignalsInput): DetectedSignal[] {
  const { symbol, prices, filings, insiderTrades, marketCap } = input;
  const signals: DetectedSignal[] = [];

  // Volume anomalies (filter to last 10 trading days for relevance)
  const volumeAnomalies = detectVolumeAnomalies(prices, symbol);
  const recentAnomalies = volumeAnomalies.filter((a) => {
    const daysAgo = (Date.now() - new Date(a.date).getTime()) / 86_400_000;
    return daysAgo <= 20;
  });
  for (const anomaly of recentAnomalies) {
    signals.push(volumeAnomalyToSignal(anomaly));
  }

  // SEC filing flags
  const filingFlags = detectFilingFlags(filings);
  for (const ff of filingFlags) {
    signals.push(filingFlagToSignal(ff));
  }

  // Insider flags
  const insiderFlags = detectInsiderFlags(insiderTrades, prices);
  const latestTradeDate = insiderTrades.length > 0
    ? insiderTrades.reduce((latest, t) =>
        t.transaction_date > latest ? t.transaction_date : latest,
      insiderTrades[0].transaction_date)
    : new Date().toISOString().split('T')[0];

  for (const flag of insiderFlags) {
    signals.push(insiderFlagToSignal(flag, latestTradeDate));
  }

  // Price spike + reversal
  const spikeReversal = detectPriceSpikeReversal(prices);
  if (spikeReversal) {
    signals.push({
      id: `spike-reversal-${spikeReversal.spike_start_date}`,
      type: 'PRICE_SPIKE_REVERSAL',
      label: 'Price Spike Reversal',
      severity: 'CAUTION',
      direction: 'bearish',
      description: `+${spikeReversal.spike_pct}% in ${spikeReversal.days_to_peak} days, now -${spikeReversal.reversal_pct}% from peak`,
      date: spikeReversal.spike_peak_date,
      icon: '📉',
    });
  }

  // Penny stock warning
  if (prices.length > 0) {
    const lastPrice = prices[prices.length - 1].close;
    if (lastPrice < 5 && marketCap != null && marketCap < 300_000_000) {
      signals.push({
        id: 'penny-stock',
        type: 'PENNY_STOCK_WARNING',
        label: 'Penny Stock',
        severity: 'RISK',
        direction: 'neutral',
        description: `$${lastPrice.toFixed(2)}, ${marketCap >= 1_000_000 ? `$${Math.round(marketCap / 1_000_000)}M` : `$${Math.round(marketCap / 1_000)}K`} market cap`,
        date: prices[prices.length - 1].date,
        icon: '⚠️',
      });
    }
  }

  // Cross-signal: insider Form 4 filings within 2 days of a volume anomaly
  const form4Filings = filingFlags.filter((f) => f.type === 'INSIDER_FORM4');
  if (form4Filings.length > 0 && recentAnomalies.length > 0) {
    for (const form4 of form4Filings) {
      const filingTime = new Date(form4.filing.filing_date).getTime();
      const nearbyAnomaly = recentAnomalies.some((a) => {
        const anomalyTime = new Date(a.date).getTime();
        return Math.abs(filingTime - anomalyTime) <= 2 * 86_400_000;
      });
      if (nearbyAnomaly) {
        signals.push({
          id: `cross-insider-spike-${form4.filing.filing_date}`,
          type: 'INSIDER_FILING_NEAR_SPIKE',
          label: 'Insider Filing Near Spike',
          severity: 'INVESTIGATE',
          direction: 'neutral',
          description: `Form 4 filed ${form4.filing.filing_date} within 2 days of volume anomaly`,
          date: form4.filing.filing_date,
          icon: '🔍',
        });
      }
    }
  }

  // Sort: severity first, then most recent date first
  signals.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.date.localeCompare(a.date);
  });

  return signals;
}

/**
 * Returns true if any volume anomaly exists within the last 5 trading days.
 * Used by the technical score to add a +10 boost.
 */
export function hasRecentVolumeAnomaly(prices: PriceBar[], symbol: string): boolean {
  const anomalies = detectVolumeAnomalies(prices, symbol);
  return anomalies.some((a) => {
    const daysAgo = (Date.now() - new Date(a.date).getTime()) / 86_400_000;
    return daysAgo <= 7;
  });
}
