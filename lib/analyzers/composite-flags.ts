import type {
  TechnicalSignals,
  Fundamentals,
  InsiderTrade,
  PriceBar,
  DeepPullbackResult,
  InsiderClusterBuyResult,
  FirstBuy12MoResult,
  MACDShiftResult,
  FCFYieldResult,
  PECompressionResult,
  ValueReversalResult,
  ValueReversalInput,
  CompositeFlags,
} from '../utils/types';

const DEEP_PULLBACK_THRESHOLD = -0.25;
const CLUSTER_WINDOW_DAYS = 14;
const CLUSTER_MIN_BUYERS = 2;
const CLUSTER_MIN_VALUE = 200_000;
const FIRST_BUY_LOOKBACK_DAYS = 365;
const MACD_LOOKBACK_BARS = 5;
const FCF_YIELD_THRESHOLD = 0.05;
const PE_COMPRESSION_RATIO = 0.85;
const MIN_CONDITIONS_TO_FIRE = 4;
const TOTAL_CONDITIONS = 6;

function isOpenMarketBuy(txType: string): boolean {
  const lower = txType.toLowerCase();
  if (lower.includes('option') || lower.includes('exercise')) return false;
  return lower.includes('buy') || lower.includes('purchase');
}

export function checkDeepPullback(
  technicals: TechnicalSignals | null,
): DeepPullbackResult {
  if (!technicals || technicals.pct_from_52w_high == null) {
    return { met: false, pct_from_high: null };
  }
  const pct = technicals.pct_from_52w_high;
  return { met: pct <= DEEP_PULLBACK_THRESHOLD, pct_from_high: pct };
}

export function checkInsiderClusterBuy(
  trades: InsiderTrade[],
): InsiderClusterBuyResult {
  const noResult: InsiderClusterBuyResult = {
    met: false,
    buyers: [],
    total_value: 0,
    window_start: null,
    window_end: null,
  };

  const buys = trades.filter(
    (t) => isOpenMarketBuy(t.transaction_type) && t.transaction_date,
  );
  if (buys.length < CLUSTER_MIN_BUYERS) return noResult;

  const sorted = [...buys].sort(
    (a, b) =>
      new Date(a.transaction_date).getTime() -
      new Date(b.transaction_date).getTime(),
  );

  let bestWindow: InsiderClusterBuyResult = noResult;

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = new Date(sorted[i].transaction_date);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + CLUSTER_WINDOW_DAYS);

    const windowTrades = sorted.filter((t) => {
      const d = new Date(t.transaction_date);
      return d >= windowStart && d <= windowEnd;
    });

    const distinctBuyers = [...new Set(windowTrades.map((t) => t.insider_name))];
    const totalValue = windowTrades.reduce(
      (sum, t) => sum + Math.abs(t.transaction_value ?? 0),
      0,
    );

    if (
      distinctBuyers.length >= CLUSTER_MIN_BUYERS &&
      totalValue >= CLUSTER_MIN_VALUE &&
      (totalValue > bestWindow.total_value ||
        distinctBuyers.length > bestWindow.buyers.length)
    ) {
      bestWindow = {
        met: true,
        buyers: distinctBuyers,
        total_value: totalValue,
        window_start: sorted[i].transaction_date,
        window_end: windowEnd.toISOString().split('T')[0],
      };
    }
  }

  return bestWindow;
}

export function checkFirstBuyIn12Months(
  clusterResult: InsiderClusterBuyResult,
  allTrades: InsiderTrade[],
): FirstBuy12MoResult {
  if (!clusterResult.met || !clusterResult.window_start) {
    return { met: false, insider: null };
  }

  const windowStart = new Date(clusterResult.window_start);
  const lookbackStart = new Date(windowStart);
  lookbackStart.setDate(lookbackStart.getDate() - FIRST_BUY_LOOKBACK_DAYS);

  for (const buyerName of clusterResult.buyers) {
    const priorBuys = allTrades.filter((t) => {
      if (t.insider_name !== buyerName) return false;
      if (!isOpenMarketBuy(t.transaction_type)) return false;
      const d = new Date(t.transaction_date);
      return d >= lookbackStart && d < windowStart;
    });

    if (priorBuys.length === 0) {
      return { met: true, insider: buyerName };
    }
  }

  return { met: false, insider: null };
}

