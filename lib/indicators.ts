import type { PriceBar, MACDResult, FiftyTwoWeekRange, VolumeAnomaly, PriceSpikeReversal } from './utils/types';

/**
 * All indicator functions expect prices sorted oldest-first (chronological).
 * They operate on arrays of closing prices or full PriceBar arrays.
 */

export function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

export function computeEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;

  const k = 2 / (period + 1);

  // Seed with SMA of first `period` values
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * Wilder's RSI (smoothed, not simple-average variant).
 * Returns a value 0–100.
 */
export function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average from first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  // Smooth with Wilder's method for remaining values
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD using 12/26/9 (standard).
 * Returns the latest MACD line, signal line, and histogram.
 */
export function computeMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult | null {
  if (closes.length < slowPeriod + signalPeriod) return null;

  const k_fast = 2 / (fastPeriod + 1);
  const k_slow = 2 / (slowPeriod + 1);
  const k_signal = 2 / (signalPeriod + 1);

  // Seed EMAs with SMA
  let emaFast = closes.slice(0, fastPeriod).reduce((s, v) => s + v, 0) / fastPeriod;
  let emaSlow = closes.slice(0, slowPeriod).reduce((s, v) => s + v, 0) / slowPeriod;

  const macdLine: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    if (i >= fastPeriod) {
      emaFast = closes[i] * k_fast + emaFast * (1 - k_fast);
    }
    if (i >= slowPeriod) {
      emaSlow = closes[i] * k_slow + emaSlow * (1 - k_slow);
    }
    if (i >= slowPeriod) {
      macdLine.push(emaFast - emaSlow);
    }
  }

  if (macdLine.length < signalPeriod) return null;

  // Signal line is EMA of MACD line
  let signal =
    macdLine.slice(0, signalPeriod).reduce((s, v) => s + v, 0) / signalPeriod;

  for (let i = signalPeriod; i < macdLine.length; i++) {
    signal = macdLine[i] * k_signal + signal * (1 - k_signal);
  }

  const macd = macdLine[macdLine.length - 1];
  return {
    macd,
    signal,
    histogram: macd - signal,
  };
}

/**
 * Average True Range — measures volatility.
 * Uses Wilder's smoothing.
 */
export function computeATR(bars: PriceBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  // Initial ATR is simple average
  let atr = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;

  // Wilder smoothing for the rest
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

/**
 * Volume ratio: current volume divided by N-day average volume.
 */
export function computeVolumeRatio(bars: PriceBar[], period = 50): number | null {
  if (bars.length < period + 1) return null;

  const currentVolume = bars[bars.length - 1].volume;
  const avgVolume =
    bars
      .slice(-period - 1, -1)
      .reduce((sum, b) => sum + b.volume, 0) / period;

  if (avgVolume === 0) return null;
  return currentVolume / avgVolume;
}

/**
 * 52-week high/low and percentage distance from each.
 */
export function compute52WeekRange(bars: PriceBar[]): FiftyTwoWeekRange | null {
  // Need approximately 252 trading days (1 year)
  const yearBars = bars.slice(-252);
  if (yearBars.length < 20) return null;

  const highs = yearBars.map((b) => b.high);
  const lows = yearBars.map((b) => b.low);
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const currentPrice = bars[bars.length - 1].close;

  return {
    high,
    low,
    pct_from_high: high > 0 ? (currentPrice - high) / high : 0,
    pct_from_low: low > 0 ? (currentPrice - low) / low : 0,
  };
}

/**
 * Relative strength: stock return vs benchmark return over N trading days.
 * Returns a raw ratio (> 1 means outperforming).
 */
export function computeRelativeStrength(
  stockCloses: number[],
  benchmarkCloses: number[],
  period: number,
): number | null {
  if (stockCloses.length < period + 1 || benchmarkCloses.length < period + 1) {
    return null;
  }

  const stockReturn =
    (stockCloses[stockCloses.length - 1] - stockCloses[stockCloses.length - 1 - period]) /
    stockCloses[stockCloses.length - 1 - period];

  const benchReturn =
    (benchmarkCloses[benchmarkCloses.length - 1] -
      benchmarkCloses[benchmarkCloses.length - 1 - period]) /
    benchmarkCloses[benchmarkCloses.length - 1 - period];

  if (benchReturn === 0) return null;
  return 1 + stockReturn - benchReturn;
}

/**
 * Compute a percentile rank (0–100) from an array of RS values.
 * Rank 99 means the stock outperformed 99% of the universe.
 */
export function computePercentileRank(
  value: number,
  allValues: number[],
): number {
  const sorted = [...allValues].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  return Math.round((below / sorted.length) * 100);
}

/**
 * Compute all technical signals for a stock, given its price bars
 * and (optional) benchmark closes for relative strength ranking.
 */
export function computeAllIndicators(
  bars: PriceBar[],
  benchmarkCloses?: number[],
) {
  const closes = bars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];

  const sma_20 = computeSMA(closes, 20);
  const sma_50 = computeSMA(closes, 50);
  const sma_150 = computeSMA(closes, 150);
  const sma_200 = computeSMA(closes, 200);
  const ema_10 = computeEMA(closes, 10);
  const ema_21 = computeEMA(closes, 21);

  const price_vs_sma50 =
    sma_50 && sma_50 > 0 ? (currentPrice - sma_50) / sma_50 : null;
  const price_vs_sma200 =
    sma_200 && sma_200 > 0 ? (currentPrice - sma_200) / sma_200 : null;

  const range = compute52WeekRange(bars);
  const rsi_14 = computeRSI(closes, 14);
  const macdResult = computeMACD(closes);
  const atr_14 = computeATR(bars, 14);
  const volume_ratio_50d = computeVolumeRatio(bars, 50);

  // RS raw values (to be ranked later across the universe)
  const rs_raw_3m = benchmarkCloses
    ? computeRelativeStrength(closes, benchmarkCloses, 63)
    : null;
  const rs_raw_6m = benchmarkCloses
    ? computeRelativeStrength(closes, benchmarkCloses, 126)
    : null;
  const rs_raw_12m = benchmarkCloses
    ? computeRelativeStrength(closes, benchmarkCloses, 252)
    : null;

  return {
    sma_20,
    sma_50,
    sma_150,
    sma_200,
    ema_10,
    ema_21,
    price_vs_sma50,
    price_vs_sma200,
    pct_from_52w_high: range?.pct_from_high ?? null,
    pct_from_52w_low: range?.pct_from_low ?? null,
    rsi_14,
    macd: macdResult?.macd ?? null,
    macd_signal: macdResult?.signal ?? null,
    macd_histogram: macdResult?.histogram ?? null,
    volume_ratio_50d,
    atr_14,
    atr_pct: atr_14 && currentPrice > 0 ? (atr_14 / currentPrice) * 100 : null,
    // Raw RS values — compute-technicals.ts will rank these across the universe
    rs_raw_3m,
    rs_raw_6m,
    rs_raw_12m,
  };
}

