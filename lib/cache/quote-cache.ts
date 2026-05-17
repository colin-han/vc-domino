interface Options { ttlMs: number; now?: () => number }

export function createQuoteCache<T>(opts: Options) {
  const ttl = opts.ttlMs;
  const now = opts.now ?? (() => Date.now());
  const store = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();

  async function get(key: string, loader: () => Promise<T>): Promise<T> {
    const t = now();
    const hit = store.get(key);
    if (hit && hit.expiresAt > t) return hit.value;
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        const v = await loader();
        store.set(key, { value: v, expiresAt: now() + ttl });
        return v;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  return { get };
}
