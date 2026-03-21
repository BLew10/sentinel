import { NextResponse } from 'next/server';
import { runScreener } from '@/lib/screener';
import type { ScreenerFilters } from '@/lib/utils/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      filters = {} as ScreenerFilters,
      sort_field = 'sentinel_score',
      sort_direction = 'desc',
      limit = 50,
      offset = 0,
    } = body;

    const { results, total } = await runScreener({
      filters,
      sortField: sort_field,
      sortDirection: sort_direction,
      limit: Math.min(limit, 200),
      offset,
    });

    return NextResponse.json({ data: results, total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
