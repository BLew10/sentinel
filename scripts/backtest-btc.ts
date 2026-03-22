import 'dotenv/config';
import { getCryptoPrices } from '../lib/financial-datasets';
import {
  computeSMA,
  computeEMA,
  computeRSI,
  computeMACD,
  computeATR,
  computeVolumeRatio,
} from '../lib/indicators';
import type { PriceBar } from '../lib/utils/types';

const MIN_BARS = 210;
const FORWARD_HORIZONS = [1, 3, 5, 10, 20];

interface SignalEvent {
  date: string;
  price: number;
  direction: 'bullish' | 'bearish';
  signal: string;
  detail: string;
}

interface SignalResult {
  signal: string;
  totalTriggers: number;
  byHorizon: Map<number, HorizonStats>;
}

interface HorizonStats {
  hitRate: number;
  avgReturn: number;
  medianReturn: number;
  winRateAbove1Pct: number;
  sharpe: number;
  wilsonLower: number;
  wilsonUpper: number;
  n: number;
}

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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeBollingerBands(closes: number[], period = 20, mult = 2): { upper: number; lower: number; mid: number; width: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mid = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  return {
    upper: mid + mult * stddev,
    lower: mid - mult * stddev,
    mid,
    width: (mult * stddev * 2) / mid,
  };
}

