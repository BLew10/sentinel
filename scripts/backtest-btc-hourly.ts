import 'dotenv/config';
import { fetchKlines, fetchMultiSymbolKlines, sliceKlines, type BinanceKline } from '../lib/binance-klines';

// ── Types ──────────────────────────────────────────────────────

type Regime = 'trending' | 'choppy_dangerous' | 'choppy_boring' | 'dead';
type Direction = 'YES' | 'NO' | 'NEUTRAL';

interface SignalOutput {
  direction: Direction;
  strength: number;
  confidence: number;
}

interface HourlyWindowResult {
  windowStart: number;
  openPrice: number;
  closePrice: number;
  outcome: 'YES' | 'NO';
  regime: Regime;
  hour: number;
  signals: Map<string, SignalOutput>;
  compositeScore: number;
  compositeDirection: Direction;
}

interface SignalStats {
  signal: string;
  total: number;
  agreeing: number;
  hitRate: number;
  avgStrength: number;
  avgConfidence: number;
  wilsonLower: number;
  wilsonUpper: number;
  byRegime: Map<Regime, { n: number; hits: number; hitRate: number }>;
  byStrengthBucket: Map<string, { n: number; hits: number; hitRate: number }>;
}

// ── Indicator Helpers ──────────────────────────────────────────

function computeEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  ema.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}

function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
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
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function slope(values: number[], lookback = 3): number {
  if (values.length < lookback) return 0;
  const recent = values.slice(-lookback);
  return (recent[recent.length - 1] - recent[0]) / lookback;
}

function velocity(values: number[], lookback = 20): number {
  if (values.length < lookback + 1) return 0;
  const recent = values.slice(-lookback);
  const changes: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    changes.push(recent[i] - recent[i - 1]);
  }
  if (changes.length < 2) return 0;
  const firstHalf = changes.slice(0, Math.floor(changes.length / 2));
  const secondHalf = changes.slice(Math.floor(changes.length / 2));
  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  return avgSecond - avgFirst;
}

// ── Regime Detection ──────────────────────────────────────────

function calculateEfficiencyRatio(closes: number[]): number {
  if (closes.length < 2) return 0;
  const netMove = Math.abs(closes[closes.length - 1] - closes[0]);
  let sumAbsMoves = 0;
  for (let i = 1; i < closes.length; i++) {
    sumAbsMoves += Math.abs(closes[i] - closes[i - 1]);
  }
  if (sumAbsMoves === 0) return 0;
  return Math.min(1, netMove / sumAbsMoves);
}

