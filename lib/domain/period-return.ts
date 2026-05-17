interface NavLike { nav_date: string; unit_nav: number }

// rows 必须按 nav_date 升序传入（首=起点、末=终点）
export function periodReturn(rows: NavLike[]): number | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return 0;
  const first = rows[0].unit_nav;
  const last = rows[rows.length - 1].unit_nav;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}
