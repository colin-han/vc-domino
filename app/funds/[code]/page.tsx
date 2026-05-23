import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { ensureHistory } from '@/lib/server/ensure-history';
import { NavChart } from '@/components/nav-chart';
import { PortfolioSwitcher } from '@/components/portfolio-switcher';
import { HoldingsKpiGrid } from '@/components/holdings-kpi-grid';
import { TransactionTable } from '@/components/transaction-table';
import { FeeConfigEditor } from '@/components/fee-config-editor';
import { TransactionAddButton } from '@/components/transaction-add-button';
import { computeFundSummary, aggregateAcrossFunds } from '@/lib/domain/holdings';

export const dynamic = 'force-dynamic';

const ALLOWED_RANGES = [30, 90, 180, 365] as const;
type Range = (typeof ALLOWED_RANGES)[number];

function parseRange(v: string | undefined): Range {
  const n = Number(v);
  return (ALLOWED_RANGES as readonly number[]).includes(n) ? (n as Range) : 90;
}
function parsePortfolio(v: string | undefined): number | 'all' {
  if (!v || v === 'all') return 'all';
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 'all';
}

export default async function FundPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { range?: string; portfolio?: string };
}) {
  const { code } = params;
  if (!/^\d{6}$/.test(code)) notFound();
  const range = parseRange(searchParams.range);
  const portfolioSel = parsePortfolio(searchParams.portfolio);

  const q = createQueries(getDb());
  const meta = q.getMeta(code);
  if (!meta) notFound();

  await ensureHistory(q, code, range);
  const rows = q.listNav(code, range);
  const latest = q.latestNav(code);

  const portfolios = q.listPortfolios();
  const txs =
    portfolioSel === 'all'
      ? q.listTransactionsForCodes(null, [code]).get(code) ?? []
      : q.listTransactions(portfolioSel, code);

  const portfolioNames = new Map(portfolios.map((p) => [p.id, p.name]));
  let summary;
  if (portfolioSel === 'all') {
    const byP = new Map<number, typeof txs>();
    for (const t of txs) byP.set(t.portfolio_id, [...(byP.get(t.portfolio_id) ?? []), t]);
    const summaries = [...byP.values()].map((list) => computeFundSummary(list, latest?.unit_nav ?? null));
    const agg = aggregateAcrossFunds(summaries);
    summary = {
      shares: summaries.reduce((a, s) => a + s.shares, 0),
      shares_bought: summaries.reduce((a, s) => a + s.shares_bought, 0),
      shares_sold: summaries.reduce((a, s) => a + s.shares_sold, 0),
      cost_buy: agg.total_cost,
      proceeds_sell: 0,
      avg_cost: null,
      remaining_cost: 0,
      mkt_value: agg.total_market,
      unrealized_pnl: agg.total_unrealized,
      realized_pnl: agg.total_realized,
      total_pnl: agg.total_pnl,
      return_pct: agg.return_pct,
    };
  } else {
    summary = computeFundSummary(txs, latest?.unit_nav ?? null);
  }

  const feeConfig = q.getFeeConfig(code);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-2 text-sm">
        <Link href="/" className="text-blue-600">← 自选</Link>
      </div>
      <h1 className="mb-1 text-2xl font-semibold">
        {meta.name} <span className="font-mono text-zinc-400">{code}</span>
      </h1>

      <div className="mb-3">
        <PortfolioSwitcher items={portfolios.map((p) => ({ id: p.id, name: p.name, is_simulated: p.is_simulated }))} />
      </div>

      <section className="mb-6">
        <div className="mb-2 text-sm font-semibold text-zinc-600">持仓</div>
        <HoldingsKpiGrid s={summary} />
      </section>

      <section className="mb-6">
        <FeeConfigEditor code={code} current={feeConfig} />
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-600">交易记录</h2>
          <TransactionAddButton
            modalCtx={{
              fundCode: code,
              fundName: meta.name,
              portfolios: portfolios.map((p) => ({ id: p.id, name: p.name, is_simulated: p.is_simulated })),
              presetPortfolioId: portfolioSel === 'all' ? null : portfolioSel,
              lockPortfolio: false,
              defaultUnitNav: latest?.unit_nav ?? null,
              feeConfig,
              sharesAvailable: portfolioSel === 'all' ? 0 : summary.shares,
            }}
          />
        </div>
        <TransactionTable
          items={txs}
          showPortfolioColumn={portfolioSel === 'all'}
          portfolioNames={portfolioNames}
        />
      </section>

      <div className="mb-4 flex gap-2 text-sm">
        {ALLOWED_RANGES.map((r) => (
          <Link
            key={r}
            href={`/funds/${code}?range=${r}&portfolio=${searchParams.portfolio ?? 'all'}`}
            className={r === range ? 'font-semibold text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}
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
              <td className={r.daily_pct == null ? '' : r.daily_pct > 0 ? 'text-red-600' : r.daily_pct < 0 ? 'text-green-600' : ''}>
                {r.daily_pct == null ? '—' : `${r.daily_pct.toFixed(2)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
