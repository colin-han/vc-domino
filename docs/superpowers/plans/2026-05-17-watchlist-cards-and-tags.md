# 看板卡片化 + 标签系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把看板从表格改为卡片网格，每张卡含 mini-chart；新增 tag 系统（多对多 + 9 色调色板 + combobox 选择器 + tag 过滤栏 + 全局周期切换）。

**Architecture:** 看板 RSC 一次性查询所有数据；周期/tag 过滤通过 URL query 参数 + `<Link>` 触发服务端重渲染。tag CRUD 通过新 API 端点。Schema 通过 migration v2 推进。

**Tech Stack:** Next.js 14 App Router · better-sqlite3 · zod · Recharts (mini-chart) · Tailwind

**Spec:** `docs/superpowers/specs/2026-05-17-watchlist-cards-and-tags-design.md`

---

## 文件结构与职责

| 路径 | 职责 |
|------|------|
| `lib/db/migrate.ts` | **修改**：MIGRATIONS 数组追加第 2 项（创建 tags / fund_tags） |
| `lib/db/queries.ts` | **修改**：新增 tag 相关方法 + listWatchlistWithTags + listNavSeriesForCodes + countNav 复用 |
| `lib/domain/tag-palette.ts` | **新建**：调色板常量 + isValidColor + key→Tailwind class 映射 |
| `lib/domain/period-return.ts` | **新建**：周期总涨跌% 纯函数 |
| `lib/server/ensure-history.ts` | **新建**：抽公共回填 helper（详情页与看板共用） |
| `app/page.tsx` | **重写**：RSC，使用 query 解析 + 批量数据 + 渲染卡片网格 |
| `app/api/tags/route.ts` | **新建**：GET / POST |
| `app/api/tags/[id]/route.ts` | **新建**：PATCH / DELETE |
| `app/api/watchlist/[code]/tags/route.ts` | **新建**：POST |
| `app/api/watchlist/[code]/tags/[tagId]/route.ts` | **新建**：DELETE |
| `components/range-selector.tsx` | **新建**：1W/1M/3M/6M/1Y 切换 |
| `components/tag-filter-bar.tsx` | **新建**：顶部 tag 过滤栏 |
| `components/tag-chip.tsx` | **新建**：彩色 pill |
| `components/tag-picker.tsx` | **新建**：combobox + 颜色选择器 |
| `components/mini-chart.tsx` | **新建**：sparkline |
| `components/fund-card.tsx` | **新建**：单卡片 |
| `components/fund-grid.tsx` | **新建**：响应式 grid 布局 |
| `components/watchlist-table.tsx` | **删除** |
| `app/funds/[code]/page.tsx` | **修改**：复用 `ensure-history` helper |
| `app/api/funds/[code]/route.ts` | **修改**：复用 `ensure-history` helper |

---

## Task 1: tag-palette 常量与 Tailwind class 映射

**Files:**
- Create: `lib/domain/tag-palette.ts` `tests/lib/domain/tag-palette.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/lib/domain/tag-palette.test.ts
import { describe, it, expect } from 'vitest';
import { TAG_PALETTE, isValidColor, tagClasses } from '@/lib/domain/tag-palette';

describe('TAG_PALETTE', () => {
  it('包含 9 个 key，全部小写无空格', () => {
    expect(TAG_PALETTE).toHaveLength(9);
    for (const c of TAG_PALETTE) expect(c).toMatch(/^[a-z]+$/);
  });
});

describe('isValidColor', () => {
  it('调色板内的 key 返回 true', () => {
    expect(isValidColor('blue')).toBe(true);
    expect(isValidColor('zinc')).toBe(true);
  });
  it('调色板外的字符串返回 false', () => {
    expect(isValidColor('rainbow')).toBe(false);
    expect(isValidColor('')).toBe(false);
    expect(isValidColor('BLUE')).toBe(false);
  });
});

describe('tagClasses', () => {
  it('返回 bg/text/border 三段 Tailwind class', () => {
    const c = tagClasses('blue');
    expect(c).toMatch(/bg-blue-100/);
    expect(c).toMatch(/text-blue-700/);
    expect(c).toMatch(/border-blue-300/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test tag-palette`
Expected: FAIL (module not found)

- [ ] **Step 3: 实现**

```ts
// lib/domain/tag-palette.ts
export const TAG_PALETTE = [
  'zinc', 'red', 'orange', 'amber',
  'green', 'teal', 'blue', 'violet', 'pink',
] as const;

export type TagColor = (typeof TAG_PALETTE)[number];

const PALETTE_SET: ReadonlySet<string> = new Set(TAG_PALETTE);

export function isValidColor(v: unknown): v is TagColor {
  return typeof v === 'string' && PALETTE_SET.has(v);
}

// 注意：必须把所有 class 字面量明文写出，否则 Tailwind JIT 扫描不到
const CLASS_MAP: Record<TagColor, string> = {
  zinc:   'bg-zinc-100 text-zinc-700 border-zinc-300',
  red:    'bg-red-100 text-red-700 border-red-300',
  orange: 'bg-orange-100 text-orange-700 border-orange-300',
  amber:  'bg-amber-100 text-amber-700 border-amber-300',
  green:  'bg-green-100 text-green-700 border-green-300',
  teal:   'bg-teal-100 text-teal-700 border-teal-300',
  blue:   'bg-blue-100 text-blue-700 border-blue-300',
  violet: 'bg-violet-100 text-violet-700 border-violet-300',
  pink:   'bg-pink-100 text-pink-700 border-pink-300',
};

export function tagClasses(color: TagColor): string {
  return CLASS_MAP[color];
}
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test tag-palette`
Expected: 3 PASS

