import { Order, Invoice, Store, Product, PreBookingOrder } from '../types';
import { renderPdfDocument, renderInfoTable, renderSummaryLine, buildPdfFileName, stableRecordRef } from './pdfTemplate';
import { computeInvoiceTotals } from './billing';

/**
 * The Order Invoice — the original template every other PDF in the app now
 * matches. Shared by the driver (SalespersonFlow) and admin (AdminSales)
 * screens so the two "download invoice" buttons can never drift apart again.
 */
export function buildOrderInvoicePdf(order: Order, invoice: Invoice, store: Store, products: Product[]): { html: string; fileName: string } {
  const rows = order.items.map((item, idx) => {
    const p = products.find(prod => prod.id === item.product_id);
    // SKU code is internal-only, so it's never shown here - instead each line
    // names the quantity and per-unit rate actually billed on this order, so
    // the item is identifiable without cross-referencing the Qty/Rate columns.
    const productName = p ? `${p.name} (${item.quantity} X Rs ${item.unit_price.toFixed(2)})` : `Product ${item.product_id}`;
    return `<tr><td>${idx + 1}</td><td>${productName}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">Rs ${item.unit_price.toFixed(2)}</td><td style="text-align:right">${item.tax_pct}%</td><td style="text-align:right">Rs ${(item.quantity * item.unit_price).toFixed(2)}</td></tr>`;
  }).join('');

  const paidVal = invoice.paid_amount || 0;
  const balanceDue = Math.max(0, invoice.grand_total - paidVal);
  const statusLabel = invoice.payment_status === 'Paid' ? 'FULLY PAID' : invoice.payment_status === 'Partial' ? 'PARTIAL PAYMENT' : 'NOT PAID (CREDIT ACCT)';

  const infoTable = renderInfoTable(
    `<strong>BILL TO (PARTNER OUTLET)</strong><br/>
     Store: ${store.name}<br/>Owner: ${store.owner_name}<br/>
     Contact: ${store.phone} / ${store.alt_phone || 'N/A'}<br/>
     Address: ${store.address}, ${store.area}<br/>
     Pincode: ${store.pincode || '411001'}<br/>
     GSTIN: ${store.gst_number || 'Composition / Unregistered'}`,
    `<strong>Invoice No:</strong> ${invoice.invoice_number}<br/>
     <strong>Date:</strong> ${new Date(invoice.created_at).toLocaleDateString('en-IN')}<br/>
     <strong>Order ID:</strong> ${order.id.toUpperCase()}<br/>
     <strong>Fulfillment Vehicle:</strong> ${order.truck_id || 'Fleet Truck'}<br/>
     <strong>Sales Executive ID:</strong> ${order.salesperson_id || 'Self Admin'}`
  );

  const bodyHtml = `
    ${infoTable}
    <table><thead><tr><th>#</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Tax</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="box" style="text-align:right">
      Taxable Subtotal: Rs ${invoice.total.toFixed(2)}<br/>
      GST Total: Rs ${invoice.tax.toFixed(2)}<br/>
      Total Amount (Before Round Off): Rs ${(invoice.total + invoice.tax).toFixed(2)}<br/>
      Round Off: ${invoice.round_off && invoice.round_off > 0 ? '+' : ''}Rs ${(invoice.round_off || 0).toFixed(2)}<br/>
      <strong>Net Amount Payable (Grand Total): Rs ${invoice.grand_total.toFixed(2)}</strong><br/>
      Paid: Rs ${paidVal.toFixed(2)}<br/>
      <strong>Balance Due: Rs ${balanceDue.toFixed(2)}</strong>
    </div>
    <div class="box"><strong>PAYMENT STATUS: ${statusLabel}</strong><br/>Settled Via: ${invoice.payment_method || 'Credit (Pay Later)'}</div>`;

  const html = renderPdfDocument({
    title: 'TAX INVOICE',
    subtitle: 'Order Dispatch & Billing Receipt',
    bodyHtml,
    footerNote: 'Thank you for your partner outlet association with Mayben traders ERP.<br/>This is a computer-generated tax invoice and requires no physical signature.',
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
export function buildPreBookingBillPdf(booking: PreBookingOrder, store: Store, products: Product[]): { html: string; fileName: string } {
  const rows = booking.items.map((item, idx) => {
    const p = products.find(prod => prod.id === item.product_id);
    // SKU code is internal-only, so it's never shown here - instead each line
    // names the quantity and per-unit rate actually billed on this booking,
    // so the item is identifiable without cross-referencing the Qty/Rate columns.
    const productName = p ? `${p.name} (${item.quantity} X Rs ${item.unit_price.toFixed(2)})` : `Product ${item.product_id}`;
    return `<tr><td>${idx + 1}</td><td>${productName}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">Rs ${item.unit_price.toFixed(2)}</td><td style="text-align:right">${item.tax_pct}%</td><td style="text-align:right">Rs ${(item.quantity * item.unit_price).toFixed(2)}</td></tr>`;
  }).join('');

  const { total, tax, grand_total: grandTotal, round_off: roundOff } = computeInvoiceTotals(booking.items);

  const statusNote = booking.status === 'Delivered'
    ? 'DELIVERED — this booking was fulfilled as a store order; the tax invoice for that delivery is available from Orders.'
    : booking.status === 'Cancelled'
      ? 'CANCELLED — reserved warehouse stock was released back to inventory.'
      : 'RESERVATION ONLY — warehouse stock is held pending delivery. This is not yet a paid tax invoice.';

  const infoTable = renderInfoTable(
    `<strong>BILL TO (PARTNER OUTLET)</strong><br/>
     Store: ${store.name}<br/>Owner: ${store.owner_name}<br/>
     Contact: ${store.phone} / ${store.alt_phone || 'N/A'}<br/>
     Address: ${store.address}, ${store.area}<br/>
     Pincode: ${store.pincode || '411001'}<br/>
     GSTIN: ${store.gst_number || 'Composition / Unregistered'}`,
    `<strong>Pre-Booking ID:</strong> ${booking.id.toUpperCase()}<br/>
     <strong>Booked On:</strong> ${new Date(booking.created_at).toLocaleDateString('en-IN')}<br/>
     <strong>Scheduled Delivery:</strong> ${new Date(booking.scheduled_delivery_date).toLocaleDateString('en-IN')}<br/>
     <strong>Status:</strong> ${booking.status}${booking.notes ? `<br/><strong>Notes:</strong> ${booking.notes}` : ''}`
  );

  const bodyHtml = `
    ${infoTable}
    <table><thead><tr><th>#</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Tax</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody></table>
    ${renderSummaryLine([
      { label: 'Taxable Subtotal', value: `Rs ${total.toFixed(2)}` },
      { label: 'GST Total', value: `Rs ${tax.toFixed(2)}` },
      { label: 'Total (Before Round Off)', value: `Rs ${(total + tax).toFixed(2)}` },
      { label: 'Round Off', value: `${roundOff > 0 ? '+' : ''}Rs ${roundOff.toFixed(2)}` },
      { label: 'Net Amount (Grand Total)', value: `Rs ${grandTotal.toFixed(2)}`, accent: true },
    ])}
    <div class="box"><strong>${statusNote}</strong></div>`;

  const html = renderPdfDocument({
    title: 'PRE-BOOKING ORDER BILL',
    subtitle: `${store.name} - ${booking.status}`,
    bodyHtml,
    footerNote: 'This is a computer-generated pre-booking bill and requires no physical signature.',
  });

  return { html, fileName: buildPdfFileName('PreBooking_Bill', stableRecordRef('PB', booking.id)) };
}
