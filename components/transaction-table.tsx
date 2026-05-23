'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TxRow } from '@/lib/db/queries';

export function TransactionTable({
  items,
  showPortfolioColumn,
  portfolioNames,
}: {
  items: TxRow[];
  showPortfolioColumn: boolean;
  portfolioNames: Map<number, string>;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);

  async function remove(id: number) {
    if (!confirm('删除这笔交易？删除后持仓与浮盈会重算。')) return;
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error === 'oversell' ? '删除会导致历史超卖' : '删除失败');
      return;
    }
    router.refresh();
  }

  if (items.length === 0) {
    return <div className="rounded border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">还没有交易记录</div>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-zinc-500">
          <th className="py-2">日期</th>
          {showPortfolioColumn && <th>组合</th>}
          <th>方向</th>
          <th className="text-right">份额</th>
          <th className="text-right">单价</th>
          <th className="text-right">金额</th>
          <th className="text-right">费用</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => {
          const gross = t.shares * t.unit_nav;
          const amount = t.side === 'BUY' ? gross + t.fee : gross - t.fee;
          return (
            <tr key={t.id} className="border-b">
              <td className="py-2 font-mono">{t.trade_date}</td>
              {showPortfolioColumn && <td>{portfolioNames.get(t.portfolio_id) ?? `#${t.portfolio_id}`}</td>}
              <td className={t.side === 'BUY' ? 'text-red-600' : 'text-green-600'}>{t.side === 'BUY' ? '买入' : '卖出'}</td>
              <td className="text-right">{t.shares.toFixed(4)}</td>
              <td className="text-right">{t.unit_nav.toFixed(4)}</td>
              <td className="text-right">¥{amount.toFixed(2)}</td>
              <td className="text-right">¥{t.fee.toFixed(2)}</td>
              <td>{t.note ?? ''}</td>
              <td className="space-x-2 text-xs">
                <button onClick={() => setEditingId(t.id)} className="text-blue-600">编辑</button>
                <button onClick={() => remove(t.id)} className="text-red-600">删除</button>
              </td>
            </tr>
          );
        })}
      </tbody>
      {editingId !== null && (
        <EditRowDialog
          tx={items.find((x) => x.id === editingId)!}
          onClose={() => setEditingId(null)}
        />
      )}
    </table>
  );
}

function EditRowDialog({ tx, onClose }: { tx: TxRow; onClose: () => void }) {
  const router = useRouter();
  const [trade_date, setDate] = useState(tx.trade_date);
  const [shares, setShares] = useState(String(tx.shares));
  const [unit_nav, setNav] = useState(String(tx.unit_nav));
  const [fee, setFee] = useState(String(tx.fee));
  const [note, setNote] = useState(tx.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/transactions/${tx.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trade_date,
        shares: Number(shares),
        unit_nav: Number(unit_nav),
        fee: Number(fee),
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErr(b.error === 'oversell' ? '修改会导致历史超卖' : '保存失败');
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
      <div className="w-[360px] rounded-lg bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-semibold">编辑交易（不能改方向）</h3>
        <div className="mb-2"><div className="text-xs text-zinc-500">日期</div><input type="date" value={trade_date} onChange={(e)=>setDate(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">份额</div><input value={shares} onChange={(e)=>setShares(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">单位净值</div><input value={unit_nav} onChange={(e)=>setNav(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">费用</div><input value={fee} onChange={(e)=>setFee(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        <div className="mb-2"><div className="text-xs text-zinc-500">备注</div><input value={note} onChange={(e)=>setNote(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" /></div>
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm text-zinc-500">取消</button>
          <button onClick={save} disabled={busy} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:bg-zinc-300">保存</button>
        </div>
      </div>
    </div>
  );
}
