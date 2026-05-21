# 持仓管理（交易记账 + PnL）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有看板基础上引入「组合 portfolio」一等公民概念、买入/卖出交易记账、WAC 平均成本与已实现/未实现 PnL，并在看板卡片与详情页提供交互入口。

**Architecture:** Schema 通过 migration v3 推进；`transactions` 是唯一事实来源，持仓汇总由 `lib/domain/holdings.ts` 纯函数从交易实时算出（不物化 holdings 表）。API 沿用 Next.js App Router + zod 校验 + better-sqlite3 模式。UI 顶部加 PortfolioSwitcher 控件，URL `?portfolio=` 跨页同步；卡片底部 `HoldingsBlock` 显示持仓概要 + 买/卖按钮；详情页加持仓 KPI、默认费率编辑、交易记录三个 section。

**Tech Stack:** Next.js 14 App Router · better-sqlite3 · zod · Tailwind · vitest

**Spec:** `docs/superpowers/specs/2026-05-21-holdings-management-design.md`

---

## 文件结构与职责

| 路径 | 职责 |
|------|------|
| `lib/db/migrate.ts` | **修改**：MIGRATIONS 数组追加第 3 项（portfolios / transactions / fund_fee_config 三表 + seed「主账本」） |
| `lib/db/queries.ts` | **修改**：新增 portfolio / transaction / fee-config CRUD + `summarizeHoldings` 跨表汇总 |
| `lib/domain/holdings.ts` | **新建**：WAC、PnL、组合汇总纯函数 |
| `lib/domain/tx-form.ts` | **新建**：交易表单"金额↔份额↔费用"派生公式 |
| `app/api/portfolios/route.ts` | **新建**：GET / POST |
| `app/api/portfolios/[id]/route.ts` | **新建**：PATCH / DELETE |
| `app/api/portfolios/[id]/transactions/route.ts` | **新建**：GET / POST |
| `app/api/transactions/[id]/route.ts` | **新建**：PATCH / DELETE |
| `app/api/funds/[code]/fee-config/route.ts` | **新建**：GET / PUT |
| `components/portfolio-switcher.tsx` | **新建**：药丸切换器 + `…` 菜单 + `⨁` 新建 popover |
| `components/transaction-modal.tsx` | **新建**：居中模态买/卖表单 |
| `components/holdings-block.tsx` | **新建**：卡片底部"份额/市值/浮盈"块 |
| `components/holdings-kpi-grid.tsx` | **新建**：详情页 KPI 网格 |
| `components/transaction-table.tsx` | **新建**：详情页交易记录表 + 行内编辑/删除 |
| `components/fee-config-editor.tsx` | **新建**：详情页默认费率小编辑器 |
| `components/fund-card.tsx` | **修改**：底部渲染 `HoldingsBlock` |
| `app/page.tsx` | **修改**：解析 `?portfolio=`，SSR 汇总持仓，渲染 PortfolioSwitcher |
| `app/funds/[code]/page.tsx` | **修改**：插入 PortfolioSwitcher + 持仓 KPI + 费率 + 交易表 |

---

## Task 1：Migration v3

**Files:**
- Modify: `lib/db/migrate.ts`
- Test: `tests/lib/db/migrate-v3.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/db/migrate-v3.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('migration v3', () => {
  it('user_version 升到 3', () => {
    const db = freshDb();
    expect(db.pragma('user_version', { simple: true })).toBe(3);
  });

  it('portfolios / transactions / fund_fee_config 三表存在', () => {
    const db = freshDb();
    const names = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['portfolios', 'transactions', 'fund_fee_config']),
    );
  });

  it('seed 出唯一一个「主账本」portfolio', () => {
    const db = freshDb();
    const rows = db.prepare(`SELECT id, name, is_simulated FROM portfolios`).all() as Array<{
      id: number;
      name: string;
      is_simulated: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('主账本');
    expect(rows[0].is_simulated).toBe(0);
  });

  it('transactions.portfolio_id 外键 ON DELETE CASCADE', () => {
    const db = freshDb();
    db.exec(`
      INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL, 0);
      INSERT INTO transactions(portfolio_id, code, trade_date, side, shares, unit_nav, fee, created_at)
      VALUES (1,'000001','2026-05-01','BUY',100,1.0,0,0);
    `);
    db.exec(`DELETE FROM portfolios WHERE id = 1`);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM transactions`).get() as { n: number }).n;
    expect(n).toBe(0);
  });

  it('transactions.side 仅允许 BUY/SELL', () => {
    const db = freshDb();
    db.exec(`INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL,0)`);
    expect(() =>
      db.exec(
        `INSERT INTO transactions(portfolio_id,code,trade_date,side,shares,unit_nav,fee,created_at) VALUES (1,'000001','2026-05-01','HOLD',1,1,0,0)`,
      ),
    ).toThrow();
  });

  it('idempotent：跑两次不报错', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM portfolios`).get() as { n: number }).n,
    ).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL（v3 不存在）**

Run: `yarn vitest run tests/lib/db/migrate-v3.test.ts`
Expected: 多个 FAIL（`user_version` 是 2，缺表）

- [ ] **Step 3: 追加 migration v3 到 `lib/db/migrate.ts`**

把第 3 个迁移加到 `MIGRATIONS` 数组：

```ts
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS portfolios (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL UNIQUE,
        is_simulated  INTEGER NOT NULL DEFAULT 0,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id  INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
        code          TEXT    NOT NULL,
        trade_date    TEXT    NOT NULL,
        side          TEXT    NOT NULL CHECK (side IN ('BUY','SELL')),
        shares        REAL    NOT NULL,
        unit_nav      REAL    NOT NULL,
        fee           REAL    NOT NULL DEFAULT 0,
        note          TEXT,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tx_portfolio_code_date
        ON transactions(portfolio_id, code, trade_date);

      CREATE TABLE IF NOT EXISTS fund_fee_config (
        code            TEXT PRIMARY KEY,
        buy_fee_rate    REAL,
        sell_fee_rate   REAL,
        updated_at      INTEGER NOT NULL
      );

      INSERT INTO portfolios (name, is_simulated, sort_order, created_at)
      SELECT '主账本', 0, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
      WHERE NOT EXISTS (SELECT 1 FROM portfolios);
    `);
  },
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/lib/db/migrate-v3.test.ts`
Expected: 6 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrate.ts tests/lib/db/migrate-v3.test.ts
git commit -m "feat(db): migration v3 — portfolios/transactions/fund_fee_config + seed 主账本"
```

---

## Task 2：`lib/domain/holdings.ts` 纯函数

**Files:**
- Create: `lib/domain/holdings.ts`
- Test: `tests/lib/domain/holdings.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/domain/holdings.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { computeFundSummary, type TxLite, type FundSummary } from '@/lib/domain/holdings';

function tx(
  side: 'BUY' | 'SELL',
  shares: number,
  unit_nav: number,
  fee = 0,
  trade_date = '2026-05-01',
): TxLite {
  return { side, shares, unit_nav, fee, trade_date };
}

describe('computeFundSummary', () => {
  it('单笔买入：avg_cost 含买入费', () => {
    const s = computeFundSummary([tx('BUY', 100, 1.0, 1)], 1.5);
    expect(s.shares).toBeCloseTo(100);
    expect(s.cost_buy).toBeCloseTo(101); // 100*1 + 1
    expect(s.avg_cost).toBeCloseTo(1.01);
    expect(s.mkt_value).toBeCloseTo(150);
    expect(s.unrealized_pnl).toBeCloseTo(49); // 150 - 100*1.01
    expect(s.realized_pnl).toBeCloseTo(0);
    expect(s.total_pnl).toBeCloseTo(49);
    expect(s.return_pct!).toBeCloseTo(49 / 101);
  });

  it('多笔买入：WAC = cost_buy / shares_bought', () => {
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0, 0), tx('BUY', 200, 1.3, 0)],
      1.4,
    );
    expect(s.shares).toBeCloseTo(300);
    expect(s.avg_cost).toBeCloseTo((100 * 1.0 + 200 * 1.3) / 300);
  });

  it('买卖混合：avg_cost 不被卖出影响、realized_pnl 用同一个 avg_cost', () => {
    // 买 100 @1.0 (fee 0), 买 100 @1.2 (fee 0) → avg=1.1
    // 卖 50 @1.5 (fee 0) → realized = (1.5-1.1)*50 = 20
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0), tx('BUY', 100, 1.2), tx('SELL', 50, 1.5)],
      1.6,
    );
    expect(s.shares).toBeCloseTo(150);
    expect(s.avg_cost).toBeCloseTo(1.1);
    expect(s.realized_pnl).toBeCloseTo(20);
    expect(s.unrealized_pnl).toBeCloseTo(150 * 1.6 - 150 * 1.1);
  });

  it('清仓后再买：avg_cost 重算（注：WAC 只看买入序列，仍包含历史买入）', () => {
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0), tx('SELL', 100, 1.5), tx('BUY', 100, 2.0)],
      2.1,
    );
    expect(s.shares).toBeCloseTo(100);
    expect(s.avg_cost).toBeCloseTo((100 + 200) / 200); // 1.5：历史买入累计
    expect(s.realized_pnl).toBeCloseTo((1.5 - 1.5) * 100); // = 0；卖出价1.5，avg=1.5
  });

  it('已清仓但仍显示已实现 PnL', () => {
    const s = computeFundSummary([tx('BUY', 100, 1.0), tx('SELL', 100, 1.3)], 1.4);
    expect(s.shares).toBeCloseTo(0);
    expect(s.realized_pnl).toBeCloseTo(30);
    expect(s.unrealized_pnl).toBeCloseTo(0);
    expect(s.mkt_value).toBeCloseTo(0);
  });

  it('latest_unit_nav 为 null 时 mkt_value / unrealized_pnl 为 null', () => {
    const s = computeFundSummary([tx('BUY', 100, 1.0)], null);
    expect(s.mkt_value).toBeNull();
    expect(s.unrealized_pnl).toBeNull();
    expect(s.total_pnl).toBeNull();
  });

  it('shares_bought == 0 时 avg_cost 为 null', () => {
    const s = computeFundSummary([], 1.0);
    expect(s.shares).toBe(0);
    expect(s.avg_cost).toBeNull();
    expect(s.return_pct).toBeNull();
  });

  it('赎回费扣除：proceeds_sell 减 fee', () => {
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0, 0), tx('SELL', 50, 1.5, 5)], // proceeds = 50*1.5 - 5 = 70
      1.6,
    );
    expect(s.proceeds_sell).toBeCloseTo(70);
    expect(s.realized_pnl).toBeCloseTo(70 - 50 * 1.0); // = 20
  });
});

