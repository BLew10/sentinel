import { NextResponse } from 'next/server';
import { format, subDays } from 'date-fns';
import { getSupabaseServerClient } from '@/lib/db';
import { getStockPrices } from '@/lib/financial-datasets';
import { computeAllIndicators, computePercentileRank } from '@/lib/indicators';
import { computeAndStoreScores } from '@/lib/scoring';
import { detectAlerts, recordAlert } from '@/lib/alerts';
import { snapshotSignal } from '@/lib/signals';
import { analyzeStock } from '@/lib/analyzers/sentiment';
import { isLLMAvailable } from '@/lib/llm';
import type { PriceBar, Fundamentals, TechnicalSignals } from '@/lib/utils/types';

export const maxDuration = 300;

function verifyCron(request: Request): boolean {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  return secret === process.env.CRON_SECRET;
}

const results: Record<string, unknown> = {};

async function step1_fetchPrices() {
  const db = getSupabaseServerClient();
  const { data: stocks } = await db
    .from('stocks')
    .select('symbol')
    .eq('is_active', true)
    .order('symbol');

  if (!stocks) return;

  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), 5), 'yyyy-MM-dd');

  let inserted = 0;
  let errors = 0;

  for (const { symbol } of stocks) {
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

      const { error } = await db
        .from('daily_prices')
        .upsert(rows, { onConflict: 'symbol,date' });
      if (error) errors++;
      else inserted += rows.length;
    } catch {
      errors++;
    }
  }

  results.prices = { inserted, errors, stocks: stocks.length };
}

async function step2_computeTechnicals() {
  const db = getSupabaseServerClient();

  const { data: stocks } = await db
    .from('stocks')
    .select('symbol, sector')
    .eq('is_active', true)
    .order('symbol');
  if (!stocks) return;

  const { data: spyPrices } = await db
    .from('daily_prices')
    .select('close')
    .eq('symbol', 'SPY')
    .order('date', { ascending: true });
  const spyCloses = (spyPrices ?? []).map((p) => Number(p.close));

  const allRsRaw: Array<{ symbol: string; rs3m: number | null; rs6m: number | null; rs12m: number | null }> = [];
  let techComputed = 0;
  let signalsDetected = 0;

  for (const { symbol, sector } of stocks) {
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

    // RSI Oversold Bounce: previous RSI < 30 and new RSI >= 30
    const newRsi = dbIndicators.rsi_14;
    if (prevRsi != null && newRsi != null && prevRsi < 30 && newRsi >= 30) {
      const currentPrice = prices[prices.length - 1].close;

      const { data: scoreRow } = await db
        .from('sentinel_scores')
        .select('sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, news_sentiment_score, options_flow_score')
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
        sector: sector as string | null,
      });

      signalsDetected++;
    }

    techComputed++;
  }

  // RS rankings
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

  const scoreResult = await computeAndStoreScores();

  results.technicals = { computed: techComputed, rsi_bounces: signalsDetected };
  results.scores = { computed: scoreResult.computed, errors: scoreResult.errors };
}

async function step3_aiAnalysis() {
  if (!isLLMAvailable()) {
    results.ai = { skipped: true, reason: 'No LLM provider configured' };
    return;
  }

  const db = getSupabaseServerClient();

  const { data: movers } = await db
    .from('sentinel_scores')
    .select('symbol, score_change_1d, stocks!inner(name, sector)')
    .not('score_change_1d', 'is', null)
    .order('score_change_1d', { ascending: false })
    .limit(20);

  const symbols = (movers ?? []).map((m) => m.symbol as string);
  if (symbols.length === 0) {
    results.ai = { analyzed: 0, message: 'No movers' };
    return;
  }

  let analyzed = 0;
  let errors = 0;

  for (const sym of symbols) {
    try {
      const stock = movers!.find((m) => m.symbol === sym);
      const s = stock!.stocks as unknown as { name: string; sector: string | null };

      const [fundRes, techRes, pricesRes] = await Promise.all([
        db.from('fundamentals').select('*').eq('symbol', sym).single(),
        db.from('technical_signals').select('*').eq('symbol', sym).single(),
        db.from('daily_prices').select('date, close, volume').eq('symbol', sym).order('date', { ascending: false }).limit(30),
      ]);

      const result = await analyzeStock({
        symbol: sym,
        name: s.name,
        sector: s.sector,
        fundamentals: fundRes.data as Fundamentals | null,
        technicals: techRes.data as TechnicalSignals | null,
        recentPrices: (pricesRes.data ?? []).reverse().map((p) => ({
          date: p.date as string,
          close: Number(p.close),
          volume: Number(p.volume),
        })),
      });

      if (!result) continue;

      await db.from('earnings_analysis').upsert({
        symbol: sym,
        fiscal_quarter: new Date().toISOString().slice(0, 7),
        conviction_score: result.sentiment_score,
        management_tone: result.bias === 'bullish' ? 'bullish' : result.bias === 'bearish' ? 'bearish' : 'neutral',
        one_line_summary: result.one_line_summary,
        key_positives: result.key_factors,
        key_concerns: result.risk_factors,
        analyzed_at: new Date().toISOString(),
      }, { onConflict: 'symbol,fiscal_quarter' });

      analyzed++;
    } catch {
      errors++;
    }
  }

  results.ai = { analyzed, errors, total: symbols.length };
}

async function step4_alerts() {
  const alerts = await detectAlerts();
  let recorded = 0;

  for (const alert of alerts) {
    try {
      await recordAlert(alert);
      recorded++;
    } catch {
      // continue
    }
  }

  results.alerts = { detected: alerts.length, recorded };
}

export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  await step1_fetchPrices();
  await step2_computeTechnicals();
  await step3_aiAnalysis();
  await step4_alerts();

  results.elapsed_ms = Date.now() - start;

  return NextResponse.json(results);
}
