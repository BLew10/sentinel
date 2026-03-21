import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { analyzeStock } from '../lib/analyzers/sentiment';
import { isLLMAvailable } from '../lib/llm';
import type { Fundamentals, TechnicalSignals } from '../lib/utils/types';

const BATCH_SIZE = 10;
const DELAY_BETWEEN_CALLS_MS = 500;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!isLLMAvailable()) {
    console.error('No LLM provider configured. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY.');
    process.exit(1);
  }

  const db = getSupabaseServerClient();

  const { data: stocks } = await db
    .from('stocks')
    .select('symbol, name, sector')
    .eq('is_active', true)
    .order('symbol');

  if (!stocks || stocks.length === 0) {
    console.log('No active stocks found.');
    return;
  }

  console.log(`Analyzing ${stocks.length} stocks with AI...`);
  let analyzed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);

    for (const stock of batch) {
      try {
        const [fundRes, techRes, pricesRes] = await Promise.all([
          db.from('fundamentals').select('*').eq('symbol', stock.symbol).single(),
          db.from('technical_signals').select('*').eq('symbol', stock.symbol).single(),
          db.from('daily_prices')
            .select('date, close, volume')
            .eq('symbol', stock.symbol)
            .order('date', { ascending: false })
            .limit(30),
        ]);

        const result = await analyzeStock({
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          fundamentals: fundRes.data as Fundamentals | null,
          technicals: techRes.data as TechnicalSignals | null,
          recentPrices: (pricesRes.data ?? []).reverse().map((p) => ({
            date: p.date as string,
            close: Number(p.close),
            volume: Number(p.volume),
          })),
        });

        if (!result) {
          skipped++;
          continue;
        }

        const { error } = await db.from('earnings_analysis').upsert({
          symbol: stock.symbol,
          fiscal_quarter: new Date().toISOString().slice(0, 7),
          conviction_score: result.sentiment_score,
          management_tone: result.bias === 'bullish' ? 'bullish' : result.bias === 'bearish' ? 'bearish' : 'neutral',
          one_line_summary: result.one_line_summary,
          key_positives: result.key_factors,
          key_concerns: result.risk_factors,
          analyzed_at: new Date().toISOString(),
        }, { onConflict: 'symbol,fiscal_quarter' });

        if (error) {
          console.error(`DB error for ${stock.symbol}:`, error.message);
          errors++;
        } else {
          analyzed++;
        }

        await sleep(DELAY_BETWEEN_CALLS_MS);
      } catch (err) {
        console.error(`Failed ${stock.symbol}:`, err);
        errors++;
      }
    }

    const progress = Math.min(i + BATCH_SIZE, stocks.length);
    console.log(`Progress: ${progress}/${stocks.length} (${analyzed} analyzed, ${skipped} skipped, ${errors} errors)`);
  }

  console.log(`\nDone! ${analyzed} analyzed, ${skipped} skipped, ${errors} errors`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
