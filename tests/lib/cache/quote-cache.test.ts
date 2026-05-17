import { describe, it, expect, vi } from 'vitest';
import { createQuoteCache } from '@/lib/cache/quote-cache';

describe('quote-cache', () => {
  it('TTL 内命中缓存，过期后重新调用 loader', async () => {
    const now = { t: 0 };
    const cache = createQuoteCache<number>({ ttlMs: 100, now: () => now.t });
    const loader = vi.fn().mockResolvedValue(42);
    expect(await cache.get('a', loader)).toBe(42);
    expect(await cache.get('a', loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
    now.t = 200;
    expect(await cache.get('a', loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('in-flight 去重：同 key 并发只触发一次 loader', async () => {
    const cache = createQuoteCache<number>({ ttlMs: 1000, now: () => 0 });
    let resolve!: (v: number) => void;
    const loader = vi.fn(() => new Promise<number>((r) => { resolve = r; }));
    const p1 = cache.get('a', loader);
    const p2 = cache.get('a', loader);
    resolve(7);
    expect(await p1).toBe(7);
    expect(await p2).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
