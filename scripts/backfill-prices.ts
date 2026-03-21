import 'dotenv/config';
import { subDays, format } from 'date-fns';
import { getSupabaseServerClient } from '../lib/db';
import { getStockPrices } from '../lib/financial-datasets';
import { BATCH_SIZE } from '../lib/utils/constants';

const LOOKBACK_DAYS = 400; // fetch ~400 calendar days to get ~252 trading days (full 52-week range)
const DELAY_BETWEEN_SYMBOLS_MS = 100; // 1,000 req/min on Developer plan

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Sentinel: Backfill Daily Prices ===\n');

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

  console.log(`Found ${stocks.length} active stocks to backfill\n`);

  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), LOOKBACK_DAYS), 'yyyy-MM-dd');

  let totalInserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol } = stocks[i];

    try {
      const prices = await getStockPrices(symbol, startDate, endDate);

      if (prices.length === 0) {
        console.log(`[${i + 1}/${stocks.length}] ${symbol} — no price data`);
        continue;
      }

      const rows = prices.map((p) => ({
        symbol,
        date: p.time.split('T')[0],
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      }));

      const batchErrors: string[] = [];
      for (let j = 0; j < rows.length; j += BATCH_SIZE) {
        const batch = rows.slice(j, j + BATCH_SIZE);
        const { error: insertError } = await db
          .from('daily_prices')
          .upsert(batch, { onConflict: 'symbol,date' });

        if (insertError) {
          batchErrors.push(insertError.message);
        }
      }

      if (batchErrors.length > 0) {
        console.log(
          `[${i + 1}/${stocks.length}] ${symbol} — ${prices.length} prices, ${batchErrors.length} batch errors`,
        );
        totalErrors++;
      } else {
        totalInserted += rows.length;
        console.log(
          `[${i + 1}/${stocks.length}] ${symbol} — ${rows.length} days inserted`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[${i + 1}/${stocks.length}] ${symbol} — ERROR: ${msg}`);
      totalErrors++;
    }

    await sleep(DELAY_BETWEEN_SYMBOLS_MS);
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Total price rows inserted: ${totalInserted}`);
  console.log(`Symbols with errors:       ${totalErrors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
