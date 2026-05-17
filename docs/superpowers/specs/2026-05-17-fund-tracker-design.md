# 基金跟踪工具 — 第一期设计（净值跟踪 + 自选看板）

- 日期：2026-05-17
- 形态：本地 Web 应用
- 技术栈：Next.js (App Router, TypeScript) + better-sqlite3
- 数据源：天天基金公开接口

## 1. 范围与非目标

### 范围（MVP）
- 添加 / 删除自选基金（按基金代码，如 `110011`）
- 自选看板：每只基金的名称、类型、最新单位净值、累计净值、最近一个交易日涨跌幅、当日盘中估算涨跌幅
- 基金详情页：近 N 日（默认 90，可切 30/180/365）净值走势图 + 历史净值表
- 手动刷新按钮 + 自动 TTL 刷新（估值 30s；历史净值每日首访拉取）

### 非目标（留给后续子项目）
- 持仓/收益计算
- 多基金筛选与对比
- 提醒推送
- 多用户 / 鉴权（单机单用户）

## 2. 架构总览

```
Next.js App（单进程）
  app/
    page.tsx                    自选看板（RSC）
    funds/[code]/page.tsx       详情页（RSC）
    api/
      watchlist/                增删自选
      funds/[code]/             基金元数据 + 历史净值
      quote/[code]/             盘中估值（短 TTL）
  lib/
    db/        better-sqlite3 + 迁移
    source/    天天基金客户端（fetch + 解析）
    cache/     内存 LRU（盘中估值）
    domain/    纯函数：涨跌幅、交易日判定
  data/funds.db                 SQLite 文件（gitignore）
```

**边界**
- `lib/source/` 是唯一接触天天基金 HTTP 的地方，外部协议变化只影响这一层
- `lib/domain/` 全部纯函数，便于单测
- `app/api/` 只做参数校验 + 编排，业务逻辑下沉到 `lib`
- UI 优先 RSC 直接调 `lib/*`，只在交互处用 Client Component

## 3. 数据源与抓取

| 用途 | URL | 缓存 |
|------|-----|------|
| 盘中估值 | `https://fundgz.1234567.com.cn/js/{code}.js`（JSONP，含 `name/dwjz/gsz/gszzl/gztime`） | 内存 30s TTL |
| 历史净值 | `https://api.fund.eastmoney.com/f10/lsjz?fundCode={code}&pageIndex=1&pageSize=N` | 写入 DB；每日首访拉增量 |
| 基金元数据 | 与盘中估值共用响应 | DB 持久化，每周校验 |

**抓取策略**
- `source/eastmoney.ts` 暴露 `fetchQuote(code)` 与 `fetchHistory(code, since)`，返回归一化结构
- 请求头必须带 `Referer: http://fund.eastmoney.com/`，否则部分接口 403
- JSONP 用正则提取 JSON 字段（不引 eval）
- 失败统一返回 `{ ok: false, reason }`，由上层决定是否回退到 DB
- 同 code 同秒只发一次（in-flight 去重）

**风险**：接口非官方，可能变。`source/` 层做最小契约校验（字段存在性 + 类型），变了立即报错而不是静默错位。

## 4. 数据模型

```sql
CREATE TABLE watchlist (
  code        TEXT PRIMARY KEY,
  added_at    INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE fund_meta (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT,
  meta_updated_at INTEGER NOT NULL
);

CREATE TABLE fund_nav (
  code      TEXT NOT NULL,
  nav_date  TEXT NOT NULL,        -- 'YYYY-MM-DD'
  unit_nav  REAL NOT NULL,
  acc_nav   REAL,
  daily_pct REAL,
  PRIMARY KEY (code, nav_date)
);
CREATE INDEX idx_fund_nav_code_date ON fund_nav(code, nav_date DESC);
```

**不入库**：盘中估值（`gsz/gszzl/gztime`）只放内存 LRU，30s TTL，进程重启重拉。

**迁移**：`PRAGMA user_version` 朴素版本号；第一版直接 `CREATE TABLE IF NOT EXISTS`。

## 5. 关键流程

