export interface TxLite {
  side: 'BUY' | 'SELL';
  shares: number;
  unit_nav: number;
  fee: number;
  trade_date: string;
}

export interface FundSummary {
  shares: number;
  shares_bought: number;
  shares_sold: number;
  cost_buy: number;
  proceeds_sell: number;
  avg_cost: number | null;
  remaining_cost: number;
  mkt_value: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number;
  total_pnl: number | null;
  return_pct: number | null;
}

export interface PortfolioAggregate {
  total_cost: number;
  total_market: number | null;
  total_realized: number;
  total_unrealized: number | null;
  total_pnl: number | null;
  return_pct: number | null;
}

export function computeFundSummary(
  txs: ReadonlyArray<TxLite>,
  latest_unit_nav: number | null,
): FundSummary {
  let shares_bought = 0;
  let shares_sold = 0;
  let cost_buy = 0;
  let proceeds_sell = 0;
  for (const t of txs) {
    if (t.side === 'BUY') {
      shares_bought += t.shares;
      cost_buy += t.shares * t.unit_nav + t.fee;
    } else {
      shares_sold += t.shares;
      proceeds_sell += t.shares * t.unit_nav - t.fee;
    }
  }
  const shares = shares_bought - shares_sold;
  const avg_cost = shares_bought > 0 ? cost_buy / shares_bought : null;
  const remaining_cost = avg_cost != null ? shares * avg_cost : 0;
  const mkt_value = latest_unit_nav != null ? shares * latest_unit_nav : null;
  const unrealized_pnl = mkt_value != null ? mkt_value - remaining_cost : null;
  const realized_pnl = avg_cost != null ? proceeds_sell - shares_sold * avg_cost : 0;
  const total_pnl = unrealized_pnl != null ? unrealized_pnl + realized_pnl : null;
  const return_pct = total_pnl != null && cost_buy > 0 ? total_pnl / cost_buy : null;

  return {
    shares, shares_bought, shares_sold, cost_buy, proceeds_sell,
    avg_cost, remaining_cost, mkt_value, unrealized_pnl, realized_pnl,
    total_pnl, return_pct,
  };
}

export function aggregateAcrossFunds(
  summaries: ReadonlyArray<FundSummary>,
): PortfolioAggregate {
  let total_cost = 0;
  let total_market: number | null = 0;
  let total_realized = 0;
  let total_unrealized: number | null = 0;
  for (const s of summaries) {
    total_cost += s.cost_buy;
    total_realized += s.realized_pnl;
    if (s.mkt_value == null) total_market = null;
    else if (total_market != null) total_market += s.mkt_value;
    if (s.unrealized_pnl == null) total_unrealized = null;
    else if (total_unrealized != null) total_unrealized += s.unrealized_pnl;
  }
  const total_pnl =
    total_unrealized == null ? null : total_unrealized + total_realized;
  const return_pct =
    total_pnl != null && total_cost > 0 ? total_pnl / total_cost : null;
  return { total_cost, total_market, total_realized, total_unrealized, total_pnl, return_pct };
}
