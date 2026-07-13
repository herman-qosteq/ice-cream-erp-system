import { Order, Invoice, Store, Product } from '../types';
import { renderPdfDocument, renderInfoTable, buildPdfFileName } from './pdfTemplate';

/**
 * The Order Invoice — the original template every other PDF in the app now
 * matches. Shared by the driver (SalespersonFlow) and admin (AdminSales)
 * screens so the two "download invoice" buttons can never drift apart again.
 */
export function buildOrderInvoicePdf(order: Order, invoice: Invoice, store: Store, products: Product[]): { html: string; fileName: string } {
  const rows = order.items.map((item, idx) => {
    const p = products.find(prod => prod.id === item.product_id);
    const productName = p ? `${p.name} (${p.code})` : `Product ${item.product_id}`;
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
     City: ${store.city}, ${store.state || 'Maharashtra'} - ${store.pincode || '411001'}<br/>
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
      <strong>Grand Total: Rs ${invoice.grand_total.toFixed(2)}</strong><br/>
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
