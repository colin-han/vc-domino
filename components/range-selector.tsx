'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { RANGE_OPTIONS } from '@/lib/domain/range-options';

export { RANGE_OPTIONS };

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
