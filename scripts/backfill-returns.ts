import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';

async function main() {
  console.log('=== Sentinel: Backfill Signal Returns ===\n');

  const db = getSupabaseServerClient();

  const { data: snapshots, error } = await db
    .from('signal_snapshots')
    .select('id, symbol, snapshot_date, price_at_signal')
    .is('return_30d', null)
    .order('snapshot_date', { ascending: true });

  if (error || !snapshots) {
    console.error('Failed to fetch snapshots:', error?.message);
    process.exit(1);
  }

  console.log(`Found ${snapshots.length} snapshots missing return data\n`);
  if (snapshots.length === 0) return;

  const priceCache = new Map<string, Array<{ date: string; close: number; low: number }>>();

  async function getPrices(symbol: string) {
    if (priceCache.has(symbol)) return priceCache.get(symbol)!;

    const { data } = await db
      .from('daily_prices')
      .select('date, close, low')
      .eq('symbol', symbol)
      .order('date', { ascending: true });

    const rows = (data ?? []).map((p) => ({
      date: p.date as string,
      close: Number(p.close),
      low: Number(p.low),
    }));
    priceCache.set(symbol, rows);
    return rows;
  }

  const spyPrices = await getPrices('SPY');

  function findPriceAtOffset(prices: Array<{ date: string; close: number }>, signalDate: string, tradingDays: number): number | null {
    const idx = prices.findIndex((p) => p.date >= signalDate);
    if (idx < 0) return null;
    const targetIdx = idx + tradingDays;
    if (targetIdx >= prices.length) return null;
    return prices[targetIdx].close;
  }

  function computeReturn(entryPrice: number, exitPrice: number | null): number | null {
    if (exitPrice == null || entryPrice <= 0) return null;
    return (exitPrice - entryPrice) / entryPrice;
  }

  function computeMaxDrawdown(prices: Array<{ date: string; close: number; low: number }>, signalDate: string, tradingDays: number): number | null {
    const idx = prices.findIndex((p) => p.date >= signalDate);
    if (idx < 0) return null;

    const entryPrice = prices[idx].close;
    const endIdx = Math.min(idx + tradingDays, prices.length - 1);
    if (endIdx <= idx) return null;

    let maxDD = 0;
    for (let i = idx; i <= endIdx; i++) {
      const dd = (prices[i].low - entryPrice) / entryPrice;
      if (dd < maxDD) maxDD = dd;
    }
    return maxDD;
  }

  const OFFSETS = [
    { field: '1d', days: 1 },
    { field: '3d', days: 3 },
    { field: '7d', days: 5 },
    { field: '14d', days: 10 },
    { field: '30d', days: 21 },
    { field: '60d', days: 42 },
    { field: '90d', days: 63 },
  ];

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const prices = await getPrices(snap.symbol as string);
    const entryPrice = Number(snap.price_at_signal);
    const signalDate = snap.snapshot_date as string;

    if (prices.length < 10 || entryPrice <= 0) {
      skipped++;
      continue;
    }

    const update: Record<string, number | null> = {};
    let hasAnyReturn = false;

    const ALPHA_FIELDS = new Set(['1d', '7d', '14d', '30d', '60d', '90d']);

    for (const { field, days } of OFFSETS) {
      const futurePrice = findPriceAtOffset(prices, signalDate, days);
      const spyFuture = findPriceAtOffset(spyPrices, signalDate, days);
      const spyEntry = findPriceAtOffset(spyPrices, signalDate, 0);

      update[`price_${field}`] = futurePrice;
      update[`return_${field}`] = computeReturn(entryPrice, futurePrice);
      update[`spy_return_${field}`] = spyEntry != null ? computeReturn(spyEntry, spyFuture) : null;

      if (ALPHA_FIELDS.has(field)) {
        const stockReturn = update[`return_${field}`];
        const spyReturn = update[`spy_return_${field}`];
        update[`alpha_${field}`] = stockReturn != null && spyReturn != null
          ? stockReturn - spyReturn
          : null;
      }

      if (update[`return_${field}`] != null) hasAnyReturn = true;
    }

    update.max_drawdown_30d = computeMaxDrawdown(prices, signalDate, 21);
    update.max_drawdown_90d = computeMaxDrawdown(prices, signalDate, 63);

    if (!hasAnyReturn) {
      skipped++;
      continue;
    }

    const { error: updateError } = await db.from('signal_snapshots').update(update).eq('id', snap.id);
    if (updateError) {
      if (i === 0) console.error(`  Update error: ${updateError.message}`);
      skipped++;
      continue;
    }
    updated++;

    if ((i + 1) % 50 === 0) console.log(`  [${i + 1}/${snapshots.length}] ${updated} updated, ${skipped} skipped`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped} (no price data or too recent)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
