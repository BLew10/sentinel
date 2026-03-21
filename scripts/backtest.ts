import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import {
  computeSMA,
  computeRSI,
  computeMACD,
  computeVolumeRatio,
  compute52WeekRange,
} from '../lib/indicators';
import type { PriceBar } from '../lib/utils/types';

const BATCH_SIZE = 50;
const MIN_BARS = 200;

async function main() {
  const mode = process.argv[2] ?? 'all';
  console.log(`=== Sentinel: Historical Backtest (${mode}) ===\n`);

  const db = getSupabaseServerClient();

  const { data: stocks } = await db
    .from('stocks')
    .select('symbol, name, sector')
    .eq('is_active', true)
    .order('symbol');

  if (!stocks) { console.error('No stocks'); process.exit(1); }

  if (mode === 'all' || mode === 'technical') {
    await backtestTechnical(db, stocks);
  }
  if (mode === 'all' || mode === 'insider') {
    await backtestInsider(db, stocks);
  }
  if (mode === 'all' || mode === 'score') {
    await backtestScore(db, stocks);
  }

  console.log('\n=== Backtest Complete ===');
}

type DB = ReturnType<typeof getSupabaseServerClient>;
type StockRow = { symbol: string; name: string; sector: string | null };

async function backtestTechnical(db: DB, stocks: StockRow[]) {
  console.log('\n--- Technical Signal Backtest ---');
  let totalSignals = 0;

  for (let si = 0; si < stocks.length; si++) {
    const { symbol, sector } = stocks[si];

    const { data: priceRows } = await db
      .from('daily_prices')
      .select('date, open, high, low, close, volume')
      .eq('symbol', symbol)
      .order('date', { ascending: true });

    if (!priceRows || priceRows.length < MIN_BARS) continue;

    const bars: PriceBar[] = priceRows.map((p) => ({
      date: p.date as string,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
    }));

    const snapshots: Array<Record<string, unknown>> = [];

    for (let i = MIN_BARS; i < bars.length; i++) {
      const window = bars.slice(0, i + 1);
      const closes = window.map((b) => b.close);
      const currentPrice = closes[closes.length - 1];
      const date = window[window.length - 1].date;

      const sma50 = computeSMA(closes, 50);
      const sma150 = computeSMA(closes, 150);
      const sma200 = computeSMA(closes, 200);
      const rsi = computeRSI(closes, 14);
      const macd = computeMACD(closes);
      const volRatio = computeVolumeRatio(window, 50);
      const range = compute52WeekRange(window);

      const priceVsSma50 = sma50 && sma50 > 0 ? (currentPrice - sma50) / sma50 : null;
      const priceVsSma200 = sma200 && sma200 > 0 ? (currentPrice - sma200) / sma200 : null;

      const prevCloses = window.slice(0, -1).map((b) => b.close);
      const prevSma50 = computeSMA(prevCloses, 50);
      const prevSma200 = computeSMA(prevCloses, 200);

      // Golden Cross: SMA50 crosses above SMA200
      if (sma50 != null && sma200 != null && prevSma50 != null && prevSma200 != null) {
        if (prevSma50 <= prevSma200 && sma50 > sma200) {
          snapshots.push(makeSnapshot(symbol, date, currentPrice, sector, 'golden_cross', `SMA50 ${sma50.toFixed(2)} crossed above SMA200 ${sma200.toFixed(2)}`));
        }
      }

      // Stage 2 Uptrend entry: price > SMA50 > SMA150 > SMA200, near 52w high
      if (
        sma50 != null && sma150 != null && sma200 != null &&
        currentPrice > sma50 && sma50 > sma150 && sma150 > sma200 &&
        range && range.pct_from_high != null && range.pct_from_high >= -0.1 &&
        volRatio != null && volRatio >= 1.5
      ) {
        const prevBars = bars.slice(0, i);
        const pCloses = prevBars.map((b) => b.close);
        const pSma50 = computeSMA(pCloses, 50);
        const pSma150 = computeSMA(pCloses, 150);
        if (pSma50 == null || pSma150 == null || !(pSma50 > pSma150)) {
          snapshots.push(makeSnapshot(symbol, date, currentPrice, sector, 'stage2_breakout', `Breakout: ${range.pct_from_high != null ? (range.pct_from_high * 100).toFixed(1) : '?'}% from 52w high, vol ratio ${volRatio.toFixed(1)}x`));
        }
      }

      // RSI Oversold bounce: RSI crosses back above 30
      if (rsi != null && i > MIN_BARS) {
        const prevRsi = computeRSI(prevCloses, 14);
        if (prevRsi != null && prevRsi < 30 && rsi >= 30) {
          snapshots.push(makeSnapshot(symbol, date, currentPrice, sector, 'rsi_oversold_bounce', `RSI bounced from ${prevRsi.toFixed(1)} to ${rsi.toFixed(1)}`));
        }
      }

      // Volume surge near highs
      if (
        volRatio != null && volRatio >= 2.5 &&
        range && range.pct_from_high != null && range.pct_from_high >= -0.05 &&
        priceVsSma50 != null && priceVsSma50 > 0
      ) {
        snapshots.push(makeSnapshot(symbol, date, currentPrice, sector, 'volume_breakout', `Volume ${volRatio.toFixed(1)}x avg, ${(range.pct_from_high * 100).toFixed(1)}% from 52w high`));
      }

      // MACD bullish crossover
      if (macd && i > MIN_BARS) {
        const prevMacd = computeMACD(prevCloses);
        if (prevMacd && prevMacd.histogram < 0 && macd.histogram > 0) {
          snapshots.push(makeSnapshot(symbol, date, currentPrice, sector, 'macd_bullish_cross', `MACD histogram flipped positive`));
        }
      }
    }

    // Deduplicate: max one signal per type per 10-day window
    const deduped = deduplicateSignals(snapshots);

    if (deduped.length > 0) {
      for (let j = 0; j < deduped.length; j += BATCH_SIZE) {
        const batch = deduped.slice(j, j + BATCH_SIZE);
        const { error } = await db.from('signal_snapshots').upsert(batch, { onConflict: 'symbol,snapshot_date,trigger_type', ignoreDuplicates: true });
        if (error) {
          console.error(`  Insert error for ${symbol}: ${error.message}`);
        }
      }
      totalSignals += deduped.length;
    }

    if ((si + 1) % 50 === 0) console.log(`  [${si + 1}/${stocks.length}] ${totalSignals} signals so far`);
  }

  console.log(`  Technical backtest: ${totalSignals} signals generated`);
}

