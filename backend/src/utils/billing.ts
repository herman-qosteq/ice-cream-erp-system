export interface InvoiceTotals {
  total: number;
  tax: number;
  grand_total: number;
  round_off: number;
}

// Standard Indian tax-invoice "Round Off": total/tax are rounded to paise
// (2dp) first and summed for an exact figure, then grand_total is rounded to
// the nearest whole rupee so bills are settled in round amounts. The signed
// gap between the exact sum and the rounded grand_total is returned as
// round_off so it can be shown as its own line rather than silently
// discarded - never more than +/-Rs 0.50 (before the final 2dp rounding).
export function computeInvoiceTotals(items: { quantity: number; unit_price: number; tax_pct: number }[]): InvoiceTotals {
  const total = parseFloat(items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0).toFixed(2));
  const tax = parseFloat(items.reduce((sum, i) => sum + i.quantity * i.unit_price * (i.tax_pct / 100), 0).toFixed(2));
  const exactGrandTotal = parseFloat((total + tax).toFixed(2));
  const grand_total = Math.round(exactGrandTotal);
  const round_off = parseFloat((grand_total - exactGrandTotal).toFixed(2));
  return { total, tax, grand_total, round_off };
}
