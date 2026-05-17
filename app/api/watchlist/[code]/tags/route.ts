import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({ tag_id: z.number().int().positive() });

export async function POST(req: Request, ctx: { params: { code: string } }) {
  const { code } = ctx.params;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  const fund = q.listWatchlist().find((w) => w.code === code);
  if (!fund) return NextResponse.json({ error: 'fund_not_found' }, { status: 404 });
  if (q.getTag(parsed.data.tag_id) === null) {
    return NextResponse.json({ error: 'tag_not_found' }, { status: 404 });
  }

  try {
    q.addFundTag(code, parsed.data.tag_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE|PRIMARY/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ code, tag_id: parsed.data.tag_id }, { status: 201 });
}
