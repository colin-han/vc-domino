import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchQuote } from '@/lib/source/eastmoney';
import { quoteCache } from '@/lib/cache';
import { ensureHistory } from '@/lib/server/ensure-history';
import { periodReturn } from '@/lib/domain/period-return';
import { AddFundForm } from '@/components/add-fund-form';
import { FundGrid } from '@/components/fund-grid';
import { RangeSelector } from '@/components/range-selector';
import { RANGE_OPTIONS } from '@/lib/domain/range-options';
import { TagFilterBar } from '@/components/tag-filter-bar';
import { PortfolioSwitcher } from '@/components/portfolio-switcher';
import type { FundCardData } from '@/components/fund-card';
import {
  computeFundSummary,
  aggregateAcrossFunds,
  type FundSummary,
} from '@/lib/domain/holdings';
import type { HoldingsBlockData } from '@/components/holdings-block';

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE = 30;
const ALLOWED_DAYS = new Set(RANGE_OPTIONS.map((o) => o.days));

function parseRange(v: string | undefined): number {
  const n = Number(v);
  return ALLOWED_DAYS.has(n as (typeof RANGE_OPTIONS)[number]['days']) ? n : DEFAULT_RANGE;
}
function parsePortfolio(v: string | undefined): number | 'all' {
  if (!v || v === 'all') return 'all';
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 'all';
}

export default async function Home({
  searchParams,
}: {
  searchParams: { range?: string; tag?: string; portfolio?: string };
}) {
  const range = parseRange(searchParams.range);
  const tagFilter = searchParams.tag?.trim() || null;
  const portfolioSel = parsePortfolio(searchParams.portfolio);

  const q = createQueries(getDb());
  const allTags = q.listTags();
  let items = q.listWatchlistWithTags();
  if (tagFilter) items = items.filter((it) => it.tags.some((t) => t.name === tagFilter));

  await Promise.allSettled(items.map((it) => ensureHistory(q, it.code, range)));

  const codes = items.map((it) => it.code);
  const seriesMap = q.listNavSeriesForCodes(codes, range);
  const portfolios = q.listPortfolios();
  const txMap = q.listTransactionsForCodes(
    portfolioSel === 'all' ? null : portfolioSel,
    codes,
  );
  const realIds = new Set(portfolios.filter((p) => !p.is_simulated).map((p) => p.id));

  const cardData: FundCardData[] = await Promise.all(
    items.map(async (it) => {
      const latest = q.latestNav(it.code);
      const series = seriesMap.get(it.code) ?? [];
      const txs = txMap.get(it.code) ?? [];
      const feeConfig = q.getFeeConfig(it.code);
      const quote = await quoteCache
        .get(it.code, () =>
          fetchQuote(it.code).then((x) => {
            if (!x.ok) throw new Error(x.reason);
            return x.data;
          }),
        )
        .then((d) => ({ ok: true as const, data: d }))
        .catch(() => ({ ok: false as const }));

      let holding: HoldingsBlockData | null = null;
      let sharesAvailable = 0;
      if (portfolioSel === 'all') {
        if (txs.length > 0) {
          const byP = new Map<number, typeof txs>();
          for (const t of txs) byP.set(t.portfolio_id, [...(byP.get(t.portfolio_id) ?? []), t]);
          const summaries: FundSummary[] = [];
          let simulatedMarket: number | null = 0;
          for (const [pid, list] of byP) {
            const s = computeFundSummary(list, latest?.unit_nav ?? null);
            summaries.push(s);
            if (!realIds.has(pid)) {
              if (s.mkt_value == null) simulatedMarket = null;
              else if (simulatedMarket != null) simulatedMarket += s.mkt_value;
            }
          }
          const agg = aggregateAcrossFunds(summaries);
          holding = {
            shares: summaries.reduce((acc, s) => acc + s.shares, 0),
            mkt_value: agg.total_market,
            total_pnl: agg.total_pnl,
            return_pct: agg.return_pct,
            avg_cost: null,
            simulatedMarket,
          };
        }
      } else {
        if (txs.length > 0) {
          const s = computeFundSummary(txs, latest?.unit_nav ?? null);
          holding = {
            shares: s.shares,
            mkt_value: s.mkt_value,
            total_pnl: s.total_pnl,
            return_pct: s.return_pct,
            avg_cost: s.avg_cost,
          };
          sharesAvailable = s.shares;
        }
      }

      return {
        code: it.code,
        name: it.name,
        tags: it.tags,
        latestNav: latest?.unit_nav ?? (quote.ok ? quote.data.unitNav : null),
        latestNavDate: latest?.nav_date ?? (quote.ok ? quote.data.navDate : null),
        prevPct: latest?.daily_pct ?? null,
        estPct: quote.ok ? quote.data.estPct : null,
        estTime: quote.ok ? quote.data.estTime : null,
        periodPct: periodReturn(series),
        series,
        holding,
        portfolioMode: portfolioSel === 'all' ? 'all' : 'specific',
        presetPortfolioId: portfolioSel === 'all' ? null : portfolioSel,
        feeConfig,
        sharesAvailable,
      };
    }),
  );

  const portfolioOptions = portfolios.map((p) => ({
    id: p.id,
    name: p.name,
    is_simulated: p.is_simulated,
  }));

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">自选基金</h1>
      <div className="mb-4 flex items-center gap-4">
        <AddFundForm />
        <div className="ml-auto">
          <RangeSelector current={range} />
        </div>
      </div>
      <div className="mb-2">
        <PortfolioSwitcher items={portfolioOptions} />
      </div>
      <div className="mb-4">
        <TagFilterBar tags={allTags} current={tagFilter} />
      </div>
      <FundGrid items={cardData} allTags={allTags} portfolios={portfolioOptions} />
    </main>
  );
}