function calculateRealizedVol(closes: number[], periodMinutes: number): number {
  if (closes.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const stddev = Math.sqrt(variance);
  const periodsPerYear = 525960 / periodMinutes;
  return stddev * Math.sqrt(periodsPerYear * closes.length);
}

function classifyRegime(efficiencyRatio: number, realizedVol: number): Regime {
  if (realizedVol < 0.2) return 'dead';
  if (efficiencyRatio > 0.4) return 'trending';
  if (efficiencyRatio < 0.3) {
    return realizedVol > 0.5 ? 'choppy_dangerous' : 'choppy_boring';
  }
  return realizedVol > 0.3 ? 'trending' : 'choppy_boring';
}

// ── Signal Implementations ────────────────────────────────────

function momentumSignal(
  openPrice: number,
  currentPrice: number,
  minuteCloses: number[],
): SignalOutput {
  const priceChange = (currentPrice - openPrice) / openPrice;
  const absPriceChange = Math.abs(priceChange);
  const momentumThreshold = 0.0008;
  const maxPriceChangeForStrength = 0.015;

  if (absPriceChange < momentumThreshold * 0.3) {
    return { direction: 'NEUTRAL', strength: 0, confidence: 0 };
  }

  const direction: Direction = priceChange > 0 ? 'YES' : 'NO';

  if (absPriceChange < momentumThreshold) {
    const proximityRatio = absPriceChange / momentumThreshold;
    return { direction, strength: proximityRatio * 0.4, confidence: 0.2 + proximityRatio * 0.15 };
  }

  const strength = Math.min(absPriceChange / maxPriceChangeForStrength, 1.0);
  let confidence = 0.5;

  const emaValues = computeEMA(minuteCloses, 20);
  if (emaValues.length >= 3) {
    const emaSlope = slope(emaValues, 3);
    const emaSlopeDir: Direction = emaSlope > 0 ? 'YES' : emaSlope < 0 ? 'NO' : 'NEUTRAL';
    if (emaSlopeDir === direction) confidence += 0.1;
    else if (emaSlopeDir !== 'NEUTRAL') confidence -= 0.15;
  }

  const vel = velocity(minuteCloses, 20);
  const isAccelerating = priceChange > 0 ? vel > 0 : vel < 0;
  if (isAccelerating) confidence += 0.15;
  else confidence -= 0.1;

  return { direction, strength, confidence: Math.max(0, Math.min(1, confidence)) };
}

function orderFlowSignal(minuteCandles: BinanceKline[]): SignalOutput {
  if (minuteCandles.length < 10) {
    return { direction: 'NEUTRAL', strength: 0, confidence: 0 };
  }

  let totalBuyVol = 0;
  let totalVol = 0;
  for (const c of minuteCandles) {
    totalBuyVol += c.takerBuyBaseVolume;
    totalVol += c.volume;
  }

  if (totalVol === 0) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const buyRatio = totalBuyVol / totalVol;
  const imbalance = (buyRatio - 0.5) * 2; // Scale to [-1, 1]
  const absImbalance = Math.abs(imbalance);
  const threshold = 0.15;

  if (absImbalance < threshold) {
    return { direction: 'NEUTRAL', strength: 0, confidence: 0.45 };
  }

  const direction: Direction = imbalance > 0 ? 'YES' : 'NO';
  const strength = Math.min(1.0, absImbalance / (threshold * 2));
  let confidence = 0.45;
  if (absImbalance > threshold * 2) confidence += 0.15;
  if (minuteCandles.length > 30) confidence += 0.05;

  return { direction, strength, confidence: Math.min(0.75, confidence) };
}

function crossAssetLagSignal(
  btc5mCandles: BinanceKline[],
  eth5mCandles: BinanceKline[],
  sol5mCandles: BinanceKline[],
): SignalOutput {
  if (btc5mCandles.length < 2 || eth5mCandles.length < 2 || sol5mCandles.length < 2) {
    return { direction: 'NEUTRAL', strength: 0, confidence: 0 };
  }

  const lastBtc = btc5mCandles[btc5mCandles.length - 1];
  const prevBtc = btc5mCandles[btc5mCandles.length - 2];
  const btcChange = (lastBtc.close - prevBtc.close) / prevBtc.close;

  const lastEth = eth5mCandles[eth5mCandles.length - 1];
  const prevEth = eth5mCandles[eth5mCandles.length - 2];
  const ethChange = (lastEth.close - prevEth.close) / prevEth.close;

  const lastSol = sol5mCandles[sol5mCandles.length - 1];
  const prevSol = sol5mCandles[sol5mCandles.length - 2];
  const solChange = (lastSol.close - prevSol.close) / prevSol.close;

  const btcLeadThreshold = 0.002;
  const altFlatThreshold = 0.0005;

  // BTC leads: BTC moved significantly, alts still flat
  if (Math.abs(btcChange) > btcLeadThreshold &&
      Math.abs(ethChange) < altFlatThreshold &&
      Math.abs(solChange) < altFlatThreshold) {
    const direction: Direction = btcChange > 0 ? 'YES' : 'NO';
    const strength = Math.min(1.0, Math.abs(btcChange) / (btcLeadThreshold * 3));
    return { direction, strength, confidence: 0.5 };
  }

  // Alts consensus: ETH+SOL moved, BTC flat → BTC follows
  const altConsensus = Math.sign(ethChange) === Math.sign(solChange) &&
    Math.abs(ethChange) > btcLeadThreshold &&
    Math.abs(solChange) > btcLeadThreshold &&
    Math.abs(btcChange) < altFlatThreshold;

  if (altConsensus) {
    const direction: Direction = ethChange > 0 ? 'YES' : 'NO';
    const strength = Math.min(1.0, (Math.abs(ethChange) + Math.abs(solChange)) / (btcLeadThreshold * 6));
    return { direction, strength, confidence: 0.45 };
  }

  return { direction: 'NEUTRAL', strength: 0, confidence: 0 };
}

function meanReversionSignal(
  minuteCloses: number[],
  regime: Regime,
  priceChange: number,
  orderFlowDir: Direction,
): SignalOutput {
  if (regime !== 'choppy_dangerous' && regime !== 'choppy_boring') {
    return { direction: 'NEUTRAL', strength: 0, confidence: 0 };
  }

  const rsi = computeRSI(minuteCloses, 14);
  if (rsi === null) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const vel = velocity(minuteCloses, 20);
  const isDecelerating = priceChange > 0 ? vel < 0 : vel > 0;

  if (!isDecelerating) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  // Order flow opposes price → market makers absorbing the move
  const priceDir: Direction = priceChange > 0 ? 'YES' : 'NO';
  const flowOpposes = orderFlowDir !== 'NEUTRAL' && orderFlowDir !== priceDir;
  if (!flowOpposes) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  // Contrarian direction
  const direction: Direction = priceChange > 0 ? 'NO' : 'YES';
  const strength = Math.min(1.0, Math.abs(priceChange) / 0.005);
  let confidence = 0.4;
  if (rsi > 70 || rsi < 30) confidence += 0.1;
  if (Math.abs(priceChange) > 0.003) confidence += 0.05;

  return { direction, strength, confidence: Math.min(0.7, confidence) };
}

function vwapSignal(
  currentPrice: number,
  candles15m: BinanceKline[],
): SignalOutput {
  if (candles15m.length < 4) {
    return { direction: 'NEUTRAL', strength: 0, confidence: 0 };
  }

  // Compute VWAP from recent 15m candles (last 4 = 1 hour)
  const recent = candles15m.slice(-4);
  let cumulativeTPV = 0;
  let cumulativeVol = 0;
  for (const c of recent) {
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * c.volume;
    cumulativeVol += c.volume;
  }

  if (cumulativeVol === 0) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const vwap = cumulativeTPV / cumulativeVol;
  const distance = (currentPrice - vwap) / vwap;
  const absDistance = Math.abs(distance);

  if (absDistance < 0.0003) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const direction: Direction = distance > 0 ? 'YES' : 'NO';
  const strength = Math.min(1.0, absDistance / 0.003);
  const confidence = 0.3 + Math.min(0.2, absDistance * 50);

  return { direction, strength, confidence };
}

function volumeSurgeSignal(
  currentHourVolume: number,
  hourlyCandles: BinanceKline[],
  priceChange: number,
): SignalOutput {
  if (hourlyCandles.length < 24) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const recent24h = hourlyCandles.slice(-24);
  const avgVolume = recent24h.reduce((s, c) => s + c.volume, 0) / 24;
  if (avgVolume === 0) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const ratio = currentHourVolume / avgVolume;
  if (ratio < 1.5) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const direction: Direction = priceChange >= 0 ? 'YES' : 'NO';
  const strength = Math.min(1.0, (ratio - 1) / 3);
  const confidence = 0.4 + Math.min(0.3, (ratio - 1.5) * 0.1);

  return { direction, strength, confidence: Math.min(0.7, confidence) };
}

function bollingerSqueezeSignal(
  hourlyCloses: number[],
  currentPrice: number,
): SignalOutput {
  if (hourlyCloses.length < 20) return { direction: 'NEUTRAL', strength: 0, confidence: 0 };

  const period = 20;
  const slice = hourlyCloses.slice(-period);
  const mid = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  const upper = mid + 2 * stddev;
  const lower = mid - 2 * stddev;
  const width = (upper - lower) / mid;

  // Check if previous period was tighter (squeeze releasing)
  if (hourlyCloses.length >= 21) {
    const prevSlice = hourlyCloses.slice(-(period + 1), -1);
    const prevMid = prevSlice.reduce((s, v) => s + v, 0) / period;
    const prevVar = prevSlice.reduce((s, v) => s + (v - prevMid) ** 2, 0) / period;
    const prevStddev = Math.sqrt(prevVar);
    const prevWidth = (2 * prevStddev * 2) / prevMid;

    if (width > prevWidth * 1.2 && prevWidth < 0.03) {
      // Squeeze is releasing
      if (currentPrice > upper) {
        return { direction: 'YES', strength: Math.min(1.0, (currentPrice - upper) / (stddev * 0.5)), confidence: 0.5 };
      }
      if (currentPrice < lower) {
        return { direction: 'NO', strength: Math.min(1.0, (lower - currentPrice) / (stddev * 0.5)), confidence: 0.5 };
      }
    }
  }

  // Standard breakout
  if (currentPrice > upper) {
    return { direction: 'YES', strength: Math.min(1.0, (currentPrice - upper) / stddev), confidence: 0.4 };
  }
  if (currentPrice < lower) {
    return { direction: 'NO', strength: Math.min(1.0, (lower - currentPrice) / stddev), confidence: 0.4 };
  }

  return { direction: 'NEUTRAL', strength: 0, confidence: 0 };
}

// ── Signal Aggregation ────────────────────────────────────────

const SIGNAL_WEIGHTS: Record<string, number> = {
  momentum: 0.30,
  orderFlow: 0.25,
  crossAssetLag: 0.15,
  meanReversion: 0.10,
  vwap: 0.05,
  volumeSurge: 0.05,
  bollingerSqueeze: 0.05,
  regime: 0.05,
};

function aggregateSignals(signals: Map<string, SignalOutput>): { score: number; direction: Direction } {
  let totalWeightedScore = 0;
  let totalActiveWeight = 0;

  for (const [name, signal] of signals) {
    if (signal.direction === 'NEUTRAL' || signal.strength === 0) continue;
    const weight = SIGNAL_WEIGHTS[name] ?? 0;
    if (weight === 0) continue;

    const sign = signal.direction === 'YES' ? 1 : -1;
    totalWeightedScore += sign * signal.strength * signal.confidence * weight;
    totalActiveWeight += weight;
  }

  const denominator = Math.max(totalActiveWeight, 0.4);
  const score = totalWeightedScore / denominator;
  const direction: Direction = score > 0 ? 'YES' : score < 0 ? 'NO' : 'NEUTRAL';

  return { score, direction };
}

// ── Wilson CI ─────────────────────────────────────────────────

function wilsonCI(wins: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 0 };
  const p = wins / n;
  const denom = 1 + z * z / n;
  const center = p + z * z / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
  return {
    lower: Math.max(0, (center - spread) / denom),
    upper: Math.min(1, (center + spread) / denom),
  };
}

