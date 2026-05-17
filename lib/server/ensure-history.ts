import type { Queries } from '@/lib/db/queries';
import { fetchHistory } from '@/lib/source/eastmoney';
import { previousTradingDay } from '@/lib/domain/trading-day';
import { log } from '@/lib/logger';

export async function ensureHistory(q: Queries, code: string, range: number): Promise<void> {
  const latest = q.latestNav(code);
  const need = previousTradingDay(new Date());
  const haveRows = q.countNav(code);
  if (latest && latest.nav_date >= need && haveRows >= range) return;

  const r = await fetchHistory(code, range + 30);
  if (r.ok) {
    try {
      q.upsertNavRows(code, r.data);
    } catch (e) {
      log.error('history_persist', { code, err: String(e) });
    }
  } else {
    log.warn('history_fetch_failed', { code, reason: r.reason });
  }
}
