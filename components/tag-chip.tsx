import type { TagColor } from '@/lib/domain/tag-palette';
import { tagClasses } from '@/lib/domain/tag-palette';

interface Props {
  name: string;
  color: TagColor;
  onClick?: () => void;
  onRemove?: () => void;
  selected?: boolean;
}

export function TagChip({ name, color, onClick, onRemove, selected }: Props) {
  const base = tagClasses(color);
  const ring = selected ? 'ring-2 ring-offset-1 ring-zinc-900' : '';
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${base} ${ring} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 leading-none opacity-60 hover:opacity-100"
          aria-label="移除"
        >
          ×
        </button>
      )}
    </span>
  );
}
