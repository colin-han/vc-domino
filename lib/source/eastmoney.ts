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
