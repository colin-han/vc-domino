# domino

本地基金净值看板（第一期）。技术栈：Next.js + TypeScript + better-sqlite3。

## 开发

```bash
volta run yarn install
volta run yarn db:migrate
volta run yarn dev
```

打开 http://localhost:3000

## 命令

- `yarn dev` 开发服务器
- `yarn build` / `yarn start` 生产构建/运行
- `yarn test` Vitest
- `yarn lint` / `yarn lint:fix`
- `yarn typecheck`
- `yarn db:migrate` 应用 SQLite 迁移

## 数据

数据存于 `data/funds.db`（已 gitignore）。
数据来源：天天基金公开接口（非官方，可能变化）。

## 后续规划

见 `docs/superpowers/specs/2026-05-17-fund-tracker-design.md`。

## 标签

- 在卡片上点 `+ tag` 添加：弹出 picker，输入名字搜索现有 tag 或底部"创建"
- 9 色调色板任选；颜色与 tag 绑定，所有显示位置同色
- 顶部 tag 栏点击单选过滤；再点取消
- tag 通过 migration v2 落库（`tags` / `fund_tags` 两张表）
