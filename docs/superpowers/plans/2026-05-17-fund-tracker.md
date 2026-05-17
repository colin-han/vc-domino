# 基金跟踪工具（MVP）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现「净值跟踪 + 自选看板」MVP：用户可加入/移除自选基金，看板展示净值与盘中估算涨跌，详情页展示历史走势。

**Architecture:** 单进程 Next.js (App Router) + better-sqlite3 本地文件库。`lib/source/` 封装天天基金两个公开端点；`lib/cache/` 做盘中估值内存 TTL；UI 优先 RSC，仅在需要轮询时用 Client Component。

**Tech Stack:** Next.js 14+ (App Router) · TypeScript · better-sqlite3 · zod · Recharts · TailwindCSS + shadcn/ui · Vitest

**Spec:** `docs/superpowers/specs/2026-05-17-fund-tracker-design.md`

---

## 文件结构与职责

| 路径 | 职责 |
|------|------|
| `package.json` | 依赖、脚本（dev/build/lint/typecheck/test/db:migrate） |
| `tsconfig.json` `next.config.mjs` `tailwind.config.ts` `postcss.config.mjs` | 配置 |
| `.eslintrc.cjs` `.prettierrc` `.gitignore` `.env.local.example` | 工具链 |
| `lib/db/client.ts` | better-sqlite3 单例 + WAL 模式 |
| `lib/db/migrate.ts` | `PRAGMA user_version` 迁移；导出 `runMigrations()` |
| `lib/db/queries.ts` | 表 SQL 查询封装（watchlist / fund_meta / fund_nav） |
| `lib/domain/trading-day.ts` | 「上个交易日」判定（纯函数） |
| `lib/domain/nav.ts` | 涨跌幅、范围过滤等纯函数 |
| `lib/source/eastmoney.ts` | `fetchQuote`、`fetchHistory`；JSONP 解析；契约校验 |
| `lib/cache/quote-cache.ts` | 内存 TTL + in-flight 去重 |
| `lib/logger.ts` | 结构化 JSON 行日志 |
| `app/layout.tsx` `app/globals.css` | 根布局 + 样式 |
| `app/page.tsx` | 自选看板（RSC） |
| `app/funds/[code]/page.tsx` | 详情页（RSC） |
| `app/api/watchlist/route.ts` | POST 加入 / GET 列表 |
| `app/api/watchlist/[code]/route.ts` | DELETE 移除 |
| `app/api/funds/[code]/route.ts` | 元数据 + 历史净值 |
| `app/api/quote/[code]/route.ts` | 盘中估值 |
| `components/watchlist-table.tsx` | 看板表格（Client：30s 轮询） |
| `components/add-fund-form.tsx` | 加入自选表单（Client） |
| `components/nav-chart.tsx` | Recharts 走势图（Client） |
| `components/ui/*` | shadcn 复制进来的基础组件 |
| `fixtures/eastmoney/*.json|.jsonp` | 接口响应快照 |
| `tests/**` | Vitest 单元/集成 |
| `data/.gitkeep` | DB 目录占位（`funds.db` gitignore） |

---

## Task 1: 初始化项目骨架

**Files:**
- Create: `package.json` `tsconfig.json` `next.config.mjs` `.gitignore` `.env.local.example` `data/.gitkeep` `app/layout.tsx` `app/globals.css` `app/page.tsx`

- [ ] **Step 1: 初始化 package.json**

写入 `package.json`：

