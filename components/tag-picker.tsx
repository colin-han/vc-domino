'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TagColor } from '@/lib/domain/tag-palette';
import { TAG_PALETTE, tagClasses } from '@/lib/domain/tag-palette';
import { TagChip } from './tag-chip';

interface Tag { id: number; name: string; color: TagColor }

interface Props {
  code: string;
  allTags: Tag[];
  attachedTagIds: Set<number>;
  onClose: () => void;
}

export function TagPicker({ code, allTags, attachedTagIds, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<{ name: string } | null>(null);
  const [color, setColor] = useState<TagColor>('blue');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  const filtered = allTags.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));
  const exactMatch = filtered.some((t) => t.name === query.trim());

  async function toggleTag(tag: Tag) {
    setErr(null);
    setBusy(true);
    try {
      if (attachedTagIds.has(tag.id)) {
        const r = await fetch(`/api/watchlist/${code}/tags/${tag.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error('删除失败');
      } else {
        const r = await fetch(`/api/watchlist/${code}/tags`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tag_id: tag.id }),
        });
        if (!r.ok) throw new Error('添加失败');
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    if (!creating) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: creating.name, color }),
      });
      if (r.status === 409) throw new Error('已存在同名 tag');
      if (!r.ok) throw new Error('创建失败');
      const tag = (await r.json()) as Tag;
      const r2 = await fetch(`/api/watchlist/${code}/tags`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tag_id: tag.id }),
      });
      if (!r2.ok) throw new Error('绑定失败');
      router.refresh();
      setCreating(null);
      setQuery('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="absolute z-50 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg"
    >
      {creating === null ? (
        <>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索或创建 tag…"
            className="mb-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {filtered.map((t) => (
              <TagChip
                key={t.id}
                name={t.name}
                color={t.color}
                selected={attachedTagIds.has(t.id)}
                onClick={() => toggleTag(t)}
              />
            ))}
          </div>
          {query.trim() && !exactMatch && (
            <button
              disabled={busy}
              onClick={() => setCreating({ name: query.trim() })}
              className="mt-2 w-full rounded bg-zinc-50 px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
            >
              创建「{query.trim()}」
            </button>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 text-sm text-zinc-700">
            新建 tag <span className="font-medium">「{creating.name}」</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {TAG_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border ${tagClasses(c)} ${
                  color === c ? 'ring-2 ring-offset-1 ring-zinc-900' : ''
                }`}
                aria-label={c}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={doCreate}
              className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              确认创建
            </button>
            <button
              disabled={busy}
              onClick={() => setCreating(null)}
              className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-600"
            >
              返回
            </button>
          </div>
        </>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
