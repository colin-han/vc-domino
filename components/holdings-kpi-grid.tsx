import type { FundSummary } from '@/lib/domain/holdings';

export function HoldingsKpiGrid({ s }: { s: FundSummary }) {
  return (
    <div className="grid grid-cols-3 gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
      <Cell label="份额" value={s.shares.toFixed(4)} />
      <Cell label="平均成本" value={s.avg_cost != null ? s.avg_cost.toFixed(4) : '—'} />
      <Cell label="市值" value={s.mkt_value != null ? `¥${s.mkt_value.toFixed(2)}` : '—'} />
      <Cell label="已实现 PnL" value={`¥${s.realized_pnl.toFixed(2)}`} tone={s.realized_pnl} />
      <Cell label="未实现 PnL" value={s.unrealized_pnl != null ? `¥${s.unrealized_pnl.toFixed(2)}` : '—'} tone={s.unrealized_pnl} />
      <Cell
        label="累计收益率"
        value={s.return_pct != null ? `${s.return_pct >= 0 ? '+' : ''}${(s.return_pct * 100).toFixed(2)}%` : '—'}
        tone={s.return_pct}
      />
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  const cls = tone == null ? 'text-zinc-800' : tone > 0 ? 'text-red-600' : tone < 0 ? 'text-green-600' : 'text-zinc-800';
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`mt-1 font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
