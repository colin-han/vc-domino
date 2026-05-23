import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const PatchBody = z
  .object({
    trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    shares: z.number().positive().finite().optional(),
    unit_nav: z.number().positive().finite().optional(),
    fee: z.number().min(0).finite().optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .strict();

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let parsed;
  try { parsed = PatchBody.safeParse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getTransaction(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    q.updateTransaction(id, parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/oversell/i.test(msg))
      return NextResponse.json({ error: 'oversell' }, { status: 400 });
    throw e;
  }
  return NextResponse.json(q.getTransaction(id));
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getTransaction(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    q.deleteTransaction(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/oversell/i.test(msg))
      return NextResponse.json({ error: 'oversell' }, { status: 400 });
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}
