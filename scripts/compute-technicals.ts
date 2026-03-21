import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { computeAllIndicators, computePercentileRank } from '../lib/indicators';
import type { PriceBar } from '../lib/utils/types';

async function main() {
  console.log('=== Sentinel: Compute Technical Indicators ===\n');

  const db = getSupabaseServerClient();

  const { data: stocks, error } = await db
    .from('stocks')
    .select('symbol')
    .eq('is_active', true)
    .order('symbol');

  if (error || !stocks) {
    console.error('Failed to fetch stocks:', error?.message);
    process.exit(1);
  }

  console.log(`Computing indicators for ${stocks.length} stocks...\n`);

  // Fetch SPY prices as benchmark for relative strength
  const { data: spyPrices } = await db
    .from('daily_prices')
    .select('close')
    .eq('symbol', 'SPY')
    .order('date', { ascending: true });

  const benchmarkCloses = spyPrices?.map((p) => Number(p.close)) ?? [];
  const hasBenchmark = benchmarkCloses.length > 252;

  if (!hasBenchmark) {
    console.log(
      'WARNING: SPY data missing or insufficient. RS ranking will be skipped.\n',
    );
  }

  // Phase 1: Compute raw indicators for all stocks
  interface RawResult {
    symbol: string;
    indicators: ReturnType<typeof computeAllIndicators>;
  }

  const results: RawResult[] = [];
  let skipped = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol } = stocks[i];

    const { data: priceData } = await db
      .from('daily_prices')
      .select('date, open, high, low, close, volume')
      .eq('symbol', symbol)
      .order('date', { ascending: true });

    if (!priceData || priceData.length < 30) {
      skipped++;
      continue;
    }

    const bars: PriceBar[] = priceData.map((p) => ({
      date: p.date,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
    }));

    const indicators = computeAllIndicators(
      bars,
      hasBenchmark ? benchmarkCloses : undefined,
    );

    results.push({ symbol, indicators });

    if ((i + 1) % 100 === 0) {
      console.log(`  Computed ${i + 1}/${stocks.length}...`);
    }
  }

  console.log(
    `\nComputed raw indicators for ${results.length} stocks (${skipped} skipped)\n`,
  );

  // Phase 2: Rank relative strength across the universe
  const rs3mValues = results
    .map((r) => r.indicators.rs_raw_3m)
    .filter((v): v is number => v !== null);
  const rs6mValues = results
    .map((r) => r.indicators.rs_raw_6m)
    .filter((v): v is number => v !== null);
  const rs12mValues = results
    .map((r) => r.indicators.rs_raw_12m)
    .filter((v): v is number => v !== null);

  // Phase 3: Upsert to database
  let inserted = 0;
  let errors = 0;

  for (const { symbol, indicators } of results) {
    const rs_rank_3m =
      indicators.rs_raw_3m !== null
        ? computePercentileRank(indicators.rs_raw_3m, rs3mValues)
        : null;
    const rs_rank_6m =
      indicators.rs_raw_6m !== null
        ? computePercentileRank(indicators.rs_raw_6m, rs6mValues)
        : null;
    const rs_rank_12m =
      indicators.rs_raw_12m !== null
        ? computePercentileRank(indicators.rs_raw_12m, rs12mValues)
        : null;

    const row = {
      symbol,
      sma_20: indicators.sma_20,
      sma_50: indicators.sma_50,
      sma_150: indicators.sma_150,
      sma_200: indicators.sma_200,
      ema_10: indicators.ema_10,
      ema_21: indicators.ema_21,
      price_vs_sma50: indicators.price_vs_sma50,
      price_vs_sma200: indicators.price_vs_sma200,
      pct_from_52w_high: indicators.pct_from_52w_high,
      pct_from_52w_low: indicators.pct_from_52w_low,
      rsi_14: indicators.rsi_14,
      macd: indicators.macd,
      macd_signal: indicators.macd_signal,
      macd_histogram: indicators.macd_histogram,
      volume_ratio_50d: indicators.volume_ratio_50d,
      rs_rank_3m,
      rs_rank_6m,
      rs_rank_12m,
      atr_14: indicators.atr_14,
      atr_pct: indicators.atr_pct,
      computed_at: new Date().toISOString(),
    };

    const { error: upsertError } = await db
      .from('technical_signals')
      .upsert(row, { onConflict: 'symbol' });

    if (upsertError) {
      errors++;
    } else {
      inserted++;
    }
  }

  console.log('=== Compute Complete ===');
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (insufficient data): ${skipped}`);
  console.log(`Errors:   ${errors}`);

  // Spot-check a few results
  const spotCheck = results.slice(0, 5);
  console.log('\n--- Spot Check (first 5) ---');
  for (const { symbol, indicators } of spotCheck) {
    const rsi = indicators.rsi_14?.toFixed(1) ?? 'n/a';
    const sma50 = indicators.sma_50?.toFixed(2) ?? 'n/a';
    const volRatio = indicators.volume_ratio_50d?.toFixed(2) ?? 'n/a';
    console.log(
      `  ${symbol}: RSI=${rsi} SMA50=${sma50} VolRatio=${volRatio}`,
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
