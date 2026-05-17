import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('@/lib/db/migrate');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return { getDb: () => db };
});

import { getDb } from '@/lib/db/client';
import { GET, POST } from '@/app/api/tags/route';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM fund_tags; DELETE FROM tags;');
});

function reqJson(body: unknown) {
  return new Request('http://x/api/tags', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('GET /api/tags', () => {
  it('空库返回空 items', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });
});

describe('POST /api/tags', () => {
  it('合法参数返回 201', async () => {
    const res = await POST(reqJson({ name: '核心', color: 'blue' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('核心');
    expect(body.color).toBe('blue');
    expect(body.id).toBeGreaterThan(0);
  });

  it('color 不在调色板返回 400', async () => {
    const res = await POST(reqJson({ name: 'a', color: 'rainbow' }));
    expect(res.status).toBe(400);
  });

  it('空 name 返回 400', async () => {
    const res = await POST(reqJson({ name: '', color: 'blue' }));
    expect(res.status).toBe(400);
  });

  it('重名返回 409', async () => {
    await POST(reqJson({ name: 'a', color: 'blue' }));
    const res = await POST(reqJson({ name: 'a', color: 'red' }));
    expect(res.status).toBe(409);
  });
});