function computeMACDHistogramSeries(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): number[] {
  if (closes.length < slowPeriod + signalPeriod) return [];

  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
  const kSignal = 2 / (signalPeriod + 1);

  let eFast = closes.slice(0, fastPeriod).reduce((s, v) => s + v, 0) / fastPeriod;
  let eSlow = closes.slice(0, slowPeriod).reduce((s, v) => s + v, 0) / slowPeriod;

  const macdLine: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    if (i >= fastPeriod) eFast = closes[i] * kFast + eFast * (1 - kFast);
    if (i >= slowPeriod) eSlow = closes[i] * kSlow + eSlow * (1 - kSlow);
    if (i >= slowPeriod) {
      macdLine.push(eFast - eSlow);
    }
  }

  if (macdLine.length < signalPeriod) return [];

  let signal =
    macdLine.slice(0, signalPeriod).reduce((s, v) => s + v, 0) / signalPeriod;

  const histograms: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (i >= signalPeriod) {
      signal = macdLine[i] * kSignal + signal * (1 - kSignal);
    }
    if (i >= signalPeriod - 1) {
      histograms.push(macdLine[i] - signal);
    }
  }

  return histograms;
}

export function checkMACDMomentumShift(
  prices: PriceBar[],
): MACDShiftResult {
  if (prices.length < 35) {
    return { met: false, current_histogram: null, prior_negative_date: null };
  }

  const closes = prices.map((p) => p.close);
  const histograms = computeMACDHistogramSeries(closes);

  if (histograms.length < MACD_LOOKBACK_BARS + 1) {
    return { met: false, current_histogram: null, prior_negative_date: null };
  }

  const current = histograms[histograms.length - 1];
  if (current <= 0) {
    return { met: false, current_histogram: current, prior_negative_date: null };
  }

  const recentSlice = histograms.slice(
    -(MACD_LOOKBACK_BARS + 1),
    -1,
  );

  const priorNegIdx = recentSlice.findIndex((h) => h < 0);
  if (priorNegIdx === -1) {
    return { met: false, current_histogram: current, prior_negative_date: null };
  }

  const offsetFromEnd = MACD_LOOKBACK_BARS - priorNegIdx;
  const negDate =
    prices.length >= offsetFromEnd + 1
      ? prices[prices.length - 1 - offsetFromEnd].date
      : null;

  return { met: true, current_histogram: current, prior_negative_date: negDate };
}

export function checkStrongFCFYield(
  fundamentals: Fundamentals | null,
  marketCap: number | null,
): FCFYieldResult {
  if (
    !fundamentals ||
    fundamentals.free_cash_flow == null ||
    !marketCap ||
    marketCap <= 0
  ) {
    return { met: false, yield_pct: null };
  }

  const fcfYield = fundamentals.free_cash_flow / marketCap;
  return { met: fcfYield >= FCF_YIELD_THRESHOLD, yield_pct: fcfYield };
}

export function checkPECompression(
  fundamentals: Fundamentals | null,
): PECompressionResult {
  if (
    !fundamentals ||
    fundamentals.forward_pe == null ||
    fundamentals.pe_ratio == null ||
    fundamentals.pe_ratio <= 0
  ) {
    return { met: false, current_pe: fundamentals?.pe_ratio ?? null, forward_pe: fundamentals?.forward_pe ?? null };
  }

  const compressed = fundamentals.forward_pe < fundamentals.pe_ratio * PE_COMPRESSION_RATIO;
  return {
    met: compressed,
    current_pe: fundamentals.pe_ratio,
    forward_pe: fundamentals.forward_pe,
  };
}

export function detectValueReversalCandidate(
  input: ValueReversalInput,
): ValueReversalResult {
  const deepPullback = checkDeepPullback(input.technicals);
  const insiderCluster = checkInsiderClusterBuy(input.insiderTrades);
  const firstBuy = checkFirstBuyIn12Months(insiderCluster, input.insiderTrades);
  const macdShift = checkMACDMomentumShift(input.prices);
  const fcfYield = checkStrongFCFYield(input.fundamentals, input.marketCap);
  const peCompression = checkPECompression(input.fundamentals);

  const details = {
    deep_pullback: deepPullback,
    insider_cluster_buy: insiderCluster,
    first_buy_12mo: firstBuy,
    macd_shift: macdShift,
    fcf_yield: fcfYield,
    pe_compression: peCompression,
  };

  const conditions = [
    deepPullback.met,
    insiderCluster.met,
    firstBuy.met,
    macdShift.met,
    fcfYield.met,
    peCompression.met,
  ];

  const conditionsMet = conditions.filter(Boolean).length;
  const conviction = Math.max(
    0,
    Math.min(100, Math.round((conditionsMet / TOTAL_CONDITIONS) * 100)),
  );

  return {
    fired: conditionsMet >= MIN_CONDITIONS_TO_FIRE,
    conditions_met: conditionsMet,
    conviction,
    details,
  };
}

export function detectCompositeFlags(
  input: ValueReversalInput,
): CompositeFlags {
  const flags: string[] = [];
  const metadata: { value_reversal?: ValueReversalResult } = {};

  const vrResult = detectValueReversalCandidate(input);
  if (vrResult.fired) {
    flags.push('VALUE_REVERSAL_CANDIDATE');
  }
  metadata.value_reversal = vrResult;

  return { flags, metadata };
}
