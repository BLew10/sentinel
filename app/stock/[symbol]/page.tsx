import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/db';
import { detectTechnicalFlags } from '@/lib/analyzers/technical';
import { detectFundamentalFlags } from '@/lib/analyzers/fundamental';
import type { TechnicalSignals, Fundamentals } from '@/lib/utils/types';
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

  const [stockRes, pricesRes, fundRes, techRes, scoresRes, insiderRes] = await Promise.all([
    db.from('stocks').select('*').eq('symbol', sym).single(),
    db.from('daily_prices').select('date, open, high, low, close, volume').eq('symbol', sym).order('date', { ascending: true }),
    db.from('fundamentals').select('*').eq('symbol', sym).single(),
    db.from('technical_signals').select('*').eq('symbol', sym).single(),
    db.from('sentinel_scores').select('*').eq('symbol', sym).single(),
    db.from('insider_trades').select('*').eq('symbol', sym).order('transaction_date', { ascending: false }).limit(20),
  ]);

  if (!stockRes.data) notFound();

  const stock = stockRes.data;
  const prices = (pricesRes.data ?? []).map((p) => ({
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
  const insiderTrades = (insiderRes.data ?? []) as unknown as import('@/lib/utils/types').InsiderTrade[];

  const technicalFlags = technicals ? detectTechnicalFlags(technicals) : [];
  const fundamentalFlags = fundamentals ? detectFundamentalFlags(fundamentals) : [];

  const latestPrice = prices.length > 0 ? prices[prices.length - 1] : null;
  const prevPrice = prices.length > 1 ? prices[prices.length - 2] : null;
  const priceChange = latestPrice && prevPrice
    ? { absolute: latestPrice.close - prevPrice.close, percent: (latestPrice.close - prevPrice.close) / prevPrice.close }
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
      latestPrice={latestPrice}
      priceChange={priceChange}
    />
  );
}
