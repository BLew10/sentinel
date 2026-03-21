import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { getInsiderTrades } from '../lib/financial-datasets';
import { BATCH_SIZE } from '../lib/utils/constants';

const DELAY_MS = 100;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Sentinel: Backfill Insider Trades ===\n');

  const db = getSupabaseServerClient();

  const { data: stocks } = await db
    .from('stocks')
    .select('symbol')
    .eq('is_active', true)
    .order('symbol');

  if (!stocks) { console.error('No stocks'); process.exit(1); }
  console.log(`Fetching insider trades for ${stocks.length} stocks\n`);

  let totalInserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol } = stocks[i];

    try {
      const trades = await getInsiderTrades(symbol, { limit: 100 });

      if (trades.length === 0) {
        if ((i + 1) % 100 === 0) console.log(`  [${i + 1}/${stocks.length}] ${totalInserted} trades, ${symbol} — no data`);
        await sleep(DELAY_MS);
        continue;
      }

      const rows = trades.map((t) => ({
        symbol,
        insider_name: t.name,
        insider_title: t.title,
        is_board_director: t.is_board_director,
        transaction_date: t.transaction_date,
        transaction_type: t.transaction_type,
        shares: t.transaction_shares,
        price_per_share: t.transaction_price_per_share,
        transaction_value: t.transaction_value,
        shares_owned_after: t.shares_owned_after_transaction,
        filing_date: t.filing_date,
      }));

      for (let j = 0; j < rows.length; j += BATCH_SIZE) {
        const batch = rows.slice(j, j + BATCH_SIZE);
        const { error } = await db
          .from('insider_trades')
          .upsert(batch, { onConflict: 'symbol,insider_name,transaction_date,transaction_type,shares', ignoreDuplicates: true });
        if (error) {
          totalErrors++;
          if (totalErrors <= 3) console.error(`  Error for ${symbol}: ${error.message}`);
        }
      }

      totalInserted += rows.length;
      if ((i + 1) % 50 === 0) console.log(`  [${i + 1}/${stocks.length}] ${totalInserted} trades inserted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && totalErrors < 5) console.log(`  ${symbol} — ${msg}`);
      totalErrors++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n--- Insider Trades Done ---`);
  console.log(`Inserted: ${totalInserted} | Errors: ${totalErrors}\n`);

  // Now compute insider_signals from the raw trades
  console.log('Computing insider signals...\n');

  const { data: allSymbols } = await db
    .from('insider_trades')
    .select('symbol')
    .order('symbol');

  const uniqueSymbols = [...new Set((allSymbols ?? []).map((r) => r.symbol as string))];
  let signalsComputed = 0;

  for (const sym of uniqueSymbols) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];

    const { data: recentTrades } = await db
      .from('insider_trades')
      .select('insider_name, transaction_type, transaction_value, shares')
      .eq('symbol', sym)
      .gte('transaction_date', thirtyDaysAgo);

    if (!recentTrades || recentTrades.length === 0) continue;

    let buyers = 0;
    let sellers = 0;
    let netBuyValue = 0;
    let largestValue = 0;
    let largestName = '';

    for (const t of recentTrades) {
      const type = (t.transaction_type as string).toLowerCase();
      const value = Number(t.transaction_value ?? 0);
      const isBuy = type.includes('buy') || type.includes('purchase') || (type.includes('acquisition') && !type.includes('disposition'));

      if (isBuy) {
        buyers++;
        netBuyValue += value;
      } else {
        sellers++;
        netBuyValue -= value;
      }

      if (Math.abs(value) > largestValue) {
        largestValue = Math.abs(value);
        largestName = t.insider_name as string;
      }
    }

    await db.from('insider_signals').upsert({
      symbol: sym,
      num_buyers_30d: buyers,
      num_sellers_30d: sellers,
      net_buy_value_30d: netBuyValue,
      largest_transaction_value: largestValue,
      largest_transaction_name: largestName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'symbol' });

    signalsComputed++;
  }

  console.log(`Insider signals computed for ${signalsComputed} stocks`);
  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
