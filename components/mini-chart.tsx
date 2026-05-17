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
  const stroke = last >= first ? '#dc2626' : '#16a34a';
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
