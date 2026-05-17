'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Row {
  code: string;
  name: string;
  type: string | null;
  latestNav: number | null;
  accNav: number | null;
  latestNavDate: string | null;
  prevPct: number | null;
  estPct: number | null;
  estTime: string | null;
}

interface QuoteApiResponse {
  estPct: number | null;
  estTime: string | null;
}

export function WatchlistTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const rowsRef = useRef(rows);
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setRows(initial);
    rowsRef.current = initial;
  }, [initial]);

  // Keep ref in sync with latest rows so the interval closure always sees current data
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Run once on mount; read from ref inside the interval to avoid stale closure
  useEffect(() => {
    const timer = setInterval(async () => {
      const snapshot = rowsRef.current;
      const updates = await Promise.all(snapshot.map(async (r) => {
        const res = await fetch(`/api/quote/${r.code}`).catch(() => null);
        if (!res || !res.ok) return null;
        const body = await res.json() as QuoteApiResponse;
        return { code: r.code, estPct: body.estPct, estTime: body.estTime };
      }));
      setRows((prev) => prev.map((r) => {
        const u = updates.find((x) => x?.code === r.code);
        if (!u) return r;
        return { ...r, estPct: u.estPct, estTime: u.estTime };
      }));
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  async function remove(code: string) {
    if (!confirm(`移除 ${code}？`)) return;
    await fetch(`/api/watchlist/${code}`, { method: 'DELETE' });
    router.refresh();
  }

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1500);
  }

  if (rows.length === 0) {
    return <p className="text-zinc-500">还没有自选基金。试着加一个。</p>;
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          {refreshing ? '刷新中…' : '刷新'}
        </button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-500">
            <th className="py-2">代码</th>
            <th>名称</th>
            <th>最新净值</th>
            <th>累计净值</th>
            <th>上日涨跌</th>
            <th>盘中估算</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-b">
              <td className="py-2 font-mono">
                <Link href={`/funds/${r.code}`} className="text-blue-600 hover:underline">{r.code}</Link>
              </td>
              <td>{r.name}</td>
              <td>{r.latestNav?.toFixed(4) ?? '—'} <span className="text-xs text-zinc-400">{r.latestNavDate}</span></td>
              <td>{r.accNav?.toFixed(4) ?? '—'}</td>
              <td className={pctClass(r.prevPct)}>{formatPct(r.prevPct)}</td>
              <td className={pctClass(r.estPct)}>{formatPct(r.estPct)} <span className="text-xs text-zinc-400">{r.estTime ?? ''}</span></td>
              <td><button onClick={() => remove(r.code)} className="text-xs text-red-600">移除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatPct(v: number | null) { return v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function pctClass(v: number | null) {
  if (v == null) return 'text-zinc-400';
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-zinc-700';
}
