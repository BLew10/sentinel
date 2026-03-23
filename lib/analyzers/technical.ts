import type { TechnicalSignals, PriceBar, BollingerBands, RSIDivergence, VolumeDryUp } from '../utils/types';
import {
  computeBollingerBands,
  computeOBVSlope,
  detectRSIDivergence,
  detectVolumeDryUp,
  computeATRPercentile,
} from '../indicators';

export type TechnicalFlag =
  | 'GOLDEN_CROSS'
  | 'DEATH_CROSS'
  | 'RSI_OVERSOLD'
  | 'RSI_OVERBOUGHT'
  | 'MACD_BULLISH_CROSS'
  | 'MACD_BEARISH_CROSS'
  | 'VOLUME_SURGE'
  | 'NEW_52W_HIGH'
  | 'NEAR_52W_HIGH'
  | 'BREAKING_OUT'
  | 'STAGE2_UPTREND'
  | 'BELOW_SMA200'
  | 'BB_SQUEEZE'
  | 'RSI_BULLISH_DIVERGENCE'
  | 'RSI_BEARISH_DIVERGENCE'
  | 'OBV_ACCUMULATION'
  | 'OBV_DISTRIBUTION'
  | 'VOLUME_DRY_UP'
  | 'ATR_SQUEEZE'
  | 'RS_ACCELERATING'
  | 'RS_DECELERATING';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function lerp(value: number, inLow: number, inHigh: number, outLow = 0, outHigh = 100): number {
  if (inHigh === inLow) return (outLow + outHigh) / 2;
  const t = (value - inLow) / (inHigh - inLow);
  return outLow + t * (outHigh - outLow);
}

export interface PredictiveTechnicalData {
  bollinger: BollingerBands | null;
  rsiDivergence: RSIDivergence | null;
  obvSlope: number | null;
  volumeDryUp: VolumeDryUp | null;
  atrPercentile: number | null;
  rsRankDelta: number | null;
}

export function computeTechnicalScore(
  signals: TechnicalSignals,
  opts?: { recentVolumeAnomaly?: boolean; predictive?: PredictiveTechnicalData },
): number {
  const scores: number[] = [];

  // RSI: 30-70 is neutral territory. Below 30 = oversold (bullish contrarian), above 70 = overbought
  if (signals.rsi_14 != null) {
    let rsiScore: number;
    if (signals.rsi_14 < 30) rsiScore = lerp(signals.rsi_14, 10, 30, 55, 65);
    else if (signals.rsi_14 <= 60) rsiScore = lerp(signals.rsi_14, 30, 60, 50, 80);
    else if (signals.rsi_14 <= 70) rsiScore = lerp(signals.rsi_14, 60, 70, 80, 70);
    else rsiScore = lerp(signals.rsi_14, 70, 90, 70, 30);
    scores.push(clamp(rsiScore));
  }

  // Trend alignment: price above moving averages
  if (signals.price_vs_sma50 != null) {
    scores.push(clamp(lerp(signals.price_vs_sma50, -0.15, 0.15, 15, 85)));
  }
  if (signals.price_vs_sma200 != null) {
    scores.push(clamp(lerp(signals.price_vs_sma200, -0.2, 0.2, 15, 85)));
  }

  // MACD histogram: positive = bullish momentum
  if (signals.macd_histogram != null && signals.sma_50 != null && signals.sma_50 > 0) {
    const macdNormalized = signals.macd_histogram / signals.sma_50;
    scores.push(clamp(lerp(macdNormalized, -0.02, 0.02, 20, 80)));
  }

  // Volume ratio: above 1.5 = elevated interest
  if (signals.volume_ratio_50d != null) {
    scores.push(clamp(lerp(signals.volume_ratio_50d, 0.5, 2.5, 30, 80)));
  }

  // Relative strength rank (already 0-100 percentile)
  if (signals.rs_rank_3m != null) scores.push(signals.rs_rank_3m);
  if (signals.rs_rank_6m != null) scores.push(signals.rs_rank_6m);

  // Proximity to 52-week high: near high = bullish
  if (signals.pct_from_52w_high != null) {
    scores.push(clamp(lerp(signals.pct_from_52w_high, -0.4, 0, 10, 85)));
  }

  // ── Predictive sub-scores (forward-looking) ──

  if (opts?.predictive) {
    const p = opts.predictive;

    // RSI divergence: bullish divergence = bonus, bearish = penalty
    if (p.rsiDivergence) {
      scores.push(p.rsiDivergence.type === 'bullish' ? 75 : 25);
    }

    // OBV slope: accumulation (positive slope) vs distribution (negative)
    if (p.obvSlope != null) {
      scores.push(clamp(lerp(p.obvSlope, -0.3, 0.3, 25, 75)));
    }

    // ATR squeeze: low percentile = volatility contraction = big move coming
    // This is directionally neutral but we slightly favor it when trend is bullish
    if (p.atrPercentile != null && p.atrPercentile <= 15) {
      const trendBias = signals.price_vs_sma50 != null && signals.price_vs_sma50 > 0 ? 65 : 50;
      scores.push(trendBias);
    }

    // RS rank acceleration: improving RS predicts continuation
    if (p.rsRankDelta != null) {
      scores.push(clamp(lerp(p.rsRankDelta, -15, 15, 30, 70)));
    }
  }

  if (scores.length === 0) return 50;

  let result = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (opts?.recentVolumeAnomaly) result += 10;

  return clamp(result);
}

