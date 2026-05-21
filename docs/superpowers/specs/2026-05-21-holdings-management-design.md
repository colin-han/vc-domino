# 持仓管理（交易记账 + PnL）设计

- 日期：2026-05-21
- 状态：草案
- 关联：
  - 主 spec `docs/superpowers/specs/2026-05-17-fund-tracker-design.md`
  - 前置：`docs/superpowers/specs/2026-05-17-watchlist-cards-and-tags-design.md`

## 1. 范围

### 本期范围

- 引入「组合 portfolio」一等公民概念：可同时承载**真实账本**与**模拟跟踪**多个账户
- 为看板上的基金添加**买入 / 卖出**交易记录：选日期、份额、单位净值、费用
- 实时计算每只基金、每个组合的**当前份额、平均成本（WAC）、市值、已实现/未实现盈亏、累计收益率**
- 看板顶部新增 `PortfolioSwitcher`：「全部 / 主账本 / 模拟·X」药丸切换；右侧 `…` 菜单管理（重命名 / 切换是否模拟 / 删除）；末尾 `⨁` 新建
- 看板卡片底部新增 `HoldingsBlock`：份额 / 市值 / 浮盈 + `+ 买入 / − 卖出 / 记录` 按钮；空持仓时退化为单按钮 `+ 记录交易`；「全部」组合下显示跨组合合计、隐藏买卖按钮
- 详情页 `/funds/[code]` 新增两个 section：**持仓汇总 KPI**、**交易记录表**（含编辑/删除）+ 顶部组合切换器（同步 URL `?portfolio=`）
- 交易表单以**居中模态弹窗**呈现，含金额/份额/费率派生
- 每只基金可配默认 `buy_fee_rate` / `sell_fee_rate`，表单按金额×费率预填、用户可逐笔覆盖

### 非目标（一期不做）

- **赎回费按持有天数阶梯**（如 7 天内 1.5%）：只设单一赎回费率
- 分红 / 红利再投 / 份额拆分合并 / 转换
- 持仓市值的历史走势图
- 多平台账户细分（每笔交易标注「在哪个平台买的」）
- 持仓的导入/导出 / CSV
- 模拟组合的"现金余额"或"初始资金"概念

## 2. 数据模型 + Migration

通过 `lib/db/migrate.ts` 的 `MIGRATIONS` 数组追加 v3。`user_version` 从 2 → 3。

```sql
-- Migration v3

CREATE TABLE IF NOT EXISTS portfolios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  is_simulated  INTEGER NOT NULL DEFAULT 0,        -- 0=真实账本，1=模拟
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id  INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  code          TEXT    NOT NULL,                  -- 引用 fund_meta.code，不 FK 到 watchlist
  trade_date    TEXT    NOT NULL,                  -- YYYY-MM-DD，与 fund_nav.nav_date 同
  side          TEXT    NOT NULL CHECK (side IN ('BUY','SELL')),
  shares        REAL    NOT NULL,                  -- 正数
  unit_nav      REAL    NOT NULL,                  -- 当笔成交单位净值
  fee           REAL    NOT NULL DEFAULT 0,        -- 元
  note          TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_portfolio_code_date
  ON transactions(portfolio_id, code, trade_date);

CREATE TABLE IF NOT EXISTS fund_fee_config (
  code            TEXT PRIMARY KEY,
  buy_fee_rate    REAL,                            -- 0.0015 = 0.15%；NULL 表示未设
  sell_fee_rate   REAL,
  updated_at      INTEGER NOT NULL
);

-- 引导：自动创建唯一的「主账本」组合，让老数据无缝迁过来
INSERT INTO portfolios (name, is_simulated, sort_order, created_at)
SELECT '主账本', 0, 0, strftime('%s','now') * 1000
WHERE NOT EXISTS (SELECT 1 FROM portfolios);
```

约束与边界：

- `portfolios.name` UNIQUE → 重名 409
- `transactions.code` **不**外键到 `watchlist`：从看板移除一只基金后交易记录仍存在，加回看板时持仓自然恢复
- `transactions.portfolio_id` ON DELETE CASCADE：删 portfolio 连带删它的所有交易（前端必须二次确认）
- `transactions.side` 不允许 PATCH（要改方向请删后重建）
- `fund_fee_config` 独立成表，不污染 `fund_meta`（后者数据源是天天基金）
- 不引入 `holdings` 物化表：份额、WAC、PnL 全部从 `transactions` 实时汇总（见第 4 节）

## 3. API

