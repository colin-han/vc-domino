import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchHistory } from '@/lib/source/eastmoney';
import { previousTradingDay } from '@/lib/domain/trading-day';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: { code: string } }) {
  const code = ctx.params.code;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const url = new URL(req.url);
  const range = Math.min(Math.max(parseInt(url.searchParams.get('range') ?? '90', 10) || 90, 7), 365);

  const q = createQueries(getDb());
  const latest = q.latestNav(code);
  const need = previousTradingDay(new Date());
  if (!latest || latest.nav_date < need) {
    const r = await fetchHistory(code, range + 30);
    if (r.ok) {
      try { q.upsertNavRows(code, r.data); } catch (e) { log.error('history_persist', { code, err: String(e) }); }
    } else {
      log.warn('history_fetch_failed', { code, reason: r.reason });
    }
  }

  const meta = q.getMeta(code);
  const rows = q.listNav(code, range);
  return NextResponse.json({ meta, rows });
}
