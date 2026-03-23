import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getSupabaseServerClient();
    const { data, error } = await db
      .from('pipeline_runs')
      .select('started_at, finished_at, status, error_count')
      .order('started_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return NextResponse.json({ lastRun: null });
    }

    const row = data[0];
    return NextResponse.json({
      lastRun: {
        started_at: row.started_at as string,
        finished_at: row.finished_at as string | null,
        status: row.status as string,
        error_count: row.error_count as number,
      },
    });
  } catch {
    return NextResponse.json({ lastRun: null });
  }
}