describe('aggregateAcrossFunds', () => {
  it('多基金汇总：mkt_value / cost_buy / pnl 累加；return_pct = Σpnl/Σcost', async () => {
    const { aggregateAcrossFunds } = await import('@/lib/domain/holdings');
    const a: FundSummary = {
      shares: 100,
      shares_bought: 100,
      shares_sold: 0,
      cost_buy: 100,
      proceeds_sell: 0,
      avg_cost: 1.0,
      remaining_cost: 100,
      mkt_value: 150,
      unrealized_pnl: 50,
      realized_pnl: 0,
      total_pnl: 50,
      return_pct: 0.5,
    };
    const b: FundSummary = { ...a, cost_buy: 200, mkt_value: 180, unrealized_pnl: -20, total_pnl: -20, return_pct: -0.1, remaining_cost: 200 };
    const agg = aggregateAcrossFunds([a, b]);
    expect(agg.total_cost).toBeCloseTo(300);
    expect(agg.total_market).toBeCloseTo(330);
    expect(agg.total_pnl).toBeCloseTo(30);
    expect(agg.return_pct!).toBeCloseTo(30 / 300);
  });

  it('某 fund mkt_value 为 null 时 total_market 也为 null（数据未完整）', async () => {
    const { aggregateAcrossFunds } = await import('@/lib/domain/holdings');
    const a: FundSummary = {
      shares: 100, shares_bought: 100, shares_sold: 0,
      cost_buy: 100, proceeds_sell: 0,
      avg_cost: 1.0, remaining_cost: 100,
      mkt_value: null, unrealized_pnl: null, realized_pnl: 0,
      total_pnl: null, return_pct: null,
    };
    const agg = aggregateAcrossFunds([a]);
    expect(agg.total_market).toBeNull();
    expect(agg.total_pnl).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/lib/domain/holdings.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/domain/holdings.ts`**

```ts
export interface TxLite {
  side: 'BUY' | 'SELL';
  shares: number;
  unit_nav: number;
  fee: number;
  trade_date: string;
}

export interface FundSummary {
  shares: number;
  shares_bought: number;
  shares_sold: number;
  cost_buy: number;
  proceeds_sell: number;
  avg_cost: number | null;
  remaining_cost: number;
  mkt_value: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number;
  total_pnl: number | null;
  return_pct: number | null;
}

export interface PortfolioAggregate {
  total_cost: number;
  total_market: number | null;
  total_realized: number;
  total_unrealized: number | null;
  total_pnl: number | null;
  return_pct: number | null;
}

export function computeFundSummary(
  txs: ReadonlyArray<TxLite>,
  latest_unit_nav: number | null,
): FundSummary {
  let shares_bought = 0;
  let shares_sold = 0;
  let cost_buy = 0;
  let proceeds_sell = 0;
  for (const t of txs) {
    if (t.side === 'BUY') {
      shares_bought += t.shares;
      cost_buy += t.shares * t.unit_nav + t.fee;
    } else {
      shares_sold += t.shares;
      proceeds_sell += t.shares * t.unit_nav - t.fee;
    }
  }
  const shares = shares_bought - shares_sold;
  const avg_cost = shares_bought > 0 ? cost_buy / shares_bought : null;
  const remaining_cost = avg_cost != null ? shares * avg_cost : 0;
  const mkt_value = latest_unit_nav != null ? shares * latest_unit_nav : null;
  const unrealized_pnl = mkt_value != null ? mkt_value - remaining_cost : null;
  const realized_pnl = avg_cost != null ? proceeds_sell - shares_sold * avg_cost : 0;
  const total_pnl = unrealized_pnl != null ? unrealized_pnl + realized_pnl : null;
  const return_pct = total_pnl != null && cost_buy > 0 ? total_pnl / cost_buy : null;

  return {
    shares,
    shares_bought,
    shares_sold,
    cost_buy,
    proceeds_sell,
    avg_cost,
    remaining_cost,
    mkt_value,
    unrealized_pnl,
    realized_pnl,
    total_pnl,
    return_pct,
  };
}

export function aggregateAcrossFunds(
  summaries: ReadonlyArray<FundSummary>,
): PortfolioAggregate {
  let total_cost = 0;
  let total_market: number | null = 0;
  let total_realized = 0;
  let total_unrealized: number | null = 0;
  for (const s of summaries) {
    total_cost += s.cost_buy;
    total_realized += s.realized_pnl;
    if (s.mkt_value == null) total_market = null;
    else if (total_market != null) total_market += s.mkt_value;
    if (s.unrealized_pnl == null) total_unrealized = null;
    else if (total_unrealized != null) total_unrealized += s.unrealized_pnl;
  }
  const total_pnl =
    total_unrealized == null ? null : total_unrealized + total_realized;
  const return_pct =
    total_pnl != null && total_cost > 0 ? total_pnl / total_cost : null;
  return { total_cost, total_market, total_realized, total_unrealized, total_pnl, return_pct };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/lib/domain/holdings.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add lib/domain/holdings.ts tests/lib/domain/holdings.test.ts
git commit -m "feat(domain): holdings.ts — WAC / PnL 纯函数"
```

---

## Task 3：`lib/domain/tx-form.ts` 表单派生公式

**Files:**
- Create: `lib/domain/tx-form.ts`
- Test: `tests/lib/domain/tx-form.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/domain/tx-form.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { deriveBuyForm, deriveSellForm } from '@/lib/domain/tx-form';

describe('deriveBuyForm', () => {
  it('给金额，按费率算费，再算份额', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 1.25, buy_fee_rate: 0.0015 });
    expect(r.fee).toBeCloseTo(1.5);
    expect(r.shares).toBeCloseTo((1000 - 1.5) / 1.25);
  });

  it('给金额 + 手填费用（覆盖）', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 1.25, fee: 2.0 });
    expect(r.fee).toBe(2.0);
    expect(r.shares).toBeCloseTo((1000 - 2) / 1.25);
  });

  it('rate 为 null/undefined → fee = 0', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 1.25, buy_fee_rate: null });
    expect(r.fee).toBe(0);
    expect(r.shares).toBeCloseTo(1000 / 1.25);
  });

  it('unit_nav 为 0 / NaN → shares = null', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 0, buy_fee_rate: 0 });
    expect(r.shares).toBeNull();
  });
});

