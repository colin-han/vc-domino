import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { ensureHistory } from '@/lib/server/ensure-history';
import { NavChart } from '@/components/nav-chart';

export const dynamic = 'force-dynamic';

const ALLOWED_RANGES = [30, 90, 180, 365] as const;
type Range = (typeof ALLOWED_RANGES)[number];

function parseRange(v: string | undefined): Range {
  const n = Number(v);
  return (ALLOWED_RANGES as readonly number[]).includes(n) ? (n as Range) : 90;
}

export default async function FundPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { range?: string };
}) {
  const { code } = params;
  if (!/^\d{6}$/.test(code)) notFound();
  const range = parseRange(searchParams.range);

  const q = createQueries(getDb());
  const meta = q.listWatchlist().find((w) => w.code === code);
  if (!meta) notFound();

  await ensureHistory(q, code, range);
  const rows = q.listNav(code, range);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-2 text-sm">
        <Link href="/" className="text-blue-600">
          ← 自选
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-semibold">
        {meta.name} <span className="font-mono text-zinc-400">{code}</span>
      </h1>
      <div className="mb-4 flex gap-2 text-sm">
        {ALLOWED_RANGES.map((r) => (
          <Link
            key={r}
            href={`/funds/${code}?range=${r}`}
            className={
              r === range ? 'font-semibold text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
            }
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
              <td
                className={
                  r.daily_pct == null
                    ? ''
                    : r.daily_pct > 0
                      ? 'text-red-600'
                      : r.daily_pct < 0
                        ? 'text-green-600'
                        : ''
                }
              >
                {r.daily_pct == null ? '—' : `${r.daily_pct.toFixed(2)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
