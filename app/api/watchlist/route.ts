import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/db';

const SINGLE_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function GET() {
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const db = getSupabaseServerClient();
  const body = await request.json();
  const { symbol, notes, target_price } = body as { symbol: string; notes?: string; target_price?: number };

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const { data, error } = await db
    .from('watchlist')
    .upsert({
      user_id: SINGLE_USER_ID,
      symbol: symbol.toUpperCase(),
      notes: notes ?? null,
      target_price: target_price ?? null,
      added_at: new Date().toISOString(),
    }, { onConflict: 'user_id,symbol' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const db = getSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const { error } = await db
    .from('watchlist')
    .delete()
    .eq('user_id', SINGLE_USER_ID)
    .eq('symbol', symbol.toUpperCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: symbol.toUpperCase() });
}