// ── Main Backtest ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Sentinel: BTC Hourly Multi-Timeframe Backtest ===\n');

  const MONTHS_BACK = 6;
  const endMs = Date.now();
  const startMs = endMs - MONTHS_BACK * 30 * 24 * 3600 * 1000;

  console.log(`Fetching ${MONTHS_BACK} months of multi-timeframe data from Binance...`);
  console.log(`  Period: ${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()}\n`);

  // Fetch all timeframes for BTC
  console.log('  Fetching BTCUSDT 1h candles...');
  const btc1h = await fetchKlines('BTCUSDT', '1h', startMs, endMs);
  console.log(`    ${btc1h.length} candles`);

  console.log('  Fetching BTCUSDT 15m candles...');
  const btc15m = await fetchKlines('BTCUSDT', '15m', startMs, endMs);
  console.log(`    ${btc15m.length} candles`);

  console.log('  Fetching BTCUSDT 5m candles...');
  const btc5m = await fetchKlines('BTCUSDT', '5m', startMs, endMs);
  console.log(`    ${btc5m.length} candles`);

  console.log('  Fetching BTCUSDT 1m candles...');
  const btc1m = await fetchKlines('BTCUSDT', '1m', startMs, endMs);
  console.log(`    ${btc1m.length} candles`);

  // Cross-asset: fetch ETH and SOL 5m
  console.log('  Fetching cross-asset 5m candles (ETH, SOL)...');
  const crossAsset5m = await fetchMultiSymbolKlines(
    ['ETHUSDT', 'SOLUSDT'],
    '5m',
    startMs,
    endMs,
  );
  console.log(`    ETHUSDT: ${crossAsset5m.get('ETHUSDT')?.length ?? 0}, SOLUSDT: ${crossAsset5m.get('SOLUSDT')?.length ?? 0}`);

  const eth5m = crossAsset5m.get('ETHUSDT') ?? [];
  const sol5m = crossAsset5m.get('SOLUSDT') ?? [];

  console.log('\nProcessing hourly windows...\n');

  // Process each hourly window (skip first 24h for lookback)
  const lookbackMs = 24 * 3600 * 1000;
  const results: HourlyWindowResult[] = [];

  for (let i = 0; i < btc1h.length - 1; i++) {
    const hourCandle = btc1h[i];
    const windowStartMs = hourCandle.openTime;
    const windowEndMs = hourCandle.closeTime;

    if (windowStartMs < startMs + lookbackMs) continue;

    const openPrice = hourCandle.open;
    const closePrice = hourCandle.close;
    const outcome: 'YES' | 'NO' = closePrice >= openPrice ? 'YES' : 'NO';
    const hour = new Date(windowStartMs).getUTCHours();
    const priceChange = (closePrice - openPrice) / openPrice;

    // Slice sub-hourly data for this window + lookback
    const lookbackStart = windowStartMs - 2 * 3600 * 1000;

    const window1m = sliceKlines(btc1m, lookbackStart, windowEndMs);
    const window5m = sliceKlines(btc5m, lookbackStart, windowEndMs);
    const window15m = sliceKlines(btc15m, lookbackStart, windowEndMs);

    const minuteCloses = window1m.map((c) => c.close);
    const currentMinute1m = sliceKlines(btc1m, windowStartMs, windowEndMs);

    // Regime from 2h of 1m candles
    const regime2hCloses = sliceKlines(btc1m, lookbackStart, windowStartMs).map((c) => c.close);
    const effRatio = calculateEfficiencyRatio(regime2hCloses);
    const realVol = calculateRealizedVol(regime2hCloses, 120);
    const regime = classifyRegime(effRatio, realVol);

    // Compute midpoint price for signal evaluation (simulate ~halfway through window)
    const midpointIdx = Math.floor(currentMinute1m.length / 2);
    const midCloses = currentMinute1m.slice(0, Math.max(midpointIdx, 10)).map((c) => c.close);
    const currentPrice = midCloses.length > 0 ? midCloses[midCloses.length - 1] : openPrice;
    const midPriceChange = (currentPrice - openPrice) / openPrice;

    const signals = new Map<string, SignalOutput>();

    // 1. Momentum (EMA20 on 1m closes, velocity)
    const momentumInput = minuteCloses.slice(-60);
    signals.set('momentum', momentumSignal(openPrice, currentPrice, momentumInput));

    // 2. Order flow (taker buy ratio from 1m candles in current window)
    signals.set('orderFlow', orderFlowSignal(currentMinute1m.slice(0, midpointIdx)));

    // 3. Cross-asset lag (5m candles)
    const btc5mWindow = sliceKlines(btc5m, windowStartMs - 600_000, windowStartMs + 1800_000);
    const eth5mWindow = sliceKlines(eth5m, windowStartMs - 600_000, windowStartMs + 1800_000);
    const sol5mWindow = sliceKlines(sol5m, windowStartMs - 600_000, windowStartMs + 1800_000);
    signals.set('crossAssetLag', crossAssetLagSignal(btc5mWindow, eth5mWindow, sol5mWindow));

    // 4. Mean reversion (RSI on 1m + deceleration in choppy regime)
    const ofSignal = signals.get('orderFlow')!;
    signals.set('meanReversion', meanReversionSignal(minuteCloses.slice(-60), regime, midPriceChange, ofSignal.direction));

    // 5. VWAP position (from 15m candles)
    const vwap15mWindow = sliceKlines(btc15m, windowStartMs - 3600_000, windowEndMs);
    signals.set('vwap', vwapSignal(currentPrice, vwap15mWindow));

    // 6. Volume surge
    const priorHourly = btc1h.slice(Math.max(0, i - 24), i);
    signals.set('volumeSurge', volumeSurgeSignal(hourCandle.volume, priorHourly, midPriceChange));

    // 7. Bollinger squeeze (1h candles)
    const hourlyCloses = btc1h.slice(Math.max(0, i - 21), i + 1).map((c) => c.close);
    signals.set('bollingerSqueeze', bollingerSqueezeSignal(hourlyCloses, currentPrice));

    const { score, direction: compositeDir } = aggregateSignals(signals);

    results.push({
      windowStart: windowStartMs,
      openPrice,
      closePrice,
      outcome,
      regime,
      hour,
      signals,
      compositeScore: score,
      compositeDirection: compositeDir,
    });
  }

  console.log(`Processed ${results.length} hourly windows\n`);

  // ── Analysis ────────────────────────────────────────────────

  printSignalAnalysis(results);
  printRegimeAnalysis(results);
  printCompositeCalibration(results);
  printTimeOfDayAnalysis(results);
  printWeightOptimization(results);

  console.log('\n=== Backtest Complete ===');
}