function detectSignals(bars: PriceBar[], i: number): SignalEvent[] {
  const events: SignalEvent[] = [];
  const window = bars.slice(0, i + 1);
  const closes = window.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];
  const date = window[window.length - 1].date;

  const prevWindow = bars.slice(0, i);
  const prevCloses = prevWindow.map((b) => b.close);

  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);
  const prevSma20 = computeSMA(prevCloses, 20);
  const prevSma50 = computeSMA(prevCloses, 50);
  const prevSma200 = computeSMA(prevCloses, 200);
  const ema10 = computeEMA(closes, 10);
  const prevEma10 = computeEMA(prevCloses, 10);
  const rsi = computeRSI(closes, 14);
  const prevRsi = computeRSI(prevCloses, 14);
  const macd = computeMACD(closes);
  const prevMacd = computeMACD(prevCloses);
  const volRatio = computeVolumeRatio(window, 50);
  const atr = computeATR(window, 14);
  const prevAtr = computeATR(prevWindow, 14);
  const bb = computeBollingerBands(closes, 20, 2);

  // SMA 20/50 crossover
  if (sma20 != null && sma50 != null && prevSma20 != null && prevSma50 != null) {
    if (prevSma20 <= prevSma50 && sma20 > sma50) {
      events.push({ date, price: currentPrice, direction: 'bullish', signal: 'sma_20_50_cross', detail: `SMA20 crossed above SMA50` });
    }
    if (prevSma20 >= prevSma50 && sma20 < sma50) {
      events.push({ date, price: currentPrice, direction: 'bearish', signal: 'sma_20_50_cross', detail: `SMA20 crossed below SMA50` });
    }
  }

  // Golden/Death cross (50/200)
  if (sma50 != null && sma200 != null && prevSma50 != null && prevSma200 != null) {
    if (prevSma50 <= prevSma200 && sma50 > sma200) {
      events.push({ date, price: currentPrice, direction: 'bullish', signal: 'golden_cross', detail: `SMA50 crossed above SMA200` });
    }
    if (prevSma50 >= prevSma200 && sma50 < sma200) {
      events.push({ date, price: currentPrice, direction: 'bearish', signal: 'death_cross', detail: `SMA50 crossed below SMA200` });
    }
  }

  // RSI oversold bounce / overbought reversal
  if (rsi != null && prevRsi != null) {
    if (prevRsi < 30 && rsi >= 30) {
      events.push({ date, price: currentPrice, direction: 'bullish', signal: 'rsi_oversold_bounce', detail: `RSI bounced from ${prevRsi.toFixed(1)} to ${rsi.toFixed(1)}` });
    }
    if (prevRsi > 70 && rsi <= 70) {
      events.push({ date, price: currentPrice, direction: 'bearish', signal: 'rsi_overbought_reversal', detail: `RSI dropped from ${prevRsi.toFixed(1)} to ${rsi.toFixed(1)}` });
    }
  }

  // MACD histogram crossover
  if (macd && prevMacd) {
    if (prevMacd.histogram < 0 && macd.histogram > 0) {
      events.push({ date, price: currentPrice, direction: 'bullish', signal: 'macd_bullish_cross', detail: 'MACD histogram flipped positive' });
    }
    if (prevMacd.histogram > 0 && macd.histogram < 0) {
      events.push({ date, price: currentPrice, direction: 'bearish', signal: 'macd_bearish_cross', detail: 'MACD histogram flipped negative' });
    }
  }

  // Volume breakout
  if (volRatio != null && volRatio >= 2.0) {
    const dayReturn = (currentPrice - bars[i - 1].close) / bars[i - 1].close;
    const dir = dayReturn >= 0 ? 'bullish' : 'bearish';
    events.push({ date, price: currentPrice, direction: dir, signal: 'volume_breakout', detail: `Volume ${volRatio.toFixed(1)}x avg, day return ${(dayReturn * 100).toFixed(2)}%` });
  }

  // ATR expansion (vol regime shift)
  if (atr != null && prevAtr != null && prevAtr > 0) {
    const atrChange = (atr - prevAtr) / prevAtr;
    if (atrChange > 0.2) {
      const dayReturn = (currentPrice - bars[i - 1].close) / bars[i - 1].close;
      const dir = dayReturn >= 0 ? 'bullish' : 'bearish';
      events.push({ date, price: currentPrice, direction: dir, signal: 'atr_expansion', detail: `ATR expanded ${(atrChange * 100).toFixed(1)}%` });
    }
  }

  // Bollinger Band breakout
  if (bb) {
    const prevPrice = prevCloses[prevCloses.length - 1];
    if (prevPrice <= bb.upper && currentPrice > bb.upper) {
      events.push({ date, price: currentPrice, direction: 'bullish', signal: 'bb_upper_break', detail: `Price broke above upper BB` });
    }
    if (prevPrice >= bb.lower && currentPrice < bb.lower) {
      events.push({ date, price: currentPrice, direction: 'bearish', signal: 'bb_lower_break', detail: `Price broke below lower BB` });
    }
  }

  // Price vs SMA200 trend bias
  if (sma200 != null && prevSma200 != null) {
    const prevPrice = prevCloses[prevCloses.length - 1];
    if (prevPrice <= prevSma200 && currentPrice > sma200) {
      events.push({ date, price: currentPrice, direction: 'bullish', signal: 'sma200_reclaim', detail: `Price reclaimed SMA200` });
    }
    if (prevPrice >= prevSma200 && currentPrice < sma200) {
      events.push({ date, price: currentPrice, direction: 'bearish', signal: 'sma200_breakdown', detail: `Price broke below SMA200` });
    }
  }

  // EMA(10) slope direction change
  if (ema10 != null && prevEma10 != null && closes.length >= 12) {
    const prevPrevCloses = bars.slice(0, i - 1).map((b) => b.close);
    const prevPrevEma10 = computeEMA(prevPrevCloses, 10);
    if (prevPrevEma10 != null) {
      const prevSlope = prevEma10 - prevPrevEma10;
      const curSlope = ema10 - prevEma10;
      if (prevSlope <= 0 && curSlope > 0) {
        events.push({ date, price: currentPrice, direction: 'bullish', signal: 'ema10_slope_flip', detail: `EMA(10) slope turned positive` });
      }
      if (prevSlope >= 0 && curSlope < 0) {
        events.push({ date, price: currentPrice, direction: 'bearish', signal: 'ema10_slope_flip', detail: `EMA(10) slope turned negative` });
      }
    }
  }

  // Consecutive up/down days (3+)
  if (i >= 3) {
    let upStreak = 0;
    let downStreak = 0;
    for (let j = i; j >= 1; j--) {
      if (bars[j].close > bars[j - 1].close) {
        if (downStreak > 0) break;
        upStreak++;
      } else if (bars[j].close < bars[j - 1].close) {
        if (upStreak > 0) break;
        downStreak++;
      } else {
        break;
      }
    }
    if (upStreak >= 3) {
      events.push({ date, price: currentPrice, direction: 'bullish', signal: 'consecutive_up', detail: `${upStreak} consecutive up days` });
    }
    if (downStreak >= 3) {
      events.push({ date, price: currentPrice, direction: 'bearish', signal: 'consecutive_down', detail: `${downStreak} consecutive down days` });
    }
  }

  // Daily range position (close in top/bottom 10% of range)
  {
    const bar = bars[i];
    const range = bar.high - bar.low;
    if (range > 0) {
      const position = (bar.close - bar.low) / range;
      if (position >= 0.9) {
        events.push({ date, price: currentPrice, direction: 'bullish', signal: 'range_top_close', detail: `Close in top ${((1 - position) * 100).toFixed(0)}% of daily range` });
      }
      if (position <= 0.1) {
        events.push({ date, price: currentPrice, direction: 'bearish', signal: 'range_bottom_close', detail: `Close in bottom ${(position * 100).toFixed(0)}% of daily range` });
      }
    }
  }

  return events;
}

