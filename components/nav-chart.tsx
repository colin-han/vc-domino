'use client';
import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface Row {
  nav_date: string;
  unit_nav: number;
  acc_nav: number | null;
}

interface AxisPlan {
  leftDomain: [number, number];
  rightDomain: [number, number];
  offset: number;
}

function computeAxes(rows: Row[]): AxisPlan | null {
  if (rows.length === 0) return null;
  const anchor = rows.find((r) => r.acc_nav != null) ?? null;
  if (!anchor) return null;
  const offset = (anchor.acc_nav as number) - anchor.unit_nav;
  // 把 acc_nav 折算到"左轴坐标系"再合并，确保两条线都能完整显示
  const unitVals = rows.map((r) => r.unit_nav);
  const accInLeftScale = rows
    .filter((r) => r.acc_nav != null)
    .map((r) => (r.acc_nav as number) - offset);
  const all = [...unitVals, ...accInLeftScale];
  const min = Math.min(...all);
  const max = Math.max(...all);
  // 留 2% 留白
  const pad = (max - min) * 0.02 || 0.01;
  const leftLo = min - pad;
  const leftHi = max + pad;
  return {
    leftDomain: [leftLo, leftHi],
    rightDomain: [leftLo + offset, leftHi + offset],
    offset,
  };
}

export function NavChart({ rows }: { rows: Row[] }) {
  const plan = useMemo(() => computeAxes(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center text-sm text-zinc-400">
        暂无数据
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={rows}>
          <CartesianGrid stroke="#eee" />
          <XAxis dataKey="nav_date" minTickGap={32} />
          <YAxis
            yAxisId="left"
            domain={plan ? plan.leftDomain : ['auto', 'auto']}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          {plan && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={plan.rightDomain}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
          )}
          <Tooltip />
          <Legend />
          {/* 渲染顺序：先画累计净值（灰，垫底），再画单位净值（蓝，置顶） */}
          {plan && (
            <Line
              yAxisId="right"
              type="linear"
              dataKey="acc_nav"
              name="累计净值"
              stroke="#9ca3af"
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          )}
          <Line
            yAxisId="left"
            type="linear"
            dataKey="unit_nav"
            name="单位净值"
            stroke="#2563eb"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
