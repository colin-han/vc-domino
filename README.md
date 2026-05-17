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
