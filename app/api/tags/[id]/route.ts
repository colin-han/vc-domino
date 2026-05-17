import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { TAG_PALETTE, type TagColor } from '@/lib/domain/tag-palette';

export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(20).optional(),
  color: z.enum([...TAG_PALETTE] as [TagColor, ...TagColor[]]).optional(),
});

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let parsed;
  try {
    parsed = PatchBody.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getTag(id) === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    q.updateTag(id, parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    throw e;
  }
  return NextResponse.json(q.getTag(id));
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getTag(id) === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  q.deleteTag(id);
  return new NextResponse(null, { status: 204 });
}
