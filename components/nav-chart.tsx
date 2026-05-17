'use client';
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
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={rows}>
          <CartesianGrid stroke="#eee" />
          <XAxis dataKey="nav_date" minTickGap={32} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="unit_nav"
            stroke="#2563eb"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
