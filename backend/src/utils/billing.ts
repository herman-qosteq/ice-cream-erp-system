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
// discarded - never more than +/-Rs. 0.50 (before the final 2dp rounding).
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
