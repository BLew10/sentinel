import 'dotenv/config';
import { format, subDays } from 'date-fns';
import { getSupabaseServerClient } from '../lib/db';
import { getStockPrices } from '../lib/financial-datasets';
import { computeAllIndicators, computePercentileRank } from '../lib/indicators';
import { computeAndStoreScores } from '../lib/scoring';
import { detectAlerts, recordAlert } from '../lib/alerts';
import { snapshotSignal } from '../lib/signals';
import type { PriceBar } from '../lib/utils/types';

async function fetchPrices() {
  console.log('\n=== 1/4 Fetch Prices ===');
  const db = getSupabaseServerClient();
  const { data: stocks } = await db.from('stocks').select('symbol').eq('is_active', true).order('symbol');
  if (!stocks) { console.log('No stocks found'); return; }

  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), 5), 'yyyy-MM-dd');

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol } = stocks[i];
    try {
      const prices = await getStockPrices(symbol, startDate, endDate);
      if (prices.length === 0) continue;

      const rows = prices.map((p) => ({
        symbol,
        date: p.time.split('T')[0],
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      }));

      const { error } = await db.from('daily_prices').upsert(rows, { onConflict: 'symbol,date' });
      if (error) errors++;
      else inserted += rows.length;

      if ((i + 1) % 50 === 0) console.log(`  [${i + 1}/${stocks.length}] ${inserted} rows inserted, ${errors} errors`);
    } catch {
      errors++;
    }
  }
  console.log(`  Done: ${inserted} rows, ${errors} errors across ${stocks.length} stocks`);
}

