import { describe, it, expect } from 'vitest';
import { previousTradingDay, isTradingDay } from '@/lib/domain/trading-day';

describe('isTradingDay', () => {
  it('周六周日为非交易日', () => {
    expect(isTradingDay(new Date('2026-05-16T03:00:00Z'))).toBe(false); // 周六
    expect(isTradingDay(new Date('2026-05-17T03:00:00Z'))).toBe(false); // 周日
  });
  it('工作日（非节假日）为交易日', () => {
    expect(isTradingDay(new Date('2026-05-18T03:00:00Z'))).toBe(true); // 周一
  });
  it('节假日不是交易日', () => {
    expect(isTradingDay(new Date('2026-01-01T03:00:00Z'))).toBe(false); // 元旦
  });
});

describe('previousTradingDay', () => {
  it('周一回溯到上周五', () => {
    expect(previousTradingDay(new Date('2026-05-18T03:00:00Z'))).toBe('2026-05-15');
  });
  it('普通工作日回溯到前一日', () => {
    expect(previousTradingDay(new Date('2026-05-20T03:00:00Z'))).toBe('2026-05-19');
  });
});
