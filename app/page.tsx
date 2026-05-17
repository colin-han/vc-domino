import { getDb } from '@/lib/db/client';
import { createQueries } from '@/lib/db/queries';
import { fetchQuote } from '@/lib/source/eastmoney';
import { quoteCache } from '@/lib/cache';
import { AddFundForm } from '@/components/add-fund-form';
import { WatchlistTable } from '@/components/watchlist-table';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const q = createQueries(getDb());
  const items = q.listWatchlist();

  const rows = await Promise.all(items.map(async (it) => {
    const latest = q.latestNav(it.code);
    const quote = await quoteCache
      .get(it.code, () => fetchQuote(it.code).then((x) => { if (!x.ok) throw new Error(x.reason); return x.data; }))
      .then((d) => ({ ok: true as const, data: d }))
      .catch(() => ({ ok: false as const, data: undefined }));

    return {
      code: it.code,
      name: it.name,
      type: it.type,
      latestNav: latest?.unit_nav ?? (quote.ok ? quote.data.unitNav : null),
      latestNavDate: latest?.nav_date ?? (quote.ok ? quote.data.navDate : null),
      prevPct: latest?.daily_pct ?? null,
      estPct: quote.ok ? quote.data.estPct : null,
      estTime: quote.ok ? quote.data.estTime : null,
    };
  }));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">自选基金</h1>
      <div className="mb-6"><AddFundForm /></div>
      <WatchlistTable initial={rows} />
    </main>
  );
}
