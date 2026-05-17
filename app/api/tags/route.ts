import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { TAG_PALETTE, type TagColor } from '@/lib/domain/tag-palette';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(20),
  color: z.enum([...TAG_PALETTE] as [TagColor, ...TagColor[]]),
});

export async function GET() {
  const q = createQueries(getDb());
  return NextResponse.json({ items: q.listTags() });
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
    const tag = q.createTag(parsed.data);
    return NextResponse.json(tag, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    throw e;
  }
}