/**
 * Scan price history for volume anomalies — days where volume far exceeds
 * the trailing 50-day average. Requires at least 51 bars (50 for the average
 * + 1 bar to evaluate). Returns anomalies sorted by severity descending.
 */
export function detectVolumeAnomalies(
  bars: PriceBar[],
  symbol: string,
): VolumeAnomaly[] {
  const MIN_HISTORY = 51;
  if (bars.length < MIN_HISTORY) return [];

  const anomalies: VolumeAnomaly[] = [];

  for (let i = 50; i < bars.length; i++) {
    const trailingSlice = bars.slice(i - 50, i);
    const avgVolume = trailingSlice.reduce((sum, b) => sum + b.volume, 0) / 50;

    if (avgVolume === 0) continue;

    const ratio = bars[i].volume / avgVolume;
    let severity: VolumeAnomaly['anomaly_severity'] = 'none';
    if (ratio >= 50) severity = 'extreme';
    else if (ratio >= 10) severity = 'high';
    else if (ratio >= 5) severity = 'moderate';

    if (severity !== 'none') {
      anomalies.push({
        symbol,
        date: bars[i].date,
        volume: bars[i].volume,
        avg_volume_50d: Math.round(avgVolume),
        volume_ratio: Math.round(ratio * 10) / 10,
        is_anomaly: true,
        anomaly_severity: severity,
      });
    }
  }

  const severityOrder: Record<string, number> = { extreme: 0, high: 1, moderate: 2 };
  anomalies.sort((a, b) => severityOrder[a.anomaly_severity] - severityOrder[b.anomaly_severity]);

  return anomalies;
}

/**
 * Detect a price spike + reversal pattern: stock up >100% within any 10-day
 * window in the last 30 trading days, then reversed >20% from the peak.
 * Returns the most extreme spike found, or null.
 */
export function detectPriceSpikeReversal(
  bars: PriceBar[],
): PriceSpikeReversal | null {
  if (bars.length < 12) return null;

  const recent = bars.slice(-30);
  if (recent.length < 2) return null;

  const currentPrice = recent[recent.length - 1].close;
  let bestSpike: PriceSpikeReversal | null = null;

  for (let i = 0; i < recent.length - 1; i++) {
    const startPrice = recent[i].close;
    if (startPrice <= 0) continue;

    const windowEnd = Math.min(i + 10, recent.length - 1);

    let peakPrice = startPrice;
    let peakIdx = i;

    for (let j = i + 1; j <= windowEnd; j++) {
      if (recent[j].high > peakPrice) {
        peakPrice = recent[j].high;
        peakIdx = j;
      }
    }

    const spikePct = (peakPrice - startPrice) / startPrice;
    if (spikePct < 1.0) continue;

    const reversalPct = peakPrice > 0 ? (peakPrice - currentPrice) / peakPrice : 0;
    if (reversalPct < 0.2) continue;

    if (!bestSpike || spikePct > bestSpike.spike_pct) {
      bestSpike = {
        spike_start_date: recent[i].date,
        spike_peak_date: recent[peakIdx].date,
        spike_start_price: startPrice,
        spike_peak_price: peakPrice,
        current_price: currentPrice,
        spike_pct: Math.round(spikePct * 1000) / 10,
        reversal_pct: Math.round(reversalPct * 1000) / 10,
        days_to_peak: peakIdx - i,
      };
    }
  }

  return bestSpike;
}
