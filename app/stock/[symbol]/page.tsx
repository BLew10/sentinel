import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/db';
import { getSECFilings } from '@/lib/financial-datasets';
import { detectTechnicalFlags, computePredictiveTechnicals } from '@/lib/analyzers/technical';
import { detectFundamentalFlags } from '@/lib/analyzers/fundamental';
import { detectInsiderFlags } from '@/lib/analyzers/insider';
import { detectAllSignals } from '@/lib/analyzers/signals';
import { classifySetups } from '@/lib/setups';
import type { TechnicalSignals, Fundamentals, ChartEvent, ChartEventCategory, InsiderTrade, FDSECFiling, EarningsAnalysis, ValueReversalResult, PriceBar } from '@/lib/utils/types';
import { StockDetail } from './StockDetail';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} — Sentinel` };
}

export default async function StockPage({ params }: Props) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  const db = getSupabaseServerClient();

  const SINGLE_USER_ID = '00000000-0000-0000-0000-000000000001';

  const [stockRes, pricesRes, fundRes, techRes, scoresRes, insiderRes, earningsRes, latestAiRes, watchlistRes] = await Promise.all([
    db.from('stocks').select('*').eq('symbol', sym).single(),
    db.from('daily_prices').select('date, open, high, low, close, volume').eq('symbol', sym).order('date', { ascending: true }),
    db.from('fundamentals').select('*').eq('symbol', sym).single(),
    db.from('technical_signals').select('*').eq('symbol', sym).single(),
    db.from('sentinel_scores').select('*').eq('symbol', sym).single(),
    db.from('insider_trades').select('*').eq('symbol', sym).order('transaction_date', { ascending: false }).limit(20),
    db.from('earnings_analysis').select('fiscal_quarter, transcript_date').eq('symbol', sym).order('transcript_date', { ascending: false }).limit(20),
    db.from('earnings_analysis')
      .select('conviction_score, one_line_summary, key_positives, key_concerns, forward_catalysts, management_tone, analyzed_at')
      .eq('symbol', sym)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single(),
    db.from('watchlist')
      .select('id, notes, target_price')
      .eq('user_id', SINGLE_USER_ID)
      .eq('symbol', sym)
      .maybeSingle(),
  ]);

  if (!stockRes.data) notFound();

  const stock = stockRes.data;
  const prices: PriceBar[] = (pricesRes.data ?? []).map((p) => ({
    date: p.date as string,
    open: Number(p.open),
    high: Number(p.high),
    low: Number(p.low),
    close: Number(p.close),
    volume: Number(p.volume),
  }));

  const fundamentals = fundRes.data as Fundamentals | null;
  const technicals = techRes.data as TechnicalSignals | null;
  const scores = scoresRes.data as unknown as import('@/lib/utils/types').SentinelScore | null;

  const scoreMetadata = scoresRes.data?.score_metadata as Record<string, unknown> | null;
  const valueReversalData = scoreMetadata?.value_reversal as ValueReversalResult | undefined;
  const valueReversal = valueReversalData?.fired ? valueReversalData : null;
  const insiderTrades = (insiderRes.data ?? []) as unknown as InsiderTrade[];
  const earningsRows = (earningsRes.data ?? []) as unknown as Pick<EarningsAnalysis, 'fiscal_quarter' | 'transcript_date'>[];

  const predictive = prices.length >= 30
    ? computePredictiveTechnicals(prices, technicals?.rs_rank_3m ?? null, technicals?.rs_rank_3m ?? null)
    : undefined;
  const technicalFlags = technicals ? detectTechnicalFlags(technicals, predictive) : [];
  const fundamentalFlags = fundamentals ? detectFundamentalFlags(fundamentals) : [];
  const insiderFlags = detectInsiderFlags(insiderTrades, prices);

  const storedFlags = (scoresRes.data?.flags as string[] | null) ?? [];
  const allFlags = [...new Set([...storedFlags, ...technicalFlags])];

  const setups = classifySetups({
    flags: allFlags,
    sentinelScore: scores?.sentinel_score ?? null,
    technicalScore: scores?.technical_score ?? null,
    fundamentalScore: scores?.fundamental_score ?? null,
    insiderScore: scores?.insider_score ?? null,
    earningsAiScore: scores?.earnings_ai_score ?? null,
    rsi14: technicals?.rsi_14 ?? null,
    priceVsSma50: technicals?.price_vs_sma50 ?? null,
    pctFrom52wHigh: technicals?.pct_from_52w_high ?? null,
    volumeRatio50d: technicals?.volume_ratio_50d ?? null,
  });

  const latestAi = latestAiRes.data as {
    conviction_score: number | null;
    one_line_summary: string | null;
    key_positives: string[] | null;
    key_concerns: string[] | null;
    forward_catalysts: string[] | null;
    management_tone: string | null;
    analyzed_at: string | null;
  } | null;

  let filings: FDSECFiling[] = [];
  try {
    filings = await getSECFilings(sym, { limit: 20 });
  } catch {
    // SEC filings are supplemental — page still renders without them
  }

  const signals = detectAllSignals({
    symbol: sym,
    prices,
    filings,
    insiderTrades,
    marketCap: stock.market_cap ? Number(stock.market_cap) : null,
  });

  const latestPrice = prices.length > 0 ? prices[prices.length - 1] : null;
  const prevPrice = prices.length > 1 ? prices[prices.length - 2] : null;
  const priceChange = latestPrice && prevPrice
    ? { absolute: latestPrice.close - prevPrice.close, percent: (latestPrice.close - prevPrice.close) / prevPrice.close }
    : null;

  const chartEvents = buildChartEvents(insiderTrades, earningsRows, filings);

  const watchlistEntry = watchlistRes.data
    ? { notes: watchlistRes.data.notes as string | null, targetPrice: watchlistRes.data.target_price ? Number(watchlistRes.data.target_price) : null }
    : null;

  return (
    <StockDetail
      stock={stock}
      prices={prices}
      fundamentals={fundamentals}
      technicals={technicals}
      scores={scores}
      insiderTrades={insiderTrades}
      technicalFlags={technicalFlags}
      fundamentalFlags={fundamentalFlags}
      insiderFlags={insiderFlags}
      signals={signals}
      valueReversal={valueReversal}
      latestPrice={latestPrice}
      priceChange={priceChange}
      chartEvents={chartEvents}
      setups={setups}
      latestAi={latestAi}
      allFlags={allFlags}
      watchlistEntry={watchlistEntry}
    />
  );
}

function formatCompactValue(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function isInsiderBuy(txType: string): boolean {
  const lower = txType.toLowerCase();
  return lower.includes('buy') || lower.includes('purchase');
}

function buildChartEvents(
  insiderTrades: InsiderTrade[],
  earningsRows: Pick<EarningsAnalysis, 'fiscal_quarter' | 'transcript_date'>[],
  filings: FDSECFiling[],
): ChartEvent[] {
  const events: ChartEvent[] = [];

  for (const t of insiderTrades) {
    if (!t.transaction_date) continue;
    const isBuy = isInsiderBuy(t.transaction_type);
    const category: ChartEventCategory = isBuy ? 'insider_buy' : 'insider_sell';
    const valueStr = t.transaction_value ? ` ${formatCompactValue(t.transaction_value)}` : '';
    events.push({
      date: t.transaction_date,
      category,
      label: `${t.insider_name.split(' ').pop()}${valueStr}`,
      detail: `${t.insider_name}${t.insider_title ? ` (${t.insider_title})` : ''} — ${t.transaction_type} ${t.shares.toLocaleString()} shares${valueStr}`,
    });
  }

  for (const e of earningsRows) {
    const date = e.transcript_date;
    if (!date) continue;
    events.push({
      date,
      category: 'earnings',
      label: e.fiscal_quarter ?? 'Earnings',
      detail: `Earnings report: ${e.fiscal_quarter ?? 'unknown quarter'}`,
    });
  }

  for (const f of filings) {
    if (!f.filing_date) continue;
    events.push({
      date: f.filing_date,
      category: 'sec_filing',
      label: f.filing_type,
      detail: `SEC ${f.filing_type} filed ${f.filing_date}`,
    });
  }

  return events;
}
