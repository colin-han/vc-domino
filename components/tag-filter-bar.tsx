'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { TagColor } from '@/lib/domain/tag-palette';
import { TagChip } from './tag-chip';

interface Tag { id: number; name: string; color: TagColor }

export function TagFilterBar({ tags, current }: { tags: Tag[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (tags.length === 0) return null;

  function toggle(name: string) {
    const next = new URLSearchParams(params);
    if (current === name) next.delete('tag');
    else next.set('tag', name);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-zinc-500">筛选：</span>
      {tags.map((t) => (
        <TagChip
          key={t.id}
          name={t.name}
          color={t.color}
          selected={current === t.name}
          onClick={() => toggle(t.name)}
        />
      ))}
    </div>
  );
}
