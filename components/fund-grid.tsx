import { FundCard, type FundCardData } from './fund-card';
import type { TagColor } from '@/lib/domain/tag-palette';

interface Tag { id: number; name: string; color: TagColor }

export function FundGrid({
  items,
  allTags,
  portfolios,
}: {
  items: FundCardData[];
  allTags: Tag[];
  portfolios: Array<{ id: number; name: string; is_simulated: boolean }>;
}) {
  if (items.length === 0) {
    return <p className="text-zinc-500">还没有自选基金。试着加一个。</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <FundCard key={it.code} data={it} allTags={allTags} portfolios={portfolios} />
      ))}
    </div>
  );
}