```
GET    /api/portfolios                          → [{id, name, is_simulated, summary}]
POST   /api/portfolios                          body { name, is_simulated? }
PATCH  /api/portfolios/[id]                     body { name?, is_simulated? }
DELETE /api/portfolios/[id]                     CASCADE 删交易；唯一组合不可删 → 400

GET    /api/portfolios/[id]/transactions?code=  → [tx]（省略 code 则列全部）
POST   /api/portfolios/[id]/transactions        body { code, trade_date, side, shares, unit_nav, fee, note? }
PATCH  /api/transactions/[id]                   body { trade_date?, shares?, unit_nav?, fee?, note? }
DELETE /api/transactions/[id]

GET    /api/funds/[code]/fee-config             → { buy_fee_rate, sell_fee_rate } | 404
PUT    /api/funds/[code]/fee-config             body { buy_fee_rate?, sell_fee_rate? } upsert
```

错误码约定：

- 400：超卖（写入后 `shares_bought < shares_sold`）/ 字段格式错误 / 唯一 portfolio 不可删
- 404：portfolio / transaction / fund 不存在
- 409：portfolio name 重复

**持仓汇总不开独立 API**：看板和详情页都走 SSR，直接在 `app/page.tsx` / `app/funds/[code]/page.tsx` 里调用 `queries` + `lib/domain/holdings.ts` 计算，不暴露 endpoint。

## 4. 计算逻辑（lib/domain/holdings.ts）

**纯函数模块**。输入：某 `(portfolio, code)` 的全部交易行 + 最新单位净值。输出：汇总。

```ts
shares_bought   = Σ shares       where side=BUY
shares_sold     = Σ shares       where side=SELL
shares          = shares_bought - shares_sold

cost_buy        = Σ (shares*unit_nav + fee)  where side=BUY   // 含买入费的累计投入
proceeds_sell   = Σ (shares*unit_nav - fee)  where side=SELL  // 扣赎回费后的累计回款

avg_cost        = shares_bought > 0 ? cost_buy / shares_bought : null
remaining_cost  = shares * avg_cost                            // 当前持有的账面成本
mkt_value       = shares * latest_unit_nav
unrealized_pnl  = mkt_value - remaining_cost
realized_pnl    = proceeds_sell - shares_sold * avg_cost
total_pnl       = unrealized_pnl + realized_pnl
return_pct      = cost_buy > 0 ? total_pnl / cost_buy : null
```

要点：

- 加权平均成本 WAC 以**买入序列**加权：`avg_cost = cost_buy / shares_bought`。卖出不影响 `avg_cost`，只减少 `shares`。
- 卖出已实现 PnL 用同一个 `avg_cost`：`(proceeds_sell - shares_sold * avg_cost)`。
- 当 `shares == 0` 且 `realized_pnl != 0`：仍展示该 `(portfolio, code)` 一行"已清仓 + 已实现 PnL"。
- 当 `shares_bought == 0`：`avg_cost = null`，PnL 跳过；UI 侧显示 "—"。
- 当 `latest_unit_nav == null`（fund_nav 无数据）：`mkt_value = null`，UI 显示 "—"。

**组合汇总** = 该组合下所有 `(code)` 汇总的合计；`return_pct` 用 `Σ total_pnl / Σ cost_buy`。

**「全部」组合汇总** = 全部 portfolio 汇总相加。模拟组合也计入，但 UI 为模拟部分加视觉标记（见 5.2）。

**表单字段派生**（在 `TransactionModal` 中实时算，落库恒定为 `{shares, unit_nav, fee, side, trade_date, note}`）：

```
买入：主输入 amount
  fee     ← amount × buy_fee_rate（默认；可改）
  unit_nav ← 当日 fund_nav（默认；可改）
  shares  ← (amount - fee) / unit_nav            // 派生显示

卖出：主输入 shares
  unit_nav ← 当日 fund_nav（默认；可改）
  fee     ← shares × unit_nav × sell_fee_rate（默认；可改）
  amount  ← shares × unit_nav - fee              // 派生显示
```

**精度约定**：`shares`、`unit_nav` 保留 6 位小数；金额、费用展示 2 位四舍五入，存原始 `REAL`。所有写入前 `Number.isFinite()` 校验。

## 5. UI 与交互

### 5.1 PortfolioSwitcher（看板顶部 / 详情页顶部）

布局：在现有 `TagFilterBar` **上方**单独一行。

```
[组合]  全部 ｜ 主账本 ｜ ~模拟·量化 ｜ ~模拟·定投   ⨁    [选中]…
```

