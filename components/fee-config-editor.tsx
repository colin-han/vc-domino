'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function FeeConfigEditor({
  code,
  current,
}: {
  code: string;
  current: { buy_fee_rate: number | null; sell_fee_rate: number | null } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [buy, setBuy] = useState(current?.buy_fee_rate != null ? (current.buy_fee_rate * 100).toFixed(2) : '');
  const [sell, setSell] = useState(current?.sell_fee_rate != null ? (current.sell_fee_rate * 100).toFixed(2) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/funds/${code}/fee-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        buy_fee_rate: buy === '' ? null : Number(buy) / 100,
        sell_fee_rate: sell === '' ? null : Number(sell) / 100,
      }),
    });
    setBusy(false);
    if (res.ok) { setEditing(false); router.refresh(); }
  }

  return (
    <div className="flex items-center gap-3 rounded border border-zinc-200 bg-white px-3 py-2 text-sm">
      {!editing ? (
        <>
          <span className="text-zinc-500">默认费率</span>
          <span>申购 {current?.buy_fee_rate != null ? `${(current.buy_fee_rate * 100).toFixed(2)}%` : '未设'}</span>
          <span>·</span>
          <span>赎回 {current?.sell_fee_rate != null ? `${(current.sell_fee_rate * 100).toFixed(2)}%` : '未设'}</span>
          <button onClick={() => setEditing(true)} className="ml-auto text-xs text-blue-600">编辑</button>
        </>
      ) : (
        <>
          <span className="text-zinc-500">申购</span>
          <input value={buy} onChange={(e) => setBuy(e.target.value)} className="w-16 rounded border border-zinc-300 px-1 text-sm" placeholder="%" />
          <span>%</span>
          <span className="text-zinc-500">赎回</span>
          <input value={sell} onChange={(e) => setSell(e.target.value)} className="w-16 rounded border border-zinc-300 px-1 text-sm" placeholder="%" />
          <span>%</span>
          <button onClick={() => setEditing(false)} className="ml-auto text-xs text-zinc-500">取消</button>
          <button onClick={save} disabled={busy} className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-white disabled:bg-zinc-300">保存</button>
        </>
      )}
    </div>
  );
}
