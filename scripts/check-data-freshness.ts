import 'dotenv/config';
import { getStockPrices } from '../lib/financial-datasets';
import { format, subDays } from 'date-fns';

async function main() {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const weekAgo = format(subDays(now, 7), 'yyyy-MM-dd');

  console.log(`Checking Financial Datasets price freshness...`);
  console.log(`Local time: ${now.toLocaleString()}\n`);

  const tickers = ['AAPL', 'MSFT', 'NVDA'];

  for (const ticker of tickers) {
    try {
      const prices = await getStockPrices(ticker, weekAgo, today);
      const dates = prices.map((p) => p.time.split('T')[0]).sort();
      const latest = dates[dates.length - 1] ?? 'none';
      console.log(`${ticker}: latest=${latest}  (${dates.length} days: ${dates.join(', ')})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${ticker}: ERROR — ${msg}`);
    }
  }
}

main().catch(console.error);
