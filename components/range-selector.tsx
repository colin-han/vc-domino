'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export const RANGE_OPTIONS = [
  { key: '1W', days: 7, label: '1 周' },
  { key: '1M', days: 30, label: '1 月' },
  { key: '3M', days: 90, label: '3 月' },
  { key: '6M', days: 180, label: '6 月' },
  { key: '1Y', days: 365, label: '1 年' },
] as const;

export function RangeSelector({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(days: number) {
    const next = new URLSearchParams(params);
    next.set('range', String(days));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex gap-1 text-sm">
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => select(o.days)}
          className={`rounded px-2 py-1 ${
            current === o.days
              ? 'bg-zinc-900 text-white'
              : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
