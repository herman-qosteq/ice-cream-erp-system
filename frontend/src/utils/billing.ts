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
// `quantity_pieces`/`pieces_per_box` let a line item bill for loose pieces
// alongside whole boxes. unit_price is always a PER-PIECE price (MRP is
// printed per individual sellable piece, e.g. per cup/cone - a "box" is only
// ever a warehouse packaging unit, never its own price tier), so the billable
// quantity is the total piece count: quantity boxes worth of pieces, plus
// quantity_pieces loose ones. pieces_per_box defaults to 1 when omitted, so a
// bare `quantity` with no pieces still bills exactly as before.
export function computeInvoiceTotals(items: { quantity: number; quantity_pieces?: number; pieces_per_box?: number; unit_price: number; tax_pct: number }[]): InvoiceTotals {
  const totalPieceQty = (i: { quantity: number; quantity_pieces?: number; pieces_per_box?: number }) =>
    i.quantity * (i.pieces_per_box ?? 1) + (i.quantity_pieces ?? 0);
  const total = parseFloat(items.reduce((sum, i) => sum + totalPieceQty(i) * i.unit_price, 0).toFixed(2));
  const tax = parseFloat(items.reduce((sum, i) => sum + totalPieceQty(i) * i.unit_price * (i.tax_pct / 100), 0).toFixed(2));
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
// convention. Includes the "Rs. " prefix itself (not just the number) so
// every call site renders identically instead of each one manually
// concatenating its own "Rs"/"Rs "/"Rs." text in front - see formatCurrency
// below for the paise-precision equivalent.
export function formatWholeRupees(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
}

// Standard two-decimal-place currency display for line items, unit prices,
// invoices, payments, and other figures that aren't whole-rupee summary
// tiles (see formatWholeRupees above for those) - always "Rs. 12.00": a
// space after the dot, exactly two decimals, Indian digit grouping for
// larger amounts.
export function formatCurrency(n: number): string {
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
