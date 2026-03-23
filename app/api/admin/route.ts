import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { password } = (await req.json()) as { password?: string };

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD not configured' },
        { status: 500 },
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const db = getSupabaseServerClient();

    const [runsRes, pricesFreshnessRes, scoresRes, stockCountRes] = await Promise.all([
      db
        .from('pipeline_runs')
        .select('run_id, source, started_at, finished_at, status, steps, error_count')
        .order('started_at', { ascending: false })
        .limit(20),
      db
        .from('daily_prices')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
        .single(),
      db
        .from('sentinel_scores')
        .select('updated_at')
        .not('sentinel_score', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single(),
      db
        .from('stocks')
        .select('symbol', { count: 'exact', head: true })
        .eq('is_active', true),
    ]);

    return NextResponse.json({
      runs: runsRes.data ?? [],
      freshness: {
        latestPriceDate: pricesFreshnessRes.data?.date ?? null,
        latestScoreUpdate: scoresRes.data?.updated_at ?? null,
        activeStocks: stockCountRes.count ?? 0,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
