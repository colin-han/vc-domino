'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TagColor } from '@/lib/domain/tag-palette';
import { TagChip } from './tag-chip';
import { TagPicker } from './tag-picker';
import { MiniChart } from './mini-chart';

interface Tag { id: number; name: string; color: TagColor }
interface NavRow { nav_date: string; unit_nav: number }

export interface FundCardData {
  code: string;
  name: string;
  tags: Tag[];
  latestNav: number | null;
  latestNavDate: string | null;
  prevPct: number | null;
  estPct: number | null;
  estTime: string | null;
  periodPct: number | null;
  series: NavRow[];
}

function fmtPct(v: number | null) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function pctClass(v: number | null) {
  if (v == null) return 'text-zinc-400';
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-zinc-700';
}

export function FundCard({ data, allTags }: { data: FundCardData; allTags: Tag[] }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const attachedIds = new Set(data.tags.map((t) => t.id));

  async function remove() {
    if (!confirm(`移除 ${data.code}？`)) return;
    await fetch(`/api/watchlist/${data.code}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/funds/${data.code}`}
            className="block truncate text-sm font-semibold text-zinc-900 hover:underline"
            title={data.name}
          >
            {data.name}
          </Link>
          <div className="font-mono text-xs text-zinc-400">{data.code}</div>
        </div>
        <button
          onClick={remove}
          className="text-xs text-zinc-400 hover:text-red-600"
          aria-label="移除"
        >
          移除
        </button>
      </div>

      <div className="relative mb-2">
        <div className="flex flex-wrap items-center gap-1">
          {data.tags.map((t) => (
            <TagChip key={t.id} name={t.name} color={t.color} />
          ))}
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            + tag
          </button>
        </div>
        {pickerOpen && (
          <TagPicker
            code={data.code}
            allTags={allTags}
            attachedTagIds={attachedIds}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-zinc-900">
          {data.latestNav?.toFixed(4) ?? '—'}
        </span>
        <span className="text-xs text-zinc-400">{data.latestNavDate ?? ''}</span>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1 text-xs">
        <div>
          <div className="text-zinc-400">上日</div>
          <div className={pctClass(data.prevPct)}>{fmtPct(data.prevPct)}</div>
        </div>
        <div>
          <div className="text-zinc-400">估算</div>
          <div className={pctClass(data.estPct)}>{fmtPct(data.estPct)}</div>
        </div>
        <div>
          <div className="text-zinc-400">区间</div>
          <div className={pctClass(data.periodPct)}>{fmtPct(data.periodPct)}</div>
        </div>
      </div>

      <MiniChart rows={data.series} />
    </div>
  );
}
