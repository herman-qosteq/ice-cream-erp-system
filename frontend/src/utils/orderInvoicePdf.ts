import { Order, Invoice, Store, Product, PreBookingOrder, QRCodeSettings } from '../types';
import {
  renderInvoiceDocument, renderInfoTable, renderPartyBox, renderKv, renderGstBreakdownTable, renderInvoiceTotalsBox,
  renderAmountInWords, renderSignatureBlock, renderPaymentBadge, renderQrSection, buildPdfFileName, stableRecordRef,
  getBrandName, GstBreakdownLine,
} from './pdfTemplate';
import { computeInvoiceTotals } from './billing';
import { toTotalPieces } from './qty';

/** Per-line MRP/discount figures the GST-invoice layout needs alongside the
 * existing qty/rate/amount - derived from the product's MRP vs. the price
 * actually billed on this line, so "Discount %" always reflects what was
 * really charged rather than a possibly-stale product-level discount
 * setting. */
function computeLineMrpFigures(item: { quantity: number; quantity_pieces: number; unit_price: number }, product: Product | undefined) {
  const piecesPerBox = product?.pieces_per_box ?? 1;
  const totalPieces = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, piecesPerBox);
  const mrpPerPiece = product?.mrp ?? item.unit_price;
  const mrpAmount = totalPieces * mrpPerPiece;
  const discountPct = mrpPerPiece > 0 ? Math.max(0, ((mrpPerPiece - item.unit_price) / mrpPerPiece) * 100) : 0;
  return { totalPieces, mrpPerPiece, mrpAmount, discountPct };
}

/** Scales a per-piece amount (MRP or the after-discount rate actually
 * billed) up to its single-box equivalent, for the "MRP / Box" and
 * "Rate / Box" columns - shown regardless of whether this line was
 * actually ordered in boxes. Always a real amount, never a placeholder
 * dash - for a product with no real box packaging (pieces_per_box <= 1)
 * this just equals the per-piece amount, which is mathematically correct
 * (one "box" of one piece costs exactly one piece). */
function formatBoxAmount(perPieceAmount: number, piecesPerBox: number): string {
  return (perPieceAmount * Math.max(1, piecesPerBox)).toFixed(2);
}

/**
 * The Order Invoice — the original template every other PDF in the app now
 * matches. Shared by the driver (SalespersonFlow) and admin (AdminSales)
 * screens so the two "download invoice" buttons can never drift apart again.
 */
