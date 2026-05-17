export const TAG_PALETTE = [
  'zinc', 'red', 'orange', 'amber',
  'green', 'teal', 'blue', 'violet', 'pink',
] as const;

export type TagColor = (typeof TAG_PALETTE)[number];

const PALETTE_SET: ReadonlySet<string> = new Set(TAG_PALETTE);

export function isValidColor(v: unknown): v is TagColor {
  return typeof v === 'string' && PALETTE_SET.has(v);
}

// 注意：必须把所有 class 字面量明文写出，否则 Tailwind JIT 扫描不到
const CLASS_MAP: Record<TagColor, string> = {
  zinc:   'bg-zinc-100 text-zinc-700 border-zinc-300',
  red:    'bg-red-100 text-red-700 border-red-300',
  orange: 'bg-orange-100 text-orange-700 border-orange-300',
  amber:  'bg-amber-100 text-amber-700 border-amber-300',
  green:  'bg-green-100 text-green-700 border-green-300',
  teal:   'bg-teal-100 text-teal-700 border-teal-300',
  blue:   'bg-blue-100 text-blue-700 border-blue-300',
  violet: 'bg-violet-100 text-violet-700 border-violet-300',
  pink:   'bg-pink-100 text-pink-700 border-pink-300',
};

export function tagClasses(color: TagColor): string {
  return CLASS_MAP[color];
}
