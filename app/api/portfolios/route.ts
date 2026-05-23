import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { aggregateAcrossFunds, computeFundSummary } from '@/lib/domain/holdings';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  is_simulated: z.boolean().default(false),
});

export async function GET() {
  const q = createQueries(getDb());
  const portfolios = q.listPortfolios();
  const items = portfolios.map((p) => {
    const txs = q.listTransactions(p.id);
    const byCode = new Map<string, Array<(typeof txs)[number]>>();
    for (const t of txs) {
      const arr = byCode.get(t.code) ?? [];
      arr.push(t);
      byCode.set(t.code, arr);
    }
    const summaries = [...byCode.entries()].map(([code, list]) => {
      const latest = q.latestNav(code);
      return computeFundSummary(list, latest?.unit_nav ?? null);
    });
    return { ...p, summary: aggregateAcrossFunds(summaries) };
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  try {
    const p = q.createPortfolio(parsed.data);
    return NextResponse.json(p, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    throw e;
  }
}