```json
{
  "name": "domino",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "tsx scripts/migrate.ts"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "better-sqlite3": "11.1.2",
    "zod": "3.23.8",
    "recharts": "2.12.7",
    "clsx": "2.1.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "7.6.10",
    "@types/node": "20.14.10",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@vitest/coverage-v8": "2.0.5",
    "autoprefixer": "10.4.19",
    "eslint": "8.57.0",
    "eslint-config-next": "14.2.5",
    "postcss": "8.4.40",
    "tailwindcss": "3.4.7",
    "tsx": "4.16.2",
    "typescript": "5.5.4",
    "vitest": "2.0.5"
  }
}
```

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: next.config.mjs**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['better-sqlite3'] },
};
export default nextConfig;
```

- [ ] **Step 4: .gitignore**

```
node_modules/
.next/
.env.local
data/*.db
data/*.db-journal
data/*.db-wal
data/*.db-shm
coverage/
*.log
.DS_Store
```

- [ ] **Step 5: .env.local.example**

```
# 本期暂无 secret，预留模板
# PORT=3000
```

- [ ] **Step 6: app 根骨架**

`app/layout.tsx`：

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: '基金跟踪', description: '本地基金净值看板' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
```

`app/globals.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`app/page.tsx`（占位，后续替换）：

```tsx
export default function Home() {
  return <main className="p-8">基金跟踪 — 初始化完成</main>;
}
```

`data/.gitkeep` 留空。

- [ ] **Step 7: Tailwind 配置**

`tailwind.config.ts`：

```ts
import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

`postcss.config.mjs`：

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 8: ESLint 配置**

`.eslintrc.cjs`：

```js
module.exports = {
  extends: ['next/core-web-vitals'],
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
};
```

- [ ] **Step 9: 安装依赖并校验**

Run: `volta run yarn install`
Run: `volta run yarn typecheck`
Expected: 无报错。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: 初始化 Next.js + TS + Tailwind 骨架"
```

---

## Task 2: SQLite 客户端与迁移

**Files:**
- Create: `lib/db/client.ts` `lib/db/migrate.ts` `scripts/migrate.ts` `tests/lib/db/migrate.test.ts`

- [ ] **Step 1: 写 migrate 测试（失败）**

`tests/lib/db/migrate.test.ts`：

```ts
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
```

- [ ] **Step 2: 配置 vitest**

新建 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { environment: 'node', coverage: { provider: 'v8' } },
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `volta run yarn test`
Expected: FAIL（找不到 `@/lib/db/migrate`）。

- [ ] **Step 4: 实现 migrate**

`lib/db/migrate.ts`：

```ts
import type { Database } from 'better-sqlite3';

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
];

export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `volta run yarn test`
Expected: 2 passed。

- [ ] **Step 6: 实现 client.ts**

`lib/db/client.ts`：

```ts
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrate';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;
  const dir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'funds.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  instance = db;
  return db;
}
```

- [ ] **Step 7: 迁移脚本**

`scripts/migrate.ts`：

```ts
import { getDb } from '../lib/db/client';
const db = getDb();
console.log('migrations applied, user_version =', db.pragma('user_version', { simple: true }));
```

- [ ] **Step 8: 跑迁移并校验**

Run: `volta run yarn db:migrate`
Expected: 输出 `migrations applied, user_version = 1`，`data/funds.db` 已生成。

- [ ] **Step 9: 校验 lint**

Run: `volta run yarn lint`
Expected: 0 errors。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(db): SQLite 客户端 + user_version 迁移"
```

---

## Task 3: domain/trading-day 纯函数

**Files:**
- Create: `lib/domain/trading-day.ts` `tests/lib/domain/trading-day.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/domain/trading-day.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { previousTradingDay, isTradingDay } from '@/lib/domain/trading-day';

describe('isTradingDay', () => {
  it('周六周日为非交易日', () => {
    expect(isTradingDay(new Date('2026-05-16T03:00:00Z'))).toBe(false); // 周六
    expect(isTradingDay(new Date('2026-05-17T03:00:00Z'))).toBe(false); // 周日
  });
  it('工作日（非节假日）为交易日', () => {
    expect(isTradingDay(new Date('2026-05-18T03:00:00Z'))).toBe(true); // 周一
  });
  it('节假日不是交易日', () => {
    expect(isTradingDay(new Date('2026-01-01T03:00:00Z'))).toBe(false); // 元旦
  });
});

describe('previousTradingDay', () => {
  it('周一回溯到上周五', () => {
    expect(previousTradingDay(new Date('2026-05-18T03:00:00Z'))).toBe('2026-05-15');
  });
  it('普通工作日回溯到前一日', () => {
    expect(previousTradingDay(new Date('2026-05-20T03:00:00Z'))).toBe('2026-05-19');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test trading-day`
Expected: FAIL。

- [ ] **Step 3: 实现**

`lib/domain/trading-day.ts`：

```ts
// 2026 节假日（A 股休市），需每年初手动更新
const HOLIDAYS_2026 = new Set([
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-06',
  '2026-05-01',
  '2026-06-19',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
]);

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isTradingDay(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAYS_2026.has(toIsoDate(d));
}

export function previousTradingDay(from: Date): string {
  const d = new Date(from.getTime());
  for (let i = 0; i < 14; i += 1) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (isTradingDay(d)) return toIsoDate(d);
  }
  throw new Error('previousTradingDay: 14 天内未找到交易日');
}
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test trading-day`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): 上个交易日判定"
```

---

## Task 4: domain/nav 涨跌幅工具

**Files:**
- Create: `lib/domain/nav.ts` `tests/lib/domain/nav.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/domain/nav.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { pctChange, withinRange } from '@/lib/domain/nav';

describe('pctChange', () => {
  it('计算两个净值的百分比变化', () => {
    expect(pctChange(1.0, 1.1)).toBeCloseTo(10, 4);
    expect(pctChange(2.0, 1.8)).toBeCloseTo(-10, 4);
  });
  it('prev=0 时返回 null', () => {
    expect(pctChange(0, 1)).toBeNull();
  });
});

describe('withinRange', () => {
  const rows = [
    { nav_date: '2026-05-10', unit_nav: 1 },
    { nav_date: '2026-05-12', unit_nav: 1.1 },
    { nav_date: '2026-05-15', unit_nav: 1.2 },
  ];
  it('按天数范围过滤', () => {
    const out = withinRange(rows, '2026-05-15', 5);
    expect(out.map((r) => r.nav_date)).toEqual(['2026-05-10', '2026-05-12', '2026-05-15']);
  });
  it('范围更窄时排除更早的行', () => {
    const out = withinRange(rows, '2026-05-15', 3);
    expect(out.map((r) => r.nav_date)).toEqual(['2026-05-12', '2026-05-15']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test nav`
Expected: FAIL。

- [ ] **Step 3: 实现**

`lib/domain/nav.ts`：

```ts
export function pctChange(prev: number, next: number): number | null {
  if (prev === 0) return null;
  return ((next - prev) / prev) * 100;
}

interface NavRow { nav_date: string; unit_nav: number }

export function withinRange<T extends NavRow>(rows: T[], anchor: string, days: number): T[] {
  const anchorMs = Date.parse(anchor);
  const cutoff = anchorMs - days * 86400000;
  return rows.filter((r) => Date.parse(r.nav_date) >= cutoff);
}
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test nav`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): 涨跌幅 + 日期范围工具"
```

---

## Task 5: 天天基金客户端 — fetchQuote

**Files:**
- Create: `lib/source/eastmoney.ts` `fixtures/eastmoney/quote-110011.jsonp` `fixtures/eastmoney/quote-empty.txt` `tests/lib/source/eastmoney-quote.test.ts`

- [ ] **Step 1: 准备 fixture**

`fixtures/eastmoney/quote-110011.jsonp`（一行）：

```
jsonpgz({"fundcode":"110011","name":"易方达中小盘混合","jzrq":"2026-05-15","dwjz":"3.7080","gsz":"3.7150","gszzl":"0.19","gztime":"2026-05-16 15:00"});
```

`fixtures/eastmoney/quote-empty.txt`：

```
jsonpgz();
```

- [ ] **Step 2: 写测试**

`tests/lib/source/eastmoney-quote.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchQuote } from '@/lib/source/eastmoney';

function readFixture(name: string) {
  return fs.readFileSync(path.resolve(__dirname, '../../../fixtures/eastmoney', name), 'utf8');
}

function mockFetchText(body: string, ok = true, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('fetchQuote', () => {
  it('成功解析 JSONP 响应', async () => {
    mockFetchText(readFixture('quote-110011.jsonp'));
    const r = await fetchQuote('110011');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.code).toBe('110011');
      expect(r.data.name).toBe('易方达中小盘混合');
      expect(r.data.unitNav).toBeCloseTo(3.708, 4);
      expect(r.data.estPct).toBeCloseTo(0.19, 4);
    }
  });

  it('空响应视为 not_found', async () => {
    mockFetchText(readFixture('quote-empty.txt'));
    const r = await fetchQuote('999999');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_found');
  });

  it('网络失败返回 network', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;
    const r = await fetchQuote('110011');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('network');
  });

  it('非 2xx 返回 network', async () => {
    mockFetchText('', false, 500);
    const r = await fetchQuote('110011');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('network');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `volta run yarn test eastmoney-quote`
Expected: FAIL。

- [ ] **Step 4: 实现 fetchQuote**

`lib/source/eastmoney.ts`（先只实现 quote 部分）：

```ts
export interface QuoteData {
  code: string;
  name: string;
  navDate: string;       // YYYY-MM-DD（接口字段 jzrq）
  unitNav: number;       // dwjz
  estNav: number | null; // gsz
  estPct: number | null; // gszzl
  estTime: string | null; // gztime
}

export type SourceResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'network' | 'parse' | 'not_found' };

const HEADERS = {
  Referer: 'http://fund.eastmoney.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
};

function parseJsonpBody(body: string): unknown | null {
  const m = body.match(/jsonpgz\((.*)\);?\s*$/s);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner) return null;
  try {
    return JSON.parse(inner);
  } catch {
    return null;
  }
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchQuote(code: string): Promise<SourceResult<QuoteData>> {
  let body: string;
  try {
    const res = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js`, { headers: HEADERS });
    if (!res.ok) return { ok: false, reason: 'network' };
    body = await res.text();
  } catch {
    return { ok: false, reason: 'network' };
  }

  const obj = parseJsonpBody(body);
  if (obj === null) return { ok: false, reason: 'not_found' };
  if (typeof obj !== 'object') return { ok: false, reason: 'parse' };

  const o = obj as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : null;
  const dwjz = toNumberOrNull(o.dwjz);
  if (!name || dwjz === null) return { ok: false, reason: 'parse' };

  return {
    ok: true,
    data: {
      code,
      name,
      navDate: typeof o.jzrq === 'string' ? o.jzrq : '',
      unitNav: dwjz,
      estNav: toNumberOrNull(o.gsz),
      estPct: toNumberOrNull(o.gszzl),
      estTime: typeof o.gztime === 'string' ? o.gztime : null,
    },
  };
}
```

- [ ] **Step 5: 跑测试通过**

Run: `volta run yarn test eastmoney-quote`
Expected: 4 passed。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(source): 天天基金 fetchQuote + 契约校验"
```

---

## Task 6: 天天基金客户端 — fetchHistory

**Files:**
- Modify: `lib/source/eastmoney.ts`
- Create: `fixtures/eastmoney/history-110011.json` `tests/lib/source/eastmoney-history.test.ts`

- [ ] **Step 1: 准备 fixture**

`fixtures/eastmoney/history-110011.json`：

```json
{
  "Data": {
    "LSJZList": [
      { "FSRQ": "2026-05-15", "DWJZ": "3.7080", "LJJZ": "5.1234", "JZZZL": "0.45" },
      { "FSRQ": "2026-05-14", "DWJZ": "3.6914", "LJJZ": "5.1068", "JZZZL": "-0.21" },
      { "FSRQ": "2026-05-13", "DWJZ": "3.6991", "LJJZ": "5.1145", "JZZZL": "" }
    ]
  },
  "ErrCode": 0
}
```

- [ ] **Step 2: 写测试**

`tests/lib/source/eastmoney-history.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchHistory } from '@/lib/source/eastmoney';

function readFixture(name: string) {
  return fs.readFileSync(path.resolve(__dirname, '../../../fixtures/eastmoney', name), 'utf8');
}

function mockFetchJson(body: string, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  }) as unknown as typeof fetch;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('fetchHistory', () => {
  it('解析历史净值并按日期升序返回', async () => {
    mockFetchJson(readFixture('history-110011.json'));
    const r = await fetchHistory('110011', 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.map((x) => x.navDate)).toEqual(['2026-05-13', '2026-05-14', '2026-05-15']);
      expect(r.data[2].unitNav).toBeCloseTo(3.708, 4);
      expect(r.data[2].dailyPct).toBeCloseTo(0.45, 4);
      expect(r.data[0].dailyPct).toBeNull(); // 空字符串
    }
  });

  it('非 2xx 返回 network', async () => {
    mockFetchJson('{}', false);
    const r = await fetchHistory('110011', 10);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `volta run yarn test eastmoney-history`
Expected: FAIL。

- [ ] **Step 4: 在 eastmoney.ts 追加 fetchHistory**

在 `lib/source/eastmoney.ts` 文件末尾追加：

```ts
export interface HistoryRow {
  navDate: string;
  unitNav: number;
  accNav: number | null;
  dailyPct: number | null;
}

interface EastmoneyLsjzRow {
  FSRQ?: unknown; DWJZ?: unknown; LJJZ?: unknown; JZZZL?: unknown;
}

export async function fetchHistory(code: string, pageSize: number): Promise<SourceResult<HistoryRow[]>> {
  const url =
    `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=${pageSize}`;
  let payload: unknown;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return { ok: false, reason: 'network' };
    payload = await res.json();
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'parse' };
  const data = (payload as Record<string, unknown>).Data;
  if (!data || typeof data !== 'object') return { ok: false, reason: 'parse' };
  const list = (data as Record<string, unknown>).LSJZList;
  if (!Array.isArray(list)) return { ok: false, reason: 'parse' };

  const rows: HistoryRow[] = [];
  for (const raw of list as EastmoneyLsjzRow[]) {
    const navDate = typeof raw.FSRQ === 'string' ? raw.FSRQ : null;
    const unitNav = toNumberOrNull(raw.DWJZ);
    if (!navDate || unitNav === null) continue;
    rows.push({
      navDate,
      unitNav,
      accNav: toNumberOrNull(raw.LJJZ),
      dailyPct: toNumberOrNull(raw.JZZZL),
    });
  }
  rows.sort((a, b) => (a.navDate < b.navDate ? -1 : 1));
  return { ok: true, data: rows };
}
```

- [ ] **Step 5: 跑测试通过**

Run: `volta run yarn test eastmoney-history`
Expected: 2 passed。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(source): 天天基金 fetchHistory"
```

---

## Task 7: 盘中估值内存缓存

**Files:**
- Create: `lib/cache/quote-cache.ts` `tests/lib/cache/quote-cache.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/cache/quote-cache.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { createQuoteCache } from '@/lib/cache/quote-cache';

describe('quote-cache', () => {
  it('TTL 内命中缓存，过期后重新调用 loader', async () => {
    const now = { t: 0 };
    const cache = createQuoteCache<number>({ ttlMs: 100, now: () => now.t });
    const loader = vi.fn().mockResolvedValue(42);
    expect(await cache.get('a', loader)).toBe(42);
    expect(await cache.get('a', loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
    now.t = 200;
    expect(await cache.get('a', loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('in-flight 去重：同 key 并发只触发一次 loader', async () => {
    const cache = createQuoteCache<number>({ ttlMs: 1000, now: () => 0 });
    let resolve!: (v: number) => void;
    const loader = vi.fn(() => new Promise<number>((r) => { resolve = r; }));
    const p1 = cache.get('a', loader);
    const p2 = cache.get('a', loader);
    resolve(7);
    expect(await p1).toBe(7);
    expect(await p2).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test quote-cache`
Expected: FAIL。

- [ ] **Step 3: 实现**

`lib/cache/quote-cache.ts`：

```ts
interface Options { ttlMs: number; now?: () => number }

export function createQuoteCache<T>(opts: Options) {
  const ttl = opts.ttlMs;
  const now = opts.now ?? (() => Date.now());
  const store = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();

  async function get(key: string, loader: () => Promise<T>): Promise<T> {
    const t = now();
    const hit = store.get(key);
    if (hit && hit.expiresAt > t) return hit.value;
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        const v = await loader();
        store.set(key, { value: v, expiresAt: now() + ttl });
        return v;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  return { get };
}
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test quote-cache`
Expected: 2 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(cache): 盘中估值 TTL + in-flight 去重"
```

---

## Task 8: DB 查询封装

**Files:**
- Create: `lib/db/queries.ts` `tests/lib/db/queries.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/db/queries.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('queries.watchlist', () => {
  it('upsert + list + remove', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: '易方达中小盘混合', type: '混合型' });
    q.addToWatchlist('110011');
    q.upsertMeta({ code: '161725', name: '招商中证白酒', type: '指数型' });
    q.addToWatchlist('161725');
    const items = q.listWatchlist();
    expect(items.map((i) => i.code).sort()).toEqual(['110011', '161725']);
    q.removeFromWatchlist('110011');
    expect(q.listWatchlist().map((i) => i.code)).toEqual(['161725']);
  });

  it('重复加入抛 UNIQUE 错误', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'x', type: null });
    q.addToWatchlist('110011');
    expect(() => q.addToWatchlist('110011')).toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('queries.nav', () => {
  it('upsertMany + 范围查询', () => {
    const q = createQueries(freshDb());
    q.upsertMeta({ code: '110011', name: 'x', type: null });
    q.upsertNavRows('110011', [
      { navDate: '2026-05-13', unitNav: 1.0, accNav: 2.0, dailyPct: 0.1 },
      { navDate: '2026-05-14', unitNav: 1.1, accNav: 2.1, dailyPct: 10 },
    ]);
    q.upsertNavRows('110011', [
      { navDate: '2026-05-14', unitNav: 1.15, accNav: 2.15, dailyPct: 15 }, // 覆盖
      { navDate: '2026-05-15', unitNav: 1.2, accNav: 2.2, dailyPct: 4.3 },
    ]);
    const rows = q.listNav('110011', 10);
    expect(rows.map((r) => r.nav_date)).toEqual(['2026-05-13', '2026-05-14', '2026-05-15']);
    expect(rows[1].unit_nav).toBeCloseTo(1.15, 4);
  });

  it('latestNav 返回最近一行或 null', () => {
    const q = createQueries(freshDb());
    expect(q.latestNav('110011')).toBeNull();
    q.upsertMeta({ code: '110011', name: 'x', type: null });
    q.upsertNavRows('110011', [{ navDate: '2026-05-15', unitNav: 1.2, accNav: null, dailyPct: null }]);
    const r = q.latestNav('110011');
    expect(r?.nav_date).toBe('2026-05-15');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test queries`
Expected: FAIL。

- [ ] **Step 3: 实现**

`lib/db/queries.ts`：

```ts
import type { Database } from 'better-sqlite3';

export interface WatchlistItem {
  code: string;
  name: string;
  type: string | null;
  added_at: number;
  sort_order: number;
}

export interface NavRow {
  nav_date: string;
  unit_nav: number;
  acc_nav: number | null;
  daily_pct: number | null;
}

export interface MetaInput { code: string; name: string; type: string | null }
export interface NavInput { navDate: string; unitNav: number; accNav: number | null; dailyPct: number | null }

export function createQueries(db: Database) {
  const upsertMetaStmt = db.prepare(`
    INSERT INTO fund_meta (code, name, type, meta_updated_at)
    VALUES (@code, @name, @type, @ts)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      meta_updated_at = excluded.meta_updated_at
  `);
  const addWatchStmt = db.prepare(
    `INSERT INTO watchlist (code, added_at, sort_order) VALUES (?, ?, ?)`,
  );
  const removeWatchStmt = db.prepare(`DELETE FROM watchlist WHERE code = ?`);
  const listWatchStmt = db.prepare(`
    SELECT w.code, m.name, m.type, w.added_at, w.sort_order
    FROM watchlist w
    JOIN fund_meta m USING (code)
    ORDER BY w.sort_order ASC, w.added_at ASC
  `);
  const insertNavStmt = db.prepare(`
    INSERT INTO fund_nav (code, nav_date, unit_nav, acc_nav, daily_pct)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code, nav_date) DO UPDATE SET
      unit_nav = excluded.unit_nav,
      acc_nav = excluded.acc_nav,
      daily_pct = excluded.daily_pct
  `);
  const listNavStmt = db.prepare(`
    SELECT nav_date, unit_nav, acc_nav, daily_pct FROM fund_nav
    WHERE code = ? ORDER BY nav_date ASC LIMIT ?
  `);
  const latestNavStmt = db.prepare(`
    SELECT nav_date, unit_nav, acc_nav, daily_pct FROM fund_nav
    WHERE code = ? ORDER BY nav_date DESC LIMIT 1
  `);
  const getMetaStmt = db.prepare(`SELECT code, name, type FROM fund_meta WHERE code = ?`);
  const countWatchStmt = db.prepare(`SELECT COUNT(*) AS n FROM watchlist`);

  return {
    upsertMeta(input: MetaInput) {
      upsertMetaStmt.run({ ...input, ts: Date.now() });
    },
    addToWatchlist(code: string) {
      const { n } = countWatchStmt.get() as { n: number };
      addWatchStmt.run(code, Date.now(), n);
    },
    removeFromWatchlist(code: string) {
      removeWatchStmt.run(code);
    },
    listWatchlist(): WatchlistItem[] {
      return listWatchStmt.all() as WatchlistItem[];
    },
    upsertNavRows(code: string, rows: NavInput[]) {
      const tx = db.transaction((items: NavInput[]) => {
        for (const r of items) {
          insertNavStmt.run(code, r.navDate, r.unitNav, r.accNav, r.dailyPct);
        }
      });
      tx(rows);
    },
    listNav(code: string, limit: number): NavRow[] {
      return listNavStmt.all(code, limit) as NavRow[];
    },
    latestNav(code: string): NavRow | null {
      const row = latestNavStmt.get(code) as NavRow | undefined;
      return row ?? null;
    },
    getMeta(code: string): { code: string; name: string; type: string | null } | null {
      const row = getMetaStmt.get(code) as { code: string; name: string; type: string | null } | undefined;
      return row ?? null;
    },
  };
}

export type Queries = ReturnType<typeof createQueries>;
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test queries`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): 查询封装（watchlist + fund_meta + fund_nav）"
```

---

## Task 9: logger + 共享 quote 缓存实例

**Files:**
- Create: `lib/logger.ts` `lib/cache/index.ts`

- [ ] **Step 1: logger**

`lib/logger.ts`：

```ts
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, op: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, op, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const log = {
  info: (op: string, fields: Record<string, unknown> = {}) => emit('info', op, fields),
  warn: (op: string, fields: Record<string, unknown> = {}) => emit('warn', op, fields),
  error: (op: string, fields: Record<string, unknown> = {}) => emit('error', op, fields),
};
```

- [ ] **Step 2: 共享缓存**

`lib/cache/index.ts`：

```ts
import { createQuoteCache } from './quote-cache';
import type { QuoteData } from '@/lib/source/eastmoney';

export const quoteCache = createQuoteCache<QuoteData>({ ttlMs: 30_000 });
```

- [ ] **Step 3: 校验 lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: logger + 共享 quote 缓存"
```

---

## Task 10: API — `POST /api/watchlist`

**Files:**
- Create: `app/api/watchlist/route.ts` `tests/api/watchlist-post.test.ts`

- [ ] **Step 1: 写测试**

`tests/api/watchlist-post.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({
  fetchQuote: vi.fn(),
  fetchHistory: vi.fn(),
}));
vi.mock('@/lib/db/client', () => {
  const Database = require('better-sqlite3');
  const { runMigrations } = require('@/lib/db/migrate');
  const db = new Database(':memory:');
  runMigrations(db);
  return { getDb: () => db };
});

import { fetchQuote, fetchHistory } from '@/lib/source/eastmoney';
import { POST } from '@/app/api/watchlist/route';

const mockedQuote = vi.mocked(fetchQuote);
const mockedHistory = vi.mocked(fetchHistory);

beforeEach(() => {
  mockedQuote.mockReset();
  mockedHistory.mockReset();
  mockedHistory.mockResolvedValue({ ok: true, data: [] });
});

function req(body: unknown) {
  return new Request('http://x/api/watchlist', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/watchlist', () => {
  it('成功添加返回 201', async () => {
    mockedQuote.mockResolvedValue({
      ok: true,
      data: { code: '110011', name: 'A', navDate: '2026-05-15', unitNav: 1, estNav: null, estPct: null, estTime: null },
    });
    const res = await POST(req({ code: '110011' }));
    expect(res.status).toBe(201);
  });

  it('参数非法返回 400', async () => {
    const res = await POST(req({ code: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('基金不存在返回 400', async () => {
    mockedQuote.mockResolvedValue({ ok: false, reason: 'not_found' });
    const res = await POST(req({ code: '999999' }));
    expect(res.status).toBe(400);
  });

  it('上游异常返回 502', async () => {
    mockedQuote.mockResolvedValue({ ok: false, reason: 'network' });
    const res = await POST(req({ code: '110011' }));
    expect(res.status).toBe(502);
  });

  it('重复添加返回 409', async () => {
    mockedQuote.mockResolvedValue({
      ok: true,
      data: { code: '110011', name: 'A', navDate: '2026-05-15', unitNav: 1, estNav: null, estPct: null, estTime: null },
    });
    await POST(req({ code: '110011' }));
    const res = await POST(req({ code: '110011' }));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test watchlist-post`
Expected: FAIL。

- [ ] **Step 3: 实现**

`app/api/watchlist/route.ts`：

```ts
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
      try { q.upsertNavRows(code, r.data); } catch (e) { log.error('history_persist', { code, err: String(e) }); }
    } else {
      log.warn('history_fetch_failed', { code, reason: r.reason });
    }
  });

  return NextResponse.json({ code, name: quote.data.name }, { status: 201 });
}
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test watchlist-post`
Expected: 5 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): POST/GET /api/watchlist"
```

---

## Task 11: API — `DELETE /api/watchlist/[code]`

**Files:**
- Create: `app/api/watchlist/[code]/route.ts` `tests/api/watchlist-delete.test.ts`

- [ ] **Step 1: 写测试**

`tests/api/watchlist-delete.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => {
  const Database = require('better-sqlite3');
  const { runMigrations } = require('@/lib/db/migrate');
  const db = new Database(':memory:');
  runMigrations(db);
  return { getDb: () => db };
});

import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { DELETE } from '@/app/api/watchlist/[code]/route';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM watchlist; DELETE FROM fund_meta;');
});

function req() {
  return new Request('http://x', { method: 'DELETE' });
}

describe('DELETE /api/watchlist/[code]', () => {
  it('删除已存在条目返回 204', async () => {
    const q = createQueries(getDb());
    q.upsertMeta({ code: '110011', name: 'A', type: null });
    q.addToWatchlist('110011');
    const res = await DELETE(req(), { params: { code: '110011' } });
    expect(res.status).toBe(204);
    expect(q.listWatchlist()).toHaveLength(0);
  });

  it('code 非法返回 400', async () => {
    const res = await DELETE(req(), { params: { code: 'abc' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test watchlist-delete`
Expected: FAIL。

- [ ] **Step 3: 实现**

`app/api/watchlist/[code]/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: { code: string } }) {
  const code = ctx.params.code;
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }
  const q = createQueries(getDb());
  q.removeFromWatchlist(code);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test watchlist-delete`
Expected: 2 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): DELETE /api/watchlist/[code]"
```

---

## Task 12: API — `GET /api/quote/[code]`

**Files:**
- Create: `app/api/quote/[code]/route.ts` `tests/api/quote-get.test.ts`

- [ ] **Step 1: 写测试**

`tests/api/quote-get.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({ fetchQuote: vi.fn() }));
vi.mock('@/lib/cache', () => ({
  quoteCache: { get: vi.fn((_k: string, loader: () => Promise<unknown>) => loader()) },
}));

import { fetchQuote } from '@/lib/source/eastmoney';
import { GET } from '@/app/api/quote/[code]/route';

const mockedQuote = vi.mocked(fetchQuote);

beforeEach(() => { mockedQuote.mockReset(); });

describe('GET /api/quote/[code]', () => {
  it('成功返回估值', async () => {
    mockedQuote.mockResolvedValue({
      ok: true,
      data: { code: '110011', name: 'A', navDate: '2026-05-15', unitNav: 1, estNav: 1.01, estPct: 1, estTime: '2026-05-16 15:00' },
    });
    const res = await GET(new Request('http://x'), { params: { code: '110011' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.estPct).toBe(1);
  });

  it('上游失败返回 502', async () => {
    mockedQuote.mockResolvedValue({ ok: false, reason: 'network' });
    const res = await GET(new Request('http://x'), { params: { code: '110011' } });
    expect(res.status).toBe(502);
  });

  it('code 非法返回 400', async () => {
    const res = await GET(new Request('http://x'), { params: { code: 'x' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test quote-get`
Expected: FAIL。

- [ ] **Step 3: 实现**

`app/api/quote/[code]/route.ts`：

```ts
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
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test quote-get`
Expected: 3 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): GET /api/quote/[code]"
```

---

## Task 13: API — `GET /api/funds/[code]`

**Files:**
- Create: `app/api/funds/[code]/route.ts` `tests/api/funds-get.test.ts`

- [ ] **Step 1: 写测试**

`tests/api/funds-get.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/source/eastmoney', () => ({ fetchHistory: vi.fn() }));
vi.mock('@/lib/db/client', () => {
  const Database = require('better-sqlite3');
  const { runMigrations } = require('@/lib/db/migrate');
  const db = new Database(':memory:');
  runMigrations(db);
  return { getDb: () => db };
});

import { fetchHistory } from '@/lib/source/eastmoney';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { GET } from '@/app/api/funds/[code]/route';

const mockedHistory = vi.mocked(fetchHistory);

beforeEach(() => {
  mockedHistory.mockReset();
  const db = getDb();
  db.exec('DELETE FROM fund_nav; DELETE FROM fund_meta;');
});

describe('GET /api/funds/[code]', () => {
  it('DB 已有最新数据时直接返回，不调用上游', async () => {
    const q = createQueries(getDb());
    q.upsertMeta({ code: '110011', name: 'A', type: null });
    const today = new Date().toISOString().slice(0, 10);
    q.upsertNavRows('110011', [{ navDate: today, unitNav: 1, accNav: null, dailyPct: null }]);
    const res = await GET(new Request('http://x?range=30'), { params: { code: '110011' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta?.name).toBe('A');
    expect(body.rows.length).toBeGreaterThan(0);
    expect(mockedHistory).not.toHaveBeenCalled();
  });

  it('DB 不足时触发回填', async () => {
    const q = createQueries(getDb());
    q.upsertMeta({ code: '110011', name: 'A', type: null });
    mockedHistory.mockResolvedValue({
      ok: true,
      data: [{ navDate: '2026-05-15', unitNav: 1, accNav: null, dailyPct: null }],
    });
    const res = await GET(new Request('http://x?range=30'), { params: { code: '110011' } });
    expect(res.status).toBe(200);
    expect(mockedHistory).toHaveBeenCalledTimes(1);
  });

  it('code 非法返回 400', async () => {
    const res = await GET(new Request('http://x'), { params: { code: 'x' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `volta run yarn test funds-get`
Expected: FAIL。

- [ ] **Step 3: 实现**

`app/api/funds/[code]/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchHistory } from '@/lib/source/eastmoney';
import { previousTradingDay } from '@/lib/domain/trading-day';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: { code: string } }) {
  const code = ctx.params.code;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const url = new URL(req.url);
  const range = Math.min(Math.max(parseInt(url.searchParams.get('range') ?? '90', 10) || 90, 7), 365);

  const q = createQueries(getDb());
  const latest = q.latestNav(code);
  const need = previousTradingDay(new Date());
  if (!latest || latest.nav_date < need) {
    const r = await fetchHistory(code, range + 30);
    if (r.ok) {
      try { q.upsertNavRows(code, r.data); } catch (e) { log.error('history_persist', { code, err: String(e) }); }
    } else {
      log.warn('history_fetch_failed', { code, reason: r.reason });
    }
  }

  const meta = q.getMeta(code);
  const rows = q.listNav(code, range);
  return NextResponse.json({ meta, rows });
}
```

- [ ] **Step 4: 跑测试通过**

Run: `volta run yarn test funds-get`
Expected: 3 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): GET /api/funds/[code]"
```

---

## Task 14: 看板页面（RSC）+ 加入表单

**Files:**
- Modify: `app/page.tsx`
- Create: `components/add-fund-form.tsx` `components/watchlist-table.tsx`

- [ ] **Step 1: AddFundForm**

`components/add-fund-form.tsx`：

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddFundForm() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{6}$/.test(code)) { setErr('请输入 6 位基金代码'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST', body: JSON.stringify({ code }), headers: { 'content-type': 'application/json' },
      });
      if (res.status === 201) { setCode(''); router.refresh(); return; }
      const body = await res.json().catch(() => ({}));
      setErr(`添加失败：${body.error ?? res.status}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.trim())}
        placeholder="6 位基金代码"
        className="rounded border border-zinc-300 px-3 py-1.5"
      />
      <button type="submit" disabled={busy} className="rounded bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-50">
        {busy ? '添加中…' : '加入自选'}
      </button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </form>
  );
}
```

- [ ] **Step 2: WatchlistTable**

`components/watchlist-table.tsx`：

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Row {
  code: string;
  name: string;
  type: string | null;
  latestNav: number | null;
  latestNavDate: string | null;
  prevPct: number | null;
  estPct: number | null;
  estTime: string | null;
}

export function WatchlistTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const router = useRouter();

  useEffect(() => { setRows(initial); }, [initial]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const next = await Promise.all(rows.map(async (r) => {
        const res = await fetch(`/api/quote/${r.code}`);
        if (!res.ok) return r;
        const body = await res.json() as { estPct: number | null; estTime: string | null };
        return { ...r, estPct: body.estPct, estTime: body.estTime };
      }));
      setRows(next);
    }, 30_000);
    return () => clearInterval(timer);
  }, [rows]);

  async function remove(code: string) {
    if (!confirm(`移除 ${code}？`)) return;
    await fetch(`/api/watchlist/${code}`, { method: 'DELETE' });
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-zinc-500">还没有自选基金。试着加一个。</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-zinc-500">
          <th className="py-2">代码</th><th>名称</th><th>最新净值</th><th>上日涨跌</th><th>盘中估算</th><th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className="border-b">
            <td className="py-2 font-mono">
              <Link href={`/funds/${r.code}`} className="text-blue-600 hover:underline">{r.code}</Link>
            </td>
            <td>{r.name}</td>
            <td>{r.latestNav?.toFixed(4) ?? '—'} <span className="text-xs text-zinc-400">{r.latestNavDate}</span></td>
            <td className={pctClass(r.prevPct)}>{formatPct(r.prevPct)}</td>
            <td className={pctClass(r.estPct)}>{formatPct(r.estPct)} <span className="text-xs text-zinc-400">{r.estTime ?? ''}</span></td>
            <td><button onClick={() => remove(r.code)} className="text-xs text-red-600">移除</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatPct(v: number | null) { return v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function pctClass(v: number | null) {
  if (v == null) return 'text-zinc-400';
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-zinc-700';
}
```

- [ ] **Step 3: 替换 app/page.tsx**

`app/page.tsx`：

```tsx
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchQuote } from '@/lib/source/eastmoney';
import { quoteCache } from '@/lib/cache';
import { AddFundForm } from '@/components/add-fund-form';
import { WatchlistTable } from '@/components/watchlist-table';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const q = createQueries(getDb());
  const items = q.listWatchlist();

  const rows = await Promise.all(items.map(async (it) => {
    const latest = q.latestNav(it.code);
    const quote = await quoteCache
      .get(it.code, () => fetchQuote(it.code).then((x) => { if (!x.ok) throw new Error(x.reason); return x.data; }))
      .then((d) => ({ ok: true as const, data: d }))
      .catch(() => ({ ok: false as const }));

    return {
      code: it.code,
      name: it.name,
      type: it.type,
      latestNav: latest?.unit_nav ?? (quote.ok ? quote.data.unitNav : null),
      latestNavDate: latest?.nav_date ?? (quote.ok ? quote.data.navDate : null),
      prevPct: latest?.daily_pct ?? null,
      estPct: quote.ok ? quote.data.estPct : null,
      estTime: quote.ok ? quote.data.estTime : null,
    };
  }));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">自选基金</h1>
      <div className="mb-6"><AddFundForm /></div>
      <WatchlistTable initial={rows} />
    </main>
  );
}
```

- [ ] **Step 4: 手动 smoke**

Run: `volta run yarn dev`
打开 `http://localhost:3000`，输入一个真实代码（如 `110011`），确认加入后表格出现该条目，刷新页面仍在；移除按钮可删除。

- [ ] **Step 5: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): 自选看板（加入 / 列表 / 移除 / 30s 估值轮询）"
```

---

## Task 15: 详情页 + 走势图

**Files:**
- Create: `app/funds/[code]/page.tsx` `components/nav-chart.tsx`

- [ ] **Step 1: NavChart**

`components/nav-chart.tsx`：

```tsx
'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Row { nav_date: string; unit_nav: number; acc_nav: number | null }

export function NavChart({ rows }: { rows: Row[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={rows}>
          <CartesianGrid stroke="#eee" />
          <XAxis dataKey="nav_date" minTickGap={32} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip />
          <Line type="monotone" dataKey="unit_nav" stroke="#2563eb" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: 详情页**

`app/funds/[code]/page.tsx`：

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchHistory } from '@/lib/source/eastmoney';
import { previousTradingDay } from '@/lib/domain/trading-day';
import { NavChart } from '@/components/nav-chart';

export const dynamic = 'force-dynamic';

const ALLOWED_RANGES = [30, 90, 180, 365] as const;
type Range = typeof ALLOWED_RANGES[number];

function parseRange(v: string | undefined): Range {
  const n = Number(v);
  return (ALLOWED_RANGES as readonly number[]).includes(n) ? (n as Range) : 90;
}

export default async function FundPage({
  params, searchParams,
}: { params: { code: string }; searchParams: { range?: string } }) {
  const { code } = params;
  if (!/^\d{6}$/.test(code)) notFound();
  const range = parseRange(searchParams.range);

  const q = createQueries(getDb());
  const meta = q.listWatchlist().find((w) => w.code === code);
  if (!meta) notFound();

  const latest = q.latestNav(code);
  const need = previousTradingDay(new Date());
  if (!latest || latest.nav_date < need) {
    const r = await fetchHistory(code, range + 30);
    if (r.ok) { try { q.upsertNavRows(code, r.data); } catch { /* ignore */ } }
  }
  const rows = q.listNav(code, range);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-2 text-sm"><Link href="/" className="text-blue-600">← 自选</Link></div>
      <h1 className="mb-1 text-2xl font-semibold">{meta.name} <span className="font-mono text-zinc-400">{code}</span></h1>
      <div className="mb-4 flex gap-2 text-sm">
        {ALLOWED_RANGES.map((r) => (
          <Link key={r} href={`/funds/${code}?range=${r}`} className={r === range ? 'font-semibold text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}>
            {r}天
          </Link>
        ))}
      </div>
      <NavChart rows={rows} />
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-500">
            <th className="py-2">日期</th><th>单位净值</th><th>累计净值</th><th>当日涨跌</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.nav_date} className="border-b">
              <td className="py-2 font-mono">{r.nav_date}</td>
              <td>{r.unit_nav.toFixed(4)}</td>
              <td>{r.acc_nav?.toFixed(4) ?? '—'}</td>
              <td className={r.daily_pct == null ? '' : r.daily_pct > 0 ? 'text-red-600' : r.daily_pct < 0 ? 'text-green-600' : ''}>
                {r.daily_pct == null ? '—' : `${r.daily_pct.toFixed(2)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 3: 手动 smoke**

Run: `volta run yarn dev`
打开 `http://localhost:3000/funds/110011?range=90`，确认图表与表格渲染；切换 30/180/365 工作。

- [ ] **Step 4: lint + typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): 基金详情页 + 净值走势图"
```

---

## Task 16: 全量回归与文档

**Files:**
- Create: `README.md`

- [ ] **Step 1: 跑完整测试**

Run: `volta run yarn test`
Expected: 全部 PASS。

- [ ] **Step 2: 跑 lint / typecheck**

Run: `volta run yarn lint && volta run yarn typecheck`
Expected: 0 errors。

- [ ] **Step 3: 手动 smoke**

Run: `volta run yarn dev`
验证：
1. 空状态 → 加入基金 → 看板出现
2. 等待 30s+，观察盘中估值列在交易时段会变化（非交易时段不变即可）
3. 点进详情 → 切换范围 → 图表更新
4. 移除 → 看板消失

- [ ] **Step 4: README**

`README.md`：

```markdown
# domino

本地基金净值看板（第一期）。技术栈：Next.js + TypeScript + better-sqlite3。

## 开发

\`\`\`bash
volta run yarn install
volta run yarn db:migrate
volta run yarn dev
\`\`\`

打开 http://localhost:3000

## 命令

- \`yarn dev\` 开发服务器
- \`yarn build\` / \`yarn start\` 生产构建/运行
- \`yarn test\` Vitest
- \`yarn lint\` / \`yarn lint:fix\`
- \`yarn typecheck\`
- \`yarn db:migrate\` 应用 SQLite 迁移

## 数据

数据存于 `data/funds.db`（已 gitignore）。
数据来源：天天基金公开接口（非官方，可能变化）。

## 后续规划

见 `docs/superpowers/specs/2026-05-17-fund-tracker-design.md`。
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: README + 第一期收尾"
```
