// 2026 节假日（A 股休市），需每年初手动更新
const HOLIDAYS_2026 = new Set([
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-06',
  '2026-05-01',
  '2026-06-19',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
]);

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isTradingDay(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAYS_2026.has(toIsoDate(d));
}

export function previousTradingDay(from: Date): string {
  const d = new Date(from.getTime());
  for (let i = 0; i < 14; i += 1) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (isTradingDay(d)) return toIsoDate(d);
  }
  throw new Error('previousTradingDay: 14 天内未找到交易日');
}
