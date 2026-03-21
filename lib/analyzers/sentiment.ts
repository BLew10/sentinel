import { callLLM, isLLMAvailable } from '../llm';
import type { Fundamentals, TechnicalSignals } from '../utils/types';

interface AIAnalysisInput {
  symbol: string;
  name: string;
  sector: string | null;
  fundamentals: Fundamentals | null;
  technicals: TechnicalSignals | null;
  recentPrices: Array<{ date: string; close: number; volume: number }>;
}

interface AIAnalysisOutput {
  sentiment_score: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  one_line_summary: string;
  key_factors: string[];
  risk_factors: string[];
  confidence: number;
}

const SYSTEM_PROMPT = `You are a senior equity research analyst. Given financial data about a stock, provide a concise, actionable analysis.

Respond ONLY with valid JSON matching this schema:
{
  "sentiment_score": <number 0-100, where 100 is extremely bullish>,
  "bias": <"bullish" | "bearish" | "neutral">,
  "one_line_summary": <string, max 80 chars>,
  "key_factors": <array of 2-4 short strings>,
  "risk_factors": <array of 1-3 short strings>,
  "confidence": <number 0-100, how confident you are in the analysis>
}

Scoring guidelines:
- 80-100: Strong buy signal, multiple confirming factors
- 60-79: Moderately bullish, some positive catalysts
- 40-59: Neutral/mixed signals
- 20-39: Moderately bearish, concerning trends
- 0-19: Strong sell signal, multiple red flags

Be data-driven. Cite specific numbers. If data is missing, lower your confidence.`;

function buildPrompt(input: AIAnalysisInput): string {
  const { symbol, name, sector, fundamentals: f, technicals: t, recentPrices } = input;

  const lines: string[] = [
    `Analyze ${symbol} (${name})${sector ? ` — ${sector}` : ''}`,
    '',
  ];

  if (f) {
    lines.push('FUNDAMENTALS:');
    if (f.pe_ratio != null) lines.push(`  PE: ${f.pe_ratio.toFixed(1)}`);
    if (f.peg_ratio != null) lines.push(`  PEG: ${f.peg_ratio.toFixed(2)}`);
    if (f.revenue_growth_yoy != null) lines.push(`  Rev Growth YoY: ${(f.revenue_growth_yoy * 100).toFixed(1)}%`);
    if (f.earnings_growth_yoy != null) lines.push(`  Earn Growth YoY: ${(f.earnings_growth_yoy * 100).toFixed(1)}%`);
    if (f.revenue_growth_qoq != null) lines.push(`  Rev Growth QoQ: ${(f.revenue_growth_qoq * 100).toFixed(1)}%`);
    if (f.earnings_growth_qoq != null) lines.push(`  Earn Growth QoQ: ${(f.earnings_growth_qoq * 100).toFixed(1)}%`);
    if (f.gross_margin != null) lines.push(`  Gross Margin: ${(f.gross_margin * 100).toFixed(1)}%`);
    if (f.operating_margin != null) lines.push(`  Op Margin: ${(f.operating_margin * 100).toFixed(1)}%`);
    if (f.net_margin != null) lines.push(`  Net Margin: ${(f.net_margin * 100).toFixed(1)}%`);
    if (f.roe != null) lines.push(`  ROE: ${(f.roe * 100).toFixed(1)}%`);
    if (f.debt_to_equity != null) lines.push(`  D/E: ${f.debt_to_equity.toFixed(2)}`);
    if (f.current_ratio != null) lines.push(`  Current Ratio: ${f.current_ratio.toFixed(2)}`);
    lines.push('');
  }

  if (t) {
    lines.push('TECHNICALS:');
    if (t.rsi_14 != null) lines.push(`  RSI(14): ${t.rsi_14.toFixed(1)}`);
    if (t.price_vs_sma50 != null) lines.push(`  vs SMA50: ${(t.price_vs_sma50 * 100).toFixed(1)}%`);
    if (t.price_vs_sma200 != null) lines.push(`  vs SMA200: ${(t.price_vs_sma200 * 100).toFixed(1)}%`);
    if (t.pct_from_52w_high != null) lines.push(`  vs 52W High: ${(t.pct_from_52w_high * 100).toFixed(1)}%`);
    if (t.volume_ratio_50d != null) lines.push(`  Vol Ratio: ${t.volume_ratio_50d.toFixed(2)}x`);
    if (t.macd != null) lines.push(`  MACD: ${t.macd.toFixed(4)}`);
    if (t.rs_rank_3m != null) lines.push(`  RS Rank 3M: ${t.rs_rank_3m}`);
    lines.push('');
  }

  if (recentPrices.length > 0) {
    const latest = recentPrices[recentPrices.length - 1];
    const first = recentPrices[0];
    const periodReturn = (latest.close - first.close) / first.close;
    lines.push(`PRICE: $${latest.close.toFixed(2)} (${(periodReturn * 100).toFixed(1)}% over ${recentPrices.length} days)`);
    lines.push('');
  }

  lines.push('Provide your analysis as JSON.');
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
      maxTokens: 1024,
    });

    const result = response.parsed;
    result.sentiment_score = Math.max(0, Math.min(100, Math.round(result.sentiment_score)));
    result.confidence = Math.max(0, Math.min(100, Math.round(result.confidence)));

    return result;
  } catch (err) {
    console.error(`AI analysis failed for ${input.symbol}:`, err);
    return null;
  }
}

export type { AIAnalysisInput, AIAnalysisOutput };
