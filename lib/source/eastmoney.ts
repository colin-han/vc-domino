export interface QuoteData {
  code: string;
  name: string;
  navDate: string;
  unitNav: number;
  estNav: number | null;
  estPct: number | null;
  estTime: string | null;
}

export type SourceResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'network' | 'parse' | 'not_found' };

const HEADERS = {
  Referer: 'http://fund.eastmoney.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
};

function parseJsonpBody(body: string): unknown | null {
  const m = body.match(/jsonpgz\((.*)\);?\s*$/s);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner) return null;
  try {
    return JSON.parse(inner);
  } catch {
    return null;
  }
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchQuote(code: string): Promise<SourceResult<QuoteData>> {
  let body: string;
  try {
    const res = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js`, { headers: HEADERS });
    if (!res.ok) return { ok: false, reason: 'network' };
    body = await res.text();
  } catch {
    return { ok: false, reason: 'network' };
  }

  const obj = parseJsonpBody(body);
  if (obj === null) return { ok: false, reason: 'not_found' };
  if (typeof obj !== 'object') return { ok: false, reason: 'parse' };

  const o = obj as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : null;
  const dwjz = toNumberOrNull(o.dwjz);
  if (!name || dwjz === null) return { ok: false, reason: 'parse' };

  return {
    ok: true,
    data: {
      code,
      name,
      navDate: typeof o.jzrq === 'string' ? o.jzrq : '',
      unitNav: dwjz,
      estNav: toNumberOrNull(o.gsz),
      estPct: toNumberOrNull(o.gszzl),
      estTime: typeof o.gztime === 'string' ? o.gztime : null,
    },
  };
}

export interface HistoryRow {
  navDate: string;
  unitNav: number;
  accNav: number | null;
  dailyPct: number | null;
}

interface EastmoneyLsjzRow {
  FSRQ?: unknown; DWJZ?: unknown; LJJZ?: unknown; JZZZL?: unknown;
}

// 天天基金 lsjz 接口 pageSize 静默封顶 20，必须循环分页才能拿到长历史
const LSJZ_PAGE_SIZE = 20;
const LSJZ_MAX_PAGES = 60; // 安全上限：60 * 20 = 1200 行，约 5 年

async function fetchHistoryPage(
  code: string,
  pageIndex: number,
): Promise<SourceResult<HistoryRow[]>> {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=${pageIndex}&pageSize=${LSJZ_PAGE_SIZE}`;
  let payload: unknown;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return { ok: false, reason: 'network' };
    payload = await res.json();
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'parse' };
  const data = (payload as Record<string, unknown>).Data;
  if (data === null) return { ok: true, data: [] };
  if (typeof data !== 'object') return { ok: false, reason: 'parse' };
  const list = (data as Record<string, unknown>).LSJZList;
  if (!Array.isArray(list)) return { ok: false, reason: 'parse' };

  const rows: HistoryRow[] = [];
  for (const raw of list as EastmoneyLsjzRow[]) {
    const navDate = typeof raw.FSRQ === 'string' ? raw.FSRQ : null;
    const unitNav = toNumberOrNull(raw.DWJZ);
    if (!navDate || unitNav === null) continue;
    rows.push({
      navDate,
      unitNav,
      accNav: toNumberOrNull(raw.LJJZ),
      dailyPct: toNumberOrNull(raw.JZZZL),
    });
  }
  return { ok: true, data: rows };
}

// 拉取至少 minRows 行历史净值；返回升序排列。pageSize 由上游硬限制（20）。
export async function fetchHistory(
  code: string,
  minRows: number,
): Promise<SourceResult<HistoryRow[]>> {
  const all: HistoryRow[] = [];
  for (let page = 1; page <= LSJZ_MAX_PAGES; page += 1) {
    const r = await fetchHistoryPage(code, page);
    if (!r.ok) return r;
    if (r.data.length === 0) break;
    all.push(...r.data);
    if (all.length >= minRows) break;
    if (r.data.length < LSJZ_PAGE_SIZE) break; // 不满一页 = 历史已取尽
  }
  all.sort((a, b) => (a.navDate < b.navDate ? -1 : 1));
  return { ok: true, data: all };
}