async function backtestInsider(db: DB, stocks: StockRow[]) {
  console.log('\n--- Insider Signal Backtest ---');

  const { data: trades } = await db
    .from('insider_trades')
    .select('symbol, insider_name, insider_title, transaction_type, transaction_value, transaction_date, shares')
    .order('transaction_date', { ascending: true });

  if (!trades || trades.length === 0) {
    console.log('  No insider trades found');
    return;
  }

  const bySymbol = new Map<string, typeof trades>();
  for (const t of trades) {
    const sym = t.symbol as string;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(t);
  }

  let totalSignals = 0;
  const snapshots: Array<Record<string, unknown>> = [];

  for (const [sym, symbolTrades] of bySymbol) {
    const stock = stocks.find((s) => s.symbol === sym);
    if (!stock) continue;

    const buys = symbolTrades.filter((t) => {
      const type = (t.transaction_type as string).toLowerCase();
      return type.includes('buy') || type.includes('purchase');
    });

    if (buys.length < 2) continue;

    // Look for cluster buys (2+ buys within 30-day windows)
    for (let i = 1; i < buys.length; i++) {
      const current = buys[i];
      const currentDate = new Date(current.transaction_date as string);
      const windowStart = new Date(currentDate);
      windowStart.setDate(windowStart.getDate() - 30);

      const clusterBuys = buys.filter((b) => {
        const d = new Date(b.transaction_date as string);
        return d >= windowStart && d <= currentDate;
      });

      if (clusterBuys.length >= 2) {
        const { data: priceRow } = await db
          .from('daily_prices')
          .select('close')
          .eq('symbol', sym)
          .gte('date', current.transaction_date as string)
          .order('date', { ascending: true })
          .limit(1)
          .single();

        if (priceRow) {
          const names = clusterBuys.map((b) => b.insider_name).join(', ');
          snapshots.push(makeSnapshot(
            sym,
            current.transaction_date as string,
            Number(priceRow.close),
            stock.sector,
            'insider_cluster_buy',
            `${clusterBuys.length} insiders bought within 30 days: ${names}`,
          ));
        }
      }

      // CEO buy
      const title = (current.insider_title as string ?? '').toLowerCase();
      if (title.includes('ceo') || title.includes('chief executive')) {
        const { data: priceRow } = await db
          .from('daily_prices')
          .select('close')
          .eq('symbol', sym)
          .gte('date', current.transaction_date as string)
          .order('date', { ascending: true })
          .limit(1)
          .single();

        if (priceRow) {
          snapshots.push(makeSnapshot(
            sym,
            current.transaction_date as string,
            Number(priceRow.close),
            stock.sector,
            'insider_ceo_buy',
            `CEO ${current.insider_name} purchased shares`,
          ));
        }
      }
    }
  }

  const deduped = deduplicateSignals(snapshots);
  for (let j = 0; j < deduped.length; j += BATCH_SIZE) {
    const batch = deduped.slice(j, j + BATCH_SIZE);
    const { error } = await db.from('signal_snapshots').upsert(batch, { onConflict: 'symbol,snapshot_date,trigger_type', ignoreDuplicates: true });
    if (error) console.error(`  Insider insert error: ${error.message}`);
  }
  totalSignals = deduped.length;

  console.log(`  Insider backtest: ${totalSignals} signals generated`);
}

