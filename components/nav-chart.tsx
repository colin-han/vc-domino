'use client';
import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface Row {
  nav_date: string;
  unit_nav: number;
  acc_nav: number | null;
}

export function NavChart({ rows }: { rows: Row[] }) {
  const [field, setField] = useState<'unit_nav' | 'acc_nav'>('unit_nav');

  const hasAccNav = rows.some((r) => r.acc_nav != null);

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button
          onClick={() => setField('unit_nav')}
          className={`rounded px-3 py-1 text-sm ${field === 'unit_nav' ? 'bg-blue-600 text-white' : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
        >
          单位净值
        </button>
        <button
          onClick={() => setField('acc_nav')}
          className={`rounded px-3 py-1 text-sm ${field === 'acc_nav' ? 'bg-blue-600 text-white' : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
        >
          累计净值
        </button>
      </div>
      {field === 'acc_nav' && !hasAccNav ? (
        <div className="flex h-80 w-full items-center justify-center text-zinc-400 text-sm">
          暂无累计净值数据
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="nav_date" minTickGap={32} />
              <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey={field}
                stroke="#2563eb"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
