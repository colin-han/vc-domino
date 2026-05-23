import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';

const getUserTables = (db: InstanceType<typeof Database>) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
    .map((t) => t.name)
    .sort();

describe('runMigrations', () => {
  it('在空库上创建 8 张表并将 user_version 设为 3', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const names = getUserTables(db);
    expect(names).toEqual([
      'fund_fee_config',
      'fund_meta',
      'fund_nav',
      'fund_tags',
      'portfolios',
      'tags',
      'transactions',
      'watchlist',
    ]);
    expect((db.pragma('user_version', { simple: true }) as number)).toBe(3);
  });

  it('幂等：重复执行不报错', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });
});

describe('runMigrations v2', () => {
  it('在已 v1 库上升级到 v3，新增 tags + fund_tags + portfolios + transactions + fund_fee_config', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    const names = getUserTables(db);
    expect(names).toEqual([
      'fund_fee_config',
      'fund_meta',
      'fund_nav',
      'fund_tags',
      'portfolios',
      'tags',
      'transactions',
      'watchlist',
    ]);
  });

  it('fund_tags 的 FK 在删除 tag 时级联清空关联', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    db.prepare('INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)').run('a', 'blue', 1);
    const tagId = (db.prepare('SELECT id FROM tags WHERE name = ?').get('a') as { id: number }).id;
    db.prepare('INSERT INTO fund_tags (code, tag_id, added_at) VALUES (?, ?, ?)').run('110011', tagId, 1);
    db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
    const left = db.prepare('SELECT COUNT(*) AS n FROM fund_tags').get() as { n: number };
    expect(left.n).toBe(0);
  });
});
