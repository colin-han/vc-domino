'use client';
import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface PortfolioOption {
  id: number;
  name: string;
  is_simulated: boolean;
}

export function PortfolioSwitcher({ items }: { items: PortfolioOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const current = params.get('portfolio') ?? 'all';
  const selected = items.find((p) => String(p.id) === current);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function navigate(portfolio: string) {
    const next = new URLSearchParams(params);
    next.set('portfolio', portfolio);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-400">组合</span>
      <button
        onClick={() => navigate('all')}
        className={pillClass(current === 'all', false)}
      >
        全部
      </button>
      {items.map((p) => (
        <button
          key={p.id}
          onClick={() => navigate(String(p.id))}
          className={pillClass(String(p.id) === current, p.is_simulated)}
        >
          {p.is_simulated ? '~' : ''}{p.name}
        </button>
      ))}
      <button
        onClick={() => setCreateOpen(true)}
        className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-zinc-500 hover:bg-zinc-50"
      >
        +
      </button>

      {selected && (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full px-2 py-0.5 text-zinc-400 hover:bg-zinc-100"
          >
            ...
          </button>
          {menuOpen && (
            <PortfolioMenu
              p={selected}
              canDelete={items.length > 1}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      )}

      {createOpen && (
        <CreatePopover onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}

function pillClass(active: boolean, simulated: boolean): string {
  const base = 'rounded-full px-3 py-0.5';
  const tone = simulated ? 'text-amber-700' : 'text-zinc-700';
  if (active) return `${base} ${simulated ? 'bg-amber-100' : 'bg-zinc-200'} font-medium ${tone}`;
  return `${base} ${tone} hover:bg-zinc-100`;
}

function CreatePopover({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sim, setSim] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const res = await fetch('/api/portfolios', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), is_simulated: sim }),
    });
    setBusy(false);
    if (res.ok) {
      onClose();
      router.refresh();
    } else if (res.status === 409) alert('名称已存在');
    else alert('创建失败');
  }
  return (
    <div className="absolute z-10 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow">
      <div className="mb-2 text-xs text-zinc-500">新建组合</div>
      <input
        autoFocus
        className="mb-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        placeholder="组合名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="mb-2 flex items-center gap-1 text-xs text-zinc-600">
        <input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} />
        模拟账本
      </label>
      <div className="flex justify-end gap-1">
        <button onClick={onClose} className="px-2 py-1 text-xs text-zinc-500">取消</button>
        <button
          disabled={busy || !name.trim()}
          onClick={submit}
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:bg-zinc-300"
        >
          创建
        </button>
      </div>
    </div>
  );
}

function PortfolioMenu({
  p,
  canDelete,
  onClose,
}: {
  p: PortfolioOption;
  canDelete: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  async function rename() {
    const next = prompt('新名称', p.name);
    if (!next || next.trim() === p.name) return onClose();
    const res = await fetch(`/api/portfolios/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: next.trim() }),
    });
    if (res.ok) { onClose(); router.refresh(); }
    else if (res.status === 409) alert('名称已存在');
    else alert('改名失败');
  }
  async function toggleSim() {
    const res = await fetch(`/api/portfolios/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_simulated: !p.is_simulated }),
    });
    if (res.ok) { onClose(); router.refresh(); }
  }
  async function remove() {
    if (!confirm(`删除「${p.name}」？所有交易将一并删除。`)) return;
    const res = await fetch(`/api/portfolios/${p.id}`, { method: 'DELETE' });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search);
      next.set('portfolio', 'all');
      router.push(`${window.location.pathname}?${next.toString()}`);
      onClose();
      router.refresh();
    }
  }
  return (
    <div className="absolute right-0 z-10 mt-2 w-40 rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow">
      <button onClick={rename} className="block w-full px-3 py-1 text-left hover:bg-zinc-50">重命名</button>
      <button onClick={toggleSim} className="block w-full px-3 py-1 text-left hover:bg-zinc-50">
        {p.is_simulated ? '设为真实' : '设为模拟'}
      </button>
      <button
        onClick={remove}
        disabled={!canDelete}
        className="block w-full px-3 py-1 text-left text-red-600 hover:bg-red-50 disabled:text-zinc-300"
        title={canDelete ? '' : '至少保留一个组合'}
      >
        删除
      </button>
    </div>
  );
}