### A. 加入自选 `POST /api/watchlist {code}`
1. 校验 code 格式（6 位数字）
2. `source.fetchQuote(code)` 拿 name/dwjz；失败返回 400
3. `fund_meta` upsert，`watchlist` insert（已存在 409）
4. 异步触发 `fetchHistory(code, since=90 天前)`，不阻塞响应

### B. 看板首屏 `/`（RSC）
1. `SELECT * FROM watchlist JOIN fund_meta ORDER BY sort_order`
2. `Promise.allSettled(codes.map(getQuote))`：缓存命中直接返回，否则拉接口
3. 同时 `SELECT` 每只基金最近一行 `fund_nav` 作为回退值
4. 客户端组件每 30s 轮询 `/api/quote/:code` 刷新估值列

### C. 详情页 `/funds/[code]?range=90`
1. RSC 读 `fund_nav` 最近 N 日；若不足或最新 `nav_date` 早于上个交易日，触发 `fetchHistory` 增量补齐
2. Recharts `LineChart`，支持单位/累计净值切换
3. 表格：日期 / 单位净值 / 累计净值 / 涨跌幅

### D. 数据新鲜度判定
- 「上个交易日」简易实现：周一~周五且非已知节假日；节假日列表写常量数组，每年初手动补一次（YAGNI，不引第三方日历库）

## 6. 错误处理与可观测性

**分层**
- `source/`：网络/解析失败返回 `{ ok: false, reason: 'network'|'parse'|'not_found' }`，不抛
- `api/`：捕获并映射 HTTP 状态（400 / 404 / 502 / 500）
- UI：单只基金失败显示「—」+ tooltip 原因，`Promise.allSettled` 隔离

**降级**
- 估值拿不到 → 用 DB 最新 `unit_nav`，标记「非实时」
- 历史拉取失败 → 用已有数据画图 + banner 提示

**日志**：服务端 `console.info/warn/error` 输出结构化 JSON 行（time/level/op/code/ms/err）。后续可单点换 pino。

**不做**：Sentry / OpenTelemetry / Prometheus（本地工具，YAGNI）

## 7. 测试策略

- **单元（Vitest）**
  - `lib/domain/`：覆盖率 90%+
  - `lib/source/`：用 fixture 驱动 parse 函数
  - `lib/cache/`：TTL 命中/过期/in-flight 去重
- **集成**
  - `api/*` Route Handler：mock `source/` 层
  - DB 层：临时文件 SQLite，验证 upsert/查询
- **E2E（轻量）**：一个 Playwright smoke（加自选 → 看板出现 → 删除消失），不阻塞迭代
- **不做**：mock 天天基金 HTTP；可视化回归
- **lint/type**：`volta run yarn lint` 0 errors；`tsc --noEmit` 进 lint-staged 与 CI

## 8. 项目结构与启动

```
domino/
├─ app/
│  ├─ page.tsx
│  ├─ funds/[code]/page.tsx
│  ├─ api/
│  │  ├─ watchlist/route.ts
│  │  ├─ watchlist/[code]/route.ts
│  │  ├─ funds/[code]/route.ts
│  │  └─ quote/[code]/route.ts
│  └─ layout.tsx
├─ components/                    shadcn/ui + 业务组件
├─ lib/
│  ├─ db/{client.ts,migrate.ts,queries.ts}
│  ├─ source/eastmoney.ts
│  ├─ cache/quote-cache.ts
│  └─ domain/{nav.ts,trading-day.ts}
├─ data/funds.db                  gitignore
├─ fixtures/                      接口响应快照
├─ tests/
├─ .env                           PORT 等非敏感
├─ .env.local.example             模板（目前无 secret）
├─ docs/superpowers/specs/
└─ package.json
```

**依赖**：`next` `react` / `better-sqlite3` / `zod` / `recharts` / `tailwindcss` + `shadcn/ui` / `vitest` `@vitest/coverage-v8`

**脚本**：`dev` `build` `start` / `lint` `lint:fix` `typecheck` / `test` `test:watch` / `db:migrate`

**包管理**：`volta run yarn`（遵循根 CLAUDE.md）

## 9. 后续规划（仅供参考，不在本期实现）

第二期候选：持仓收益管理（依赖本期数据模型）。
第三期候选：提醒推送（届时引入后台 worker 进程）。
第四期候选：筛选与对比。
