import { describe, it, expect } from 'vitest';
import { TAG_PALETTE, isValidColor, tagClasses } from '@/lib/domain/tag-palette';

describe('TAG_PALETTE', () => {
  it('包含 9 个 key，全部小写无空格', () => {
    expect(TAG_PALETTE).toHaveLength(9);
    for (const c of TAG_PALETTE) expect(c).toMatch(/^[a-z]+$/);
  });
});

describe('isValidColor', () => {
  it('调色板内的 key 返回 true', () => {
    expect(isValidColor('blue')).toBe(true);
    expect(isValidColor('zinc')).toBe(true);
  });
  it('调色板外的字符串返回 false', () => {
    expect(isValidColor('rainbow')).toBe(false);
    expect(isValidColor('')).toBe(false);
    expect(isValidColor('BLUE')).toBe(false);
  });
});

describe('tagClasses', () => {
  it('返回 bg/text/border 三段 Tailwind class', () => {
    const c = tagClasses('blue');
    expect(c).toMatch(/bg-blue-100/);
    expect(c).toMatch(/text-blue-700/);
    expect(c).toMatch(/border-blue-300/);
  });
});
