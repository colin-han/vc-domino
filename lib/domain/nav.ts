export function pctChange(prev: number, next: number): number | null {
  if (prev === 0) return null;
  return ((next - prev) / prev) * 100;
}

interface NavRow {
  nav_date: string;
  unit_nav: number;
}

export function withinRange<T extends NavRow>(rows: T[], anchor: string, days: number): T[] {
  const anchorMs = Date.parse(anchor);
  const cutoff = anchorMs - days * 86400000;
  return rows.filter((r) => Date.parse(r.nav_date) >= cutoff);
}
