import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchQuote, fetchHistory } from '@/lib/source/eastmoney';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const Body = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function GET() {
  const q = createQueries(getDb());
  return NextResponse.json({ items: q.listWatchlist() });
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  const { code } = parsed.data;
  const quote = await fetchQuote(code);
  if (!quote.ok) {
    if (quote.reason === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 400 });
    return NextResponse.json({ error: 'upstream' }, { status: 502 });
  }

  const q = createQueries(getDb());
  q.upsertMeta({ code, name: quote.data.name, type: null });
  try {
    q.addToWatchlist(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE|PRIMARY/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    throw e;
  }

  void fetchHistory(code, 120).then((r) => {
    if (r.ok) {
      try {
        q.upsertNavRows(code, r.data);
      } catch (e) {
        log.error('history_persist', { code, err: String(e) });
      }
    } else {
      log.warn('history_fetch_failed', { code, reason: r.reason });
    }
  });

  return NextResponse.json({ code, name: quote.data.name }, { status: 201 });
}
