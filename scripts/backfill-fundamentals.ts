import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import {
  getFinancialMetricsSnapshot,
  getIncomeStatements,
} from '../lib/financial-datasets';
import type { FDFinancialMetricsSnapshot, FDIncomeStatement } from '../lib/utils/types';

const DELAY_BETWEEN_SYMBOLS_MS = 150; // 1,000 req/min on Developer plan (2 concurrent requests per symbol)

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeGrowth(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (!current || !previous || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function buildFundamentalsRow(
  symbol: string,
  snapshot: FDFinancialMetricsSnapshot | null,
  quarterlyIncome: FDIncomeStatement[],
) {
  const sorted = quarterlyIncome
    .filter((s) => s.period === 'quarterly')
    .sort(
      (a, b) =>
        new Date(b.report_period).getTime() -
        new Date(a.report_period).getTime(),
    );

  const latest = sorted[0];
  const prevQuarter = sorted[1];
  const yearAgoQuarter = sorted.find((s) => {
    if (!latest) return false;
    const latestDate = new Date(latest.report_period);
    const candidateDate = new Date(s.report_period);
    const diffMs = latestDate.getTime() - candidateDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > 300 && diffDays < 420;
  });

  const revenueGrowthQoQ = computeGrowth(latest?.revenue, prevQuarter?.revenue);
  const earningsGrowthQoQ = computeGrowth(latest?.net_income, prevQuarter?.net_income);
  const revenueGrowthYoY = computeGrowth(latest?.revenue, yearAgoQuarter?.revenue);
  const earningsGrowthYoY = computeGrowth(latest?.net_income, yearAgoQuarter?.net_income);

  return {
    symbol,
    pe_ratio: snapshot?.price_to_earnings_ratio ?? null,
    forward_pe: null, // not directly available from snapshot
    peg_ratio: snapshot?.peg_ratio ?? null,
    ps_ratio: snapshot?.price_to_sales_ratio ?? null,
    pb_ratio: snapshot?.price_to_book_ratio ?? null,
    revenue_growth_yoy: snapshot?.revenue_growth ?? revenueGrowthYoY,
    earnings_growth_yoy: snapshot?.earnings_growth ?? earningsGrowthYoY,
    revenue_growth_qoq: revenueGrowthQoQ,
    earnings_growth_qoq: earningsGrowthQoQ,
    gross_margin: snapshot?.gross_margin ?? null,
    operating_margin: snapshot?.operating_margin ?? null,
    net_margin: snapshot?.net_margin ?? null,
    roe: snapshot?.return_on_equity ?? null,
    roa: snapshot?.return_on_assets ?? null,
    debt_to_equity: snapshot?.debt_to_equity ?? null,
    current_ratio: snapshot?.current_ratio ?? null,
    free_cash_flow: null, // would need separate cash flow fetch
    dividend_yield: null,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  console.log('=== Sentinel: Backfill Fundamentals ===\n');

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

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < stocks.length; i++) {
    const { symbol } = stocks[i];

    try {
      const [snapshot, incomeStatements] = await Promise.all([
        getFinancialMetricsSnapshot(symbol).catch(() => null),
        getIncomeStatements(symbol, { period: 'quarterly', limit: 8 }).catch(
          () => [],
        ),
      ]);

      if (!snapshot && incomeStatements.length === 0) {
        console.log(
          `[${i + 1}/${stocks.length}] ${symbol} — no fundamental data`,
        );
        continue;
      }

      const row = buildFundamentalsRow(symbol, snapshot, incomeStatements);

      // Also update market_cap in the stocks table
      if (snapshot?.market_cap) {
        await db
          .from('stocks')
          .update({ market_cap: Math.round(snapshot.market_cap) })
          .eq('symbol', symbol);
      }

      const { error: upsertError } = await db
        .from('fundamentals')
        .upsert(row, { onConflict: 'symbol' });

      if (upsertError) {
        console.log(
          `[${i + 1}/${stocks.length}] ${symbol} — upsert error: ${upsertError.message}`,
        );
        errors++;
      } else {
        inserted++;
        const pe = row.pe_ratio != null ? `PE=${row.pe_ratio.toFixed(1)}` : 'PE=n/a';
        const rev = row.revenue_growth_yoy != null
          ? `RevG=${(row.revenue_growth_yoy * 100).toFixed(1)}%`
          : 'RevG=n/a';
        console.log(
          `[${i + 1}/${stocks.length}] ${symbol} — ${pe} ${rev}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[${i + 1}/${stocks.length}] ${symbol} — ERROR: ${msg}`);
      errors++;
    }

    await sleep(DELAY_BETWEEN_SYMBOLS_MS);
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Total inserted: ${inserted}`);
  console.log(`Total errors:   ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
