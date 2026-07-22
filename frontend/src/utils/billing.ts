// Mirrors backend/src/utils/billing.ts exactly - every client-side bill
// preview (before the API call persists the real Invoice) must round the
// same way the backend will, or the number shown to the user won't match
// what actually gets billed/collected a moment later.

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
// discarded.
export function computeInvoiceTotals(items: { quantity: number; unit_price: number; tax_pct: number }[]): InvoiceTotals {
  const total = parseFloat(items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0).toFixed(2));
  const tax = parseFloat(items.reduce((sum, i) => sum + i.quantity * i.unit_price * (i.tax_pct / 100), 0).toFixed(2));
  const exactGrandTotal = parseFloat((total + tax).toFixed(2));
  const grand_total = Math.round(exactGrandTotal);
  const round_off = parseFloat((grand_total - exactGrandTotal).toFixed(2));
  return { total, tax, grand_total, round_off };
}

// Whole-rupee display for grand/net/bill-total and paid/due figures shown in
// the app UI (cards, tiles, lists, notifications) - grand_total is already
// rounded to a whole rupee by computeInvoiceTotals, so `.toFixed(2)` on it
// just adds a redundant ".00"; this keeps that class of display consistent
// with the Dashboard's KPI tiles. Does NOT apply to Subtotal/GST/Round Off
// lines or formal PDF invoices/WhatsApp messages, which stay at paise
// precision - those need to reconcile exactly and follow standard invoicing
// convention.
export function formatWholeRupees(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}
