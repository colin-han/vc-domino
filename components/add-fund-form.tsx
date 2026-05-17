'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddFundForm() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{6}$/.test(code)) { setErr('请输入 6 位基金代码'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST', body: JSON.stringify({ code }), headers: { 'content-type': 'application/json' },
      });
      if (res.status === 201) { setCode(''); router.refresh(); return; }
      const body = await res.json().catch(() => ({})) as { error?: string };
      setErr(`添加失败：${body.error ?? res.status}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.trim())}
        placeholder="6 位基金代码"
        className="rounded border border-zinc-300 px-3 py-1.5"
      />
      <button type="submit" disabled={busy} className="rounded bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-50">
        {busy ? '添加中…' : '加入自选'}
      </button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </form>
  );
}