async function computeScores() {
  console.log('\n=== 2/4 Compute Technicals + Scores ===');
  const db = getSupabaseServerClient();
  const { data: stocks } = await db.from('stocks').select('symbol').eq('is_active', true).order('symbol');
  if (!stocks) { console.log('No stocks'); return; }

  const { data: spyPrices } = await db.from('daily_prices').select('close').eq('symbol', 'SPY').order('date', { ascending: true });
  const spyCloses = (spyPrices ?? []).map((p) => Number(p.close));

  const allRsRaw: Array<{ symbol: string; rs3m: number | null; rs6m: number | null; rs12m: number | null }> = [];
  let techComputed = 0;
  let rsiBounces = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol } = stocks[i];

    const [pricesRes, prevTechRes] = await Promise.all([
      db.from('daily_prices')
        .select('date, open, high, low, close, volume')
        .eq('symbol', symbol)
        .order('date', { ascending: true }),
      db.from('technical_signals')
        .select('rsi_14')
        .eq('symbol', symbol)
        .single(),
    ]);

    if (!pricesRes.data || pricesRes.data.length < 20) continue;

    const prevRsi = prevTechRes.data?.rsi_14 != null
      ? Number(prevTechRes.data.rsi_14)
      : null;

    const prices: PriceBar[] = pricesRes.data.map((p) => ({
      date: p.date as string,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
    }));

    const indicators = computeAllIndicators(prices, spyCloses);
    const { rs_raw_3m, rs_raw_6m, rs_raw_12m, ...dbIndicators } = indicators;
    allRsRaw.push({ symbol, rs3m: rs_raw_3m, rs6m: rs_raw_6m, rs12m: rs_raw_12m });

    await db.from('technical_signals').upsert({
      symbol,
      ...dbIndicators,
      rs_rank_3m: null,
      rs_rank_6m: null,
      rs_rank_12m: null,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'symbol' });

    // RSI Oversold Bounce detection
    const newRsi = dbIndicators.rsi_14;
    if (prevRsi != null && newRsi != null && prevRsi < 30 && newRsi >= 30) {
      const currentPrice = prices[prices.length - 1].close;

      const { data: scoreRow } = await db
        .from('sentinel_scores')
        .select('sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, news_sentiment_score, options_flow_score')
        .eq('symbol', symbol)
        .single();

      const { data: stockRow } = await db
        .from('stocks')
        .select('sector')
        .eq('symbol', symbol)
        .single();

      await snapshotSignal({
        symbol,
        triggerType: 'rsi_oversold_bounce',
        triggerDetail: `RSI bounced from ${prevRsi.toFixed(1)} to ${newRsi.toFixed(1)}`,
        priceAtSignal: currentPrice,
        sentinelScore: scoreRow?.sentinel_score != null ? Number(scoreRow.sentinel_score) : null,
        technicalScore: scoreRow?.technical_score != null ? Number(scoreRow.technical_score) : null,
        fundamentalScore: scoreRow?.fundamental_score != null ? Number(scoreRow.fundamental_score) : null,
        earningsAiScore: scoreRow?.earnings_ai_score != null ? Number(scoreRow.earnings_ai_score) : null,
        insiderScore: scoreRow?.insider_score != null ? Number(scoreRow.insider_score) : null,
        institutionalScore: scoreRow?.institutional_score != null ? Number(scoreRow.institutional_score) : null,
        newsSentimentScore: scoreRow?.news_sentiment_score != null ? Number(scoreRow.news_sentiment_score) : null,
        optionsFlowScore: scoreRow?.options_flow_score != null ? Number(scoreRow.options_flow_score) : null,
        sector: (stockRow?.sector as string | null) ?? null,
      });

      rsiBounces++;
      console.log(`  🔔 RSI Oversold Bounce: ${symbol} (RSI ${prevRsi.toFixed(1)} → ${newRsi.toFixed(1)})`);
    }

    techComputed++;
    if ((i + 1) % 50 === 0) console.log(`  Technicals: [${i + 1}/${stocks.length}]`);
  }

  console.log(`  Technicals done: ${techComputed} stocks, ${rsiBounces} RSI bounces detected`);

  const all3m = allRsRaw.map((r) => r.rs3m).filter((v): v is number => v != null);
  const all6m = allRsRaw.map((r) => r.rs6m).filter((v): v is number => v != null);
  const all12m = allRsRaw.map((r) => r.rs12m).filter((v): v is number => v != null);

  for (const { symbol, rs3m, rs6m, rs12m } of allRsRaw) {
    await db.from('technical_signals').update({
      rs_rank_3m: rs3m != null ? computePercentileRank(rs3m, all3m) : null,
      rs_rank_6m: rs6m != null ? computePercentileRank(rs6m, all6m) : null,
      rs_rank_12m: rs12m != null ? computePercentileRank(rs12m, all12m) : null,
    }).eq('symbol', symbol);
  }
  console.log('  RS rankings updated');

  const scoreResult = await computeAndStoreScores();
  console.log(`  Scores: ${scoreResult.computed} computed, ${scoreResult.errors} errors`);
}

async function runAlerts() {
  console.log('\n=== 3/4 Detect Alerts ===');
  const alerts = await detectAlerts();
  console.log(`  Detected ${alerts.length} alerts`);

  let recorded = 0;
  for (const alert of alerts) {
    try {
      await recordAlert(alert);
      recorded++;
      console.log(`  → ${alert.alert_type}: ${alert.symbol} — ${alert.detail}`);
    } catch {
      // continue
    }
  }
  console.log(`  Recorded ${recorded}/${alerts.length} alerts`);
}

async function main() {
  const arg = process.argv[2];
  const start = Date.now();

  console.log('=== Sentinel Local Cron Runner ===');
  console.log(`Started: ${new Date().toLocaleString()}`);

  if (!arg || arg === 'all') {
    await fetchPrices();
    await computeScores();
    await runAlerts();
  } else if (arg === 'prices') {
    await fetchPrices();
  } else if (arg === 'scores') {
    await computeScores();
  } else if (arg === 'alerts') {
    await runAlerts();
  } else {
    console.error(`Unknown job "${arg}". Available: prices, scores, alerts, all`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s ===`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