export function buildOrderInvoicePdf(order: Order, invoice: Invoice, store: Store, products: Product[], qrSettings?: QRCodeSettings): { html: string; fileName: string } {
  let mrpValueTotal = 0;
  let totalPieceQty = 0;
  let totalBoxQty = 0;
  let totalLoosePieceQty = 0;
  const gstLines: GstBreakdownLine[] = [];

  // const temItem = [...order.items,...order.items, ...order.items]

  const rows = order.items.map((item, idx) => {
    const p = products.find(prod => prod.id === item.product_id);
    const piecesPerBox = p?.pieces_per_box ?? 1;
    // unit_price is always a per-piece rate (MRP is printed per individual
    // sellable piece) - the billable amount is the total piece count (whole
    // boxes worth, plus any loose pieces), not the raw box count.
    const amount = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, piecesPerBox) * item.unit_price;
    // SKU code is internal-only, so it's never shown here - just the plain
    // product name.
    const productName = p ? p.name : `Product ${item.product_id}`;
    // After-discount rate actually billed for this line (what Total Pieces
    // is multiplied by to reach Amount) - distinct from the pre-discount
    // MRP shown in "MRP / Piece" / "MRP / Box".
    const ratePerPieceLabel = item.unit_price.toFixed(2);
    const ratePerBoxLabel = formatBoxAmount(item.unit_price, piecesPerBox);

    const { totalPieces, mrpPerPiece, mrpAmount, discountPct } = computeLineMrpFigures(item, p);
    const mrpPerBoxLabel = formatBoxAmount(mrpPerPiece, piecesPerBox);
    mrpValueTotal += mrpAmount;
    totalPieceQty += totalPieces;
    totalBoxQty += item.quantity;
    totalLoosePieceQty += item.quantity_pieces;
    gstLines.push({ taxPct: item.tax_pct, taxable: amount });

    return `<tr>
      <td style="text-align:center">${idx + 1}</td>
      <td class="prod-name" style="text-align:left;font-weight:700">${productName}</td>
      <td style="text-align:center;font-weight:600">${piecesPerBox}</td>
      <td style="text-align:center;font-weight:600">${item.quantity}</td>
      <td style="text-align:center;font-weight:600">${item.quantity_pieces}</td>
      <td style="text-align:center;font-weight:600">${totalPieces}</td>
      <td style="text-align:center;font-weight:600">${mrpPerPiece.toFixed(2)}</td>
      <td style="text-align:center;font-weight:600">${mrpPerBoxLabel}</td>
      <td style="text-align:center;font-weight:600">${ratePerPieceLabel}</td>
      <td style="text-align:center;font-weight:600">${ratePerBoxLabel}</td>
      <td style="text-align:center;font-weight:600">${discountPct.toFixed(1)}%</td>
      <td style="text-align:center;font-weight:600">${item.tax_pct}%</td>
      <td style="text-align:right;padding-right:6px;font-weight:800;color:#111827">${amount.toFixed(2)}</td>
    </tr>`;
  });

  const paidVal = invoice.paid_amount || 0;
  const balanceDue = Math.max(0, invoice.grand_total - paidVal);
  const statusLabel = invoice.payment_status === 'Paid' ? 'FULLY PAID' : invoice.payment_status === 'Partial' ? 'PARTIAL PAYMENT' : 'NOT PAID (CREDIT ACCT)';
  const gstTotal = invoice.tax;

  const infoTable = renderInfoTable(
    renderPartyBox('Bill To (Partner Outlet)',
      renderKv('Store Name', store.name, true) +
      renderKv('Owner Name', store.owner_name) +
      renderKv('Phone Number', store.alt_phone ? `${store.phone} / ${store.alt_phone}` : store.phone) +
      renderKv('Address', `${store.address}, ${store.area}`) +
      renderKv('GST Number', store.gst_number || 'Unregistered')),
    renderPartyBox('Invoice Details',
      renderKv('Invoice Number', invoice.invoice_number, true) +
      renderKv('Invoice Date', new Date(invoice.created_at).toLocaleDateString('en-IN')) +
      renderKv('Order ID', order.id.toUpperCase()) +
      renderKv('Vehicle', order.truck_id || 'Fleet Truck') +
      renderKv('Sales Executive', order.salesperson_id || 'Self Admin') +
      renderKv('Payment Status', statusLabel, true))
  );

  const columnsHtml = `
      <th style="text-align:center">S.No</th>
      <th style="text-align:left">Product Name</th>
      <th style="text-align:center">Pieces per Box</th>
      <th style="text-align:center">Boxes</th>
      <th style="text-align:center">Loose Pieces</th>
      <th style="text-align:center">Total Pieces</th>
      <th style="text-align:center">MRP / Piece</th>
      <th style="text-align:center">MRP / Box</th>
      <th style="text-align:center">Rate / Piece</th>
      <th style="text-align:center">Rate / Box</th>
      <th style="text-align:center">Discount</th>
      <th style="text-align:center">GST</th>
      <th style="text-align:right;padding-right:6px">Amount</th>`;

  const footerHtml = `
    <div class="bottom-row">
      <div>${renderGstBreakdownTable(gstLines, { itemCount: order.items.length, qtyLabel: `${totalPieceQty} Pieces` })}</div>
      ${renderQrSection(qrSettings)}
      <div>${renderInvoiceTotalsBox({
        totalBoxes: totalBoxQty,
        totalLoosePieces: totalLoosePieceQty,
        totalQuantity: totalPieceQty,
        grossAmount: mrpValueTotal,
        discount: mrpValueTotal - invoice.total,
        taxable: invoice.total,
        cgst: gstTotal / 2,
        sgst: gstTotal / 2,
        roundOff: invoice.round_off || 0,
        grandTotal: invoice.grand_total,
      })}</div>
    </div>
    ${renderAmountInWords(invoice.grand_total)}
    <div class="payment-bar">
      <div class="payment-details-row">
        ${renderKv('Paid Amount', `Rs. ${paidVal.toFixed(2)}`, true)}
        ${renderKv('Balance Amount', `Rs. ${balanceDue.toFixed(2)}`, true)}
        ${renderKv('Payment Method', invoice.payment_method || 'Credit (Pay Later)')}
      </div>
      ${renderPaymentBadge(invoice.payment_status, statusLabel)}
    </div>
    ${renderSignatureBlock()}`;

  const html = renderInvoiceDocument({
    partyBoxesHtml: infoTable,
    columnsHtml,
    rows,
    footerHtml,
    footerNote: `Thank you for your partnership with ${getBrandName()} ERP &bull; Computer-generated tax invoice, no signature required`,
  });

  // invoice.invoice_number (e.g. "INV-2026-0001") is already a real, unique,
  // human-readable record ID — used as-is rather than generating a new one.
  return { html, fileName: buildPdfFileName('Order_Invoice', invoice.invoice_number) };
}