- 横向药丸列表，沿用项目中 `text-zinc-*` / `bg-zinc-*` 系列；选中态深色，未选中浅色
- 模拟组合药丸文字色 `text-amber-600`，名字前带 `~` 前缀，与真实账本区分
- 末尾 `⨁` 新建：点开 popover，输入 `name` + 勾选 `is_simulated`
- 选中态药丸右侧的 `…` 菜单：**重命名 / 切换是否模拟 / 删除**
  - 删除二次确认弹窗，文案显示 "将删除 N 笔交易"
  - 唯一一个 portfolio 时，删除项 disabled + tooltip "至少保留一个组合"
- URL 透传：`?portfolio=1` 或 `?portfolio=all`；与 `?range=` `?tag=` 并存
- 列表按 `sort_order ASC, created_at ASC` 排序；一期不暴露拖拽 / 排序 UI，`sort_order` 字段保留供后续扩展
- **详情页**复用同一个 `PortfolioSwitcher` 组件，URL 跨页同步

### 5.2 看板卡片底部 HoldingsBlock

`FundCard` 在区间 `MiniChart` 下方追加一段。三种状态：

**A. `?portfolio=具体ID`，有持仓**

```
─────────────
份额  1,234.56     市值 ¥1,586.30
成本  1.2147       浮盈 +¥86.30 (+5.76%)
[+ 买入]  [− 卖出]  [记录]
```

浮盈用现有 `pctClass` 红涨绿跌。"记录"按钮 `Link` 到 `/funds/[code]?portfolio=ID`，落地后滚动到「交易记录」section。

**B. `?portfolio=具体ID`，该组合下无该基金交易**

```
─────────────
                + 记录交易
```

单按钮，淡色，不喧宾夺主。点击打开 `TransactionModal`，side 不预设。

**C. `?portfolio=all`**

```
─────────────
合计  ¥1,586.30        浮盈 +¥86.30 (+5.76%)
（含模拟 ¥420.00）
```

"含模拟" 用 `text-amber-600` 小字；**隐藏**买/卖/记录按钮（统一从 5.1 切换到具体组合再操作）。

### 5.3 详情页 `/funds/[code]`

不做 tab 化（避免与现有 `NavChart` 大改），改为追加两个 section：

**Section · 持仓 KPI**

- 顶部一行：`组合：[药丸切换器]`（复用 5.1，影响下面两个 section；URL 同步）
- KPI 网格 2×3：`份额 / 平均成本 / 市值 / 已实现 PnL / 未实现 PnL / 累计收益率`
- 选 `all` 时，本 section 改为"跨组合汇总"，并下挂一个小表"各组合分布"（组合名 / 份额 / 市值 / 浮盈）

**Section · 默认费率**

- 一行小入口（齿轮图标 + 当前费率显示）：`申购费 0.15%  ·  赎回费 0.50%   [编辑]`
- 点击展开 inline 表单 / 小弹窗（`FeeConfigEditor`）改两个百分比，`PUT /api/funds/[code]/fee-config`
- 未配置时显示 "未设默认费率（每笔需手填）"

**Section · 交易记录**

- 表头：`+ 添加交易`（打开 Modal）
- 表格列：`日期 ｜ 方向 ｜ 份额 ｜ 单价 ｜ 金额 ｜ 费用 ｜ 备注 ｜ 操作`
- 默认仅显示**当前组合**该基金的交易；选 `all` 时多一列 `组合`
- 每行末尾 `编辑 / 删除`
- 删除二次确认（"删除后会重算持仓与浮盈"）

### 5.4 TransactionModal（居中模态）

标题：`买入 / 卖出 — {fund.name} · {code}`，side 由入口预设。

字段（买入）：

```
组合：[主账本 ▾]                  （从卡片入口锁定，从详情页可改）
日期：[2026-05-21] 📅              默认今日（Asia/Shanghai）；该日无 NAV 时提示
单位净值：[1.2845]                 默认 = trade_date 当日 fund_nav；用户可改
申购金额（元）：[__________]       ← 主输入
申购费率：0.15% · 申购费：[1.50]   默认 = 金额 × 费率；用户可改
份额（自动算）：823.34            ← 派生显示
备注：[__________________]
                          [取消]  [保存]
```

卖出 Modal 同样，但主输入是「赎回份额」、派生显示「赎回金额」。

实时校验：

- `shares ≤ 0` / `amount ≤ 0` → 禁用「保存」
- 卖出 `shares > 当前可卖份额`（= `shares_bought - shares_sold`）→ 红字提示，禁用「保存」
- `trade_date` 当日无 NAV：`unit_nav` 不预填，placeholder "该日无 NAV，请手填"；后台静默 `ensureHistory`