- [ ] **Step 5: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(domain): tag 调色板常量 + Tailwind class 映射"
```

---

## Task 2: Migration v2 — tags / fund_tags 表

**Files:**
- Modify: `lib/db/migrate.ts`
- Modify: `tests/lib/db/migrate.test.ts` (追加 v1→v2 用例)

- [ ] **Step 1: 写测试**（追加到现有 migrate.test.ts 末尾）

打开 `tests/lib/db/migrate.test.ts`，在文件末尾的最后一个 `})` 之前追加：

```ts
describe('runMigrations v2', () => {
  it('在已 v1 库上升级到 v2，新增 tags + fund_tags', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    // 模拟 v1 之前状态：保留 v1 应用结果
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(['fund_meta', 'fund_nav', 'fund_tags', 'tags', 'watchlist']);
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
```

注意：原文件首两个 case 仍预期 `user_version=1`。**必须**修改它们：

```ts
// 原 case：在空库上创建三张表并将 user_version 设为 1
// 改为：在空库上创建全部 5 张表并将 user_version 设为 2
it('在空库上创建 5 张表并将 user_version 设为 2', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const names = tables.map((t) => t.name).sort();
  expect(names).toEqual(['fund_meta', 'fund_nav', 'fund_tags', 'tags', 'watchlist']);
  expect((db.pragma('user_version', { simple: true }) as number)).toBe(2);
});
```

第二个 case "幂等" 保持。

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test migrate`
Expected: FAIL（v2 期望未满足）

- [ ] **Step 3: 修改 `lib/db/migrate.ts`，给 MIGRATIONS 数组追加第二项**

把现有 `MIGRATIONS` 变量改为：

```ts
const MIGRATIONS: Array<(db: Database) => void> = [
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code        TEXT PRIMARY KEY,
        added_at    INTEGER NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS fund_meta (
        code            TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        type            TEXT,
        meta_updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fund_nav (
        code      TEXT NOT NULL,
        nav_date  TEXT NOT NULL,
        unit_nav  REAL NOT NULL,
        acc_nav   REAL,
        daily_pct REAL,
        PRIMARY KEY (code, nav_date)
      );
      CREATE INDEX IF NOT EXISTS idx_fund_nav_code_date ON fund_nav(code, nav_date DESC);
    `);
  },
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        color       TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fund_tags (
        code     TEXT NOT NULL,
        tag_id   INTEGER NOT NULL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (code, tag_id),
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fund_tags_tag ON fund_tags(tag_id);
    `);
  },
];
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test migrate`
Expected: 4 PASS（原 2 个 + 新 2 个，且 v1 case 已改为 v2）

- [ ] **Step 5: 应用到本地 DB**

Run: `volta run yarn db:migrate`
Expected: 输出 `migrations applied, user_version = 2`，且本地 `data/funds.db` 新增 tags / fund_tags 表（用 sqlite3 命令行可校验 `.tables`，非必须）

- [ ] **Step 6: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): migration v2 — tags + fund_tags 表"
```

---

## Task 3: queries.ts — tag CRUD

**Files:**
- Modify: `lib/db/queries.ts` (追加 tag 类型与 CRUD 方法)
- Create: `tests/lib/db/queries-tags.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/lib/db/queries-tags.test.ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test queries-tags`
Expected: FAIL

- [ ] **Step 3: 修改 `lib/db/queries.ts`**

在文件顶部 import 区追加：

```ts
import type { TagColor } from '@/lib/domain/tag-palette';
```

在现有 `export interface NavInput { ... }` 之后追加类型：

```ts
export interface TagRow {
  id: number;
  name: string;
  color: TagColor;
  sort_order: number;
}
export interface TagWithCount extends TagRow {
  fund_count: number;
}
```

在 `createQueries` 函数内（已有 statements 段之后、`return { ... }` 之前），追加 statements：

```ts
const insertTagStmt = db.prepare(
  `INSERT INTO tags (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)`,
);
const getTagStmt = db.prepare(
  `SELECT id, name, color, sort_order FROM tags WHERE id = ?`,
);
const listTagsStmt = db.prepare(`
  SELECT t.id, t.name, t.color, t.sort_order,
         COALESCE(f.cnt, 0) AS fund_count
  FROM tags t
  LEFT JOIN (
    SELECT tag_id, COUNT(*) AS cnt FROM fund_tags GROUP BY tag_id
  ) f ON f.tag_id = t.id
  ORDER BY t.sort_order ASC, t.name ASC
`);
const updateTagNameStmt = db.prepare(`UPDATE tags SET name = ? WHERE id = ?`);
const updateTagColorStmt = db.prepare(`UPDATE tags SET color = ? WHERE id = ?`);
const deleteTagStmt = db.prepare(`DELETE FROM tags WHERE id = ?`);

const insertFundTagStmt = db.prepare(
  `INSERT INTO fund_tags (code, tag_id, added_at) VALUES (?, ?, ?)`,
);
const deleteFundTagStmt = db.prepare(
  `DELETE FROM fund_tags WHERE code = ? AND tag_id = ?`,
);
const listTagsForFundStmt = db.prepare(`
  SELECT t.id, t.name, t.color, t.sort_order
  FROM tags t
  JOIN fund_tags ft ON ft.tag_id = t.id
  WHERE ft.code = ?
  ORDER BY t.sort_order ASC, t.name ASC
`);
const countTagsStmt = db.prepare(`SELECT COUNT(*) AS n FROM tags`);
```

在 `return { ... }` 内追加方法（按字母顺序放在 `getMeta` 后）：

```ts
listTags(): TagWithCount[] {
  return listTagsStmt.all() as TagWithCount[];
},
getTag(id: number): TagRow | null {
  return (getTagStmt.get(id) as TagRow | undefined) ?? null;
},
createTag(input: { name: string; color: TagColor }): TagRow {
  const { n } = countTagsStmt.get() as { n: number };
  const result = insertTagStmt.run(input.name, input.color, n, Date.now());
  const id = Number(result.lastInsertRowid);
  return { id, name: input.name, color: input.color, sort_order: n };
},
updateTag(id: number, patch: { name?: string; color?: TagColor }): void {
  if (patch.name !== undefined) updateTagNameStmt.run(patch.name, id);
  if (patch.color !== undefined) updateTagColorStmt.run(patch.color, id);
},
deleteTag(id: number): void {
  deleteTagStmt.run(id);
},
addFundTag(code: string, tagId: number): void {
  insertFundTagStmt.run(code, tagId, Date.now());
},
removeFundTag(code: string, tagId: number): void {
  deleteFundTagStmt.run(code, tagId);
},
listTagsForFund(code: string): TagRow[] {
  return listTagsForFundStmt.all(code) as TagRow[];
},
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test queries-tags`
Expected: 7 PASS

- [ ] **Step 5: 全量测试 + lint + typecheck**

Run: `volta run yarn test && volta run yarn lint && volta run yarn typecheck`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): tag + fund-tag 查询封装"
```

