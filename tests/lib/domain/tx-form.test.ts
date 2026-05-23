import { describe, it, expect } from 'vitest';
import { deriveBuyForm, deriveSellForm } from '@/lib/domain/tx-form';

describe('deriveBuyForm', () => {
  it('给金额，按费率算费，再算份额', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 1.25, buy_fee_rate: 0.0015 });
    expect(r.fee).toBeCloseTo(1.5);
    expect(r.shares).toBeCloseTo((1000 - 1.5) / 1.25);
  });

  it('给金额 + 手填费用（覆盖）', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 1.25, fee: 2.0 });
    expect(r.fee).toBe(2.0);
    expect(r.shares).toBeCloseTo((1000 - 2) / 1.25);
  });

  it('rate 为 null/undefined → fee = 0', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 1.25, buy_fee_rate: null });
    expect(r.fee).toBe(0);
    expect(r.shares).toBeCloseTo(1000 / 1.25);
  });

  it('unit_nav 为 0 / NaN → shares = null', () => {
    const r = deriveBuyForm({ amount: 1000, unit_nav: 0, buy_fee_rate: 0 });
    expect(r.shares).toBeNull();
  });
});

describe('deriveSellForm', () => {
  it('给份额，按费率算费，再算回款', () => {
    const r = deriveSellForm({ shares: 500, unit_nav: 1.5, sell_fee_rate: 0.005 });
    expect(r.fee).toBeCloseTo(500 * 1.5 * 0.005);
    expect(r.amount).toBeCloseTo(500 * 1.5 - 500 * 1.5 * 0.005);
  });

  it('给份额 + 手填费用', () => {
    const r = deriveSellForm({ shares: 500, unit_nav: 1.5, fee: 1.0 });
    expect(r.fee).toBe(1.0);
    expect(r.amount).toBeCloseTo(500 * 1.5 - 1.0);
  });
});
