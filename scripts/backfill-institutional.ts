import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { getInstitutionalOwnership } from '../lib/financial-datasets';
import { BATCH_SIZE } from '../lib/utils/constants';

const DELAY_MS = 100;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Sentinel: Backfill Institutional Holdings ===\n');

  const db = getSupabaseServerClient();

  const { data: stocks } = await db
    .from('stocks')
    .select('symbol')
    .eq('is_active', true)
    .order('symbol');

  if (!stocks) { console.error('No stocks'); process.exit(1); }
  console.log(`Fetching institutional holdings for ${stocks.length} stocks\n`);

  let totalInserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol } = stocks[i];

    try {
      const holdings = await getInstitutionalOwnership(symbol, { limit: 100 });

      if (holdings.length === 0) {
        if ((i + 1) % 100 === 0) console.log(`  [${i + 1}/${stocks.length}] ${totalInserted} holdings, ${symbol} — no data`);
        await sleep(DELAY_MS);
        continue;
      }

      const rows = holdings.map((h) => ({
        symbol,
        institution_name: h.investor,
        shares_held: h.shares,
        value: h.market_value,
        pct_of_portfolio: null as number | null,
        change_shares: null as number | null,
        change_pct: null as number | null,
        filing_quarter: h.report_period,
        filing_date: h.report_period,
      }));

      for (let j = 0; j < rows.length; j += BATCH_SIZE) {
        const batch = rows.slice(j, j + BATCH_SIZE);
        const { error } = await db
          .from('institutional_holdings')
          .upsert(batch, { onConflict: 'symbol,institution_name,filing_quarter', ignoreDuplicates: true });
        if (error) {
          totalErrors++;
          if (totalErrors <= 3) console.error(`  Error for ${symbol}: ${error.message}`);
        }
      }

      totalInserted += rows.length;
      if ((i + 1) % 50 === 0) console.log(`  [${i + 1}/${stocks.length}] ${totalInserted} holdings inserted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('402') && totalErrors < 5) console.log(`  ${symbol} — ${msg}`);
      totalErrors++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n--- Institutional Holdings Done ---`);
  console.log(`Inserted: ${totalInserted} | Errors: ${totalErrors}\n`);

  // Now compute institutional_signals from the raw holdings
  console.log('Computing institutional signals...\n');

  const { data: allSymbols } = await db
    .from('institutional_holdings')
    .select('symbol')
    .order('symbol');

  const uniqueSymbols = [...new Set((allSymbols ?? []).map((r) => r.symbol as string))];
  let signalsComputed = 0;

  for (const sym of uniqueSymbols) {
    const { data: quarters } = await db
      .from('institutional_holdings')
      .select('filing_quarter')
      .eq('symbol', sym)
      .order('filing_quarter', { ascending: false })
      .limit(2);

    const latestQuarter = quarters?.[0]?.filing_quarter;
    const prevQuarter = quarters?.[1]?.filing_quarter;

    if (!latestQuarter) continue;

    const { data: currentHoldings } = await db
      .from('institutional_holdings')
      .select('institution_name, shares_held, value')
      .eq('symbol', sym)
      .eq('filing_quarter', latestQuarter);

    if (!currentHoldings || currentHoldings.length === 0) continue;

    let newPositions = 0;
    let increased = 0;
    let decreased = 0;
    let closed = 0;
    let netFlow = 0;
    const notableFunds: string[] = [];

    if (prevQuarter) {
      const { data: prevHoldings } = await db
        .from('institutional_holdings')
        .select('institution_name, shares_held')
        .eq('symbol', sym)
        .eq('filing_quarter', prevQuarter);

      const prevMap = new Map(
        (prevHoldings ?? []).map((h) => [h.institution_name as string, Number(h.shares_held ?? 0)])
      );

      for (const h of currentHoldings) {
        const name = h.institution_name as string;
        const curShares = Number(h.shares_held ?? 0);
        const prevShares = prevMap.get(name);

        if (prevShares === undefined) {
          newPositions++;
          netFlow += curShares;
          if (curShares > 1_000_000) notableFunds.push(name);
        } else if (curShares > prevShares) {
          increased++;
          netFlow += curShares - prevShares;
        } else if (curShares < prevShares) {
          decreased++;
          netFlow -= prevShares - curShares;
        }

        prevMap.delete(name);
      }

      for (const [, prevShares] of prevMap) {
        closed++;
        netFlow -= prevShares;
      }
    } else {
      newPositions = currentHoldings.length;
      for (const h of currentHoldings) {
        netFlow += Number(h.shares_held ?? 0);
      }
    }

    await db.from('institutional_signals').upsert({
      symbol: sym,
      num_new_positions: newPositions,
      num_increased: increased,
      num_decreased: decreased,
      num_closed: closed,
      net_institutional_flow: netFlow,
      notable_funds: notableFunds.slice(0, 5),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'symbol' });

    signalsComputed++;
  }

  console.log(`Institutional signals computed for ${signalsComputed} stocks`);
  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
