import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({
  buy_fee_rate: z.number().min(0).max(1).nullable().optional(),
  sell_fee_rate: z.number().min(0).max(1).nullable().optional(),
});

function parseCode(raw: string): string | null {
  return /^\d{6}$/.test(raw) ? raw : null;
}

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const code = parseCode(ctx.params.code);
  if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const q = createQueries(getDb());
  const c = q.getFeeConfig(code);
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(c);
}

export async function PUT(req: Request, ctx: { params: { code: string } }) {
  const code = parseCode(ctx.params.code);
  if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  let parsed;
  try { parsed = Body.safeParse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getMeta(code) === null)
    return NextResponse.json({ error: 'fund_not_found' }, { status: 404 });

  q.upsertFeeConfig(code, parsed.data);
  return NextResponse.json(q.getFeeConfig(code));
}
