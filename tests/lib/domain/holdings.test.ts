import { describe, it, expect } from 'vitest';
import { computeFundSummary, type TxLite, type FundSummary } from '@/lib/domain/holdings';

function tx(
  side: 'BUY' | 'SELL',
  shares: number,
  unit_nav: number,
  fee = 0,
  trade_date = '2026-05-01',
): TxLite {
  return { side, shares, unit_nav, fee, trade_date };
}

describe('computeFundSummary', () => {
  it('单笔买入：avg_cost 含买入费', () => {
    const s = computeFundSummary([tx('BUY', 100, 1.0, 1)], 1.5);
    expect(s.shares).toBeCloseTo(100);
    expect(s.cost_buy).toBeCloseTo(101); // 100*1 + 1
    expect(s.avg_cost).toBeCloseTo(1.01);
    expect(s.mkt_value).toBeCloseTo(150);
    expect(s.unrealized_pnl).toBeCloseTo(49); // 150 - 100*1.01
    expect(s.realized_pnl).toBeCloseTo(0);
    expect(s.total_pnl).toBeCloseTo(49);
    expect(s.return_pct!).toBeCloseTo(49 / 101);
  });

  it('多笔买入：WAC = cost_buy / shares_bought', () => {
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0, 0), tx('BUY', 200, 1.3, 0)],
      1.4,
    );
    expect(s.shares).toBeCloseTo(300);
    expect(s.avg_cost).toBeCloseTo((100 * 1.0 + 200 * 1.3) / 300);
  });

  it('买卖混合：avg_cost 不被卖出影响、realized_pnl 用同一个 avg_cost', () => {
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0), tx('BUY', 100, 1.2), tx('SELL', 50, 1.5)],
      1.6,
    );
    expect(s.shares).toBeCloseTo(150);
    expect(s.avg_cost).toBeCloseTo(1.1);
    expect(s.realized_pnl).toBeCloseTo(20);
    expect(s.unrealized_pnl).toBeCloseTo(150 * 1.6 - 150 * 1.1);
  });

  it('清仓后再买：avg_cost 重算（注：WAC 只看买入序列，仍包含历史买入）', () => {
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0), tx('SELL', 100, 1.5), tx('BUY', 100, 2.0)],
      2.1,
    );
    expect(s.shares).toBeCloseTo(100);
    expect(s.avg_cost).toBeCloseTo((100 + 200) / 200);
    expect(s.realized_pnl).toBeCloseTo((1.5 - 1.5) * 100);
  });

  it('已清仓但仍显示已实现 PnL', () => {
    const s = computeFundSummary([tx('BUY', 100, 1.0), tx('SELL', 100, 1.3)], 1.4);
    expect(s.shares).toBeCloseTo(0);
    expect(s.realized_pnl).toBeCloseTo(30);
    expect(s.unrealized_pnl).toBeCloseTo(0);
    expect(s.mkt_value).toBeCloseTo(0);
  });

  it('latest_unit_nav 为 null 时 mkt_value / unrealized_pnl 为 null', () => {
    const s = computeFundSummary([tx('BUY', 100, 1.0)], null);
    expect(s.mkt_value).toBeNull();
    expect(s.unrealized_pnl).toBeNull();
    expect(s.total_pnl).toBeNull();
  });

  it('shares_bought == 0 时 avg_cost 为 null', () => {
    const s = computeFundSummary([], 1.0);
    expect(s.shares).toBe(0);
    expect(s.avg_cost).toBeNull();
    expect(s.return_pct).toBeNull();
  });

  it('赎回费扣除：proceeds_sell 减 fee', () => {
    const s = computeFundSummary(
      [tx('BUY', 100, 1.0, 0), tx('SELL', 50, 1.5, 5)],
      1.6,
    );
    expect(s.proceeds_sell).toBeCloseTo(70);
    expect(s.realized_pnl).toBeCloseTo(70 - 50 * 1.0);
  });
});

describe('aggregateAcrossFunds', () => {
  it('多基金汇总：mkt_value / cost_buy / pnl 累加；return_pct = Σpnl/Σcost', async () => {
    const { aggregateAcrossFunds } = await import('@/lib/domain/holdings');
    const a: FundSummary = {
      shares: 100, shares_bought: 100, shares_sold: 0,
      cost_buy: 100, proceeds_sell: 0,
      avg_cost: 1.0, remaining_cost: 100,
      mkt_value: 150, unrealized_pnl: 50, realized_pnl: 0,
      total_pnl: 50, return_pct: 0.5,
    };
    const b: FundSummary = { ...a, cost_buy: 200, mkt_value: 180, unrealized_pnl: -20, total_pnl: -20, return_pct: -0.1, remaining_cost: 200 };
    const agg = aggregateAcrossFunds([a, b]);
    expect(agg.total_cost).toBeCloseTo(300);
    expect(agg.total_market).toBeCloseTo(330);
    expect(agg.total_pnl).toBeCloseTo(30);
    expect(agg.return_pct!).toBeCloseTo(30 / 300);
  });

  it('某 fund mkt_value 为 null 时 total_market 也为 null（数据未完整）', async () => {
    const { aggregateAcrossFunds } = await import('@/lib/domain/holdings');
    const a: FundSummary = {
      shares: 100, shares_bought: 100, shares_sold: 0,
      cost_buy: 100, proceeds_sell: 0,
      avg_cost: 1.0, remaining_cost: 100,
      mkt_value: null, unrealized_pnl: null, realized_pnl: 0,
      total_pnl: null, return_pct: null,
    };
    const agg = aggregateAcrossFunds([a]);
    expect(agg.total_market).toBeNull();
    expect(agg.total_pnl).toBeNull();
  });
});
