# 看板卡片化 + 标签系统 设计

- 日期：2026-05-17
- 状态：草案
- 关联：
  - 主 spec `docs/superpowers/specs/2026-05-17-fund-tracker-design.md`
  - ADR `docs/adr/0001-nav-chart-dual-axis.md`

## 1. 范围

### 本期范围
- 看板从表格改为卡片网格；卡片含：名称/代码、tag chips、移除按钮、最新单位净值+日期、上日涨跌%、盘中估算%、周期总涨跌%、mini-chart
- 顶部全局周期切换器：1W / 1M / 3M / 6M / 1Y；默认 1M；状态写入 URL `?range=`
- 顶部 tag 过滤栏：所有已存在 tag chip，单选过滤；URL `?tag=`
- 卡片上 tag chip 触发 TagPicker：combobox 风格搜索过滤已有 tag、加/移、底部「创建『xxx』」分支
- 创建 tag 时从 9 色预设调色板选色

### 非目标
- 多 tag 同时过滤（AND/OR）
- tag 重命名/删除的**UI 入口**（PATCH/DELETE 端点本期仍实现，但前端不暴露按钮；后续做"tag 管理页"时再连通）
- 卡片排序/拖拽
- 详情页变更

## 2. 数据模型 + Migration

新增两张表，**通过 `lib/db/migrate.ts` 的 `MIGRATIONS` 数组追加，user_version 从 1 → 2**。

```sql
-- Migration v2

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
```

**调色板（代码常量）**：

```ts
// lib/domain/tag-palette.ts
export const TAG_PALETTE = [
  'zinc', 'red', 'orange', 'amber',
  'green', 'teal', 'blue', 'violet', 'pink',
] as const;
export type TagColor = (typeof TAG_PALETTE)[number];

// 配套 Tailwind class 映射：bg-{c}-100 / text-{c}-700 / border-{c}-300
```

`color` 列存 key（不存 hex）；改调色板时无需 migrate 数据。

**约束与边界**：
- `tags.name` UNIQUE — 重名直接 409
- `fund_tags.tag_id` ON DELETE CASCADE — 删 tag 自动解绑所有基金
- `fund_tags` 没有 FK 到 `watchlist.code`：允许"基金已从自选移除但 fund_tags 残留"；看板 JOIN watchlist 自然过滤掉，残留不清理

## 3. API

```
GET    /api/tags                                列出所有 tag（含基金计数）
POST   /api/tags                                创建 tag       body { name, color }
PATCH  /api/tags/[id]                           改名/换色      body { name?, color? }
DELETE /api/tags/[id]                           删除（自动解绑）

POST   /api/watchlist/[code]/tags               给基金加 tag   body { tag_id }
DELETE /api/watchlist/[code]/tags/[tagId]       给基金移除 tag
```

**状态码**
- 200 / 201 成功
- 400 参数非法（空 name；color 不在 palette）
- 404 tag 或 fund 不存在
- 409 tag 重名 / fund-tag 关联已存在

**响应结构**

```ts
GET /api/tags
{ items: Array<{ id: number; name: string; color: TagColor; fund_count: number }> }

POST /api/tags  → 201
{ id: number; name: string; color: TagColor }
```

**看板 RSC 不走 API**：直接 `createQueries(getDb())`。tag CRUD 走 HTTP，因为 TagPicker 是 Client Component。

## 4. 数据查询封装

`lib/db/queries.ts` 追加：

```ts
export interface TagRow { id: number; name: string; color: TagColor; sort_order: number }
export interface TagWithCount extends TagRow { fund_count: number }

listTags(): TagWithCount[]
getTag(id: number): TagRow | null
createTag(input: { name: string; color: TagColor }): TagRow
updateTag(id: number, patch: { name?: string; color?: TagColor }): void
deleteTag(id: number): void

addFundTag(code: string, tagId: number): void
removeFundTag(code: string, tagId: number): void
listTagsForFund(code: string): TagRow[]

listWatchlistWithTags(): Array<WatchlistItem & { tags: TagRow[] }>
listNavSeriesForCodes(codes: string[], range: number): Map<string, NavRow[]>
```

- `listWatchlistWithTags`：单条 SQL `JOIN fund_tags JOIN tags`，按 watchlist 排序聚合 tags
- `listNavSeriesForCodes`：单条 `WHERE code IN (...)` + per-code LIMIT；调用方分组成 Map

## 5. 组件与文件结构

```
app/
  page.tsx                       重写：RSC 拿数据，按 range/tag 过滤，渲染 <FundGrid>
  api/
    tags/route.ts                GET / POST
    tags/[id]/route.ts           PATCH / DELETE
    watchlist/[code]/tags/route.ts        POST
    watchlist/[code]/tags/[tagId]/route.ts DELETE

components/
  fund-card.tsx                  client（含 TagPicker 入口 + 移除确认）
  mini-chart.tsx                 client；Recharts LineChart 无轴
  tag-chip.tsx                   彩色 pill
  tag-picker.tsx                 client；combobox + 颜色选择器；调 tag API
  tag-filter-bar.tsx             client；点击改 URL ?tag=
  range-selector.tsx             client；点击改 URL ?range=
  fund-grid.tsx                  CSS grid 响应式
  add-fund-form.tsx              保留

  watchlist-table.tsx            删除

lib/
  domain/tag-palette.ts          调色板 + key→Tailwind class 映射

tests/
  lib/db/queries-tags.test.ts
  lib/db/migrate.test.ts         追加 v1→v2 用例
  api/tags.test.ts
  api/fund-tags.test.ts
  lib/domain/tag-palette.test.ts
```

