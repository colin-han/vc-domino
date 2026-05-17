import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('tag CRUD', () => {
  it('createTag 后能 getTag 找到，listTags 按 sort_order 返回', () => {
    const q = createQueries(freshDb());
    const a = q.createTag({ name: '核心仓', color: 'blue' });
    const b = q.createTag({ name: '高风险', color: 'red' });
    expect(a.name).toBe('核心仓');
    expect(a.color).toBe('blue');
    expect(q.getTag(a.id)?.name).toBe('核心仓');
    const all = q.listTags();
    expect(all.map((t) => t.name).sort()).toEqual(['核心仓', '高风险']);
    expect(all.find((t) => t.id === a.id)?.fund_count).toBe(0);
    expect(b.id).toBeGreaterThan(0);
  });

  it('重名 createTag 抛 UNIQUE 错误', () => {
    const q = createQueries(freshDb());
    q.createTag({ name: '核心仓', color: 'blue' });
    expect(() => q.createTag({ name: '核心仓', color: 'red' })).toThrow(/UNIQUE/i);
  });

  it('updateTag 仅更新提供的字段', () => {
    const q = createQueries(freshDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    q.updateTag(t.id, { color: 'red' });
    expect(q.getTag(t.id)?.color).toBe('red');
    expect(q.getTag(t.id)?.name).toBe('a');
    q.updateTag(t.id, { name: 'b' });
    expect(q.getTag(t.id)?.name).toBe('b');
    expect(q.getTag(t.id)?.color).toBe('red');
  });

  it('deleteTag 级联清空 fund_tags', () => {
    const q = createQueries(freshDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.addToWatchlist('110011');
    q.addFundTag('110011', t.id);
    expect(q.listTagsForFund('110011')).toHaveLength(1);
    q.deleteTag(t.id);
    expect(q.getTag(t.id)).toBeNull();
    expect(q.listTagsForFund('110011')).toHaveLength(0);
  });
});

describe('fund-tag 关联', () => {
  it('addFundTag / removeFundTag / listTagsForFund', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.addToWatchlist('110011');
    const t1 = q.createTag({ name: '核心', color: 'blue' });
    const t2 = q.createTag({ name: '高风险', color: 'red' });
    q.addFundTag('110011', t1.id);
    q.addFundTag('110011', t2.id);
    expect(q.listTagsForFund('110011').map((t) => t.name).sort()).toEqual(['核心', '高风险']);
    q.removeFundTag('110011', t1.id);
    expect(q.listTagsForFund('110011').map((t) => t.name)).toEqual(['高风险']);
  });

  it('重复 addFundTag 抛 UNIQUE 错误', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.addToWatchlist('110011');
    const t = q.createTag({ name: 'a', color: 'blue' });
    q.addFundTag('110011', t.id);
    expect(() => q.addFundTag('110011', t.id)).toThrow(/UNIQUE|PRIMARY/i);
  });

  it('listTags 的 fund_count 反映关联数', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.upsertMeta({ code: '110012', name: 'Y', type: null });
    q.addToWatchlist('110011');
    q.addToWatchlist('110012');
    const t = q.createTag({ name: 'a', color: 'blue' });
    q.addFundTag('110011', t.id);
    q.addFundTag('110012', t.id);
    const list = q.listTags();
    expect(list[0].fund_count).toBe(2);
  });
});
