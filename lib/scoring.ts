import { getSupabaseServerClient } from './db';
import { SCORE_WEIGHTS } from './utils/constants';
import { computeTechnicalScore } from './analyzers/technical';
import { computeFundamentalScore } from './analyzers/fundamental';
import { computeInsiderScore, computeInstitutionalScore } from './analyzers/insider';
import { detectCompositeFlags } from './analyzers/composite-flags';
import { detectVolumeAnomalies } from './indicators';
import type {
  TechnicalSignals,
  Fundamentals,
  InsiderSignals,
  InstitutionalSignals,
  NewsSentiment,
  ComputedSentinelScore,
  InsiderTrade,
  PriceBar,
  CompositeFlags,
} from './utils/types';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function computeCompositeScore(components: {
  technical: TechnicalSignals | null;
  fundamentals: Fundamentals | null;
  insider: InsiderSignals | null;
  institutional: InstitutionalSignals | null;
  news: NewsSentiment | null;
  earningsAiScore?: number;
  recentVolumeAnomaly?: boolean;
  estimateRevisionScore?: number;
}): ComputedSentinelScore {
  const technical_score = components.technical
    ? computeTechnicalScore(components.technical, {
        recentVolumeAnomaly: components.recentVolumeAnomaly,
      })
    : 50;

  const fundamental_score = components.fundamentals
    ? computeFundamentalScore(components.fundamentals)
    : 50;

  const insider_score = computeInsiderScore(components.insider);
  const institutional_score = computeInstitutionalScore(components.institutional);

  const news_sentiment_score = components.news?.sentiment_score != null
    ? clamp(components.news.sentiment_score)
    : 50;

  const earnings_ai_score = components.earningsAiScore ?? 50;
  const options_flow_score = components.estimateRevisionScore ?? 50;

  const w = SCORE_WEIGHTS;
  const totalWeight =
    w.technical + w.fundamental + w.earnings_ai +
    w.insider + w.institutional + w.news_sentiment + w.estimate_revision;

  const weighted =
    technical_score * w.technical +
    fundamental_score * w.fundamental +
    earnings_ai_score * w.earnings_ai +
    insider_score * w.insider +
    institutional_score * w.institutional +
    news_sentiment_score * w.news_sentiment +
    options_flow_score * w.estimate_revision;

  const sentinel_score = clamp(weighted / totalWeight);

  return {
    sentinel_score,
    technical_score,
    fundamental_score,
    earnings_ai_score,
    insider_score,
    institutional_score,
    news_sentiment_score,
    options_flow_score,
  };
}

export async function computeAndStoreScores(): Promise<{
  computed: number;
  errors: number;
}> {
  const db = getSupabaseServerClient();

  const { data: stocks } = await db
    .from('stocks')
    .select('symbol, market_cap')
    .eq('is_active', true)
    .order('symbol');

  if (!stocks) return { computed: 0, errors: 0 };

  const fourteenMonthsAgo = new Date();
  fourteenMonthsAgo.setMonth(fourteenMonthsAgo.getMonth() - 14);
  const insiderCutoff = fourteenMonthsAgo.toISOString().split('T')[0];

  const allScores: Array<{
    symbol: string;
    score: ComputedSentinelScore;
    scoreChange1d: number | null;
    scoreChange7d: number | null;
    composite: CompositeFlags;
  }> = [];

  for (const { symbol, market_cap } of stocks) {
    const [techRes, fundRes, insiderRes, instRes, newsRes, prevScoreRes, aiRes, tradesRes, pricesRes] = await Promise.all([
      db.from('technical_signals').select('*').eq('symbol', symbol).single(),
      db.from('fundamentals').select('*').eq('symbol', symbol).single(),
      db.from('insider_signals').select('*').eq('symbol', symbol).single(),
      db.from('institutional_signals').select('*').eq('symbol', symbol).single(),
      db.from('news_sentiment').select('*').eq('symbol', symbol).single(),
      db.from('sentinel_scores').select('sentinel_score, computed_at').eq('symbol', symbol).single(),
      db.from('earnings_analysis').select('conviction_score').eq('symbol', symbol).order('analyzed_at', { ascending: false }).limit(1).single(),
      db.from('insider_trades').select('*').eq('symbol', symbol).gte('transaction_date', insiderCutoff).order('transaction_date', { ascending: false }),
      db.from('daily_prices').select('date, open, high, low, close, volume').eq('symbol', symbol).order('date', { ascending: false }).limit(60),
    ]);

    const earningsAiScore = aiRes.data?.conviction_score != null
      ? clamp(Number(aiRes.data.conviction_score))
      : undefined;

    const technicals = techRes.data as TechnicalSignals | null;
    const fundamentals = fundRes.data as Fundamentals | null;

    const prices: PriceBar[] = (pricesRes.data ?? [])
      .reverse()
      .map((p: Record<string, unknown>) => ({
        date: p.date as string,
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
        volume: Number(p.volume),
      }));

    const recentAnomalies = detectVolumeAnomalies(prices, symbol);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const recentVolumeAnomaly = recentAnomalies.some(
      (a) => (a.anomaly_severity === 'high' || a.anomaly_severity === 'extreme')
        && new Date(a.date) >= threeDaysAgo,
    );

    const score = computeCompositeScore({
      technical: technicals,
      fundamentals,
      insider: insiderRes.data as InsiderSignals | null,
      institutional: instRes.data as InstitutionalSignals | null,
      news: newsRes.data as NewsSentiment | null,
      earningsAiScore,
      recentVolumeAnomaly,
    });

    const insiderTrades = (tradesRes.data ?? []) as unknown as InsiderTrade[];

    const composite = detectCompositeFlags({
      technicals,
      fundamentals,
      insiderTrades,
      prices,
      marketCap: market_cap ? Number(market_cap) : null,
    });

    const prevScore = prevScoreRes.data?.sentinel_score as number | null;
    const prevDate = prevScoreRes.data?.computed_at as string | null;
    let scoreChange1d: number | null = null;
    let scoreChange7d: number | null = null;

    if (prevScore != null && prevDate) {
      const daysSince = (Date.now() - new Date(prevDate).getTime()) / 86_400_000;
      if (daysSince <= 2) scoreChange1d = score.sentinel_score - prevScore;
      if (daysSince <= 8) scoreChange7d = score.sentinel_score - prevScore;
    }

    allScores.push({ symbol, score, scoreChange1d, scoreChange7d, composite });
  }

  // Rank by sentinel_score descending
  allScores.sort((a, b) => b.score.sentinel_score - a.score.sentinel_score);

  let computed = 0;
  let errors = 0;
  let firstError: string | null = null;

  for (let i = 0; i < allScores.length; i++) {
    const { symbol, score, scoreChange1d, scoreChange7d, composite } = allScores[i];
    const rank = i + 1;
    const percentile = Math.round(((allScores.length - rank) / allScores.length) * 100);

    const { error } = await db
      .from('sentinel_scores')
      .upsert({
        symbol,
        ...score,
        rank,
        percentile,
        score_change_1d: scoreChange1d,
        score_change_7d: scoreChange7d,
        flags: composite.flags,
        score_metadata: composite.metadata,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'symbol' });

    if (error) {
      errors++;
      if (!firstError) firstError = `${symbol}: ${error.message}`;
    } else {
      computed++;
    }
  }

  if (firstError && errors > 0) {
    console.log(`  [!] Score upsert errors: ${errors}/${allScores.length} — first: ${firstError}`);
  }

  return { computed, errors };
}
