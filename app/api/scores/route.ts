import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');
  const sort = searchParams.get('sort') ?? 'sentinel_score';
  const dir = searchParams.get('dir') === 'asc' ? true : false;
  const sector = searchParams.get('sector');
  const minScore = searchParams.get('min_score');

  const db = getSupabaseServerClient();

  let query = db
    .from('sentinel_scores')
    .select(`
      *,
      stocks!inner(name, sector, market_cap)
    `, { count: 'exact' })
    .not('sentinel_score', 'is', null);

  if (sector) {
    query = query.eq('stocks.sector', sector);
  }
  if (minScore) {
    query = query.gte('sentinel_score', parseInt(minScore));
  }

  const validSortFields = [
    'sentinel_score', 'technical_score', 'fundamental_score',
    'earnings_ai_score', 'insider_score', 'institutional_score',
    'rank', 'percentile',
  ];
  const sortField = validSortFields.includes(sort) ? sort : 'sentinel_score';

  const { data, count, error } = await query
    .order(sortField, { ascending: dir })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count });
}