---

## Task 4: queries.ts — listWatchlistWithTags / listNavSeriesForCodes

**Files:**
- Modify: `lib/db/queries.ts`
- Create: `tests/lib/db/queries-batch.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/lib/db/queries-batch.test.ts
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

describe('listWatchlistWithTags', () => {
  it('返回每只基金及其 tags 数组', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.upsertMeta({ code: '110012', name: 'Y', type: null });
    q.addToWatchlist('110011');
    q.addToWatchlist('110012');
    const t1 = q.createTag({ name: '核心', color: 'blue' });
    const t2 = q.createTag({ name: '高风险', color: 'red' });
    q.addFundTag('110011', t1.id);
    q.addFundTag('110011', t2.id);
    const items = q.listWatchlistWithTags();
    expect(items.map((i) => i.code).sort()).toEqual(['110011', '110012']);
    const x = items.find((i) => i.code === '110011');
    expect(x?.tags.map((t) => t.name).sort()).toEqual(['核心', '高风险']);
    const y = items.find((i) => i.code === '110012');
    expect(y?.tags).toEqual([]);
  });

  it('无 watchlist 时返回空数组', () => {
    const q = createQueries(freshDb());
    expect(q.listWatchlistWithTags()).toEqual([]);
  });
});

describe('listNavSeriesForCodes', () => {
  it('按 code 分组返回最近 N 行升序 nav', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    q.upsertMeta({ code: '110012', name: 'Y', type: null });
    q.upsertNavRows('110011', [
      { navDate: '2026-05-13', unitNav: 1.0, accNav: null, dailyPct: null },
      { navDate: '2026-05-14', unitNav: 1.1, accNav: null, dailyPct: null },
      { navDate: '2026-05-15', unitNav: 1.2, accNav: null, dailyPct: null },
    ]);
    q.upsertNavRows('110012', [
      { navDate: '2026-05-15', unitNav: 2.0, accNav: null, dailyPct: null },
    ]);
    const map = q.listNavSeriesForCodes(['110011', '110012'], 2);
    expect(map.get('110011')?.map((r) => r.nav_date)).toEqual(['2026-05-14', '2026-05-15']);
    expect(map.get('110012')?.map((r) => r.nav_date)).toEqual(['2026-05-15']);
  });

  it('空数组返回空 Map', () => {
    const q = createQueries(freshDb());
    const map = q.listNavSeriesForCodes([], 30);
    expect(map.size).toBe(0);
  });
});

describe('countNav 已存在', () => {
  it('countNav 返回行数', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'X', type: null });
    expect(q.countNav('110011')).toBe(0);
    q.upsertNavRows('110011', [
      { navDate: '2026-05-13', unitNav: 1, accNav: null, dailyPct: null },
      { navDate: '2026-05-14', unitNav: 1, accNav: null, dailyPct: null },
    ]);
    expect(q.countNav('110011')).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test queries-batch`
Expected: FAIL (listWatchlistWithTags / listNavSeriesForCodes 未定义)

- [ ] **Step 3: 修改 `lib/db/queries.ts`**

在 statements 区追加：

```ts
const listWatchWithTagsStmt = db.prepare(`
  SELECT w.code, m.name, m.type, w.added_at, w.sort_order
  FROM watchlist w
  JOIN fund_meta m USING (code)
  ORDER BY w.sort_order ASC, w.added_at ASC
`);
```

在 return 对象内追加方法：

```ts
listWatchlistWithTags(): Array<WatchlistItem & { tags: TagRow[] }> {
  const items = listWatchWithTagsStmt.all() as WatchlistItem[];
  return items.map((it) => ({ ...it, tags: this.listTagsForFund(it.code) }));
},
listNavSeriesForCodes(codes: string[], range: number): Map<string, NavRow[]> {
  const result = new Map<string, NavRow[]>();
  for (const code of codes) {
    result.set(code, listNavStmt.all(code, range) as NavRow[]);
  }
  return result;
},
```

注意：`listWatchlistWithTags` 使用 `this.listTagsForFund` 调用对象上的同辈方法。这要求返回对象用 `function` 风格的方法 — `:` shorthand 已可以，因为方法语法在对象字面量里 `this` 绑定到对象本身。如发现 `this` 为 undefined，把 `listWatchlistWithTags` 改写为闭包形式：先把 `listTagsForFund` 提取到 createQueries 函数作用域的 const，然后两边都用同一个 const。

实际更可靠的写法 — 把 `listTagsForFund` 改为顶层函数：

在 createQueries 内 statements 区之后、return 之前先定义：

```ts
function listTagsForFundImpl(code: string): TagRow[] {
  return listTagsForFundStmt.all(code) as TagRow[];
}
```

然后 return 对象里：

```ts
listTagsForFund(code: string): TagRow[] {
  return listTagsForFundImpl(code);
},
listWatchlistWithTags(): Array<WatchlistItem & { tags: TagRow[] }> {
  const items = listWatchWithTagsStmt.all() as WatchlistItem[];
  return items.map((it) => ({ ...it, tags: listTagsForFundImpl(it.code) }));
},
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test queries-batch`
Expected: 5 PASS