function computeForwardReturns(bars: PriceBar[], signalIdx: number): Map<number, number> {
  const returns = new Map<number, number>();
  const entryPrice = bars[signalIdx].close;

  for (const h of FORWARD_HORIZONS) {
    const exitIdx = signalIdx + h;
    if (exitIdx < bars.length) {
      returns.set(h, (bars[exitIdx].close - entryPrice) / entryPrice);
    }
  }

  return returns;
}

function analyzeSignal(
  events: Array<{ event: SignalEvent; forwardReturns: Map<number, number> }>,
): SignalResult {
  if (events.length === 0) {
    return { signal: '', totalTriggers: 0, byHorizon: new Map() };
  }

  const signal = events[0].event.signal;
  const horizonStats = new Map<number, HorizonStats>();

  for (const h of FORWARD_HORIZONS) {
    const returns: number[] = [];

    for (const { event, forwardReturns } of events) {
      const ret = forwardReturns.get(h);
      if (ret === undefined) continue;
      const directionalReturn = event.direction === 'bullish' ? ret : -ret;
      returns.push(directionalReturn);
    }

    if (returns.length === 0) continue;

    const hits = returns.filter((r) => r > 0).length;
    const bigWins = returns.filter((r) => r > 0.01).length;
    const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
    const med = median(returns);
    const variance = returns.reduce((s, v) => s + (v - avg) ** 2, 0) / returns.length;
    const stddev = Math.sqrt(variance);
    const sharpe = stddev > 0 ? avg / stddev : 0;
    const wilson = wilsonCI(hits, returns.length);

    horizonStats.set(h, {
      hitRate: hits / returns.length,
      avgReturn: avg,
      medianReturn: med,
      winRateAbove1Pct: returns.length > 0 ? bigWins / returns.length : 0,
      sharpe,
      wilsonLower: wilson.lower,
      wilsonUpper: wilson.upper,
      n: returns.length,
    });
  }

  return { signal, totalTriggers: events.length, byHorizon: horizonStats };
}

