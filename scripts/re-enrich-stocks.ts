import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { getCompanyFacts, getFinancialMetricsSnapshot } from '../lib/financial-datasets';

const DELAY_MS = 200;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Sentinel: Re-enrich Stocks ===\n');

  const db = getSupabaseServerClient();

  const { data: stocks, error } = await db
    .from('stocks')
    .select('symbol, name, sector, market_cap')
    .eq('is_active', true)
    .or('sector.is.null,market_cap.is.null')
    .order('symbol');

  if (error || !stocks) {
    console.error('Failed to fetch stocks:', error?.message);
    process.exit(1);
  }

  console.log(`Found ${stocks.length} active stocks needing enrichment\n`);

  let factsUpdated = 0;
  let mcapUpdated = 0;
  let errors = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol, sector, market_cap } = stocks[i];
    const needsFacts = !sector;
    const needsMcap = market_cap == null;
    const tags: string[] = [];

    try {
      if (needsFacts) {
        const facts = await getCompanyFacts(symbol);
        if (facts) {
          const update: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (facts.name) update.name = facts.name;
          if (facts.sector || facts.sic_sector)
            update.sector = facts.sector || facts.sic_sector;
          if (facts.industry || facts.sic_industry)
            update.industry = facts.industry || facts.sic_industry;
          if (facts.exchange) update.exchange = facts.exchange;

          const { error: updateErr } = await db
            .from('stocks')
            .update(update)
            .eq('symbol', symbol);

          if (!updateErr) {
            factsUpdated++;
            tags.push(`sector=${update.sector ?? 'n/a'}`);
          } else {
            tags.push(`facts-err: ${updateErr.message}`);
          }
        } else {
          tags.push('no-facts');
        }
      }

      if (needsMcap) {
        const snapshot = await getFinancialMetricsSnapshot(symbol);
        if (snapshot?.market_cap) {
          const mcapRounded = Math.round(snapshot.market_cap);
          const { error: mcErr } = await db
            .from('stocks')
            .update({ market_cap: mcapRounded, updated_at: new Date().toISOString() })
            .eq('symbol', symbol);

          if (!mcErr) {
            mcapUpdated++;
            tags.push(`mcap=${(snapshot.market_cap / 1e9).toFixed(1)}B`);
          } else {
            tags.push(`mcap-err: ${mcErr.message}`);
          }
        } else {
          tags.push('no-mcap');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tags.push(`ERROR: ${msg}`);
      errors++;
    }

    console.log(
      `[${i + 1}/${stocks.length}] ${symbol} — ${tags.join(' | ') || 'skipped'}`,
    );

    await sleep(DELAY_MS);
  }

  console.log('\n=== Re-enrichment Complete ===');
  console.log(`Facts updated:   ${factsUpdated}`);
  console.log(`Market cap set:  ${mcapUpdated}`);
  console.log(`Errors:          ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