入口与组合字段：

- 卡片状态 A 进入：side 已预设，「组合」锁定为当前选中组合
- 卡片状态 B 进入：side 不预设（两个 radio），「组合」锁定为当前选中组合
- 详情页 `?portfolio=具体ID` 进入：「组合」预填为该 ID，可改
- 详情页 `?portfolio=all` 进入：「组合」无默认值、必填（下拉选择真实/模拟任一组合）
- 卡片状态 A 下，当 `shares == 0`（已清仓）时，「− 卖出」按钮 disabled，hover 显示 "无可卖份额"

### 5.5 与现有组件的差量

- `components/fund-card.tsx`：新增 props `holdingSummary?` + `portfolioMode: 'all' | id`；底部多渲染 `HoldingsBlock`
- `app/page.tsx`：SSR 多查 transactions，调 `holdings.ts` 算 summary，传给卡片
- `app/funds/[code]/page.tsx`：插入「持仓 KPI」「交易记录」两个 section + 顶部切换器
- 新组件：`PortfolioSwitcher`、`HoldingsBlock`（卡片用）、`HoldingsKpiGrid`（详情页用）、`TransactionTable`、`TransactionModal`、`FeeConfigEditor`（详情页一个小 section 用，可点小齿轮编辑该基金的默认费率）

## 6. 错误处理与边界

### 6.1 数据完整性

- **事务化写入**：POST/PATCH/DELETE transaction 在 `db.transaction(...)` 内完成。写完后重新汇总该 `(portfolio, code)`，若 `shares_bought < shares_sold` 则 `ROLLBACK + 400`。
- **唯一组合不可删**：DELETE 前 `COUNT(portfolios) > 1` 校验。
- **孤立 fund_meta**：从 `watchlist` 移除一只基金时（已有逻辑）保留 `fund_meta`，所以 `transactions.code` 总能解析出 `name`。
- **NaN / 浮点漂移**：所有汇总在 `holdings.ts` 用 number 算；展示用 `toFixed`；写入前 `Number.isFinite()`。

### 6.2 时区与日期

- `trade_date` 用 `YYYY-MM-DD`（与 `fund_nav.nav_date` 同）。客户端按 `Asia/Shanghai` 本地 0 点算今日。
- 服务端不做时区换算，原样存。

### 6.3 性能

- 看板 SSR：现有 `listNavSeriesForCodes` 之外，加一次 `summarizeAllHoldings(portfolioId | 'all')` —— 一条 `SELECT ... GROUP BY portfolio_id, code` 拉全表，内存里按 code 分发给卡片。N≈100 量级毫秒级。
- 详情页 SSR：单只基金的交易列表 + summary，可忽略。

## 7. 测试

- **`lib/domain/holdings.ts`** 纯函数单测最重：
  - 单笔买入 / 多笔买入 / 买卖混合 / 清仓后再买 / 仅卖出（应拒）
  - `shares_bought == 0`、`latest_unit_nav == null` 等空值分支
  - 含费用的 WAC 与 PnL 公式
- **`lib/db/queries.ts`** + in-memory `better-sqlite3` 迁移后 CRUD smoke：
  - portfolio CASCADE 删交易
  - 唯一 portfolio 不可删
  - 写入后超卖触发 ROLLBACK
- **API route**：vitest + Next route handler 直调，覆盖 happy path + 主要错误码
- **UI 组件**：vitest + Testing Library
  - `TransactionModal` 的"金额↔份额↔费用"派生公式
  - `HoldingsBlock` 三种状态切换
  - `PortfolioSwitcher` 的 URL 同步
- **不写 e2e**：项目目前没有 Playwright，本期不引入

## 8. 验收清单

- [ ] 迁移 v3 跑通；老 DB 自动得到「主账本」portfolio
- [ ] 顶部 `PortfolioSwitcher` 出现于 `TagFilterBar` 上方，可建/改名/删/切模拟；URL `?portfolio=` 生效
- [ ] 卡片底部 `HoldingsBlock` 三种状态在不同 portfolio 选择下表现正确
- [ ] 详情页能看到持仓 KPI + 默认费率编辑 + 交易记录表
- [ ] `TransactionModal` 三处派生公式正确，可手改任一字段
- [ ] 编辑/删除交易后 PnL 即时刷新
- [ ] 删 portfolio 时二次确认并连带删交易
- [ ] 从看板移除基金后再加回，持仓数据完整
- [ ] `lib/domain/holdings.ts` 单测全绿；超卖被拦截
