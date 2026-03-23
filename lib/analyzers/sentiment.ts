import { callLLM, isLLMAvailable } from '../llm';
import type { Fundamentals, TechnicalSignals, FDAnalystEstimate } from '../utils/types';
import type { EstimateRevisionResult } from './estimates';

interface AIAnalysisInput {
  symbol: string;
  name: string;
  sector: string | null;
  fundamentals: Fundamentals | null;
  technicals: TechnicalSignals | null;
  recentPrices: Array<{ date: string; close: number; volume: number }>;
  analystEstimates?: FDAnalystEstimate[];
  estimateRevision?: EstimateRevisionResult;
  predictiveSignals?: string[];
}

interface AIAnalysisOutput {
  sentiment_score: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  one_line_summary: string;
  key_factors: string[];
  risk_factors: string[];
  catalyst_timeline: Array<{
    event: string;
    expected_date: string;
    impact: 'positive' | 'negative' | 'uncertain';
  }>;
  move_probability: number;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a senior equity research analyst focused on PREDICTING near-term price movements, not summarizing what already happened.

Your job is to assess FORWARD-LOOKING probability: what is likely to happen in the next 30 days based on the data provided?

Respond ONLY with valid JSON matching this schema:
{
  "sentiment_score": <number 0-100, where 100 is extremely bullish>,
  "bias": <"bullish" | "bearish" | "neutral">,
  "one_line_summary": <string, max 80 chars, must be FORWARD-LOOKING>,
  "key_factors": <array of 2-4 short strings describing what WILL drive the stock>,
  "risk_factors": <array of 1-3 short strings describing what could go wrong>,
  "catalyst_timeline": <array of upcoming events with dates and expected impact>,
  "move_probability": <number 0-100, probability of a >5% move in the next 30 days>,
  "confidence": <number 0-100, how confident you are in this forward assessment>
}

catalyst_timeline entries should have:
  {"event": "<description>", "expected_date": "<YYYY-MM-DD or 'unknown'>", "impact": "<positive|negative|uncertain>"}

Scoring guidelines:
- 80-100: Strong conviction setup — multiple forward catalysts align
- 60-79: Moderately bullish — positive estimate revisions or setup forming
- 40-59: Neutral — no clear directional catalyst
- 20-39: Moderately bearish — deteriorating estimates or negative catalysts
- 0-19: Strong bearish conviction — multiple headwinds converging

CRITICAL: Focus on what HASN'T happened yet. Analyst estimate revisions, upcoming earnings, volatility setups, and accumulation patterns are more valuable than trailing fundamentals.`;

function buildPrompt(input: AIAnalysisInput): string {
  const { symbol, name, sector, fundamentals: f, technicals: t, recentPrices } = input;

  const lines: string[] = [
    `Predict the next 30-day outlook for ${symbol} (${name})${sector ? ` — ${sector}` : ''}`,
    '',
  ];

  if (f) {
    lines.push('FUNDAMENTALS (trailing):');
    if (f.pe_ratio != null) lines.push(`  PE: ${f.pe_ratio.toFixed(1)}`);
    if (f.forward_pe != null) lines.push(`  Forward PE: ${f.forward_pe.toFixed(1)}`);
    if (f.peg_ratio != null) lines.push(`  PEG: ${f.peg_ratio.toFixed(2)}`);
    if (f.revenue_growth_yoy != null) lines.push(`  Rev Growth YoY: ${(f.revenue_growth_yoy * 100).toFixed(1)}%`);
    if (f.earnings_growth_yoy != null) lines.push(`  Earn Growth YoY: ${(f.earnings_growth_yoy * 100).toFixed(1)}%`);
    if (f.revenue_growth_qoq != null) lines.push(`  Rev Growth QoQ: ${(f.revenue_growth_qoq * 100).toFixed(1)}%`);
    if (f.earnings_growth_qoq != null) lines.push(`  Earn Growth QoQ: ${(f.earnings_growth_qoq * 100).toFixed(1)}%`);
    if (f.gross_margin != null) lines.push(`  Gross Margin: ${(f.gross_margin * 100).toFixed(1)}%`);
    if (f.operating_margin != null) lines.push(`  Op Margin: ${(f.operating_margin * 100).toFixed(1)}%`);
    if (f.free_cash_flow != null) lines.push(`  FCF: $${(f.free_cash_flow / 1e6).toFixed(1)}M`);
    if (f.debt_to_equity != null) lines.push(`  D/E: ${f.debt_to_equity.toFixed(2)}`);
    lines.push('');
  }

  // Forward-looking data: analyst estimates
  if (input.analystEstimates && input.analystEstimates.length > 0) {
    lines.push('ANALYST ESTIMATES (forward-looking):');
    for (const est of input.analystEstimates.slice(0, 4)) {
      const eps = est.earnings_per_share != null ? `EPS: $${est.earnings_per_share.toFixed(2)}` : '';
      const rev = est.revenue != null ? `Rev: $${(est.revenue / 1e9).toFixed(2)}B` : '';
      lines.push(`  ${est.fiscal_period} (${est.period}): ${[eps, rev].filter(Boolean).join(' · ')}`);
    }
    lines.push('');
  }

  // Estimate revision data
  if (input.estimateRevision) {
    const er = input.estimateRevision;
    lines.push('ESTIMATE REVISIONS (forward-looking):');
    if (er.eps_revision_pct != null) lines.push(`  EPS revision: ${(er.eps_revision_pct * 100).toFixed(1)}%`);
    if (er.revenue_revision_pct != null) lines.push(`  Revenue revision: ${(er.revenue_revision_pct * 100).toFixed(1)}%`);
    if (er.earnings_surprise_streak > 0) lines.push(`  Surprise streak: ${er.earnings_surprise_streak} consecutive beats`);
    if (er.next_earnings_date) lines.push(`  Next earnings: ${er.next_earnings_date} (${er.days_to_earnings} days away)`);
    if (er.flags.length > 0) lines.push(`  Flags: ${er.flags.join(', ')}`);
    lines.push('');
  }

  if (t) {
    lines.push('TECHNICALS:');
    if (t.rsi_14 != null) lines.push(`  RSI(14): ${t.rsi_14.toFixed(1)}`);
    if (t.price_vs_sma50 != null) lines.push(`  vs SMA50: ${(t.price_vs_sma50 * 100).toFixed(1)}%`);
    if (t.price_vs_sma200 != null) lines.push(`  vs SMA200: ${(t.price_vs_sma200 * 100).toFixed(1)}%`);
    if (t.pct_from_52w_high != null) lines.push(`  vs 52W High: ${(t.pct_from_52w_high * 100).toFixed(1)}%`);
    if (t.volume_ratio_50d != null) lines.push(`  Vol Ratio: ${t.volume_ratio_50d.toFixed(2)}x`);
    if (t.rs_rank_3m != null) lines.push(`  RS Rank 3M: ${t.rs_rank_3m}`);
    lines.push('');
  }

  // Predictive signals detected by our system
  if (input.predictiveSignals && input.predictiveSignals.length > 0) {
    lines.push('PREDICTIVE SIGNALS DETECTED:');
    for (const sig of input.predictiveSignals) {
      lines.push(`  - ${sig}`);
    }
    lines.push('');
  }

  if (recentPrices.length > 0) {
    const latest = recentPrices[recentPrices.length - 1];
    const first = recentPrices[0];
    const periodReturn = (latest.close - first.close) / first.close;
    lines.push(`PRICE: $${latest.close.toFixed(2)} (${(periodReturn * 100).toFixed(1)}% over ${recentPrices.length} days)`);
    lines.push('');
  }

  lines.push('Based on this data, provide your FORWARD-LOOKING analysis as JSON. Focus on what will happen next, not what already happened.');
  return lines.join('\n');
}

export async function analyzeStock(input: AIAnalysisInput): Promise<AIAnalysisOutput | null> {
  if (!isLLMAvailable()) return null;

  try {
    const prompt = buildPrompt(input);
    const response = await callLLM<AIAnalysisOutput>(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 1536,
    });

    const result = response.parsed;
    result.sentiment_score = Math.max(0, Math.min(100, Math.round(result.sentiment_score)));
    result.confidence = Math.max(0, Math.min(100, Math.round(result.confidence)));
    result.move_probability = Math.max(0, Math.min(100, Math.round(result.move_probability ?? 50)));
    if (!Array.isArray(result.catalyst_timeline)) result.catalyst_timeline = [];

    return result;
  } catch (err) {
    console.error(`AI analysis failed for ${input.symbol}:`, err);
    return null;
  }
}

export type { AIAnalysisInput, AIAnalysisOutput };
