import { getSupabaseServerClient } from '@/lib/db';
import { WatchlistClient } from './WatchlistClient';

export const dynamic = 'force-dynamic';

const SINGLE_USER_ID = '00000000-0000-0000-0000-000000000001';

async function getWatchlist() {
  const db = getSupabaseServerClient();

  const { data, error } = await db
    .from('watchlist')
    .select(`
      id, symbol, added_at, notes, target_price,
      stocks!inner(name, sector, market_cap),
      sentinel_scores(sentinel_score, technical_score, fundamental_score, rank, score_change_1d)
    `)
    .eq('user_id', SINGLE_USER_ID)
    .order('added_at', { ascending: false });

  if (error) {
    console.error('Watchlist error:', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
    const score = row.sentinel_scores as unknown as {
      sentinel_score: number | null;
      technical_score: number | null;
      fundamental_score: number | null;
      rank: number | null;
      score_change_1d: number | null;
    } | null;

    return {
      id: row.id as number,
      symbol: row.symbol as string,
      name: stock.name,
      sector: stock.sector,
      market_cap: stock.market_cap,
      notes: row.notes as string | null,
      target_price: row.target_price ? Number(row.target_price) : null,
      added_at: row.added_at as string,
      sentinel_score: score?.sentinel_score ?? null,
      technical_score: score?.technical_score ?? null,
      fundamental_score: score?.fundamental_score ?? null,
      rank: score?.rank ?? null,
      score_change_1d: score?.score_change_1d ?? null,
    };
  });
}

export default async function WatchlistPage() {
  const items = await getWatchlist();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Watchlist</h1>
        <p className="text-text-secondary text-sm mt-1">
          Track stocks you're interested in
        </p>
      </div>
      <WatchlistClient initialItems={items} />
    </div>
  );
}
