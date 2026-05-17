import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { ensureHistory } from '@/lib/server/ensure-history';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: { code: string } }) {
  const code = ctx.params.code;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const url = new URL(req.url);
  const range = Math.min(Math.max(parseInt(url.searchParams.get('range') ?? '90', 10) || 90, 7), 365);

  const q = createQueries(getDb());
  await ensureHistory(q, code, range);

  const meta = q.getMeta(code);
  const rows = q.listNav(code, range);
  return NextResponse.json({ meta, rows });
}
