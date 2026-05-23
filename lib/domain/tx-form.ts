export interface BuyFormInput {
  amount: number;
  unit_nav: number;
  buy_fee_rate?: number | null;
  fee?: number;
}
export interface BuyFormDerived {
  fee: number;
  shares: number | null;
}
export function deriveBuyForm(i: BuyFormInput): BuyFormDerived {
  const fee = i.fee != null ? i.fee : i.amount * (i.buy_fee_rate ?? 0);
  if (!Number.isFinite(i.unit_nav) || i.unit_nav <= 0) return { fee, shares: null };
  const shares = (i.amount - fee) / i.unit_nav;
  return { fee, shares };
}

export interface SellFormInput {
  shares: number;
  unit_nav: number;
  sell_fee_rate?: number | null;
  fee?: number;
}
export interface SellFormDerived {
  fee: number;
  amount: number;
}
export function deriveSellForm(i: SellFormInput): SellFormDerived {
  const gross = i.shares * i.unit_nav;
  const fee = i.fee != null ? i.fee : gross * (i.sell_fee_rate ?? 0);
  return { fee, amount: gross - fee };
}