describe('deriveSellForm', () => {
  it('给份额，按费率算费，再算回款', () => {
    const r = deriveSellForm({ shares: 500, unit_nav: 1.5, sell_fee_rate: 0.005 });
    expect(r.fee).toBeCloseTo(500 * 1.5 * 0.005); // = 3.75
    expect(r.amount).toBeCloseTo(500 * 1.5 - 3.75);
  });

  it('给份额 + 手填费用', () => {
    const r = deriveSellForm({ shares: 500, unit_nav: 1.5, fee: 1.0 });
    expect(r.fee).toBe(1.0);
    expect(r.amount).toBeCloseTo(500 * 1.5 - 1.0);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/lib/domain/tx-form.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/domain/tx-form.ts`**

```ts
export interface BuyFormInput {
  amount: number;
  unit_nav: number;
  buy_fee_rate?: number | null;
  fee?: number; // 手填则覆盖费率
}
export interface BuyFormDerived {
  fee: number;
  shares: number | null;
}
export function deriveBuyForm(i: BuyFormInput): BuyFormDerived {
  const fee = i.fee != null ? i.fee : i.amount * (i.buy_fee_rate ?? 0);
  if (!Number.isFinite(i.unit_nav) || i.unit_nav <= 0) return { fee, shares: null };
  const shares = (i.amount - fee) / i.unit_nav;
  return { fee, shares };
}

export interface SellFormInput {
  shares: number;
  unit_nav: number;
  sell_fee_rate?: number | null;
  fee?: number;
}
export interface SellFormDerived {
  fee: number;
  amount: number;
}
export function deriveSellForm(i: SellFormInput): SellFormDerived {
  const gross = i.shares * i.unit_nav;
  const fee = i.fee != null ? i.fee : gross * (i.sell_fee_rate ?? 0);
  return { fee, amount: gross - fee };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/lib/domain/tx-form.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tx-form.ts tests/lib/domain/tx-form.test.ts
git commit -m "feat(domain): tx-form.ts — 买入/卖出表单派生公式"
```

---

## Task 4：queries — portfolios CRUD

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `tests/lib/db/queries-portfolios.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/db/queries-portfolios.test.ts`：

```ts
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

describe('portfolios CRUD', () => {
  it('migration 后 listPortfolios 返回 [主账本]', () => {
    const q = createQueries(freshDb());
    const list = q.listPortfolios();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('主账本');
    expect(list[0].is_simulated).toBe(false);
  });

  it('createPortfolio 成功 + 重名抛 UNIQUE', () => {
    const q = createQueries(freshDb());
    const p = q.createPortfolio({ name: '模拟·A', is_simulated: true });
    expect(p.id).toBeGreaterThan(1);
    expect(p.is_simulated).toBe(true);
    expect(() => q.createPortfolio({ name: '模拟·A', is_simulated: false })).toThrow(/UNIQUE/i);
  });

  it('updatePortfolio 只更新提供字段', () => {
    const q = createQueries(freshDb());
    const p = q.createPortfolio({ name: 'X', is_simulated: false });
    q.updatePortfolio(p.id, { is_simulated: true });
    expect(q.getPortfolio(p.id)?.is_simulated).toBe(true);
    expect(q.getPortfolio(p.id)?.name).toBe('X');
    q.updatePortfolio(p.id, { name: 'Y' });
    expect(q.getPortfolio(p.id)?.name).toBe('Y');
  });

  it('deletePortfolio CASCADE 删交易', () => {
    const db = freshDb();
    const q = createQueries(db);
    q.upsertMeta({ code: '000001', name: 'X', type: null });
    const p = q.createPortfolio({ name: 'A', is_simulated: false });
    q.insertTransaction({
      portfolio_id: p.id, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.deletePortfolio(p.id);
    expect(q.getPortfolio(p.id)).toBeNull();
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM transactions`).get() as { n: number }).n;
    expect(n).toBe(0);
  });

  it('countPortfolios', () => {
    const q = createQueries(freshDb());
    expect(q.countPortfolios()).toBe(1);
    q.createPortfolio({ name: 'B', is_simulated: false });
    expect(q.countPortfolios()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/lib/db/queries-portfolios.test.ts`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现 queries 增量**

`lib/db/queries.ts` 顶部添加类型：

```ts
export interface PortfolioRow {
  id: number;
  name: string;
  is_simulated: boolean;
  sort_order: number;
  created_at: number;
}
```

在 `createQueries(db)` 内部添加 statements 和导出方法（插入到 return 对象里）：

```ts
  const insertPortfolioStmt = db.prepare(
    `INSERT INTO portfolios (name, is_simulated, sort_order, created_at) VALUES (?, ?, ?, ?)`,
  );
  const updatePortfolioNameStmt = db.prepare(`UPDATE portfolios SET name = ? WHERE id = ?`);
  const updatePortfolioSimStmt = db.prepare(
    `UPDATE portfolios SET is_simulated = ? WHERE id = ?`,
  );
  const deletePortfolioStmt = db.prepare(`DELETE FROM portfolios WHERE id = ?`);
  const getPortfolioStmt = db.prepare(
    `SELECT id, name, is_simulated, sort_order, created_at FROM portfolios WHERE id = ?`,
  );
  const listPortfoliosStmt = db.prepare(
    `SELECT id, name, is_simulated, sort_order, created_at FROM portfolios
     ORDER BY sort_order ASC, created_at ASC`,
  );
  const countPortfoliosStmt = db.prepare(`SELECT COUNT(*) AS n FROM portfolios`);

  function rowToPortfolio(r: {
    id: number; name: string; is_simulated: number; sort_order: number; created_at: number;
  }): PortfolioRow {
    return { ...r, is_simulated: r.is_simulated === 1 };
  }
```

return 对象内追加：

```ts
    listPortfolios(): PortfolioRow[] {
      return (listPortfoliosStmt.all() as Array<{
        id: number; name: string; is_simulated: number; sort_order: number; created_at: number;
      }>).map(rowToPortfolio);
    },
    getPortfolio(id: number): PortfolioRow | null {
      const row = getPortfolioStmt.get(id) as
        | { id: number; name: string; is_simulated: number; sort_order: number; created_at: number; }
        | undefined;
      return row ? rowToPortfolio(row) : null;
    },
    countPortfolios(): number {
      return (countPortfoliosStmt.get() as { n: number }).n;
    },
    createPortfolio(input: { name: string; is_simulated: boolean }): PortfolioRow {
      const { n } = countPortfoliosStmt.get() as { n: number };
      const result = insertPortfolioStmt.run(
        input.name, input.is_simulated ? 1 : 0, n, Date.now(),
      );
      const id = Number(result.lastInsertRowid);
      return rowToPortfolio({
        id, name: input.name, is_simulated: input.is_simulated ? 1 : 0,
        sort_order: n, created_at: Date.now(),
      });
    },
    updatePortfolio(id: number, patch: { name?: string; is_simulated?: boolean }): void {
      if (patch.name !== undefined) updatePortfolioNameStmt.run(patch.name, id);
      if (patch.is_simulated !== undefined)
        updatePortfolioSimStmt.run(patch.is_simulated ? 1 : 0, id);
    },
    deletePortfolio(id: number): void {
      deletePortfolioStmt.run(id);
    },
```

注意：本步同时要实现 `insertTransaction`（测试用例引用了），但完整 transactions CRUD 放到 Task 5；这里**仅**写一个最小可用的 `insertTransaction` 让测试跑过（不含校验，只插入），形如：

```ts
  const insertTransactionStmt = db.prepare(`
    INSERT INTO transactions (portfolio_id, code, trade_date, side, shares, unit_nav, fee, note, created_at)
    VALUES (@portfolio_id, @code, @trade_date, @side, @shares, @unit_nav, @fee, @note, @created_at)
  `);
```

```ts
    insertTransaction(input: {
      portfolio_id: number; code: string; trade_date: string;
      side: 'BUY' | 'SELL'; shares: number; unit_nav: number; fee: number; note: string | null;
    }): number {
      const r = insertTransactionStmt.run({ ...input, created_at: Date.now() });
      return Number(r.lastInsertRowid);
    },
```

(Task 5 会重写它加上事务化超卖校验。)

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/lib/db/queries-portfolios.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts tests/lib/db/queries-portfolios.test.ts
git commit -m "feat(db): portfolios CRUD queries"
```

---

## Task 5：queries — transactions CRUD（含超卖校验）

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `tests/lib/db/queries-transactions.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/db/queries-transactions.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/db/migrate';
import { createQueries } from '@/lib/db/queries';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  const q = createQueries(db);
  q.upsertMeta({ code: '000001', name: 'X', type: null });
  return { db, q, portfolioId: 1 };
}

describe('transactions CRUD', () => {
  it('insertTransaction 写入成功并能列出', () => {
    const { q, portfolioId } = setup();
    const id = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0.5, note: 'init',
    });
    expect(id).toBeGreaterThan(0);
    const list = q.listTransactions(portfolioId, '000001');
    expect(list).toHaveLength(1);
    expect(list[0].shares).toBe(100);
    expect(list[0].fee).toBeCloseTo(0.5);
    expect(list[0].note).toBe('init');
  });

  it('卖出超卖：写入前校验拒绝', () => {
    const { q, portfolioId } = setup();
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    expect(() =>
      q.insertTransaction({
        portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-02',
        side: 'SELL', shares: 101, unit_nav: 1.5, fee: 0, note: null,
      }),
    ).toThrow(/oversell/i);
  });

  it('编辑后致超卖：抛错并回滚', () => {
    const { q, db, portfolioId } = setup();
    const buyId = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-02',
      side: 'SELL', shares: 50, unit_nav: 1.5, fee: 0, note: null,
    });
    expect(() => q.updateTransaction(buyId, { shares: 40 })).toThrow(/oversell/i);
    // 验证回滚：buyId 的 shares 仍是 100
    const row = db.prepare(`SELECT shares FROM transactions WHERE id = ?`).get(buyId) as { shares: number };
    expect(row.shares).toBe(100);
  });

  it('删除最后一笔买入致超卖：拒绝', () => {
    const { q, portfolioId } = setup();
    const buyId = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-02',
      side: 'SELL', shares: 50, unit_nav: 1.5, fee: 0, note: null,
    });
    expect(() => q.deleteTransaction(buyId)).toThrow(/oversell/i);
  });

  it('getTransaction / deleteTransaction 正常路径', () => {
    const { q, portfolioId } = setup();
    const id = q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    expect(q.getTransaction(id)?.id).toBe(id);
    q.deleteTransaction(id);
    expect(q.getTransaction(id)).toBeNull();
  });

  it('listTransactions(portfolioId) 不传 code 列出整个组合', () => {
    const { q, portfolioId } = setup();
    q.upsertMeta({ code: '000002', name: 'Y', type: null });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: portfolioId, code: '000002', trade_date: '2026-05-01',
      side: 'BUY', shares: 50, unit_nav: 2.0, fee: 0, note: null,
    });
    expect(q.listTransactions(portfolioId)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/lib/db/queries-transactions.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 transactions CRUD**

替换 Task 4 中临时的 `insertTransactionStmt` 实现 + 在 queries 中追加：

```ts
  const updateTxFieldsStmt = db.prepare(`
    UPDATE transactions
       SET trade_date = COALESCE(@trade_date, trade_date),
           shares    = COALESCE(@shares, shares),
           unit_nav  = COALESCE(@unit_nav, unit_nav),
           fee       = COALESCE(@fee, fee),
           note      = COALESCE(@note, note)
     WHERE id = @id
  `);
  const deleteTxStmt = db.prepare(`DELETE FROM transactions WHERE id = ?`);
  const getTxStmt = db.prepare(`
    SELECT id, portfolio_id, code, trade_date, side, shares, unit_nav, fee, note, created_at
    FROM transactions WHERE id = ?
  `);
  const listTxByPortfolioCodeStmt = db.prepare(`
    SELECT id, portfolio_id, code, trade_date, side, shares, unit_nav, fee, note, created_at
    FROM transactions WHERE portfolio_id = ? AND code = ?
    ORDER BY trade_date ASC, id ASC
  `);
  const listTxByPortfolioStmt = db.prepare(`
    SELECT id, portfolio_id, code, trade_date, side, shares, unit_nav, fee, note, created_at
    FROM transactions WHERE portfolio_id = ?
    ORDER BY trade_date ASC, id ASC
  `);
  const sumByPortfolioCodeStmt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN side='BUY'  THEN shares ELSE 0 END),0) AS bought,
      COALESCE(SUM(CASE WHEN side='SELL' THEN shares ELSE 0 END),0) AS sold
    FROM transactions WHERE portfolio_id = ? AND code = ?
  `);

  function assertNoOversell(portfolioId: number, code: string) {
    const { bought, sold } = sumByPortfolioCodeStmt.get(portfolioId, code) as {
      bought: number; sold: number;
    };
    // 浮点容差：份额一般 ≤ 6 位小数
    if (bought + 1e-9 < sold) throw new Error('oversell');
  }
```

新增/替换 return 对象中的方法：

```ts
    insertTransaction(input: {
      portfolio_id: number; code: string; trade_date: string;
      side: 'BUY' | 'SELL'; shares: number; unit_nav: number; fee: number; note: string | null;
    }): number {
      return db.transaction((): number => {
        const r = insertTransactionStmt.run({ ...input, created_at: Date.now() });
        assertNoOversell(input.portfolio_id, input.code);
        return Number(r.lastInsertRowid);
      })();
    },
    updateTransaction(
      id: number,
      patch: { trade_date?: string; shares?: number; unit_nav?: number; fee?: number; note?: string | null },
    ): void {
      db.transaction(() => {
        const before = getTxStmt.get(id) as { portfolio_id: number; code: string } | undefined;
        if (!before) throw new Error('not_found');
        updateTxFieldsStmt.run({
          id,
          trade_date: patch.trade_date ?? null,
          shares: patch.shares ?? null,
          unit_nav: patch.unit_nav ?? null,
          fee: patch.fee ?? null,
          note: patch.note ?? null,
        });
        assertNoOversell(before.portfolio_id, before.code);
      })();
    },
    deleteTransaction(id: number): void {
      db.transaction(() => {
        const before = getTxStmt.get(id) as { portfolio_id: number; code: string } | undefined;
        if (!before) return;
        deleteTxStmt.run(id);
        assertNoOversell(before.portfolio_id, before.code);
      })();
    },
    getTransaction(id: number): TxRow | null {
      const r = getTxStmt.get(id) as TxRow | undefined;
      return r ?? null;
    },
    listTransactions(portfolioId: number, code?: string): TxRow[] {
      return (code
        ? listTxByPortfolioCodeStmt.all(portfolioId, code)
        : listTxByPortfolioStmt.all(portfolioId)) as TxRow[];
    },
```

并在文件顶部 `interface TxRow`：

```ts
export interface TxRow {
  id: number;
  portfolio_id: number;
  code: string;
  trade_date: string;
  side: 'BUY' | 'SELL';
  shares: number;
  unit_nav: number;
  fee: number;
  note: string | null;
  created_at: number;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/lib/db/queries-transactions.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts tests/lib/db/queries-transactions.test.ts
git commit -m "feat(db): transactions CRUD with oversell guard"
```

---

## Task 6：queries — fee-config + 跨表汇总

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `tests/lib/db/queries-fee-config.test.ts`

- [ ] **Step 1: 写测试**

`tests/lib/db/queries-fee-config.test.ts`：

```ts
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

describe('fund_fee_config', () => {
  it('未配置时 getFeeConfig 返回 null', () => {
    const q = createQueries(freshDb());
    expect(q.getFeeConfig('000001')).toBeNull();
  });

  it('upsertFeeConfig 写入再读取', () => {
    const q = createQueries(freshDb());
    q.upsertFeeConfig('000001', { buy_fee_rate: 0.0015, sell_fee_rate: 0.005 });
    const c = q.getFeeConfig('000001');
    expect(c?.buy_fee_rate).toBeCloseTo(0.0015);
    expect(c?.sell_fee_rate).toBeCloseTo(0.005);
  });

  it('upsertFeeConfig 只更新提供的字段', () => {
    const q = createQueries(freshDb());
    q.upsertFeeConfig('000001', { buy_fee_rate: 0.0015, sell_fee_rate: 0.005 });
    q.upsertFeeConfig('000001', { sell_fee_rate: 0.0 });
    const c = q.getFeeConfig('000001');
    expect(c?.buy_fee_rate).toBeCloseTo(0.0015);
    expect(c?.sell_fee_rate).toBe(0);
  });
});

describe('listTransactionsForCodes', () => {
  it('按 portfolio_id + 多 code 一次拉回，方便看板批量', () => {
    const db = freshDb();
    const q = createQueries(db);
    q.upsertMeta({ code: '000001', name: 'X', type: null });
    q.upsertMeta({ code: '000002', name: 'Y', type: null });
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: 1, code: '000002', trade_date: '2026-05-01',
      side: 'BUY', shares: 20, unit_nav: 2, fee: 0, note: null,
    });
    const map = q.listTransactionsForCodes(1, ['000001', '000002']);
    expect(map.get('000001')?.length).toBe(1);
    expect(map.get('000002')?.length).toBe(1);
  });

  it('portfolioId 传 null 时返回所有组合', () => {
    const db = freshDb();
    const q = createQueries(db);
    q.upsertMeta({ code: '000001', name: 'X', type: null });
    const p2 = q.createPortfolio({ name: '模拟', is_simulated: true });
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1, fee: 0, note: null,
    });
    q.insertTransaction({
      portfolio_id: p2.id, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 5, unit_nav: 2, fee: 0, note: null,
    });
    const all = q.listTransactionsForCodes(null, ['000001']).get('000001')!;
    expect(all.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/lib/db/queries-fee-config.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 fee-config + listTransactionsForCodes**

`lib/db/queries.ts` 添加类型 + statements + 方法：

```ts
export interface FeeConfigRow {
  code: string;
  buy_fee_rate: number | null;
  sell_fee_rate: number | null;
  updated_at: number;
}
```

```ts
  const getFeeConfigStmt = db.prepare(
    `SELECT code, buy_fee_rate, sell_fee_rate, updated_at FROM fund_fee_config WHERE code = ?`,
  );
  const upsertFeeConfigStmt = db.prepare(`
    INSERT INTO fund_fee_config (code, buy_fee_rate, sell_fee_rate, updated_at)
    VALUES (@code, @buy, @sell, @ts)
    ON CONFLICT(code) DO UPDATE SET
      buy_fee_rate  = COALESCE(@buy,  buy_fee_rate),
      sell_fee_rate = COALESCE(@sell, sell_fee_rate),
      updated_at    = @ts
  `);
```

return 对象追加：

```ts
    getFeeConfig(code: string): FeeConfigRow | null {
      return (getFeeConfigStmt.get(code) as FeeConfigRow | undefined) ?? null;
    },
    upsertFeeConfig(
      code: string,
      patch: { buy_fee_rate?: number | null; sell_fee_rate?: number | null },
    ): void {
      upsertFeeConfigStmt.run({
        code,
        buy: patch.buy_fee_rate ?? null,
        sell: patch.sell_fee_rate ?? null,
        ts: Date.now(),
      });
    },
    listTransactionsForCodes(
      portfolioId: number | null,
      codes: string[],
    ): Map<string, TxRow[]> {
      const result = new Map<string, TxRow[]>();
      for (const c of codes) result.set(c, []);
      if (codes.length === 0) return result;
      const placeholders = codes.map(() => '?').join(',');
      const sql = portfolioId == null
        ? `SELECT * FROM transactions WHERE code IN (${placeholders}) ORDER BY trade_date ASC, id ASC`
        : `SELECT * FROM transactions WHERE portfolio_id = ? AND code IN (${placeholders}) ORDER BY trade_date ASC, id ASC`;
      const stmt = db.prepare(sql);
      const rows = (portfolioId == null
        ? stmt.all(...codes)
        : stmt.all(portfolioId, ...codes)) as TxRow[];
      for (const r of rows) result.get(r.code)!.push(r);
      return result;
    },
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/lib/db/queries-fee-config.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts tests/lib/db/queries-fee-config.test.ts
git commit -m "feat(db): fund_fee_config + batch tx loader"
```

---

## Task 7：API `/api/portfolios`（GET + POST）

**Files:**
- Create: `app/api/portfolios/route.ts`
- Test: `tests/api/portfolios.test.ts`

- [ ] **Step 1: 写测试**

`tests/api/portfolios.test.ts`：

```ts
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
import { GET, POST } from '@/app/api/portfolios/route';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (name, is_simulated, sort_order, created_at) VALUES ('主账本',0,0,0)`);
});

function reqJson(body: unknown) {
  return new Request('http://x/api/portfolios', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('GET /api/portfolios', () => {
  it('返回 items 含 summary（空组合时 summary 全为 0）', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('主账本');
    expect(body.items[0].summary.total_cost).toBe(0);
    expect(body.items[0].summary.total_market).toBe(0);
  });
});

describe('POST /api/portfolios', () => {
  it('合法参数返回 201', async () => {
    const res = await POST(reqJson({ name: '模拟·A', is_simulated: true }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('模拟·A');
    expect(body.is_simulated).toBe(true);
  });
  it('name 为空 400', async () => {
    const res = await POST(reqJson({ name: '', is_simulated: false }));
    expect(res.status).toBe(400);
  });
  it('重名 409', async () => {
    await POST(reqJson({ name: 'A', is_simulated: false }));
    const res = await POST(reqJson({ name: 'A', is_simulated: false }));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/api/portfolios.test.ts`
Expected: FAIL（route 不存在）

- [ ] **Step 3: 实现 route**

`app/api/portfolios/route.ts`：

```ts
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
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/api/portfolios.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add app/api/portfolios/route.ts tests/api/portfolios.test.ts
git commit -m "feat(api): /api/portfolios — list with summary + create"
```

---

## Task 8：API `/api/portfolios/[id]`（PATCH + DELETE）

**Files:**
- Create: `app/api/portfolios/[id]/route.ts`
- Test: `tests/api/portfolios-id.test.ts`

- [ ] **Step 1: 写测试**

`tests/api/portfolios-id.test.ts`：

```ts
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
import { PATCH, DELETE } from '@/app/api/portfolios/[id]/route';
import { createQueries } from '@/lib/db/queries';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (id,name,is_simulated,sort_order,created_at) VALUES (1,'主账本',0,0,0)`);
});

function patch(body: unknown) {
  return new Request('http://x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/portfolios/:id', () => {
  it('改名成功', async () => {
    const res = await PATCH(patch({ name: 'NewName' }), { params: { id: '1' } });
    expect(res.status).toBe(200);
    const q = createQueries(getDb());
    expect(q.getPortfolio(1)?.name).toBe('NewName');
  });

  it('不存在 404', async () => {
    const res = await PATCH(patch({ name: 'X' }), { params: { id: '999' } });
    expect(res.status).toBe(404);
  });

  it('重名 409', async () => {
    const q = createQueries(getDb());
    q.createPortfolio({ name: 'B', is_simulated: false });
    const res = await PATCH(patch({ name: '主账本' }), { params: { id: String(q.listPortfolios()[1].id) } });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/portfolios/:id', () => {
  it('删除非唯一 portfolio 成功', async () => {
    const q = createQueries(getDb());
    const p = q.createPortfolio({ name: 'B', is_simulated: false });
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(p.id) } });
    expect(res.status).toBe(204);
    expect(q.getPortfolio(p.id)).toBeNull();
  });

  it('唯一 portfolio 不可删 400', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: '1' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/api/portfolios-id.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 route**

`app/api/portfolios/[id]/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  is_simulated: z.boolean().optional(),
});

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let parsed;
  try { parsed = PatchBody.safeParse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getPortfolio(id) === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    q.updatePortfolio(id, parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    throw e;
  }
  return NextResponse.json(q.getPortfolio(id));
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getPortfolio(id) === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (q.countPortfolios() <= 1)
    return NextResponse.json({ error: 'last_portfolio' }, { status: 400 });

  q.deletePortfolio(id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/api/portfolios-id.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add app/api/portfolios/[id]/route.ts tests/api/portfolios-id.test.ts
git commit -m "feat(api): /api/portfolios/[id] — PATCH / DELETE"
```

---

## Task 9：API `/api/portfolios/[id]/transactions`（GET + POST）

**Files:**
- Create: `app/api/portfolios/[id]/transactions/route.ts`
- Test: `tests/api/portfolios-transactions.test.ts`

- [ ] **Step 1: 写测试**

```ts
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
import { GET, POST } from '@/app/api/portfolios/[id]/transactions/route';
import { createQueries } from '@/lib/db/queries';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (id,name,is_simulated,sort_order,created_at) VALUES (1,'主账本',0,0,0)`);
  db.exec(`INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL,0)`);
});

function postReq(body: unknown) {
  return new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/portfolios/:id/transactions', () => {
  it('合法买入 201', async () => {
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026-05-01', side: 'BUY', shares: 100, unit_nav: 1.0, fee: 1.5 }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(201);
  });

  it('超卖 400', async () => {
    const q = createQueries(getDb());
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1.0, fee: 0, note: null,
    });
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026-05-02', side: 'SELL', shares: 11, unit_nav: 1.5, fee: 0 }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('oversell');
  });

  it('portfolio 不存在 404', async () => {
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026-05-01', side: 'BUY', shares: 1, unit_nav: 1, fee: 0 }),
      { params: { id: '99' } },
    );
    expect(res.status).toBe(404);
  });

  it('日期格式 400', async () => {
    const res = await POST(
      postReq({ code: '000001', trade_date: '2026/05/01', side: 'BUY', shares: 1, unit_nav: 1, fee: 0 }),
      { params: { id: '1' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/portfolios/:id/transactions', () => {
  it('?code= 过滤', async () => {
    const q = createQueries(getDb());
    q.insertTransaction({
      portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
      side: 'BUY', shares: 10, unit_nav: 1.0, fee: 0, note: null,
    });
    const res = await GET(
      new Request('http://x/?code=000001'),
      { params: { id: '1' } },
    );
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/api/portfolios-transactions.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 route**

`app/api/portfolios/[id]/transactions/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({
  code: z.string().regex(/^\d{6}$/),
  trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  side: z.enum(['BUY', 'SELL']),
  shares: z.number().positive().finite(),
  unit_nav: z.number().positive().finite(),
  fee: z.number().min(0).finite().default(0),
  note: z.string().max(200).nullable().optional(),
});

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const q = createQueries(getDb());
  if (q.getPortfolio(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? undefined;
  return NextResponse.json({ items: q.listTransactions(id, code) });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let parsed;
  try { parsed = Body.safeParse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getPortfolio(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (q.getMeta(parsed.data.code) === null)
    return NextResponse.json({ error: 'fund_not_found' }, { status: 404 });

  try {
    const txId = q.insertTransaction({
      portfolio_id: id,
      code: parsed.data.code,
      trade_date: parsed.data.trade_date,
      side: parsed.data.side,
      shares: parsed.data.shares,
      unit_nav: parsed.data.unit_nav,
      fee: parsed.data.fee,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json(q.getTransaction(txId), { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/oversell/i.test(msg))
      return NextResponse.json({ error: 'oversell' }, { status: 400 });
    throw e;
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/api/portfolios-transactions.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add app/api/portfolios/[id]/transactions/route.ts tests/api/portfolios-transactions.test.ts
git commit -m "feat(api): /api/portfolios/[id]/transactions — list + create with oversell guard"
```

---

## Task 10：API `/api/transactions/[id]`（PATCH + DELETE）

**Files:**
- Create: `app/api/transactions/[id]/route.ts`
- Test: `tests/api/transactions-id.test.ts`

- [ ] **Step 1: 写测试**

```ts
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
import { PATCH, DELETE } from '@/app/api/transactions/[id]/route';
import { createQueries } from '@/lib/db/queries';

let buyId: number;
let sellId: number;

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM transactions; DELETE FROM portfolios; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO portfolios (id,name,is_simulated,sort_order,created_at) VALUES (1,'主账本',0,0,0)`);
  db.exec(`INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL,0)`);
  const q = createQueries(db);
  buyId = q.insertTransaction({
    portfolio_id: 1, code: '000001', trade_date: '2026-05-01',
    side: 'BUY', shares: 100, unit_nav: 1.0, fee: 0, note: null,
  });
  sellId = q.insertTransaction({
    portfolio_id: 1, code: '000001', trade_date: '2026-05-05',
    side: 'SELL', shares: 50, unit_nav: 1.5, fee: 0, note: null,
  });
});

function patch(body: unknown) {
  return new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('PATCH /api/transactions/:id', () => {
  it('改 shares 致超卖 → 400', async () => {
    const res = await PATCH(patch({ shares: 40 }), { params: { id: String(buyId) } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('oversell');
  });

  it('合法改 fee → 200', async () => {
    const res = await PATCH(patch({ fee: 2.0 }), { params: { id: String(buyId) } });
    expect(res.status).toBe(200);
  });

  it('side 字段不允许 PATCH → 400', async () => {
    const res = await PATCH(patch({ side: 'SELL' }), { params: { id: String(buyId) } });
    expect(res.status).toBe(400);
  });

  it('不存在 404', async () => {
    const res = await PATCH(patch({ fee: 1 }), { params: { id: '99999' } });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/transactions/:id', () => {
  it('删卖出 → 204', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(sellId) } });
    expect(res.status).toBe(204);
  });

  it('删买入致超卖 → 400', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: String(buyId) } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/api/transactions-id.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 route**

`app/api/transactions/[id]/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const PatchBody = z
  .object({
    trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    shares: z.number().positive().finite().optional(),
    unit_nav: z.number().positive().finite().optional(),
    fee: z.number().min(0).finite().optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .strict(); // 拒绝 side 等未列字段

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  let parsed;
  try { parsed = PatchBody.safeParse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getTransaction(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    q.updateTransaction(id, parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/oversell/i.test(msg))
      return NextResponse.json({ error: 'oversell' }, { status: 400 });
    throw e;
  }
  return NextResponse.json(q.getTransaction(id));
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const id = parseId(ctx.params.id);
  if (id === null) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getTransaction(id) === null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    q.deleteTransaction(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/oversell/i.test(msg))
      return NextResponse.json({ error: 'oversell' }, { status: 400 });
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/api/transactions-id.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add app/api/transactions/[id]/route.ts tests/api/transactions-id.test.ts
git commit -m "feat(api): /api/transactions/[id] — PATCH / DELETE with oversell guard"
```

---

## Task 11：API `/api/funds/[code]/fee-config`（GET + PUT）

**Files:**
- Create: `app/api/funds/[code]/fee-config/route.ts`
- Test: `tests/api/funds-fee-config.test.ts`

- [ ] **Step 1: 写测试**

```ts
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
import { GET, PUT } from '@/app/api/funds/[code]/fee-config/route';

beforeEach(() => {
  const db = getDb();
  db.exec(`DELETE FROM fund_fee_config; DELETE FROM fund_meta;`);
  db.exec(`INSERT INTO fund_meta(code,name,type,meta_updated_at) VALUES ('000001','X',NULL,0)`);
});

function put(body: unknown) {
  return new Request('http://x', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('fund fee-config API', () => {
  it('未配置 GET 404', async () => {
    const res = await GET(new Request('http://x'), { params: { code: '000001' } });
    expect(res.status).toBe(404);
  });

  it('PUT 写入再 GET', async () => {
    const r1 = await PUT(put({ buy_fee_rate: 0.0015, sell_fee_rate: 0.005 }), { params: { code: '000001' } });
    expect(r1.status).toBe(200);
    const r2 = await GET(new Request('http://x'), { params: { code: '000001' } });
    const body = await r2.json();
    expect(body.buy_fee_rate).toBeCloseTo(0.0015);
    expect(body.sell_fee_rate).toBeCloseTo(0.005);
  });

  it('code 不在 fund_meta → 404', async () => {
    const res = await PUT(put({ buy_fee_rate: 0.001 }), { params: { code: '999999' } });
    expect(res.status).toBe(404);
  });

  it('rate 非数字 → 400', async () => {
    const res = await PUT(put({ buy_fee_rate: 'a' }), { params: { code: '000001' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `yarn vitest run tests/api/funds-fee-config.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 route**

`app/api/funds/[code]/fee-config/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({
  buy_fee_rate: z.number().min(0).max(1).nullable().optional(),
  sell_fee_rate: z.number().min(0).max(1).nullable().optional(),
});

function parseCode(raw: string): string | null {
  return /^\d{6}$/.test(raw) ? raw : null;
}

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const code = parseCode(ctx.params.code);
  if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  const q = createQueries(getDb());
  const c = q.getFeeConfig(code);
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(c);
}

export async function PUT(req: Request, ctx: { params: { code: string } }) {
  const code = parseCode(ctx.params.code);
  if (!code) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });

  let parsed;
  try { parsed = Body.safeParse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const q = createQueries(getDb());
  if (q.getMeta(code) === null)
    return NextResponse.json({ error: 'fund_not_found' }, { status: 404 });

  q.upsertFeeConfig(code, parsed.data);
  return NextResponse.json(q.getFeeConfig(code));
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `yarn vitest run tests/api/funds-fee-config.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add app/api/funds/[code]/fee-config/route.ts tests/api/funds-fee-config.test.ts
git commit -m "feat(api): /api/funds/[code]/fee-config — get / put"
```

---

## Task 12：`PortfolioSwitcher` 组件

**Files:**
- Create: `components/portfolio-switcher.tsx`

- [ ] **Step 1: 写组件**

`components/portfolio-switcher.tsx`：

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface PortfolioOption {
  id: number;
  name: string;
  is_simulated: boolean;
}

export function PortfolioSwitcher({ items }: { items: PortfolioOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const current = params.get('portfolio') ?? 'all';
  const selected = items.find((p) => String(p.id) === current);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function navigate(portfolio: string) {
    const next = new URLSearchParams(params);
    next.set('portfolio', portfolio);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-400">组合</span>
      <button
        onClick={() => navigate('all')}
        className={pillClass(current === 'all', false)}
      >
        全部
      </button>
      {items.map((p) => (
        <button
          key={p.id}
          onClick={() => navigate(String(p.id))}
          className={pillClass(String(p.id) === current, p.is_simulated)}
        >
          {p.is_simulated ? '~' : ''}{p.name}
        </button>
      ))}
      <button
        onClick={() => setCreateOpen(true)}
        className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-zinc-500 hover:bg-zinc-50"
      >
        ⨁
      </button>

      {selected && (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full px-2 py-0.5 text-zinc-400 hover:bg-zinc-100"
          >
            …
          </button>
          {menuOpen && (
            <PortfolioMenu
              p={selected}
              canDelete={items.length > 1}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      )}

      {createOpen && (
        <CreatePopover onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}

function pillClass(active: boolean, simulated: boolean): string {
  const base = 'rounded-full px-3 py-0.5';
  const tone = simulated ? 'text-amber-700' : 'text-zinc-700';
  if (active) return `${base} ${simulated ? 'bg-amber-100' : 'bg-zinc-200'} font-medium ${tone}`;
  return `${base} ${tone} hover:bg-zinc-100`;
}

function CreatePopover({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sim, setSim] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const res = await fetch('/api/portfolios', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), is_simulated: sim }),
    });
    setBusy(false);
    if (res.ok) {
      onClose();
      router.refresh();
    } else if (res.status === 409) alert('名称已存在');
    else alert('创建失败');
  }
  return (
    <div className="absolute z-10 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow">
      <div className="mb-2 text-xs text-zinc-500">新建组合</div>
      <input
        autoFocus
        className="mb-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        placeholder="组合名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="mb-2 flex items-center gap-1 text-xs text-zinc-600">
        <input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} />
        模拟账本
      </label>
      <div className="flex justify-end gap-1">
        <button onClick={onClose} className="px-2 py-1 text-xs text-zinc-500">取消</button>
        <button
          disabled={busy || !name.trim()}
          onClick={submit}
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:bg-zinc-300"
        >
          创建
        </button>
      </div>
    </div>
  );
}

function PortfolioMenu({
  p,
  canDelete,
  onClose,
}: {
  p: PortfolioOption;
  canDelete: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  async function rename() {
    const next = prompt('新名称', p.name);
    if (!next || next.trim() === p.name) return onClose();
    const res = await fetch(`/api/portfolios/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: next.trim() }),
    });
    if (res.ok) { onClose(); router.refresh(); }
    else if (res.status === 409) alert('名称已存在');
    else alert('改名失败');
  }
  async function toggleSim() {
    const res = await fetch(`/api/portfolios/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_simulated: !p.is_simulated }),
    });
    if (res.ok) { onClose(); router.refresh(); }
  }
  async function remove() {
    if (!confirm(`删除「${p.name}」？所有交易将一并删除。`)) return;
    const res = await fetch(`/api/portfolios/${p.id}`, { method: 'DELETE' });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search);
      next.set('portfolio', 'all');
      router.push(`${window.location.pathname}?${next.toString()}`);
      onClose();
      router.refresh();
    }
  }
  return (
    <div className="absolute right-0 z-10 mt-2 w-40 rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow">
      <button onClick={rename} className="block w-full px-3 py-1 text-left hover:bg-zinc-50">重命名</button>
      <button onClick={toggleSim} className="block w-full px-3 py-1 text-left hover:bg-zinc-50">
        {p.is_simulated ? '设为真实' : '设为模拟'}
      </button>
      <button
        onClick={remove}
        disabled={!canDelete}
        className="block w-full px-3 py-1 text-left text-red-600 hover:bg-red-50 disabled:text-zinc-300"
        title={canDelete ? '' : '至少保留一个组合'}
      >
        删除
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 手工冒烟（先不接入页面，只确认能编译）**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/portfolio-switcher.tsx
git commit -m "feat(ui): PortfolioSwitcher 组件（药丸切换 + 菜单 + 新建）"
```

---

## Task 13：`TransactionModal` 组件

**Files:**
- Create: `components/transaction-modal.tsx`

- [ ] **Step 1: 写组件**

`components/transaction-modal.tsx`：

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deriveBuyForm, deriveSellForm } from '@/lib/domain/tx-form';

export interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  fundCode: string;
  fundName: string;
  portfolios: Array<{ id: number; name: string; is_simulated: boolean }>;
  presetPortfolioId: number | null; // 锁定时给值；null = 全部组合下，用户必选
  lockPortfolio?: boolean;
  presetSide?: 'BUY' | 'SELL' | null;
  defaultUnitNav: number | null; // 当日 fund_nav
  feeConfig: { buy_fee_rate: number | null; sell_fee_rate: number | null } | null;
  sharesAvailable: number; // 当前组合下可卖份额
}

export function TransactionModal(props: TransactionModalProps) {
  const router = useRouter();
  const [side, setSide] = useState<'BUY' | 'SELL'>(props.presetSide ?? 'BUY');
  const [portfolioId, setPortfolioId] = useState<number | null>(props.presetPortfolioId);
  const [tradeDate, setTradeDate] = useState<string>(todayISO());
  const [unitNav, setUnitNav] = useState<string>(
    props.defaultUnitNav != null ? props.defaultUnitNav.toFixed(4) : '',
  );
  const [amount, setAmount] = useState<string>('');
  const [shares, setShares] = useState<string>('');
  const [fee, setFee] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setSide(props.presetSide ?? 'BUY');
      setPortfolioId(props.presetPortfolioId);
      setTradeDate(todayISO());
      setUnitNav(props.defaultUnitNav != null ? props.defaultUnitNav.toFixed(4) : '');
      setAmount(''); setShares(''); setFee(''); setNote(''); setErr(null);
    }
  }, [props.open, props.presetSide, props.presetPortfolioId, props.defaultUnitNav]);

  const nUnitNav = Number(unitNav);
  const nAmount = Number(amount);
  const nShares = Number(shares);
  const userFee = fee === '' ? undefined : Number(fee);

  const derived = useMemo(() => {
    if (side === 'BUY') {
      return deriveBuyForm({
        amount: nAmount,
        unit_nav: nUnitNav,
        buy_fee_rate: props.feeConfig?.buy_fee_rate ?? null,
        fee: userFee,
      });
    }
    return deriveSellForm({
      shares: nShares,
      unit_nav: nUnitNav,
      sell_fee_rate: props.feeConfig?.sell_fee_rate ?? null,
      fee: userFee,
    });
  }, [side, nAmount, nShares, nUnitNav, userFee, props.feeConfig]);

  const computedShares = side === 'BUY' ? (derived as { shares: number | null }).shares : nShares;
  const computedAmount = side === 'BUY' ? nAmount : (derived as { amount: number }).amount;
  const computedFee = derived.fee;

  const overSell = side === 'SELL' && Number.isFinite(nShares) && nShares > props.sharesAvailable + 1e-9;
  const canSave =
    portfolioId != null &&
    Number.isFinite(nUnitNav) && nUnitNav > 0 &&
    Number.isFinite(computedShares ?? NaN) && (computedShares ?? 0) > 0 &&
    !overSell && !busy;

  async function submit() {
    if (!canSave || portfolioId == null || computedShares == null) return;
    setBusy(true); setErr(null);
    const res = await fetch(`/api/portfolios/${portfolioId}/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: props.fundCode,
        trade_date: tradeDate,
        side,
        shares: computedShares,
        unit_nav: nUnitNav,
        fee: computedFee,
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? '保存失败');
      return;
    }
    props.onClose();
    router.refresh();
  }

  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-lg bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-base font-semibold">
            {side === 'BUY' ? '买入' : '卖出'} — {props.fundName} <span className="font-mono text-xs text-zinc-400">{props.fundCode}</span>
          </h3>
          <button onClick={props.onClose} className="text-zinc-400">×</button>
        </div>

        {!props.presetSide && (
          <div className="mb-3 flex gap-1 text-sm">
            <button onClick={() => setSide('BUY')} className={tabClass(side === 'BUY')}>买入</button>
            <button onClick={() => setSide('SELL')} className={tabClass(side === 'SELL')}>卖出</button>
          </div>
        )}

        <Field label="组合">
          <select
            disabled={props.lockPortfolio}
            value={portfolioId ?? ''}
            onChange={(e) => setPortfolioId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">— 请选择 —</option>
            {props.portfolios.map((p) => (
              <option key={p.id} value={p.id}>{p.is_simulated ? '~' : ''}{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="日期">
          <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
        </Field>

        <Field label="单位净值">
          <input
            inputMode="decimal"
            value={unitNav}
            placeholder={props.defaultUnitNav == null ? '该日无 NAV，请手填' : ''}
            onChange={(e) => setUnitNav(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </Field>

        {side === 'BUY' ? (
          <Field label="申购金额（元）">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
          </Field>
        ) : (
          <Field label="赎回份额">
            <input inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
            <div className="mt-1 text-xs text-zinc-500">可卖：{props.sharesAvailable.toFixed(4)}</div>
          </Field>
        )}

        <Field label="费用（元）">
          <input
            inputMode="decimal"
            value={fee}
            placeholder={computedFee.toFixed(2)}
            onChange={(e) => setFee(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="mt-1 text-xs text-zinc-500">
            默认费率 {pct(side === 'BUY' ? props.feeConfig?.buy_fee_rate : props.feeConfig?.sell_fee_rate)} · 派生费用 {computedFee.toFixed(2)}
          </div>
        </Field>

        <Field label={side === 'BUY' ? '份额（自动算）' : '回款金额（自动算）'}>
          <div className="rounded bg-zinc-50 px-2 py-1 font-mono text-sm">
            {side === 'BUY'
              ? computedShares != null ? computedShares.toFixed(4) : '—'
              : Number.isFinite(computedAmount) ? computedAmount.toFixed(2) : '—'}
          </div>
        </Field>

        <Field label="备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
        </Field>

        {overSell && <div className="mb-2 text-xs text-red-600">超过可卖份额</div>}
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}

        <div className="mt-3 flex justify-end gap-2">
          <button onClick={props.onClose} className="rounded px-3 py-1 text-sm text-zinc-500">取消</button>
          <button onClick={submit} disabled={!canSave} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:bg-zinc-300">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs text-zinc-500">{label}</div>
      {children}
    </div>
  );
}
function tabClass(active: boolean) {
  return `rounded px-3 py-1 ${active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`;
}
function pct(v: number | null | undefined) {
  return v == null ? '未设' : `${(v * 100).toFixed(2)}%`;
}
function todayISO(): string {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return tz.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: typecheck**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/transaction-modal.tsx
git commit -m "feat(ui): TransactionModal — 买入/卖出表单 + 派生公式"
```

---

## Task 14：`HoldingsBlock` 组件（卡片用）

**Files:**
- Create: `components/holdings-block.tsx`

- [ ] **Step 1: 写组件**

```tsx
'use client';
import { useState } from 'react';
import { TransactionModal, type TransactionModalProps } from './transaction-modal';

export interface HoldingsBlockData {
  shares: number;          // 当前组合下持仓份额；跨组合合计也用这个口径展示
  mkt_value: number | null;
  total_pnl: number | null;
  return_pct: number | null;
  avg_cost: number | null;
  // 跨组合合计模式专用
  simulatedMarket?: number | null;
}

export interface HoldingsBlockProps {
  data: HoldingsBlockData | null;          // null = 该组合下无交易
  mode: 'specific' | 'all';
  modalCtx: Omit<TransactionModalProps, 'open' | 'onClose' | 'presetSide'>;
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return `¥${v.toFixed(2)}`;
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
}
function pctClass(v: number | null | undefined) {
  if (v == null) return 'text-zinc-400';
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-zinc-700';
}

export function HoldingsBlock({ data, mode, modalCtx }: HoldingsBlockProps) {
  const [side, setSide] = useState<'BUY' | 'SELL' | null>(null);

  // 状态 B：具体组合 + 无持仓
  if (mode === 'specific' && data == null) {
    return (
      <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-center">
        <button
          onClick={() => setSide('BUY')}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          + 记录交易
        </button>
        <TransactionModal {...modalCtx} open={side !== null} onClose={() => setSide(null)} presetSide={null} />
      </div>
    );
  }

  if (data == null) return null; // mode=all 且全无交易：不渲染本块

  // 状态 C：全部组合
  if (mode === 'all') {
    return (
      <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-400">合计</span>
          <span className="font-semibold">{fmtMoney(data.mkt_value)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">浮盈</span>
          <span className={pctClass(data.total_pnl)}>
            {fmtMoney(data.total_pnl)} ({fmtPct(data.return_pct)})
          </span>
        </div>
        {data.simulatedMarket != null && data.simulatedMarket !== 0 && (
          <div className="text-[10px] text-amber-600">
            （含模拟 {fmtMoney(data.simulatedMarket)}）
          </div>
        )}
      </div>
    );
  }

  // 状态 A：具体组合 + 有持仓
  const canSell = data.shares > 1e-9;
  return (
    <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-xs">
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <div className="flex justify-between"><span className="text-zinc-400">份额</span><span>{data.shares.toFixed(4)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-400">市值</span><span>{fmtMoney(data.mkt_value)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-400">成本</span><span>{data.avg_cost != null ? data.avg_cost.toFixed(4) : '—'}</span></div>
        <div className={`flex justify-between ${pctClass(data.total_pnl)}`}><span className="text-zinc-400">浮盈</span><span>{fmtMoney(data.total_pnl)} ({fmtPct(data.return_pct)})</span></div>
      </div>
      <div className="mt-1 flex gap-1">
        <button onClick={() => setSide('BUY')} className="rounded border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:bg-zinc-50">+ 买入</button>
        <button
          onClick={() => setSide('SELL')}
          disabled={!canSell}
          title={canSell ? '' : '无可卖份额'}
          className="rounded border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-300"
        >
          − 卖出
        </button>
        <a
          href={`/funds/${modalCtx.fundCode}?portfolio=${modalCtx.presetPortfolioId}`}
          className="rounded border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:bg-zinc-50"
        >
          记录
        </a>
      </div>
      <TransactionModal {...modalCtx} open={side !== null} onClose={() => setSide(null)} presetSide={side} />
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/holdings-block.tsx
git commit -m "feat(ui): HoldingsBlock — 卡片底部持仓块（3 种状态）"
```

---

## Task 15：详情页组件 — `HoldingsKpiGrid` + `TransactionTable` + `FeeConfigEditor`

**Files:**
- Create: `components/holdings-kpi-grid.tsx`
- Create: `components/transaction-table.tsx`
- Create: `components/fee-config-editor.tsx`

- [ ] **Step 1: 写 `HoldingsKpiGrid`**

`components/holdings-kpi-grid.tsx`：

```tsx
import type { FundSummary } from '@/lib/domain/holdings';

export function HoldingsKpiGrid({ s }: { s: FundSummary }) {
  return (
    <div className="grid grid-cols-3 gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
      <Cell label="份额" value={s.shares.toFixed(4)} />
      <Cell label="平均成本" value={s.avg_cost != null ? s.avg_cost.toFixed(4) : '—'} />
      <Cell label="市值" value={s.mkt_value != null ? `¥${s.mkt_value.toFixed(2)}` : '—'} />
      <Cell label="已实现 PnL" value={`¥${s.realized_pnl.toFixed(2)}`} tone={s.realized_pnl} />
      <Cell label="未实现 PnL" value={s.unrealized_pnl != null ? `¥${s.unrealized_pnl.toFixed(2)}` : '—'} tone={s.unrealized_pnl} />
      <Cell
        label="累计收益率"
        value={s.return_pct != null ? `${s.return_pct >= 0 ? '+' : ''}${(s.return_pct * 100).toFixed(2)}%` : '—'}
        tone={s.return_pct}
      />
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  const cls = tone == null ? 'text-zinc-800' : tone > 0 ? 'text-red-600' : tone < 0 ? 'text-green-600' : 'text-zinc-800';
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`mt-1 font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: 写 `TransactionTable`**

`components/transaction-table.tsx`：

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TxRow } from '@/lib/db/queries';

export function TransactionTable({
  items,
  showPortfolioColumn,
  portfolioNames,
}: {
  items: TxRow[];
  showPortfolioColumn: boolean;
  portfolioNames: Map<number, string>;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);

  async function remove(id: number) {
    if (!confirm('删除这笔交易？删除后持仓与浮盈会重算。')) return;
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error === 'oversell' ? '删除会导致历史超卖' : '删除失败');
      return;
    }
    router.refresh();
  }

  if (items.length === 0) {
    return <div className="rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">还没有交易记录</div>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-zinc-500">
          <th className="py-2">日期</th>
          {showPortfolioColumn && <th>组合</th>}
          <th>方向</th>
          <th className="text-right">份额</th>
          <th className="text-right">单价</th>
          <th className="text-right">金额</th>
          <th className="text-right">费用</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => {
          const gross = t.shares * t.unit_nav;
          const amount = t.side === 'BUY' ? gross + t.fee : gross - t.fee;
          return (
            <tr key={t.id} className="border-b">
              <td className="py-2 font-mono">{t.trade_date}</td>
              {showPortfolioColumn && <td>{portfolioNames.get(t.portfolio_id) ?? `#${t.portfolio_id}`}</td>}
              <td className={t.side === 'BUY' ? 'text-red-600' : 'text-green-600'}>{t.side === 'BUY' ? '买入' : '卖出'}</td>
              <td className="text-right">{t.shares.toFixed(4)}</td>
              <td className="text-right">{t.unit_nav.toFixed(4)}</td>
              <td className="text-right">¥{amount.toFixed(2)}</td>
              <td className="text-right">¥{t.fee.toFixed(2)}</td>
              <td>{t.note ?? ''}</td>
              <td className="space-x-2 text-xs">
                <button onClick={() => setEditingId(t.id)} className="text-blue-600">编辑</button>
                <button onClick={() => remove(t.id)} className="text-red-600">删除</button>
              </td>
            </tr>
          );
        })}
      </tbody>
      {editingId !== null && (
        <EditRowDialog
          tx={items.find((x) => x.id === editingId)!}
          onClose={() => setEditingId(null)}
        />
      )}
    </table>
  );
}

function EditRowDialog({ tx, onClose }: { tx: TxRow; onClose: () => void }) {
  const router = useRouter();
  const [trade_date, setDate] = useState(tx.trade_date);
  const [shares, setShares] = useState(String(tx.shares));
  const [unit_nav, setNav] = useState(String(tx.unit_nav));
  const [fee, setFee] = useState(String(tx.fee));
  const [note, setNote] = useState(tx.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/transactions/${tx.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trade_date,
        shares: Number(shares),
        unit_nav: Number(unit_nav),
        fee: Number(fee),
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b.error === 'oversell' ? '修改会导致历史超卖' : '保存失败');
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
      <div className="w-[360px] rounded-lg bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-semibold">编辑交易（不能改方向）</h3>
        <div className="mb-2"><div className="text-xs text-zinc-500">日期</div><input type="date" value={trade_date} onChange={(e)=>setDate(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">份额</div><input value={shares} onChange={(e)=>setShares(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">单位净值</div><input value={unit_nav} onChange={(e)=>setNav(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">费用</div><input value={fee} onChange={(e)=>setFee(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">备注</div><input value={note} onChange={(e)=>setNote(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm text-zinc-500">取消</button>
          <button onClick={save} disabled={busy} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:bg-zinc-300">保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 写 `FeeConfigEditor`**

`components/fee-config-editor.tsx`：

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function FeeConfigEditor({
  code,
  current,
}: {
  code: string;
  current: { buy_fee_rate: number | null; sell_fee_rate: number | null } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [buy, setBuy] = useState(current?.buy_fee_rate != null ? (current.buy_fee_rate * 100).toFixed(2) : '');
  const [sell, setSell] = useState(current?.sell_fee_rate != null ? (current.sell_fee_rate * 100).toFixed(2) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/funds/${code}/fee-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        buy_fee_rate: buy === '' ? null : Number(buy) / 100,
        sell_fee_rate: sell === '' ? null : Number(sell) / 100,
      }),
    });
    setBusy(false);
    if (res.ok) { setEditing(false); router.refresh(); }
  }

  return (
    <div className="flex items-center gap-3 rounded border border-zinc-200 bg-white px-3 py-2 text-sm">
      {!editing ? (
        <>
          <span className="text-zinc-500">默认费率</span>
          <span>申购 {current?.buy_fee_rate != null ? `${(current.buy_fee_rate * 100).toFixed(2)}%` : '未设'}</span>
          <span>·</span>
          <span>赎回 {current?.sell_fee_rate != null ? `${(current.sell_fee_rate * 100).toFixed(2)}%` : '未设'}</span>
          <button onClick={() => setEditing(true)} className="ml-auto text-xs text-blue-600">编辑</button>
        </>
      ) : (
        <>
          <span className="text-zinc-500">申购</span>
          <input value={buy} onChange={(e) => setBuy(e.target.value)} className="w-16 rounded border border-zinc-300 px-1 text-sm" placeholder="%" />
          <span>%</span>
          <span className="text-zinc-500">赎回</span>
          <input value={sell} onChange={(e) => setSell(e.target.value)} className="w-16 rounded border border-zinc-300 px-1 text-sm" placeholder="%" />
          <span>%</span>
          <button onClick={() => setEditing(false)} className="ml-auto text-xs text-zinc-500">取消</button>
          <button onClick={save} disabled={busy} className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-white disabled:bg-zinc-300">保存</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: typecheck**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/holdings-kpi-grid.tsx components/transaction-table.tsx components/fee-config-editor.tsx
git commit -m "feat(ui): HoldingsKpiGrid + TransactionTable + FeeConfigEditor 详情页三件套"
```

---

## Task 16：看板集成 — `app/page.tsx` + `fund-card.tsx` + `fund-grid.tsx`

**Files:**
- Modify: `app/page.tsx`（完整替换）
- Modify: `components/fund-card.tsx`（扩展 props + 渲染 HoldingsBlock）
- Modify: `components/fund-grid.tsx`（透传 portfolios）

- [ ] **Step 1: 完整替换 `app/page.tsx`**

```tsx
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchQuote } from '@/lib/source/eastmoney';
import { quoteCache } from '@/lib/cache';
import { ensureHistory } from '@/lib/server/ensure-history';
import { periodReturn } from '@/lib/domain/period-return';
import { AddFundForm } from '@/components/add-fund-form';
import { FundGrid } from '@/components/fund-grid';
import { RangeSelector } from '@/components/range-selector';
import { RANGE_OPTIONS } from '@/lib/domain/range-options';
import { TagFilterBar } from '@/components/tag-filter-bar';
import { PortfolioSwitcher } from '@/components/portfolio-switcher';
import type { FundCardData } from '@/components/fund-card';
import {
  computeFundSummary,
  aggregateAcrossFunds,
  type FundSummary,
} from '@/lib/domain/holdings';
import type { HoldingsBlockData } from '@/components/holdings-block';

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE = 30;
const ALLOWED_DAYS = new Set(RANGE_OPTIONS.map((o) => o.days));

function parseRange(v: string | undefined): number {
  const n = Number(v);
  return ALLOWED_DAYS.has(n as (typeof RANGE_OPTIONS)[number]['days']) ? n : DEFAULT_RANGE;
}
function parsePortfolio(v: string | undefined): number | 'all' {
  if (!v || v === 'all') return 'all';
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 'all';
}

export default async function Home({
  searchParams,
}: {
  searchParams: { range?: string; tag?: string; portfolio?: string };
}) {
  const range = parseRange(searchParams.range);
  const tagFilter = searchParams.tag?.trim() || null;
  const portfolioSel = parsePortfolio(searchParams.portfolio);

  const q = createQueries(getDb());
  const allTags = q.listTags();
  let items = q.listWatchlistWithTags();
  if (tagFilter) items = items.filter((it) => it.tags.some((t) => t.name === tagFilter));

  await Promise.allSettled(items.map((it) => ensureHistory(q, it.code, range)));

  const codes = items.map((it) => it.code);
  const seriesMap = q.listNavSeriesForCodes(codes, range);
  const portfolios = q.listPortfolios();
  const txMap = q.listTransactionsForCodes(
    portfolioSel === 'all' ? null : portfolioSel,
    codes,
  );
  const realIds = new Set(portfolios.filter((p) => !p.is_simulated).map((p) => p.id));

  const cardData: FundCardData[] = await Promise.all(
    items.map(async (it) => {
      const latest = q.latestNav(it.code);
      const series = seriesMap.get(it.code) ?? [];
      const txs = txMap.get(it.code) ?? [];
      const feeConfig = q.getFeeConfig(it.code);
      const quote = await quoteCache
        .get(it.code, () =>
          fetchQuote(it.code).then((x) => {
            if (!x.ok) throw new Error(x.reason);
            return x.data;
          }),
        )
        .then((d) => ({ ok: true as const, data: d }))
        .catch(() => ({ ok: false as const }));

      let holding: HoldingsBlockData | null = null;
      let sharesAvailable = 0;
      if (portfolioSel === 'all') {
        if (txs.length > 0) {
          const byP = new Map<number, typeof txs>();
          for (const t of txs) byP.set(t.portfolio_id, [...(byP.get(t.portfolio_id) ?? []), t]);
          const summaries: FundSummary[] = [];
          let simulatedMarket: number | null = 0;
          for (const [pid, list] of byP) {
            const s = computeFundSummary(list, latest?.unit_nav ?? null);
            summaries.push(s);
            if (!realIds.has(pid)) {
              if (s.mkt_value == null) simulatedMarket = null;
              else if (simulatedMarket != null) simulatedMarket += s.mkt_value;
            }
          }
          const agg = aggregateAcrossFunds(summaries);
          holding = {
            shares: summaries.reduce((acc, s) => acc + s.shares, 0),
            mkt_value: agg.total_market,
            total_pnl: agg.total_pnl,
            return_pct: agg.return_pct,
            avg_cost: null,
            simulatedMarket,
          };
        }
      } else {
        if (txs.length > 0) {
          const s = computeFundSummary(txs, latest?.unit_nav ?? null);
          holding = {
            shares: s.shares,
            mkt_value: s.mkt_value,
            total_pnl: s.total_pnl,
            return_pct: s.return_pct,
            avg_cost: s.avg_cost,
          };
          sharesAvailable = s.shares;
        }
      }

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
        holding,
        portfolioMode: portfolioSel === 'all' ? 'all' : 'specific',
        presetPortfolioId: portfolioSel === 'all' ? null : portfolioSel,
        feeConfig,
        sharesAvailable,
      };
    }),
  );

  const portfolioOptions = portfolios.map((p) => ({
    id: p.id,
    name: p.name,
    is_simulated: p.is_simulated,
  }));

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">自选基金</h1>
      <div className="mb-4 flex items-center gap-4">
        <AddFundForm />
        <div className="ml-auto">
          <RangeSelector current={range} />
        </div>
      </div>
      <div className="mb-2">
        <PortfolioSwitcher items={portfolioOptions} />
      </div>
      <div className="mb-4">
        <TagFilterBar tags={allTags} current={tagFilter} />
      </div>
      <FundGrid items={cardData} allTags={allTags} portfolios={portfolioOptions} />
    </main>
  );
}
```

- [ ] **Step 2: 修改 `components/fund-grid.tsx` 透传 portfolios**

读取现有 `components/fund-grid.tsx`，扩展 props：

```tsx
import type { TagColor } from '@/lib/domain/tag-palette';
import { FundCard, type FundCardData } from './fund-card';

interface Tag { id: number; name: string; color: TagColor }

export function FundGrid({
  items,
  allTags,
  portfolios,
}: {
  items: FundCardData[];
  allTags: Tag[];
  portfolios: Array<{ id: number; name: string; is_simulated: boolean }>;
}) {
  if (items.length === 0) {
    return <p className="text-zinc-500">暂无自选基金，使用上方表单添加。</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => (
        <FundCard key={it.code} data={it} allTags={allTags} portfolios={portfolios} />
      ))}
    </div>
  );
}
```

（如果当前 `fund-grid.tsx` 已有不同样式，**只**新增 `portfolios` prop + 透传给 `FundCard`，其它保留。）

- [ ] **Step 3: 修改 `components/fund-card.tsx` 扩展数据 + 底部 HoldingsBlock**

在 `FundCardData` interface 内追加：

```ts
  holding: import('./holdings-block').HoldingsBlockData | null;
  portfolioMode: 'specific' | 'all';
  presetPortfolioId: number | null;
  feeConfig: { buy_fee_rate: number | null; sell_fee_rate: number | null } | null;
  sharesAvailable: number;
```

`FundCard` 组件签名改为：

```tsx
export function FundCard({
  data,
  allTags,
  portfolios,
}: {
  data: FundCardData;
  allTags: Tag[];
  portfolios: Array<{ id: number; name: string; is_simulated: boolean }>;
}) {
```

在文件顶部 import 段加：

```ts
import { HoldingsBlock } from './holdings-block';
```

在 `<MiniChart rows={data.series} />` 之后、卡片闭合 `</div>` 之前追加：

```tsx
      <HoldingsBlock
        data={data.holding}
        mode={data.portfolioMode}
        modalCtx={{
          fundCode: data.code,
          fundName: data.name,
          portfolios,
          presetPortfolioId: data.presetPortfolioId,
          lockPortfolio: data.portfolioMode === 'specific',
          defaultUnitNav: data.latestNav,
          feeConfig: data.feeConfig,
          sharesAvailable: data.sharesAvailable,
        }}
      />
```

- [ ] **Step 4: typecheck + 手工冒烟**

Run: `yarn typecheck`
Expected: no errors

Run: `yarn dev`，打开 `http://localhost:3000`，验证：
- 顶部多出"组合"行，默认显示「全部 / 主账本」两药丸
- 默认 `?portfolio=all` 时卡片底部仅在有持仓时显示合计
- 点 `主账本`，URL 变 `?portfolio=1`，无交易卡片底部出现 `+ 记录交易`
- 在 `⨁` 创建模拟组合 → 新药丸出现，刷新后保留
- 卡片上 `+ 买入` 打开 modal，提交后 `router.refresh()`，卡片立即显示份额/市值

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/fund-card.tsx components/fund-grid.tsx
git commit -m "feat(ui): 看板集成 PortfolioSwitcher + 卡片底部 HoldingsBlock"
```

---

## Task 17：详情页集成 — `app/funds/[code]/page.tsx`

**Files:**
- Modify: `app/funds/[code]/page.tsx`

- [ ] **Step 1: 改写详情页**

完整替换 `app/funds/[code]/page.tsx`：

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { ensureHistory } from '@/lib/server/ensure-history';
import { NavChart } from '@/components/nav-chart';
import { PortfolioSwitcher } from '@/components/portfolio-switcher';
import { HoldingsKpiGrid } from '@/components/holdings-kpi-grid';
import { TransactionTable } from '@/components/transaction-table';
import { FeeConfigEditor } from '@/components/fee-config-editor';
import { computeFundSummary, aggregateAcrossFunds } from '@/lib/domain/holdings';

export const dynamic = 'force-dynamic';

const ALLOWED_RANGES = [30, 90, 180, 365] as const;
type Range = (typeof ALLOWED_RANGES)[number];

function parseRange(v: string | undefined): Range {
  const n = Number(v);
  return (ALLOWED_RANGES as readonly number[]).includes(n) ? (n as Range) : 90;
}
function parsePortfolio(v: string | undefined): number | 'all' {
  if (!v || v === 'all') return 'all';
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 'all';
}

export default async function FundPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { range?: string; portfolio?: string };
}) {
  const { code } = params;
  if (!/^\d{6}$/.test(code)) notFound();
  const range = parseRange(searchParams.range);
  const portfolioSel = parsePortfolio(searchParams.portfolio);

  const q = createQueries(getDb());
  const meta = q.getMeta(code);
  if (!meta) notFound();

  await ensureHistory(q, code, range);
  const rows = q.listNav(code, range);
  const latest = q.latestNav(code);

  const portfolios = q.listPortfolios();
  const txs =
    portfolioSel === 'all'
      ? q.listTransactionsForCodes(null, [code]).get(code) ?? []
      : q.listTransactions(portfolioSel, code);

  // 当前组合的 summary（all 模式：跨组合）
  const portfolioNames = new Map(portfolios.map((p) => [p.id, p.name]));
  let summary;
  if (portfolioSel === 'all') {
    const byP = new Map<number, typeof txs>();
    for (const t of txs) byP.set(t.portfolio_id, [...(byP.get(t.portfolio_id) ?? []), t]);
    const summaries = [...byP.values()].map((list) => computeFundSummary(list, latest?.unit_nav ?? null));
    const agg = aggregateAcrossFunds(summaries);
    summary = {
      shares: summaries.reduce((a, s) => a + s.shares, 0),
      shares_bought: summaries.reduce((a, s) => a + s.shares_bought, 0),
      shares_sold: summaries.reduce((a, s) => a + s.shares_sold, 0),
      cost_buy: agg.total_cost,
      proceeds_sell: 0, // 详情页 all 模式不分项展示
      avg_cost: null,
      remaining_cost: 0,
      mkt_value: agg.total_market,
      unrealized_pnl: agg.total_unrealized,
      realized_pnl: agg.total_realized,
      total_pnl: agg.total_pnl,
      return_pct: agg.return_pct,
    };
  } else {
    summary = computeFundSummary(txs, latest?.unit_nav ?? null);
  }

  const feeConfig = q.getFeeConfig(code);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-2 text-sm">
        <Link href="/" className="text-blue-600">← 自选</Link>
      </div>
      <h1 className="mb-1 text-2xl font-semibold">
        {meta.name} <span className="font-mono text-zinc-400">{code}</span>
      </h1>

      <div className="mb-3">
        <PortfolioSwitcher items={portfolios.map((p) => ({ id: p.id, name: p.name, is_simulated: p.is_simulated }))} />
      </div>

      <section className="mb-6">
        <div className="mb-2 text-sm font-semibold text-zinc-600">持仓</div>
        <HoldingsKpiGrid s={summary} />
      </section>

      <section className="mb-6">
        <FeeConfigEditor code={code} current={feeConfig} />
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-600">交易记录</h2>
        </div>
        <TransactionTable
          items={txs}
          showPortfolioColumn={portfolioSel === 'all'}
          portfolioNames={portfolioNames}
        />
      </section>

      <div className="mb-4 flex gap-2 text-sm">
        {ALLOWED_RANGES.map((r) => (
          <Link
            key={r}
            href={`/funds/${code}?range=${r}&portfolio=${searchParams.portfolio ?? 'all'}`}
            className={r === range ? 'font-semibold text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}
          >
            {r}天
          </Link>
        ))}
      </div>
      <NavChart rows={rows} />

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-500">
            <th className="py-2">日期</th>
            <th>单位净值</th>
            <th>累计净值</th>
            <th>当日涨跌</th>
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

注意：把原本的 `q.listWatchlist().find` 替换为 `q.getMeta(code)`，让从看板移除后也能访问详情页（如果以后做"组合视角列表"导航）。

- [ ] **Step 2: typecheck**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 3: 手工冒烟**

Run: `yarn dev`，验证：
- 在看板任意卡片点基金名 → 跳到详情页 `/funds/[code]?portfolio=ID` 顶部组合切换器与看板同步
- 详情页显示"持仓 KPI"、"默认费率"、"交易记录"三个 section
- "+ 添加交易"… 等等：这里其实交易记录 section 里没显式 "+ 添加交易" 按钮，因为入口在卡片或修改 `TransactionTable` 加按钮。给 `TransactionTable` 加一个工具栏：在 task 内补一个 step。

- [ ] **Step 4: 在 TransactionTable 上方加 "+ 添加交易" 入口（前置组件改动）**

回到 `components/transaction-table.tsx`，把它包装成接收 `onAdd?: () => void` 的 prop？更简单做法：在详情页 section 里加一个独立 `<TransactionAddButton>`。直接在 `app/funds/[code]/page.tsx` 的"交易记录"section 里，让按钮触发本地 client modal。最简：把 "+ 添加交易" 按钮做成 client component，由它持有 `TransactionModal`，传入与卡片同款的 modalCtx。

新建 `components/transaction-add-button.tsx`：

```tsx
'use client';
import { useState } from 'react';
import { TransactionModal, type TransactionModalProps } from './transaction-modal';

export function TransactionAddButton({
  modalCtx,
}: {
  modalCtx: Omit<TransactionModalProps, 'open' | 'onClose' | 'presetSide'>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-zinc-900 px-3 py-1 text-xs text-white"
      >
        + 添加交易
      </button>
      <TransactionModal {...modalCtx} open={open} onClose={() => setOpen(false)} presetSide={null} />
    </>
  );
}
```

在 `app/funds/[code]/page.tsx` 的"交易记录" section 顶部 div 里加：

```tsx
        <TransactionAddButton
          modalCtx={{
            fundCode: code,
            fundName: meta.name,
            portfolios: portfolios.map((p) => ({ id: p.id, name: p.name, is_simulated: p.is_simulated })),
            presetPortfolioId: portfolioSel === 'all' ? null : portfolioSel,
            lockPortfolio: false,
            defaultUnitNav: latest?.unit_nav ?? null,
            feeConfig,
            sharesAvailable: portfolioSel === 'all' ? 0 : summary.shares,
          }}
        />
```

- [ ] **Step 5: typecheck + 冒烟**

Run: `yarn typecheck && yarn dev`
Expected：详情页能添加 / 编辑 / 删除交易；超卖被服务端拦下，UI 显示红字。

- [ ] **Step 6: Commit**

```bash
git add app/funds/[code]/page.tsx components/transaction-add-button.tsx
git commit -m "feat(ui): 详情页持仓 / 费率 / 交易记录三件套集成"
```

---

## Task 18：端到端冒烟 + 验收清单

**Files:** 无新增（手工 / 整改修复）

- [ ] **Step 1: 跑全量测试**

Run: `yarn vitest run`
Expected: 全绿，含原有 + 新增 ≈ 11 个新测试文件

- [ ] **Step 2: typecheck + lint**

Run: `yarn typecheck && yarn lint`
Expected: clean

- [ ] **Step 3: 浏览器走通 spec 第 8 节验收清单**

Run: `yarn dev` → 浏览器逐条验证：

- [ ] 新空 DB / 升级老 DB 都得到「主账本」portfolio
- [ ] 顶部 `PortfolioSwitcher` 在 `TagFilterBar` 上方；可建/改名/删/切模拟；URL `?portfolio=` 生效
- [ ] 卡片底部 `HoldingsBlock` 在「全部」/ 「具体组合-有持仓」/ 「具体组合-无持仓」三种状态正确
- [ ] 详情页能看到持仓 KPI + 默认费率编辑 + 交易记录表
- [ ] `TransactionModal` 三处派生公式正确（输入金额时份额自动算、改费率/单价/费用同步）
- [ ] 编辑/删除交易后 PnL 即时刷新（`router.refresh()` 重新 SSR）
- [ ] 删 portfolio 二次确认 + CASCADE 删交易
- [ ] 从看板移除基金后再加回，持仓数据完整（不丢交易）
- [ ] 试图卖超 → 服务端 400、UI 红字提示

发现的小问题在本任务内 fix 完。

- [ ] **Step 4: 最终 commit**

```bash
git add -A
git commit -m "chore: 持仓管理一期收尾（验收冒烟通过）"
```

---

## 总结

完成所有 18 个 Task 后：

- 新增 3 张表 + 全量 API + 看板/详情页 UI 集成
- `lib/domain/holdings.ts` + `lib/domain/tx-form.ts` 两个纯函数模块单测覆盖 WAC / PnL / 派生公式
- `queries.ts` 透出 portfolios / transactions / fee-config CRUD + 跨表批量
- 5 个 API route，TDD 覆盖 happy path + 主要错误码
- 6 个新组件，分工清晰（PortfolioSwitcher / TransactionModal / HoldingsBlock / HoldingsKpiGrid / TransactionTable / FeeConfigEditor + TransactionAddButton）
- `app/page.tsx` 与 `app/funds/[code]/page.tsx` 完成集成
