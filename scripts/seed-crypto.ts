import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { getCryptoList } from '../lib/crypto-api';

async function main() {
  console.log('=== Sentinel: Seed Crypto Universe ===\n');

  const db = getSupabaseServerClient();

  console.log('Fetching top 100 crypto assets from CoinGecko...');
  const cryptoAssets = await getCryptoList(100);
  console.log(`Fetched ${cryptoAssets.length} assets\n`);

  const rows = cryptoAssets.map((asset) => ({
    symbol: asset.symbol,
    name: asset.name,
    coingecko_id: asset.coingecko_id,
    category: asset.category,
    market_cap_rank: asset.market_cap_rank,
    is_active: true,
  }));

  const { error, count } = await db
    .from('crypto_assets')
    .upsert(rows, { onConflict: 'symbol' });

  if (error) {
    console.error('Insert error:', error.message);
    process.exit(1);
  }

  console.log(`Inserted/updated ${count ?? rows.length} crypto assets`);
  console.log('\n=== Seed Complete ===');

  rows.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.symbol.padEnd(8)} ${r.name}`);
  });
  if (rows.length > 10) {
    console.log(`  ... and ${rows.length - 10} more`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