// ── Analysis Functions ────────────────────────────────────────

function printSignalAnalysis(results: HourlyWindowResult[]): void {
  console.log('='.repeat(120));
  console.log('PER-SIGNAL HIT RATE ANALYSIS');
  console.log('='.repeat(120));

  const signalNames = Object.keys(SIGNAL_WEIGHTS);
  const stats: SignalStats[] = [];

  for (const name of signalNames) {
    let total = 0;
    let agreeing = 0;
    let totalStrength = 0;
    let totalConf = 0;
    const byRegime = new Map<Regime, { n: number; hits: number; hitRate: number }>();
    const byStrength = new Map<string, { n: number; hits: number; hitRate: number }>();

    for (const r of results) {
      const sig = r.signals.get(name);
      if (!sig || sig.direction === 'NEUTRAL' || sig.strength === 0) continue;

      total++;
      const hit = sig.direction === r.outcome;
      if (hit) agreeing++;
      totalStrength += sig.strength;
      totalConf += sig.confidence;

      // Regime breakdown
      const regEntry = byRegime.get(r.regime) ?? { n: 0, hits: 0, hitRate: 0 };
      regEntry.n++;
      if (hit) regEntry.hits++;
      regEntry.hitRate = regEntry.hits / regEntry.n;
      byRegime.set(r.regime, regEntry);

      // Strength bucket
      const bucket = sig.strength >= 0.7 ? 'strong' : sig.strength >= 0.3 ? 'medium' : 'weak';
      const strEntry = byStrength.get(bucket) ?? { n: 0, hits: 0, hitRate: 0 };
      strEntry.n++;
      if (hit) strEntry.hits++;
      strEntry.hitRate = strEntry.hits / strEntry.n;
      byStrength.set(bucket, strEntry);
    }

    if (total === 0) continue;

    const wilson = wilsonCI(agreeing, total);
    stats.push({
      signal: name,
      total,
      agreeing,
      hitRate: agreeing / total,
      avgStrength: totalStrength / total,
      avgConfidence: totalConf / total,
      wilsonLower: wilson.lower,
      wilsonUpper: wilson.upper,
      byRegime,
      byStrengthBucket: byStrength,
    });
  }

  stats.sort((a, b) => b.hitRate - a.hitRate);

  console.log('\n' +
    'Signal'.padEnd(20) +
    'N'.padStart(7) +
    'HitRate'.padStart(9) +
    'AvgStr'.padStart(9) +
    'AvgConf'.padStart(9) +
    'Wilson95'.padStart(16),
  );
  console.log('-'.repeat(70));

  for (const s of stats) {
    console.log(
      s.signal.padEnd(20) +
      String(s.total).padStart(7) +
      `${(s.hitRate * 100).toFixed(1)}%`.padStart(9) +
      s.avgStrength.toFixed(3).padStart(9) +
      s.avgConfidence.toFixed(3).padStart(9) +
      `[${(s.wilsonLower * 100).toFixed(0)}-${(s.wilsonUpper * 100).toFixed(0)}%]`.padStart(16),
    );
  }

  // Strength bucket breakdown
  console.log('\n--- By Strength Bucket ---\n');
  for (const s of stats) {
    const buckets = ['strong', 'medium', 'weak'];
    const parts: string[] = [];
    for (const b of buckets) {
      const entry = s.byStrengthBucket.get(b);
      if (entry && entry.n >= 5) {
        parts.push(`${b}: ${(entry.hitRate * 100).toFixed(1)}% (n=${entry.n})`);
      }
    }
    if (parts.length > 0) {
      console.log(`  ${s.signal}: ${parts.join(' | ')}`);
    }
  }
}