/**
 * Pre-Booking Bill — built straight from the PreBookingOrder record itself
 * rather than a real Invoice, because once a booking is delivered the
 * backend creates a brand-new Order/Invoice with no foreign key back to the
 * originating pre-booking (see prebookings.service.ts:deliverPreBooking), so
 * there's no reliable way to look one up. Works for Booked/Delivered/
 * Cancelled bookings alike since it only ever reads the booking's own
 * stored items and dates.
 */
export function buildPreBookingBillPdf(booking: PreBookingOrder, store: Store, products: Product[], qrSettings?: QRCodeSettings): { html: string; fileName: string } {
  let mrpValueTotal = 0;
  let totalPieceQty = 0;
  let totalBoxQty = 0;
  let totalLoosePieceQty = 0;
  const gstLines: GstBreakdownLine[] = [];

  const rows = booking.items.map((item, idx) => {
    const p = products.find(prod => prod.id === item.product_id);
    const piecesPerBox = p?.pieces_per_box ?? 1;
    // unit_price is always a per-piece rate (MRP is printed per individual
    // sellable piece) - the billable amount is the total piece count (whole
    // boxes worth, plus any loose pieces), not the raw box count.
    const amount = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, piecesPerBox) * item.unit_price;
    // SKU code is internal-only, so it's never shown here - just the plain
    // product name.
    const productName = p ? p.name : `Product ${item.product_id}`;
    // After-discount rate actually billed for this line (what Total Pieces
    // is multiplied by to reach Amount) - distinct from the pre-discount
    // MRP shown in "MRP / Piece" / "MRP / Box".
    const ratePerPieceLabel = item.unit_price.toFixed(2);
    const ratePerBoxLabel = formatBoxAmount(item.unit_price, piecesPerBox);

    const { totalPieces, mrpPerPiece, mrpAmount, discountPct } = computeLineMrpFigures(item, p);
    const mrpPerBoxLabel = formatBoxAmount(mrpPerPiece, piecesPerBox);
    mrpValueTotal += mrpAmount;
    totalPieceQty += totalPieces;
    totalBoxQty += item.quantity;
    totalLoosePieceQty += item.quantity_pieces;
    gstLines.push({ taxPct: item.tax_pct, taxable: amount });

    return `<tr>
      <td style="text-align:center">${idx + 1}</td>
      <td class="prod-name" style="text-align:left;font-weight:700">${productName}</td>
      <td style="text-align:center;font-weight:600">${piecesPerBox}</td>
      <td style="text-align:center;font-weight:600">${item.quantity}</td>
      <td style="text-align:center;font-weight:600">${item.quantity_pieces}</td>
      <td style="text-align:center;font-weight:600">${totalPieces}</td>
      <td style="text-align:center;font-weight:600">${mrpPerPiece.toFixed(2)}</td>
      <td style="text-align:center;font-weight:600">${mrpPerBoxLabel}</td>
      <td style="text-align:center;font-weight:600">${ratePerPieceLabel}</td>
      <td style="text-align:center;font-weight:600">${ratePerBoxLabel}</td>
      <td style="text-align:center;font-weight:600">${discountPct.toFixed(1)}%</td>
      <td style="text-align:center;font-weight:600">${item.tax_pct}%</td>
      <td style="text-align:right;padding-right:6px;font-weight:800;color:#111827">${amount.toFixed(2)}</td>
    </tr>`;
  });

  const { total, tax, grand_total: grandTotal, round_off: roundOff } = computeInvoiceTotals(
    booking.items.map(i => ({ ...i, pieces_per_box: products.find(p => p.id === i.product_id)?.pieces_per_box ?? 1 }))
  );

  const statusNote = booking.status === 'Delivered'
    ? 'DELIVERED — this booking was fulfilled as a store order; the tax invoice for that delivery is available from Orders.'
    : booking.status === 'Cancelled'
      ? 'CANCELLED — reserved warehouse stock was released back to inventory.'
      : 'RESERVATION ONLY — warehouse stock is held pending delivery. This is not yet a paid tax invoice.';

  const infoTable = renderInfoTable(
    renderPartyBox('Bill To (Partner Outlet)',
      renderKv('Store Name', store.name, true) +
      renderKv('Owner Name', store.owner_name) +
      renderKv('Phone Number', store.alt_phone ? `${store.phone} / ${store.alt_phone}` : store.phone) +
      renderKv('Address', `${store.address}, ${store.area}`) +
      renderKv('GST Number', store.gst_number || 'Unregistered')),
    renderPartyBox('Booking Details',
      renderKv('Pre-Booking ID', booking.id.toUpperCase(), true) +
      renderKv('Booked On', new Date(booking.created_at).toLocaleDateString('en-IN')) +
      renderKv('Scheduled Delivery', new Date(booking.scheduled_delivery_date).toLocaleDateString('en-IN')) +
      renderKv('Status', booking.status, true) +
      (booking.notes ? renderKv('Notes', booking.notes) : ''))
  );

  const columnsHtml = `
      <th style="text-align:center">S.No</th>
      <th style="text-align:left">Product Name</th>
      <th style="text-align:center">Pieces per Box</th>
      <th style="text-align:center">Boxes</th>
      <th style="text-align:center">Loose Pieces</th>
      <th style="text-align:center">Total Pieces</th>
      <th style="text-align:center">MRP / Piece</th>
      <th style="text-align:center">MRP / Box</th>
      <th style="text-align:center">Rate / Piece</th>
      <th style="text-align:center">Rate / Box</th>
      <th style="text-align:center">Discount</th>
      <th style="text-align:center">GST</th>
      <th style="text-align:right;padding-right:6px">Amount</th>`;

  const footerHtml = `
    <div class="bottom-row">
      <div>${renderGstBreakdownTable(gstLines, { itemCount: booking.items.length, qtyLabel: `${totalPieceQty} Pieces` })}</div>
      ${renderQrSection(qrSettings)}
      <div>${renderInvoiceTotalsBox({
        totalBoxes: totalBoxQty,
        totalLoosePieces: totalLoosePieceQty,
        totalQuantity: totalPieceQty,
        grossAmount: mrpValueTotal,
        discount: mrpValueTotal - total,
        taxable: total,
        cgst: tax / 2,
        sgst: tax / 2,
        roundOff: roundOff,
        grandTotal: grandTotal,
      })}</div>
    </div>
    ${renderAmountInWords(grandTotal)}
    <div class="box"><strong>${statusNote}</strong></div>
    ${renderSignatureBlock()}`;

  const html = renderInvoiceDocument({
    title: 'PRE-BOOKING ORDER BILL',
    subtitle: `${store.name} - ${booking.status}`,
    partyBoxesHtml: infoTable,
    columnsHtml,
    rows,
    footerHtml,
    footerNote: 'This is a computer-generated pre-booking bill and requires no physical signature',
  });

  return { html, fileName: buildPdfFileName('PreBooking_Bill', stableRecordRef('PB', booking.id)) };
}