function printResults(results: SignalResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('BTC DAILY SIGNAL BACKTEST RESULTS');
  console.log('='.repeat(120));

  for (const h of FORWARD_HORIZONS) {
    console.log(`\n--- Forward ${h}d Returns ---\n`);
    console.log(
      'Signal'.padEnd(25) +
      'N'.padStart(6) +
      'HitRate'.padStart(9) +
      'AvgRet'.padStart(9) +
      'MedRet'.padStart(9) +
      'Win>1%'.padStart(9) +
      'Sharpe'.padStart(9) +
      'Wilson95'.padStart(16),
    );
    console.log('-'.repeat(92));

    const sorted = results
      .filter((r) => r.byHorizon.has(h))
      .sort((a, b) => {
        const aStats = a.byHorizon.get(h)!;
        const bStats = b.byHorizon.get(h)!;
        return bStats.sharpe - aStats.sharpe;
      });

    for (const r of sorted) {
      const s = r.byHorizon.get(h)!;
      if (s.n < 5) continue;
      console.log(
        r.signal.padEnd(25) +
        String(s.n).padStart(6) +
        `${(s.hitRate * 100).toFixed(1)}%`.padStart(9) +
        `${(s.avgReturn * 100).toFixed(2)}%`.padStart(9) +
        `${(s.medianReturn * 100).toFixed(2)}%`.padStart(9) +
        `${(s.winRateAbove1Pct * 100).toFixed(1)}%`.padStart(9) +
        s.sharpe.toFixed(3).padStart(9) +
        `[${(s.wilsonLower * 100).toFixed(0)}-${(s.wilsonUpper * 100).toFixed(0)}%]`.padStart(16),
      );
    }
  }

  // Summary: best signals across all horizons
  console.log('\n' + '='.repeat(120));
  console.log('TOP SIGNALS BY SHARPE (5d horizon, N >= 10)');
  console.log('='.repeat(120) + '\n');

  const h5 = results
    .filter((r) => {
      const s = r.byHorizon.get(5);
      return s && s.n >= 10;
    })
    .sort((a, b) => {
      const aS = a.byHorizon.get(5)!;
      const bS = b.byHorizon.get(5)!;
      return bS.sharpe - aS.sharpe;
    });

  for (let rank = 0; rank < Math.min(10, h5.length); rank++) {
    const r = h5[rank];
    const s = r.byHorizon.get(5)!;
    console.log(
      `  ${rank + 1}. ${r.signal} — ${(s.hitRate * 100).toFixed(1)}% hit rate, ` +
      `${(s.avgReturn * 100).toFixed(2)}% avg return, Sharpe ${s.sharpe.toFixed(3)} ` +
      `(N=${s.n}, 95%CI [${(s.wilsonLower * 100).toFixed(0)}-${(s.wilsonUpper * 100).toFixed(0)}%])`,
    );
  }
}

async function main(): Promise<void> {
  console.log('=== Sentinel: BTC Daily Signal Backtest ===\n');
  console.log('Fetching BTC-USD daily data from Financial Datasets...');

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = '2022-01-01';

  const cryptoBars = await getCryptoPrices('BTC-USD', startDate, endDate);

  if (cryptoBars.length === 0) {
    console.error('No BTC price data returned');
    process.exit(1);
  }

  console.log(`  Received ${cryptoBars.length} daily bars (${cryptoBars[0].time} to ${cryptoBars[cryptoBars.length - 1].time})`);

  const bars: PriceBar[] = cryptoBars.map((b) => ({
    date: b.time.split('T')[0],
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  // Deduplicate signals per type within 5-day windows
  const allEvents: Array<{ event: SignalEvent; forwardReturns: Map<number, number>; barIdx: number }> = [];

  console.log(`\nScanning ${bars.length - MIN_BARS} bars for signals...`);

  for (let i = MIN_BARS; i < bars.length; i++) {
    const signals = detectSignals(bars, i);
    for (const event of signals) {
      const fwd = computeForwardReturns(bars, i);
      allEvents.push({ event, forwardReturns: fwd, barIdx: i });
    }
  }

  console.log(`  Found ${allEvents.length} raw signal events`);

  // Deduplicate: same signal type within 5-day window
  const dedupedBySignal = new Map<string, Array<{ event: SignalEvent; forwardReturns: Map<number, number> }>>();
  const lastSeen = new Map<string, string>();

  for (const entry of allEvents) {
    const key = `${entry.event.signal}:${entry.event.direction}`;
    const lastDate = lastSeen.get(key);

    if (lastDate) {
      const diff = (new Date(entry.event.date).getTime() - new Date(lastDate).getTime()) / 86_400_000;
      if (diff < 5) continue;
    }

    lastSeen.set(key, entry.event.date);

    if (!dedupedBySignal.has(entry.event.signal)) {
      dedupedBySignal.set(entry.event.signal, []);
    }
    dedupedBySignal.get(entry.event.signal)!.push(entry);
  }

  let totalDeduped = 0;
  for (const entries of dedupedBySignal.values()) {
    totalDeduped += entries.length;
  }
  console.log(`  After dedup: ${totalDeduped} events across ${dedupedBySignal.size} signal types`);

  const results: SignalResult[] = [];
  for (const [signal, events] of dedupedBySignal) {
    const result = analyzeSignal(events);
    result.signal = signal;
    results.push(result);
  }

  printResults(results);

  console.log('\n=== Backtest Complete ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