function printRegimeAnalysis(results: HourlyWindowResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('REGIME BREAKDOWN');
  console.log('='.repeat(120) + '\n');

  const regimes: Regime[] = ['trending', 'choppy_dangerous', 'choppy_boring', 'dead'];

  for (const regime of regimes) {
    const regimeResults = results.filter((r) => r.regime === regime);
    if (regimeResults.length === 0) continue;

    const withDecision = regimeResults.filter((r) => r.compositeDirection !== 'NEUTRAL');
    const correct = withDecision.filter((r) => r.compositeDirection === r.outcome);

    console.log(`  ${regime}: ${regimeResults.length} windows, ` +
      `${withDecision.length} with signal (${((withDecision.length / regimeResults.length) * 100).toFixed(0)}%), ` +
      `${correct.length}/${withDecision.length} correct (${withDecision.length > 0 ? ((correct.length / withDecision.length) * 100).toFixed(1) : 'N/A'}%)`,
    );
  }
}

function printCompositeCalibration(results: HourlyWindowResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('COMPOSITE SCORE CALIBRATION');
  console.log('='.repeat(120) + '\n');

  const buckets = [
    { label: '|score| >= 0.35', min: 0.35 },
    { label: '|score| >= 0.30', min: 0.30 },
    { label: '|score| >= 0.25', min: 0.25 },
    { label: '|score| >= 0.20', min: 0.20 },
    { label: '|score| >= 0.15', min: 0.15 },
    { label: '|score| >= 0.10', min: 0.10 },
    { label: '|score| >= 0.05', min: 0.05 },
    { label: 'all non-neutral', min: 0.001 },
  ];

  console.log(
    'Threshold'.padEnd(22) +
    'N'.padStart(7) +
    'HitRate'.padStart(9) +
    'Wilson95'.padStart(16) +
    'AvgScore'.padStart(10),
  );
  console.log('-'.repeat(64));

  for (const bucket of buckets) {
    const filtered = results.filter((r) => Math.abs(r.compositeScore) >= bucket.min);
    if (filtered.length === 0) continue;

    const correct = filtered.filter((r) => r.compositeDirection === r.outcome);
    const hitRate = correct.length / filtered.length;
    const avgScore = filtered.reduce((s, r) => s + Math.abs(r.compositeScore), 0) / filtered.length;
    const wilson = wilsonCI(correct.length, filtered.length);

    console.log(
      bucket.label.padEnd(22) +
      String(filtered.length).padStart(7) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `[${(wilson.lower * 100).toFixed(0)}-${(wilson.upper * 100).toFixed(0)}%]`.padStart(16) +
      avgScore.toFixed(4).padStart(10),
    );
  }
}

