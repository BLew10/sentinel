import { getSupabaseServerClient } from './db';
import { SCORE_WEIGHTS } from './utils/constants';
import { computeTechnicalScore } from './analyzers/technical';
import { computeFundamentalScore } from './analyzers/fundamental';
import { computeInsiderScore, computeInstitutionalScore } from './analyzers/insider';
import type {
  TechnicalSignals,
  Fundamentals,
  InsiderSignals,
  InstitutionalSignals,
  NewsSentiment,
  ComputedSentinelScore,
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
}): ComputedSentinelScore {
  const technical_score = components.technical
    ? computeTechnicalScore(components.technical)
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
  const options_flow_score = 50;

  const w = SCORE_WEIGHTS;
  const totalWeight =
    w.technical + w.fundamental + w.earnings_ai +
    w.insider + w.institutional + w.news_sentiment + w.options_flow;

  const weighted =
    technical_score * w.technical +
    fundamental_score * w.fundamental +
    earnings_ai_score * w.earnings_ai +
    insider_score * w.insider +
    institutional_score * w.institutional +
    news_sentiment_score * w.news_sentiment +
    options_flow_score * w.options_flow;

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
    .select('symbol')
    .eq('is_active', true)
    .order('symbol');

  if (!stocks) return { computed: 0, errors: 0 };

  const allScores: Array<{
    symbol: string;
    score: ComputedSentinelScore;
    scoreChange1d: number | null;
    scoreChange7d: number | null;
  }> = [];

  for (const { symbol } of stocks) {
    const [techRes, fundRes, insiderRes, instRes, newsRes, prevScoreRes, aiRes] = await Promise.all([
      db.from('technical_signals').select('*').eq('symbol', symbol).single(),
      db.from('fundamentals').select('*').eq('symbol', symbol).single(),
      db.from('insider_signals').select('*').eq('symbol', symbol).single(),
      db.from('institutional_signals').select('*').eq('symbol', symbol).single(),
      db.from('news_sentiment').select('*').eq('symbol', symbol).single(),
      db.from('sentinel_scores').select('sentinel_score, computed_at').eq('symbol', symbol).single(),
      db.from('earnings_analysis').select('conviction_score').eq('symbol', symbol).order('analyzed_at', { ascending: false }).limit(1).single(),
    ]);

    const earningsAiScore = aiRes.data?.conviction_score != null
      ? clamp(Number(aiRes.data.conviction_score))
      : undefined;

    const score = computeCompositeScore({
      technical: techRes.data as TechnicalSignals | null,
      fundamentals: fundRes.data as Fundamentals | null,
      insider: insiderRes.data as InsiderSignals | null,
      institutional: instRes.data as InstitutionalSignals | null,
      news: newsRes.data as NewsSentiment | null,
      earningsAiScore,
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

    allScores.push({ symbol, score, scoreChange1d, scoreChange7d });
  }

  // Rank by sentinel_score descending
  allScores.sort((a, b) => b.score.sentinel_score - a.score.sentinel_score);

  let computed = 0;
  let errors = 0;

  for (let i = 0; i < allScores.length; i++) {
    const { symbol, score, scoreChange1d, scoreChange7d } = allScores[i];
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
        computed_at: new Date().toISOString(),
      }, { onConflict: 'symbol' });

    if (error) errors++;
    else computed++;
  }

  return { computed, errors };
}