export function detectTechnicalFlags(
  signals: TechnicalSignals,
  predictive?: PredictiveTechnicalData,
): TechnicalFlag[] {
  const flags: TechnicalFlag[] = [];

  if (signals.rsi_14 != null) {
    if (signals.rsi_14 < 30) flags.push('RSI_OVERSOLD');
    if (signals.rsi_14 > 70) flags.push('RSI_OVERBOUGHT');
  }

  if (signals.macd != null && signals.macd_signal != null && signals.macd_histogram != null) {
    if (signals.macd > signals.macd_signal && signals.macd_histogram > 0 && signals.macd_histogram < (signals.sma_50 ?? 1) * 0.005) {
      flags.push('MACD_BULLISH_CROSS');
    }
    if (signals.macd < signals.macd_signal && signals.macd_histogram < 0 && signals.macd_histogram > -(signals.sma_50 ?? 1) * 0.005) {
      flags.push('MACD_BEARISH_CROSS');
    }
  }

  if (signals.volume_ratio_50d != null && signals.volume_ratio_50d >= 2.0) {
    flags.push('VOLUME_SURGE');
  }

  if (signals.pct_from_52w_high != null) {
    if (signals.pct_from_52w_high >= -0.01) flags.push('NEW_52W_HIGH');
    else if (signals.pct_from_52w_high >= -0.05) flags.push('NEAR_52W_HIGH');
  }

  if (
    signals.price_vs_sma50 != null && signals.price_vs_sma50 > 0 &&
    signals.price_vs_sma200 != null && signals.price_vs_sma200 > 0 &&
    signals.sma_50 != null && signals.sma_150 != null && signals.sma_200 != null &&
    signals.sma_50 > signals.sma_150 && signals.sma_150 > signals.sma_200
  ) {
    flags.push('STAGE2_UPTREND');
    if (signals.pct_from_52w_high != null && signals.pct_from_52w_high >= -0.1 &&
        signals.volume_ratio_50d != null && signals.volume_ratio_50d >= 1.5) {
      flags.push('BREAKING_OUT');
    }
  }

  if (signals.price_vs_sma200 != null && signals.price_vs_sma200 < -0.05) {
    flags.push('BELOW_SMA200');
  }

  // Golden/death cross: SMA50 vs SMA200 relationship
  if (signals.sma_50 != null && signals.sma_200 != null) {
    const crossRatio = (signals.sma_50 - signals.sma_200) / signals.sma_200;
    if (crossRatio > 0 && crossRatio < 0.02) flags.push('GOLDEN_CROSS');
    if (crossRatio < 0 && crossRatio > -0.02) flags.push('DEATH_CROSS');
  }

  // ── Predictive flags ──
  if (predictive) {
    if (predictive.bollinger?.is_squeeze) flags.push('BB_SQUEEZE');
    if (predictive.rsiDivergence?.type === 'bullish') flags.push('RSI_BULLISH_DIVERGENCE');
    if (predictive.rsiDivergence?.type === 'bearish') flags.push('RSI_BEARISH_DIVERGENCE');
    if (predictive.obvSlope != null && predictive.obvSlope > 0.15) flags.push('OBV_ACCUMULATION');
    if (predictive.obvSlope != null && predictive.obvSlope < -0.15) flags.push('OBV_DISTRIBUTION');
    if (predictive.volumeDryUp) flags.push('VOLUME_DRY_UP');
    if (predictive.atrPercentile != null && predictive.atrPercentile <= 10) flags.push('ATR_SQUEEZE');
    if (predictive.rsRankDelta != null && predictive.rsRankDelta >= 10) flags.push('RS_ACCELERATING');
    if (predictive.rsRankDelta != null && predictive.rsRankDelta <= -10) flags.push('RS_DECELERATING');
  }

  return flags;
}

/**
 * Compute predictive technical data from price bars.
 */
export function computePredictiveTechnicals(
  bars: PriceBar[],
  prevRsRank3m: number | null,
  currentRsRank3m: number | null,
): PredictiveTechnicalData {
  const closes = bars.map((b) => b.close);

  return {
    bollinger: computeBollingerBands(closes),
    rsiDivergence: detectRSIDivergence(bars),
    obvSlope: computeOBVSlope(bars),
    volumeDryUp: detectVolumeDryUp(bars),
    atrPercentile: computeATRPercentile(bars),
    rsRankDelta: prevRsRank3m != null && currentRsRank3m != null
      ? currentRsRank3m - prevRsRank3m
      : null,
  };
}

export type SmaCrossoverType = 'golden_cross' | 'death_cross';

/**
 * Detects a true SMA50/SMA200 crossover by comparing previous and current values.
 * Returns the crossover type if one occurred, or null if no cross happened.
 */
export function detectSmaCrossover(
  prevSma50: number | null,
  prevSma200: number | null,
  newSma50: number | null,
  newSma200: number | null,
): SmaCrossoverType | null {
  if (prevSma50 == null || prevSma200 == null || newSma50 == null || newSma200 == null) {
    return null;
  }
  if (prevSma50 <= prevSma200 && newSma50 > newSma200) return 'golden_cross';
  if (prevSma50 >= prevSma200 && newSma50 < newSma200) return 'death_cross';
  return null;
}