function printTimeOfDayAnalysis(results: HourlyWindowResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('TIME-OF-DAY ANALYSIS (UTC)');
  console.log('='.repeat(120) + '\n');

  const byHour = new Map<number, { total: number; correct: number }>();

  for (const r of results) {
    if (r.compositeDirection === 'NEUTRAL') continue;
    const entry = byHour.get(r.hour) ?? { total: 0, correct: 0 };
    entry.total++;
    if (r.compositeDirection === r.outcome) entry.correct++;
    byHour.set(r.hour, entry);
  }

  const sortedHours = Array.from(byHour.entries()).sort((a, b) => a[0] - b[0]);

  console.log('Hour'.padEnd(8) + 'N'.padStart(6) + 'HitRate'.padStart(9) + '  Bar');
  console.log('-'.repeat(50));

  for (const [hour, { total, correct }] of sortedHours) {
    if (total < 5) continue;
    const hitRate = correct / total;
    const barLength = Math.round(hitRate * 40);
    const bar = '#'.repeat(barLength) + ' '.repeat(40 - barLength);
    console.log(
      `${String(hour).padStart(2)}:00`.padEnd(8) +
      String(total).padStart(6) +
      `${(hitRate * 100).toFixed(1)}%`.padStart(9) +
      `  |${bar}|`,
    );
  }
}

