'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deriveBuyForm, deriveSellForm } from '@/lib/domain/tx-form';

export interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  fundCode: string;
  fundName: string;
  portfolios: Array<{ id: number; name: string; is_simulated: boolean }>;
  presetPortfolioId: number | null;
  lockPortfolio?: boolean;
  presetSide?: 'BUY' | 'SELL' | null;
  defaultUnitNav: number | null;
  feeConfig: { buy_fee_rate: number | null; sell_fee_rate: number | null } | null;
  sharesAvailable: number;
}

export function TransactionModal(props: TransactionModalProps) {
  const router = useRouter();
  const [side, setSide] = useState<'BUY' | 'SELL'>(props.presetSide ?? 'BUY');
  const [portfolioId, setPortfolioId] = useState<number | null>(props.presetPortfolioId);
  const [tradeDate, setTradeDate] = useState<string>(todayISO());
  const [unitNav, setUnitNav] = useState<string>(
    props.defaultUnitNav != null ? props.defaultUnitNav.toFixed(4) : '',
  );
  const [amount, setAmount] = useState<string>('');
  const [shares, setShares] = useState<string>('');
  const [fee, setFee] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setSide(props.presetSide ?? 'BUY');
      setPortfolioId(props.presetPortfolioId);
      setTradeDate(todayISO());
      setUnitNav(props.defaultUnitNav != null ? props.defaultUnitNav.toFixed(4) : '');
      setAmount(''); setShares(''); setFee(''); setNote(''); setErr(null);
    }
  }, [props.open, props.presetSide, props.presetPortfolioId, props.defaultUnitNav]);

  const nUnitNav = Number(unitNav);
  const nAmount = Number(amount);
  const nShares = Number(shares);
  const userFee = fee === '' ? undefined : Number(fee);

  const derived = useMemo(() => {
    if (side === 'BUY') {
      return deriveBuyForm({
        amount: nAmount,
        unit_nav: nUnitNav,
        buy_fee_rate: props.feeConfig?.buy_fee_rate ?? null,
        fee: userFee,
      });
    }
    return deriveSellForm({
      shares: nShares,
      unit_nav: nUnitNav,
      sell_fee_rate: props.feeConfig?.sell_fee_rate ?? null,
      fee: userFee,
    });
  }, [side, nAmount, nShares, nUnitNav, userFee, props.feeConfig]);

  const computedShares = side === 'BUY' ? (derived as { shares: number | null }).shares : nShares;
  const computedAmount = side === 'BUY' ? nAmount : (derived as { amount: number }).amount;
  const computedFee = derived.fee;

  const overSell = side === 'SELL' && Number.isFinite(nShares) && nShares > props.sharesAvailable + 1e-9;
  const canSave =
    portfolioId != null &&
    Number.isFinite(nUnitNav) && nUnitNav > 0 &&
    Number.isFinite(computedShares ?? NaN) && (computedShares ?? 0) > 0 &&
    !overSell && !busy;

  async function submit() {
    if (!canSave || portfolioId == null || computedShares == null) return;
    setBusy(true); setErr(null);
    const res = await fetch(`/api/portfolios/${portfolioId}/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: props.fundCode,
        trade_date: tradeDate,
        side,
        shares: computedShares,
        unit_nav: nUnitNav,
        fee: computedFee,
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? '保存失败');
      return;
    }
    props.onClose();
    router.refresh();
  }

  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-lg bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-base font-semibold">
            {side === 'BUY' ? '买入' : '卖出'} — {props.fundName} <span className="font-mono text-xs text-zinc-400">{props.fundCode}</span>
          </h3>
          <button onClick={props.onClose} className="text-zinc-400">x</button>
        </div>

        {!props.presetSide && (
          <div className="mb-3 flex gap-1 text-sm">
            <button onClick={() => setSide('BUY')} className={tabClass(side === 'BUY')}>买入</button>
            <button onClick={() => setSide('SELL')} className={tabClass(side === 'SELL')}>卖出</button>
          </div>
        )}

        <Field label="组合">
          <select
            disabled={props.lockPortfolio}
            value={portfolioId ?? ''}
            onChange={(e) => setPortfolioId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">— 请选择 —</option>
            {props.portfolios.map((p) => (
              <option key={p.id} value={p.id}>{p.is_simulated ? '~' : ''}{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="日期">
          <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
        </Field>

        <Field label="单位净值">
          <input
            inputMode="decimal"
            value={unitNav}
            placeholder={props.defaultUnitNav == null ? '该日无 NAV，请手填' : ''}
            onChange={(e) => setUnitNav(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </Field>

        {side === 'BUY' ? (
          <Field label="申购金额（元）">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
          </Field>
        ) : (
          <Field label="赎回份额">
            <input inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
            <div className="mt-1 text-xs text-zinc-500">可卖：{props.sharesAvailable.toFixed(4)}</div>
          </Field>
        )}

        <Field label="费用（元）">
          <input
            inputMode="decimal"
            value={fee}
            placeholder={computedFee.toFixed(2)}
            onChange={(e) => setFee(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="mt-1 text-xs text-zinc-500">
            默认费率 {pct(side === 'BUY' ? props.feeConfig?.buy_fee_rate : props.feeConfig?.sell_fee_rate)} · 派生费用 {computedFee.toFixed(2)}
          </div>
        </Field>

        <Field label={side === 'BUY' ? '份额（自动算）' : '回款金额（自动算）'}>
          <div className="rounded bg-zinc-50 px-2 py-1 font-mono text-sm">
            {side === 'BUY'
              ? computedShares != null ? computedShares.toFixed(4) : '—'
              : Number.isFinite(computedAmount) ? computedAmount.toFixed(2) : '—'}
          </div>
        </Field>

        <Field label="备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" />
        </Field>

        {overSell && <div className="mb-2 text-xs text-red-600">超过可卖份额</div>}
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}

        <div className="mt-3 flex justify-end gap-2">
          <button onClick={props.onClose} className="rounded px-3 py-1 text-sm text-zinc-500">取消</button>
          <button onClick={submit} disabled={!canSave} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:bg-zinc-300">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs text-zinc-500">{label}</div>
      {children}
    </div>
  );
}
function tabClass(active: boolean) {
  return `rounded px-3 py-1 ${active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`;
}
function pct(v: number | null | undefined) {
  return v == null ? '未设' : `${(v * 100).toFixed(2)}%`;
}
function todayISO(): string {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return tz.toISOString().slice(0, 10);
}