async function backtestScore(db: DB, stocks: StockRow[]) {
  console.log('\n--- Score Threshold Backtest ---');

  // Simulate weekly score snapshots by computing technical scores at each week boundary
  let totalSignals = 0;

  for (let si = 0; si < stocks.length; si++) {
    const { symbol, sector } = stocks[si];

    const { data: priceRows } = await db
      .from('daily_prices')
      .select('date, open, high, low, close, volume')
      .eq('symbol', symbol)
      .order('date', { ascending: true });

    if (!priceRows || priceRows.length < MIN_BARS) continue;

    const bars: PriceBar[] = priceRows.map((p) => ({
      date: p.date as string,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
    }));

    const snapshots: Array<Record<string, unknown>> = [];
    let prevTechScore: number | null = null;

    // Sample every 5 trading days (weekly)
    for (let i = MIN_BARS; i < bars.length; i += 5) {
      const window = bars.slice(0, i + 1);
      const closes = window.map((b) => b.close);
      const currentPrice = closes[closes.length - 1];
      const date = window[window.length - 1].date;

      const sma50 = computeSMA(closes, 50);
      const rsi = computeRSI(closes, 14);
      const macd = computeMACD(closes);
      const volRatio = computeVolumeRatio(window, 50);
      const range = compute52WeekRange(window);

      const priceVsSma50 = sma50 && sma50 > 0 ? (currentPrice - sma50) / sma50 : null;
      const sma200 = computeSMA(closes, 200);
      const priceVsSma200 = sma200 && sma200 > 0 ? (currentPrice - sma200) / sma200 : null;
      const macdHist = macd?.histogram ?? null;
      const macdNorm = macdHist != null && sma50 != null && sma50 > 0 ? macdHist / sma50 : null;

      // Simplified technical score (same formula as technical.ts)
      const scores: number[] = [];
      if (rsi != null) {
        let s: number;
        if (rsi < 30) s = lerp(rsi, 10, 30, 55, 65);
        else if (rsi <= 60) s = lerp(rsi, 30, 60, 50, 80);
        else if (rsi <= 70) s = lerp(rsi, 60, 70, 80, 70);
        else s = lerp(rsi, 70, 90, 70, 30);
        scores.push(clamp(s));
      }
      if (priceVsSma50 != null) scores.push(clamp(lerp(priceVsSma50, -0.15, 0.15, 15, 85)));
      if (priceVsSma200 != null) scores.push(clamp(lerp(priceVsSma200, -0.2, 0.2, 15, 85)));
      if (macdNorm != null) scores.push(clamp(lerp(macdNorm, -0.02, 0.02, 20, 80)));
      if (volRatio != null) scores.push(clamp(lerp(volRatio, 0.5, 2.5, 30, 80)));
      if (range?.pct_from_high != null) scores.push(clamp(lerp(range.pct_from_high, -0.4, 0, 10, 85)));

      if (scores.length === 0) continue;
      const techScore = clamp(scores.reduce((a, b) => a + b, 0) / scores.length);

      // Score threshold crossing (75+)
      if (techScore >= 75 && (prevTechScore == null || prevTechScore < 75)) {
        snapshots.push({
          ...makeSnapshot(symbol, date, currentPrice, sector, 'score_threshold', `Technical score crossed 75 (now ${techScore})`),
          technical_score: techScore,
        });
      }

      // Score drop (10+ point drop)
      if (prevTechScore != null && techScore <= prevTechScore - 10 && prevTechScore >= 65) {
        snapshots.push({
          ...makeSnapshot(symbol, date, currentPrice, sector, 'score_drop', `Technical score dropped ${prevTechScore - techScore} pts (${prevTechScore} → ${techScore})`),
          technical_score: techScore,
        });
      }

      prevTechScore = techScore;
    }

    const deduped = deduplicateSignals(snapshots);
    if (deduped.length > 0) {
      for (let j = 0; j < deduped.length; j += BATCH_SIZE) {
        const batch = deduped.slice(j, j + BATCH_SIZE);
        const { error } = await db.from('signal_snapshots').upsert(batch, { onConflict: 'symbol,snapshot_date,trigger_type', ignoreDuplicates: true });
        if (error) console.error(`  Score insert error for ${symbol}: ${error.message}`);
      }
      totalSignals += deduped.length;
    }

    if ((si + 1) % 50 === 0) console.log(`  [${si + 1}/${stocks.length}] ${totalSignals} signals so far`);
  }

  console.log(`  Score backtest: ${totalSignals} signals generated`);
}

// --- Helpers ---

function makeSnapshot(symbol: string, date: string, price: number, sector: string | null, triggerType: string, detail: string) {
  return {
    symbol,
    snapshot_date: date,
    price_at_signal: price,
    sector,
    trigger_type: triggerType,
    trigger_detail: detail,
    sentinel_score: null,
    technical_score: null,
    fundamental_score: null,
    earnings_ai_score: null,
    insider_score: null,
    institutional_score: null,
    news_sentiment_score: null,
    options_flow_score: null,
  };
}

function deduplicateSignals(snapshots: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Map<string, string>();
  return snapshots.filter((s) => {
    const key = `${s.symbol}:${s.trigger_type}`;
    const lastDate = seen.get(key);
    const date = s.snapshot_date as string;

    if (lastDate) {
      const diff = (new Date(date).getTime() - new Date(lastDate).getTime()) / 86_400_000;
      if (diff < 10) return false;
    }
    seen.set(key, date);
    return true;
  });
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function lerp(value: number, inLow: number, inHigh: number, outLow = 0, outHigh = 100): number {
  if (inHigh === inLow) return (outLow + outHigh) / 2;
  const t = (value - inLow) / (inHigh - inLow);
  return outLow + t * (outHigh - outLow);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
