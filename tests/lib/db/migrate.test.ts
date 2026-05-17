import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';

describe('runMigrations', () => {
  it('在空库上创建三张表并将 user_version 设为 1', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(['fund_meta', 'fund_nav', 'watchlist']);
    expect((db.pragma('user_version', { simple: true }) as number)).toBe(1);
  });

  it('幂等：重复执行不报错', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });
});
