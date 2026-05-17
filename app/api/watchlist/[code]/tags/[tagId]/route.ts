import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: { code: string; tagId: string } }) {
  const { code, tagId } = ctx.params;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const id = Number(tagId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const q = createQueries(getDb());
  q.removeFundTag(code, id);
  return new NextResponse(null, { status: 204 });
}