function printWeightOptimization(results: HourlyWindowResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('WEIGHT OPTIMIZATION SUGGESTIONS');
  console.log('='.repeat(120) + '\n');

  const signalNames = Object.keys(SIGNAL_WEIGHTS);

  // For each signal, measure its standalone predictive power
  const standalone: Array<{ name: string; hitRate: number; n: number; contribution: number }> = [];

  for (const name of signalNames) {
    let total = 0;
    let correct = 0;

    for (const r of results) {
      const sig = r.signals.get(name);
      if (!sig || sig.direction === 'NEUTRAL' || sig.strength === 0) continue;
      total++;
      if (sig.direction === r.outcome) correct++;
    }

    if (total < 30) continue;

    const hitRate = correct / total;
    const contribution = (hitRate - 0.5) * total;
    standalone.push({ name, hitRate, n: total, contribution });
  }

  standalone.sort((a, b) => b.contribution - a.contribution);

  console.log('Current weights vs suggested adjustments:\n');
  console.log(
    'Signal'.padEnd(20) +
    'CurWeight'.padStart(10) +
    'HitRate'.padStart(9) +
    'N'.padStart(7) +
    'EdgeContrib'.padStart(12) +
    '  Suggestion',
  );
  console.log('-'.repeat(90));

  for (const s of standalone) {
    const curWeight = SIGNAL_WEIGHTS[s.name] ?? 0;
    let suggestion = '';
    if (s.hitRate < 0.48) suggestion = 'REDUCE or DISABLE — hurting P&L';
    else if (s.hitRate < 0.52) suggestion = 'REDUCE — near coin-flip';
    else if (s.hitRate > 0.55 && curWeight < 0.20) suggestion = 'INCREASE — underweighted edge';
    else if (s.hitRate > 0.55) suggestion = 'Keep or increase';
    else suggestion = 'Keep current';

    console.log(
      s.name.padEnd(20) +
      curWeight.toFixed(2).padStart(10) +
      `${(s.hitRate * 100).toFixed(1)}%`.padStart(9) +
      String(s.n).padStart(7) +
      s.contribution.toFixed(1).padStart(12) +
      `  ${suggestion}`,
    );
  }

  // Suggest optimal weights based on edge contribution
  const totalContrib = standalone.filter((s) => s.contribution > 0).reduce((sum, s) => sum + s.contribution, 0);

  if (totalContrib > 0) {
    console.log('\nSuggested weights (proportional to edge contribution):\n');
    for (const s of standalone) {
      if (s.contribution <= 0) continue;
      const suggestedWeight = s.contribution / totalContrib;
      console.log(`  ${s.name}: ${(suggestedWeight * 100).toFixed(1)}% (was ${(SIGNAL_WEIGHTS[s.name] * 100).toFixed(1)}%)`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
