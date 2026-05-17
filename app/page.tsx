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
import type { FundCardData } from '@/components/fund-card';

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE = 30;
const ALLOWED_DAYS = new Set(RANGE_OPTIONS.map((o) => o.days));

function parseRange(v: string | undefined): number {
  const n = Number(v);
  return ALLOWED_DAYS.has(n as (typeof RANGE_OPTIONS)[number]['days']) ? n : DEFAULT_RANGE;
}

export default async function Home({
  searchParams,
}: {
  searchParams: { range?: string; tag?: string };
}) {
  const range = parseRange(searchParams.range);
  const tagFilter = searchParams.tag?.trim() || null;

  const q = createQueries(getDb());
  const allTags = q.listTags();
  let items = q.listWatchlistWithTags();
  if (tagFilter) items = items.filter((it) => it.tags.some((t) => t.name === tagFilter));

  await Promise.allSettled(items.map((it) => ensureHistory(q, it.code, range)));

  const seriesMap = q.listNavSeriesForCodes(items.map((it) => it.code), range);

  const cardData: FundCardData[] = await Promise.all(
    items.map(async (it) => {
      const latest = q.latestNav(it.code);
      const series = seriesMap.get(it.code) ?? [];
      const quote = await quoteCache
        .get(it.code, () =>
          fetchQuote(it.code).then((x) => {
            if (!x.ok) throw new Error(x.reason);
            return x.data;
          }),
        )
        .then((d) => ({ ok: true as const, data: d }))
        .catch(() => ({ ok: false as const }));
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
      };
    }),
  );

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">自选基金</h1>
      <div className="mb-4 flex items-center gap-4">
        <AddFundForm />
        <div className="ml-auto">
          <RangeSelector current={range} />
        </div>
      </div>
      <div className="mb-4">
        <TagFilterBar tags={allTags} current={tagFilter} />
      </div>
      <FundGrid items={cardData} allTags={allTags} />
    </main>
  );
}
