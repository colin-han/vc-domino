import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({
  code: z.string().regex(/^\d{6}$/),
  trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  side: z.enum(['BUY', 'SELL']),
  shares: z.number().positive().finite(),
  unit_nav: z.number().positive().finite(),
  fee: z.number().min(0).finite().default(0),
  note: z.string().max(200).nullable().optional(),
});

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const q = createQueries(getDb());
  if (q.getPortfolio(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? undefined;
  return NextResponse.json({ items: q.listTransactions(id, code) });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let parsed;
  try { parsed = Body.safeParse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getPortfolio(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (q.getMeta(parsed.data.code) === null)
    return NextResponse.json({ error: 'fund_not_found' }, { status: 404 });

  try {
    const txId = q.insertTransaction({
      portfolio_id: id,
      code: parsed.data.code,
      trade_date: parsed.data.trade_date,
      side: parsed.data.side,
      shares: parsed.data.shares,
      unit_nav: parsed.data.unit_nav,
      fee: parsed.data.fee,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json(q.getTransaction(txId), { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/oversell/i.test(msg))
      return NextResponse.json({ error: 'oversell' }, { status: 400 });
    throw e;
  }
}
