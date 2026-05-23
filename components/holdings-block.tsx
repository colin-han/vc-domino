'use client';
import { useState } from 'react';
import { TransactionModal, type TransactionModalProps } from './transaction-modal';

export interface HoldingsBlockData {
  shares: number;
  mkt_value: number | null;
  total_pnl: number | null;
  return_pct: number | null;
  avg_cost: number | null;
  simulatedMarket?: number | null;
}

export interface HoldingsBlockProps {
  data: HoldingsBlockData | null;
  mode: 'specific' | 'all';
  modalCtx: Omit<TransactionModalProps, 'open' | 'onClose' | 'presetSide'>;
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return `¥${v.toFixed(2)}`;
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
}
function pctClass(v: number | null | undefined) {
  if (v == null) return 'text-zinc-400';
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-zinc-700';
}

export function HoldingsBlock({ data, mode, modalCtx }: HoldingsBlockProps) {
  const [side, setSide] = useState<'BUY' | 'SELL' | null>(null);

  // 状态 B：具体组合 + 无持仓
  if (mode === 'specific' && data == null) {
    return (
      <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-center">
        <button
          onClick={() => setSide('BUY')}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          + 记录交易
        </button>
        <TransactionModal {...modalCtx} open={side !== null} onClose={() => setSide(null)} presetSide={null} />
      </div>
    );
  }

  if (data == null) return null;

  // 状态 C：全部组合
  if (mode === 'all') {
    return (
      <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-400">合计</span>
          <span className="font-semibold">{fmtMoney(data.mkt_value)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">浮盈</span>
          <span className={pctClass(data.total_pnl)}>
            {fmtMoney(data.total_pnl)} ({fmtPct(data.return_pct)})
          </span>
        </div>
        {data.simulatedMarket != null && data.simulatedMarket !== 0 && (
          <div className="text-[10px] text-amber-600">
            （含模拟 {fmtMoney(data.simulatedMarket)}）
          </div>
        )}
      </div>
    );
  }

  // 状态 A：具体组合 + 有持仓
  const canSell = data.shares > 1e-9;
  return (
    <div className="mt-2 border-t border-dashed border-zinc-200 pt-2 text-xs">
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <div className="flex justify-between"><span className="text-zinc-400">份额</span><span>{data.shares.toFixed(4)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-400">市值</span><span>{fmtMoney(data.mkt_value)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-400">成本</span><span>{data.avg_cost != null ? data.avg_cost.toFixed(4) : '—'}</span></div>
        <div className={`flex justify-between ${pctClass(data.total_pnl)}`}><span className="text-zinc-400">浮盈</span><span>{fmtMoney(data.total_pnl)} ({fmtPct(data.return_pct)})</span></div>
      </div>
      <div className="mt-1 flex gap-1">
        <button onClick={() => setSide('BUY')} className="rounded border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:bg-zinc-50">+ 买入</button>
        <button
          onClick={() => setSide('SELL')}
          disabled={!canSell}
          title={canSell ? '' : '无可卖份额'}
          className="rounded border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-300"
        >
          - 卖出
        </button>
        <a
          href={`/funds/${modalCtx.fundCode}?portfolio=${modalCtx.presetPortfolioId}`}
          className="rounded border border-zinc-200 px-2 py-0.5 text-zinc-600 hover:bg-zinc-50"
        >
          记录
        </a>
      </div>
      <TransactionModal {...modalCtx} open={side !== null} onClose={() => setSide(null)} presetSide={side} />
    </div>
  );
}
