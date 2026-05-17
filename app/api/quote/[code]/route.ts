import { NextResponse } from 'next/server';
import { fetchQuote } from '@/lib/source/eastmoney';
import { quoteCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const code = ctx.params.code;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const r = await quoteCache.get(code, () => fetchQuote(code).then((x) => {
    if (!x.ok) throw new Error(x.reason);
    return x.data;
  }))
    .then((data) => ({ ok: true as const, data }))
    .catch((e: Error) => ({ ok: false as const, reason: e.message }));
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 502 });
  return NextResponse.json(r.data);
}
