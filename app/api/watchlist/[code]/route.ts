import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: { code: string } }) {
  const code = ctx.params.code;
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }
  const q = createQueries(getDb());
  q.removeFromWatchlist(code);
  return new NextResponse(null, { status: 204 });
}