### TagPicker 交互流程

```
点击卡片上的 + chip
  → popover：搜索框 + 已绑 tag（高亮，可取消）+ 未绑 tag（可添加）
  → 输入文字过滤；无完全匹配 → 底部「创建『xxx』」
  → 点创建 → 9 色 swatch → POST /api/tags → POST /api/watchlist/[code]/tags → router.refresh()
  → 点已绑 tag → DELETE → refresh
  → 点未绑 tag → POST → refresh
```

### MiniChart

无坐标轴、无 Grid、无 Tooltip；高度 ~40px；按周期 N 行 `unit_nav` 画直线段（type=linear），颜色由起点-终点涨跌决定（涨红 / 跌绿）。

## 6. 关键流程与边界

### 周期总涨跌% 计算

`(终点 unit_nav - 起点 unit_nav) / 起点 unit_nav × 100`，其中起点 = 周期内最早一行 nav、终点 = 最新一行 nav。在 RSC 中算好后传给卡片，避免重复计算。

### 看板加载 `/?range=30&tag=核心仓`
1. RSC 解析 `range` (1W=7 / 1M=30 / 3M=90 / 6M=180 / 1Y=365)，默认 30；`tag` 默认空
2. `q.listWatchlistWithTags()` → `[{...item, tags: [...]}]`
3. 若 `?tag=` 存在 → `items.filter(it => it.tags.some(t => t.name === tag))`
4. `q.countNav(code) < range` 触发 `fetchHistory` 回填（与详情页同一 helper）
5. `q.listNavSeriesForCodes(codes, range)` 拿所有 mini-chart 数据
6. `Promise.allSettled(quoteCache.get(code, fetchQuote))` 拿估值
7. 渲染 `<RangeSelector><TagFilterBar><FundGrid>`

### 周期切换
`<RangeSelector>` 点击 → `router.push('/?range=90&tag=...')`，保留其他 query → RSC 重渲染 → 所有 mini-chart 同步刷新

### tag 过滤
`<TagFilterBar>` 同样 push URL；点击当前选中的 tag = 取消（删 `?tag=`）

### tag CRUD
- 创建 + 绑定：连调两个 endpoint（先 POST /api/tags，再 POST /api/watchlist/[code]/tags）
- 重名 409：picker 内显示「已存在同名 tag」
- 加/移：单个 POST / DELETE
- 全部走 `router.refresh()`

### 边界
- 空自选 → 「还没有自选基金」（沿用）
- 空 tag → 顶部过滤栏隐藏
- 基金没绑任何 tag → 卡片右上仅显示 `+ 添加 tag`
- 某基金缺周期内 nav → MiniChart 显示「数据不足」灰条
- fund_tags 残留 → JOIN 过滤；不主动清理
- 切到 1Y 且 fund_nav < 365 → 触发 `fetchHistory` 回填（沿用 §6 流程 4）

## 7. 错误处理 与 测试

### 错误处理

- API 层：zod 校验 → 400；UNIQUE constraint → 409；getTag(id)=null → 404；DB 错误 → 500 + 结构化日志 `log.error('tag_op', {op, err})`
- UI 层：TagPicker 失败 → 内联红字提示；quote 失败 → 复用 `Promise.allSettled` 路径；mini-chart 数据不足 → 灰条

### 测试

| 文件 | 覆盖 |
|------|------|
| `tests/lib/domain/tag-palette.test.ts` | palette 不可变 + isValidColor 守卫 |
| `tests/lib/db/migrate.test.ts` | 追加：v1→v2 升级路径，tags / fund_tags 表存在 |
| `tests/lib/db/queries-tags.test.ts` | listTags / CRUD / addFundTag / listWatchlistWithTags / listNavSeriesForCodes |
| `tests/api/tags.test.ts` | GET/POST/PATCH/DELETE 全部状态码 |
| `tests/api/fund-tags.test.ts` | 加/移基金 tag；重复添加 409 |

UI 不写自动化测试（沿用惯例）；最终 task 跑手动 smoke：
- 添加基金 → 卡片 + mini-chart 出现
- 创建 tag → 选色 → chip 显示
- tag 栏过滤 → 卡片数变化
- 周期切换 → mini-chart 长度变化
- 删除 tag → chip 消失

### 回归

现有 11 个测试文件、42 个 case 应保持通过；`app/page.tsx` 重写后 UI smoke 路径需重跑。`migrate.test` 追加 v1→v2 用例。

## 8. 后续规划（不在本期）

- 多 tag AND/OR 过滤
- tag 管理页（批量编辑/合并/排序）
- 拖拽改卡片顺序，写回 `watchlist.sort_order`