- [ ] **Step 5: 全量测试 + lint + typecheck**

Run: `volta run yarn test && volta run yarn lint && volta run yarn typecheck`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): 看板批量查询 listWatchlistWithTags + listNavSeriesForCodes"
```

---

## Task 5: period-return 纯函数

**Files:**
- Create: `lib/domain/period-return.ts` `tests/lib/domain/period-return.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/lib/domain/period-return.test.ts
import { describe, it, expect } from 'vitest';
import { periodReturn } from '@/lib/domain/period-return';

describe('periodReturn', () => {
  it('计算首尾涨跌百分比', () => {
    const rows = [
      { nav_date: '2026-04-15', unit_nav: 1.0 },
      { nav_date: '2026-05-15', unit_nav: 1.1 },
    ];
    expect(periodReturn(rows)).toBeCloseTo(10, 4);
  });

  it('单行返回 0', () => {
    expect(periodReturn([{ nav_date: '2026-05-15', unit_nav: 1 }])).toBe(0);
  });

  it('空数组返回 null', () => {
    expect(periodReturn([])).toBeNull();
  });

  it('首值为 0 返回 null', () => {
    expect(periodReturn([
      { nav_date: '2026-04-15', unit_nav: 0 },
      { nav_date: '2026-05-15', unit_nav: 1 },
    ])).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test period-return`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// lib/domain/period-return.ts
interface NavLike { nav_date: string; unit_nav: number }

// rows 必须按 nav_date 升序传入（首=起点、末=终点）
export function periodReturn(rows: NavLike[]): number | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return 0;
  const first = rows[0].unit_nav;
  const last = rows[rows.length - 1].unit_nav;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test period-return`
Expected: 4 PASS

- [ ] **Step 5: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(domain): periodReturn 纯函数"
```

---

## Task 6: ensure-history 公共回填 helper

**Files:**
- Create: `lib/server/ensure-history.ts` `tests/lib/server/ensure-history.test.ts`
- Modify: `app/funds/[code]/page.tsx` (复用)
- Modify: `app/api/funds/[code]/route.ts` (复用)

- [ ] **Step 1: 写测试**

```ts
// tests/lib/server/ensure-history.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({ fetchHistory: vi.fn() }));

import { fetchHistory } from '@/lib/source/eastmoney';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';
import { ensureHistory } from '@/lib/server/ensure-history';

const mockedFetch = vi.mocked(fetchHistory);

function freshQ() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  const q = createQueries(db);
  q.upsertMeta({ code: '110011', name: 'X', type: null });
  return q;
}

beforeEach(() => mockedFetch.mockReset());

describe('ensureHistory', () => {
  it('行数充足且数据新鲜时跳过 fetch', async () => {
    const q = freshQ();
    const today = new Date().toISOString().slice(0, 10);
    const rows = Array.from({ length: 100 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      return { navDate: d.toISOString().slice(0, 10), unitNav: 1, accNav: null, dailyPct: null };
    });
    q.upsertNavRows('110011', rows);
    void today;
    await ensureHistory(q, '110011', 30);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('数据过期时触发 fetch', async () => {
    const q = freshQ();
    q.upsertNavRows('110011', [
      { navDate: '2020-01-01', unitNav: 1, accNav: null, dailyPct: null },
    ]);
    mockedFetch.mockResolvedValue({ ok: true, data: [] });
    await ensureHistory(q, '110011', 30);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('行数不足请求范围时触发 fetch', async () => {
    const q = freshQ();
    const today = new Date().toISOString().slice(0, 10);
    q.upsertNavRows('110011', [
      { navDate: today, unitNav: 1, accNav: null, dailyPct: null },
    ]);
    mockedFetch.mockResolvedValue({ ok: true, data: [] });
    await ensureHistory(q, '110011', 90);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test ensure-history`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// lib/server/ensure-history.ts
import type { Queries } from '@/lib/db/queries';
import { fetchHistory } from '@/lib/source/eastmoney';
import { previousTradingDay } from '@/lib/domain/trading-day';
import { log } from '@/lib/logger';

export async function ensureHistory(q: Queries, code: string, range: number): Promise<void> {
  const latest = q.latestNav(code);
  const need = previousTradingDay(new Date());
  const haveRows = q.countNav(code);
  if (latest && latest.nav_date >= need && haveRows >= range) return;

  const r = await fetchHistory(code, range + 30);
  if (r.ok) {
    try {
      q.upsertNavRows(code, r.data);
    } catch (e) {
      log.error('history_persist', { code, err: String(e) });
    }
  } else {
    log.warn('history_fetch_failed', { code, reason: r.reason });
  }
}
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test ensure-history`
Expected: 3 PASS

- [ ] **Step 5: 替换 `app/api/funds/[code]/route.ts` 中的重复逻辑**

把这一段：

```ts
const latest = q.latestNav(code);
const need = previousTradingDay(new Date());
const haveRows = q.countNav(code);
if (!latest || latest.nav_date < need || haveRows < range) {
  const r = await fetchHistory(code, range + 30);
  if (r.ok) {
    try { q.upsertNavRows(code, r.data); } catch (e) { log.error('history_persist', { code, err: String(e) }); }
  } else {
    log.warn('history_fetch_failed', { code, reason: r.reason });
  }
}
```

替换为：

```ts
await ensureHistory(q, code, range);
```

import 添加 `import { ensureHistory } from '@/lib/server/ensure-history';`，删除不再使用的 `fetchHistory`/`previousTradingDay`/`log` 中已不直接调用的部分（如果仍有别的引用就保留）。

- [ ] **Step 6: 替换 `app/funds/[code]/page.tsx` 中的同段逻辑**

把：

```ts
const latest = q.latestNav(code);
const need = previousTradingDay(new Date());
const haveRows = q.countNav(code);
if (!latest || latest.nav_date < need || haveRows < range) {
  const r = await fetchHistory(code, range + 30);
  if (r.ok) {
    try {
      q.upsertNavRows(code, r.data);
    } catch {
      /* ignore */
    }
  }
}
```

替换为：

```ts
await ensureHistory(q, code, range);
```

同步修正 imports。

- [ ] **Step 7: 全量测试 + lint + typecheck**

Run: `volta run yarn test && volta run yarn lint && volta run yarn typecheck`
Expected: 全部通过（funds-get.test 不应回归）

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: 抽出 ensureHistory 公共回填 helper"
```

---

## Task 7: API — `/api/tags` GET + POST

**Files:**
- Create: `app/api/tags/route.ts` `tests/api/tags-list-create.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/api/tags-list-create.test.ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test tags-list-create`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// app/api/tags/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { TAG_PALETTE } from '@/lib/domain/tag-palette';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(20),
  color: z.enum(TAG_PALETTE),
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
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test tags-list-create`
Expected: 5 PASS

- [ ] **Step 5: 全量测试 + lint + typecheck**

Run: `volta run yarn test && volta run yarn lint && volta run yarn typecheck`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): GET + POST /api/tags"
```

---

## Task 8: API — `/api/tags/[id]` PATCH + DELETE

**Files:**
- Create: `app/api/tags/[id]/route.ts` `tests/api/tags-update-delete.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/api/tags-update-delete.test.ts
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
import { createQueries } from '@/lib/db/queries';
import { PATCH, DELETE } from '@/app/api/tags/[id]/route';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM fund_tags; DELETE FROM tags;');
});

function patchReq(body: unknown) {
  return new Request('http://x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/tags/[id]', () => {
  it('改名 + 改色返回 200', async () => {
    const q = createQueries(getDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await PATCH(patchReq({ name: 'b', color: 'red' }), { params: { id: String(t.id) } });
    expect(res.status).toBe(200);
    expect(q.getTag(t.id)?.name).toBe('b');
    expect(q.getTag(t.id)?.color).toBe('red');
  });

  it('不存在的 id 返回 404', async () => {
    const res = await PATCH(patchReq({ name: 'b' }), { params: { id: '999' } });
    expect(res.status).toBe(404);
  });

  it('id 非数字返回 400', async () => {
    const res = await PATCH(patchReq({ name: 'b' }), { params: { id: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('改名重名返回 409', async () => {
    const q = createQueries(getDb());
    q.createTag({ name: 'a', color: 'blue' });
    const t = q.createTag({ name: 'b', color: 'red' });
    const res = await PATCH(patchReq({ name: 'a' }), { params: { id: String(t.id) } });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/tags/[id]', () => {
  it('删除返回 204', async () => {
    const q = createQueries(getDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(t.id) } });
    expect(res.status).toBe(204);
    expect(q.getTag(t.id)).toBeNull();
  });

  it('不存在的 id 返回 404', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: '999' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test tags-update-delete`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// app/api/tags/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { TAG_PALETTE } from '@/lib/domain/tag-palette';

export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(20).optional(),
  color: z.enum(TAG_PALETTE).optional(),
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
```

- [ ] **Step 4: 测试通过**

Run: `volta run yarn test tags-update-delete`
Expected: 6 PASS

- [ ] **Step 5: 全量测试 + lint + typecheck**

Run: `volta run yarn test && volta run yarn lint && volta run yarn typecheck`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): PATCH + DELETE /api/tags/[id]"
```

---

## Task 9: API — `/api/watchlist/[code]/tags` POST + DELETE

**Files:**
- Create: `app/api/watchlist/[code]/tags/route.ts` `app/api/watchlist/[code]/tags/[tagId]/route.ts` `tests/api/fund-tags.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/api/fund-tags.test.ts
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
import { createQueries } from '@/lib/db/queries';
import { POST } from '@/app/api/watchlist/[code]/tags/route';
import { DELETE } from '@/app/api/watchlist/[code]/tags/[tagId]/route';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM fund_tags; DELETE FROM tags; DELETE FROM watchlist; DELETE FROM fund_meta;');
});

function postReq(body: unknown) {
  return new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function seedFund(code = '110011') {
  const q = createQueries(getDb());
  q.upsertMeta({ code, name: 'X', type: null });
  q.addToWatchlist(code);
  return q;
}

describe('POST /api/watchlist/[code]/tags', () => {
  it('成功添加返回 201', async () => {
    const q = seedFund();
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    expect(res.status).toBe(201);
    expect(q.listTagsForFund('110011')).toHaveLength(1);
  });

  it('code 非法返回 400', async () => {
    const res = await POST(postReq({ tag_id: 1 }), { params: { code: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('tag 不存在返回 404', async () => {
    seedFund();
    const res = await POST(postReq({ tag_id: 9999 }), { params: { code: '110011' } });
    expect(res.status).toBe(404);
  });

  it('fund 不在 watchlist 返回 404', async () => {
    const q = createQueries(getDb());
    const t = q.createTag({ name: 'a', color: 'blue' });
    const res = await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    expect(res.status).toBe(404);
  });

  it('重复关联返回 409', async () => {
    const q = seedFund();
    const t = q.createTag({ name: 'a', color: 'blue' });
    await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    const res = await POST(postReq({ tag_id: t.id }), { params: { code: '110011' } });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/watchlist/[code]/tags/[tagId]', () => {
  it('删除已存在关联返回 204', async () => {
    const q = seedFund();
    const t = q.createTag({ name: 'a', color: 'blue' });
    q.addFundTag('110011', t.id);
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params: { code: '110011', tagId: String(t.id) },
    });
    expect(res.status).toBe(204);
    expect(q.listTagsForFund('110011')).toHaveLength(0);
  });

  it('code 非法返回 400', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params: { code: 'abc', tagId: '1' },
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test fund-tags`
Expected: FAIL

- [ ] **Step 3: 实现 POST 路由**

```ts
// app/api/watchlist/[code]/tags/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({ tag_id: z.number().int().positive() });

export async function POST(req: Request, ctx: { params: { code: string } }) {
  const { code } = ctx.params;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  const fund = q.listWatchlist().find((w) => w.code === code);
  if (!fund) return NextResponse.json({ error: 'fund_not_found' }, { status: 404 });
  if (q.getTag(parsed.data.tag_id) === null) {
    return NextResponse.json({ error: 'tag_not_found' }, { status: 404 });
  }

  try {
    q.addFundTag(code, parsed.data.tag_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE|PRIMARY/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ code, tag_id: parsed.data.tag_id }, { status: 201 });
}
```

- [ ] **Step 4: 实现 DELETE 路由**

```ts
// app/api/watchlist/[code]/tags/[tagId]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: { code: string; tagId: string } }) {
  const { code, tagId } = ctx.params;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const id = Number(tagId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const q = createQueries(getDb());
  q.removeFundTag(code, id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: 测试通过**

Run: `volta run yarn test fund-tags`
Expected: 7 PASS

- [ ] **Step 6: 全量测试 + lint + typecheck**

Run: `volta run yarn test && volta run yarn lint && volta run yarn typecheck`
Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): 基金-tag 关联 POST + DELETE"
```

---

## Task 10: MiniChart 组件

**Files:**
- Create: `components/mini-chart.tsx`

(无单元测试 — 纯视觉组件，最终 task 走手动 smoke)

- [ ] **Step 1: 实现**

```tsx
// components/mini-chart.tsx
'use client';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

interface Row { nav_date: string; unit_nav: number }

export function MiniChart({ rows }: { rows: Row[] }) {
  if (rows.length < 2) {
    return (
      <div className="flex h-12 w-full items-center justify-center text-xs text-zinc-400">
        数据不足
      </div>
    );
  }
  const first = rows[0].unit_nav;
  const last = rows[rows.length - 1].unit_nav;
  const stroke = last >= first ? '#dc2626' : '#16a34a'; // 红涨绿跌
  return (
    <div className="h-12 w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={['auto', 'auto']} hide />
          <Line type="linear" dataKey="unit_nav" stroke={stroke} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): MiniChart sparkline 组件"
```

---

## Task 11: TagChip 组件

**Files:**
- Create: `components/tag-chip.tsx`

- [ ] **Step 1: 实现**

```tsx
// components/tag-chip.tsx
import type { TagColor } from '@/lib/domain/tag-palette';
import { tagClasses } from '@/lib/domain/tag-palette';

interface Props {
  name: string;
  color: TagColor;
  onClick?: () => void;
  onRemove?: () => void;
  selected?: boolean;
}

export function TagChip({ name, color, onClick, onRemove, selected }: Props) {
  const base = tagClasses(color);
  const ring = selected ? 'ring-2 ring-offset-1 ring-zinc-900' : '';
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${base} ${ring} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 leading-none opacity-60 hover:opacity-100"
          aria-label="移除"
        >
          ×
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 2: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): TagChip 彩色 pill 组件"
```

---

## Task 12: RangeSelector 组件

**Files:**
- Create: `components/range-selector.tsx`

- [ ] **Step 1: 实现**

```tsx
// components/range-selector.tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export const RANGE_OPTIONS = [
  { key: '1W', days: 7, label: '1 周' },
  { key: '1M', days: 30, label: '1 月' },
  { key: '3M', days: 90, label: '3 月' },
  { key: '6M', days: 180, label: '6 月' },
  { key: '1Y', days: 365, label: '1 年' },
] as const;

export function RangeSelector({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(days: number) {
    const next = new URLSearchParams(params);
    next.set('range', String(days));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex gap-1 text-sm">
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => select(o.days)}
          className={`rounded px-2 py-1 ${
            current === o.days
              ? 'bg-zinc-900 text-white'
              : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): RangeSelector 周期切换器"
```

---

## Task 13: TagFilterBar 组件

**Files:**
- Create: `components/tag-filter-bar.tsx`

- [ ] **Step 1: 实现**

```tsx
// components/tag-filter-bar.tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { TagColor } from '@/lib/domain/tag-palette';
import { TagChip } from './tag-chip';

interface Tag { id: number; name: string; color: TagColor }

export function TagFilterBar({ tags, current }: { tags: Tag[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (tags.length === 0) return null;

  function toggle(name: string) {
    const next = new URLSearchParams(params);
    if (current === name) next.delete('tag');
    else next.set('tag', name);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-zinc-500">筛选：</span>
      {tags.map((t) => (
        <TagChip
          key={t.id}
          name={t.name}
          color={t.color}
          selected={current === t.name}
          onClick={() => toggle(t.name)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): TagFilterBar 顶部过滤栏"
```

---

## Task 14: TagPicker 组件（combobox + 颜色选择器）

**Files:**
- Create: `components/tag-picker.tsx`

- [ ] **Step 1: 实现**

```tsx
// components/tag-picker.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TagColor } from '@/lib/domain/tag-palette';
import { TAG_PALETTE, tagClasses } from '@/lib/domain/tag-palette';
import { TagChip } from './tag-chip';

interface Tag { id: number; name: string; color: TagColor }

interface Props {
  code: string;
  allTags: Tag[];
  attachedTagIds: Set<number>;
  onClose: () => void;
}

export function TagPicker({ code, allTags, attachedTagIds, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<{ name: string } | null>(null);
  const [color, setColor] = useState<TagColor>('blue');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  const filtered = allTags.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));
  const exactMatch = filtered.some((t) => t.name === query.trim());

  async function toggleTag(tag: Tag) {
    setErr(null);
    setBusy(true);
    try {
      if (attachedTagIds.has(tag.id)) {
        const r = await fetch(`/api/watchlist/${code}/tags/${tag.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error('删除失败');
      } else {
        const r = await fetch(`/api/watchlist/${code}/tags`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tag_id: tag.id }),
        });
        if (!r.ok) throw new Error('添加失败');
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    if (!creating) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: creating.name, color }),
      });
      if (r.status === 409) throw new Error('已存在同名 tag');
      if (!r.ok) throw new Error('创建失败');
      const tag = (await r.json()) as Tag;
      const r2 = await fetch(`/api/watchlist/${code}/tags`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tag_id: tag.id }),
      });
      if (!r2.ok) throw new Error('绑定失败');
      router.refresh();
      setCreating(null);
      setQuery('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="absolute z-50 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg"
    >
      {creating === null ? (
        <>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索或创建 tag…"
            className="mb-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {filtered.map((t) => (
              <TagChip
                key={t.id}
                name={t.name}
                color={t.color}
                selected={attachedTagIds.has(t.id)}
                onClick={() => toggleTag(t)}
              />
            ))}
          </div>
          {query.trim() && !exactMatch && (
            <button
              disabled={busy}
              onClick={() => setCreating({ name: query.trim() })}
              className="mt-2 w-full rounded bg-zinc-50 px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
            >
              创建「{query.trim()}」
            </button>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 text-sm text-zinc-700">
            新建 tag <span className="font-medium">「{creating.name}」</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {TAG_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border ${tagClasses(c)} ${
                  color === c ? 'ring-2 ring-offset-1 ring-zinc-900' : ''
                }`}
                aria-label={c}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={doCreate}
              className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              确认创建
            </button>
            <button
              disabled={busy}
              onClick={() => setCreating(null)}
              className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-600"
            >
              返回
            </button>
          </div>
        </>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): TagPicker combobox + 颜色选择器"
```

---

## Task 15: FundCard 组件

**Files:**
- Create: `components/fund-card.tsx`

- [ ] **Step 1: 实现**

```tsx
// components/fund-card.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TagColor } from '@/lib/domain/tag-palette';
import { TagChip } from './tag-chip';
import { TagPicker } from './tag-picker';
import { MiniChart } from './mini-chart';

interface Tag { id: number; name: string; color: TagColor }
interface NavRow { nav_date: string; unit_nav: number }

export interface FundCardData {
  code: string;
  name: string;
  tags: Tag[];
  latestNav: number | null;
  latestNavDate: string | null;
  prevPct: number | null;
  estPct: number | null;
  estTime: string | null;
  periodPct: number | null;
  series: NavRow[];
}

function fmtPct(v: number | null) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function pctClass(v: number | null) {
  if (v == null) return 'text-zinc-400';
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-zinc-700';
}

export function FundCard({ data, allTags }: { data: FundCardData; allTags: Tag[] }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const attachedIds = new Set(data.tags.map((t) => t.id));

  async function remove() {
    if (!confirm(`移除 ${data.code}？`)) return;
    await fetch(`/api/watchlist/${data.code}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/funds/${data.code}`}
            className="block truncate text-sm font-semibold text-zinc-900 hover:underline"
            title={data.name}
          >
            {data.name}
          </Link>
          <div className="font-mono text-xs text-zinc-400">{data.code}</div>
        </div>
        <button
          onClick={remove}
          className="text-xs text-zinc-400 hover:text-red-600"
          aria-label="移除"
        >
          移除
        </button>
      </div>

      <div className="relative mb-2">
        <div className="flex flex-wrap items-center gap-1">
          {data.tags.map((t) => (
            <TagChip key={t.id} name={t.name} color={t.color} />
          ))}
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            + tag
          </button>
        </div>
        {pickerOpen && (
          <TagPicker
            code={data.code}
            allTags={allTags}
            attachedTagIds={attachedIds}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-zinc-900">
          {data.latestNav?.toFixed(4) ?? '—'}
        </span>
        <span className="text-xs text-zinc-400">{data.latestNavDate ?? ''}</span>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1 text-xs">
        <div>
          <div className="text-zinc-400">上日</div>
          <div className={pctClass(data.prevPct)}>{fmtPct(data.prevPct)}</div>
        </div>
        <div>
          <div className="text-zinc-400">估算</div>
          <div className={pctClass(data.estPct)}>{fmtPct(data.estPct)}</div>
        </div>
        <div>
          <div className="text-zinc-400">区间</div>
          <div className={pctClass(data.periodPct)}>{fmtPct(data.periodPct)}</div>
        </div>
      </div>

      <MiniChart rows={data.series} />
    </div>
  );
}
```

- [ ] **Step 2: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): FundCard 基金卡片"
```

---

## Task 16: FundGrid 布局组件

**Files:**
- Create: `components/fund-grid.tsx`

- [ ] **Step 1: 实现**

```tsx
// components/fund-grid.tsx
import { FundCard, type FundCardData } from './fund-card';
import type { TagColor } from '@/lib/domain/tag-palette';

interface Tag { id: number; name: string; color: TagColor }

export function FundGrid({ items, allTags }: { items: FundCardData[]; allTags: Tag[] }) {
  if (items.length === 0) {
    return <p className="text-zinc-500">还没有自选基金。试着加一个。</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <FundCard key={it.code} data={it} allTags={allTags} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): FundGrid 响应式网格"
```

---

## Task 17: 重写 `app/page.tsx`，删除旧 watchlist-table.tsx

**Files:**
- Modify: `app/page.tsx`
- Delete: `components/watchlist-table.tsx`

- [ ] **Step 1: 重写 `app/page.tsx`**

```tsx
// app/page.tsx
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchQuote } from '@/lib/source/eastmoney';
import { quoteCache } from '@/lib/cache';
import { ensureHistory } from '@/lib/server/ensure-history';
import { periodReturn } from '@/lib/domain/period-return';
import { AddFundForm } from '@/components/add-fund-form';
import { FundGrid } from '@/components/fund-grid';
import { RangeSelector, RANGE_OPTIONS } from '@/components/range-selector';
import { TagFilterBar } from '@/components/tag-filter-bar';
import type { FundCardData } from '@/components/fund-card';

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE = 30;
const ALLOWED_DAYS = new Set(RANGE_OPTIONS.map((o) => o.days));

function parseRange(v: string | undefined): number {
  const n = Number(v);
  return ALLOWED_DAYS.has(n) ? n : DEFAULT_RANGE;
}

export default async function Home({
  searchParams,
}: {
  searchParams: { range?: string; tag?: string };
}) {
  const range = parseRange(searchParams.range);
  const tagFilter = searchParams.tag?.trim() || null;

  const q = createQueries(getDb());
  const allTags = q.listTags();
  let items = q.listWatchlistWithTags();
  if (tagFilter) items = items.filter((it) => it.tags.some((t) => t.name === tagFilter));

  // 并行回填 + 取估值
  await Promise.allSettled(items.map((it) => ensureHistory(q, it.code, range)));

  const seriesMap = q.listNavSeriesForCodes(items.map((it) => it.code), range);

  const cardData: FundCardData[] = await Promise.all(
    items.map(async (it) => {
      const latest = q.latestNav(it.code);
      const series = seriesMap.get(it.code) ?? [];
      const quote = await quoteCache
        .get(it.code, () =>
          fetchQuote(it.code).then((x) => {
            if (!x.ok) throw new Error(x.reason);
            return x.data;
          }),
        )
        .then((d) => ({ ok: true as const, data: d }))
        .catch(() => ({ ok: false as const }));
      return {
        code: it.code,
        name: it.name,
        tags: it.tags,
        latestNav: latest?.unit_nav ?? (quote.ok ? quote.data.unitNav : null),
        latestNavDate: latest?.nav_date ?? (quote.ok ? quote.data.navDate : null),
        prevPct: latest?.daily_pct ?? null,
        estPct: quote.ok ? quote.data.estPct : null,
        estTime: quote.ok ? quote.data.estTime : null,
        periodPct: periodReturn(series),
        series,
      };
    }),
  );

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">自选基金</h1>
      <div className="mb-4 flex items-center gap-4">
        <AddFundForm />
        <div className="ml-auto">
          <RangeSelector current={range} />
        </div>
      </div>
      <div className="mb-4">
        <TagFilterBar tags={allTags} current={tagFilter} />
      </div>
      <FundGrid items={cardData} allTags={allTags} />
    </main>
  );
}
```

- [ ] **Step 2: 删除 `components/watchlist-table.tsx`**

```bash
git rm components/watchlist-table.tsx
```

- [ ] **Step 3: 全量测试 + lint + typecheck**

Run: `volta run yarn test && volta run yarn lint && volta run yarn typecheck`
Expected: 全部通过

- [ ] **Step 4: build 校验**

Run: `volta run yarn build`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): 看板改为卡片网格，删除旧表格组件"
```

---

## Task 18: 全量回归 + 手动 smoke + 文档

**Files:**
- Modify: `README.md`（可选追加）

- [ ] **Step 1: 全量测试**

Run: `volta run yarn test`
Expected: 全部 PASS（包含本期新增的 7 个测试文件，约 30+ 新用例）

- [ ] **Step 2: lint + typecheck + build**

Run: `volta run yarn lint && volta run yarn typecheck && volta run yarn build`
Expected: 0 errors

- [ ] **Step 3: 手动 smoke**

启动：`volta run yarn dev`（背景）

通过 curl 完成 e2e：

```bash
# 假设占用 3000，按实际端口替换
PORT=3000

# 1. 加自选
curl -s -X POST http://localhost:$PORT/api/watchlist \
  -H 'content-type: application/json' -d '{"code":"110011"}'

# 2. 创建 tag「核心」蓝色
curl -s -X POST http://localhost:$PORT/api/tags \
  -H 'content-type: application/json' -d '{"name":"核心","color":"blue"}'

# 3. 列出 tag，取 id
TAG_ID=$(curl -s http://localhost:$PORT/api/tags | python3 -c \
  "import json,sys; print(json.load(sys.stdin)['items'][0]['id'])")
echo "tag id = $TAG_ID"

# 4. 把 110011 打上「核心」
curl -s -X POST http://localhost:$PORT/api/watchlist/110011/tags \
  -H 'content-type: application/json' -d "{\"tag_id\":$TAG_ID}" -w "\nHTTP %{http_code}\n"

# 5. 看板含卡片 + tag chip
curl -s "http://localhost:$PORT/?range=30" | grep -o "核心\|110011" | sort -u

# 6. tag 过滤
curl -s "http://localhost:$PORT/?range=30&tag=核心" -o /dev/null -w "filter HTTP %{http_code}\n"

# 7. 切换周期
for r in 7 30 90 180 365; do
  curl -s "http://localhost:$PORT/?range=$r" -o /dev/null -w "range=$r HTTP %{http_code}\n"
done

# 8. 解绑 tag
curl -s -X DELETE "http://localhost:$PORT/api/watchlist/110011/tags/$TAG_ID" \
  -w "unbind HTTP %{http_code}\n"

# 9. 删除 tag
curl -s -X DELETE "http://localhost:$PORT/api/tags/$TAG_ID" \
  -w "delete tag HTTP %{http_code}\n"
```

期望：每步 200/201/204；步骤 5 输出包含「核心」与「110011」。

停止 dev server。

- [ ] **Step 4: README 追加 tag 说明（可选）**

如果 README 未提及 tag，追加一节：

```markdown
## 标签

- 在卡片上点 `+ tag` 添加；首次添加时输入名称，选 9 色调色板之一
- 顶部 tag 栏点击单选过滤；再点取消
- tag 通过 migration v2 落库（tags / fund_tags 两张表）
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: 看板卡片化 + 标签系统收尾"
```
