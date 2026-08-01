import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Download } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { Asset } from '../../types';
import { calculateDeliveredOrderProfit, getAveragePurchasePrice, getLatestPurchasePrice } from '../../data';
import { exportHtmlReport, openWebPreviewWindow } from '../../utils/reportExport';
import { renderPdfDocument, renderSummaryLine, buildPdfFileName, freshReportRef } from '../../utils/pdfTemplate';
import DateField from '../../components/common/DateField';
import { isRetailPricingEnabled } from '../../utils/permissions';
import { computeInvoiceTotals } from '../../utils/billing';
import { assetsApi } from '../../api/endpoints';
import { getReportPeriod, isWithinReportPeriod } from '../../utils/reportPeriod';
import { formatQty, isPositiveQty, toTotalPieces } from '../../utils/qty';
import {
  PermissionRole, REPORTS_FILTER_DAILY_FEATURE, REPORTS_FILTER_WEEKLY_FEATURE,
  REPORTS_FILTER_MONTHLY_FEATURE, REPORTS_FILTER_CUSTOM_FEATURE,
} from '../../config/permissionsRegistry';
import { isPermissionEnabled } from '../../utils/permissions';

interface AdminReportsProps {
  data: ERPData;
  currentUser: { id: string; role: string };
  showAlert: (opts: any) => void;
}

type ReportTab = 'Daily' | 'Weekly' | 'Monthly' | 'Custom';

// Maps each period tab to the per-operator feature key that gates it (see
// permissionsRegistry.ts) - the single place this Daily/Weekly/Monthly/
// Custom -> feature-key mapping lives, so the tab bar and Manage
// Permissions can't drift apart.
const REPORT_TAB_FEATURE: Record<ReportTab, string> = {
  Daily: REPORTS_FILTER_DAILY_FEATURE,
  Weekly: REPORTS_FILTER_WEEKLY_FEATURE,
  Monthly: REPORTS_FILTER_MONTHLY_FEATURE,
  Custom: REPORTS_FILTER_CUSTOM_FEATURE,
};
const REPORT_TABS: ReportTab[] = ['Daily', 'Weekly', 'Monthly', 'Custom'];

// The 3 report types whose PDF actually reads the selected period (the other
// 5 are live/point-in-time and export regardless of report-filter permissions).
const PERIOD_DEPENDENT_REPORTS = new Set(['Sales and Profit Report', 'Sales by Partner Type', 'Partner Type Revenue Report']);

// Extracted from AdminDashboard.tsx's former "ERP Executive Reports Hub" card
// so report-export access can be granted/revoked independently of the
// Executive Dashboard itself (see permissionsRegistry.ts's 'Reports' item) -
// some operators should be able to pull financial/logistics reports without
// also getting the full KPI dashboard, or vice versa.
export default function AdminReports({ data, currentUser, showAlert }: AdminReportsProps) {
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('Weekly');

  // Which of the 4 period tabs THIS operator is allowed to use - 'Reports'
  // itself is a separate, coarser permission (can they open this screen at
  // all); these narrow it further to which filter(s) they can pick once
  // inside, e.g. an operator restricted to Daily-only never sees the
  // Weekly/Monthly/Custom buttons and can't export those periods.
  const allowedReportTabs = REPORT_TABS.filter(tab => isPermissionEnabled(
    'Admin', currentUser.role as PermissionRole, REPORT_TAB_FEATURE[tab], currentUser.id, data.rolePermissions, data.userPermissions,
  ));

  // If the active tab is no longer allowed (permission just revoked, or the
  // default 'Weekly' isn't in this operator's allowed set), fall back to the
  // first tab they do have - never leave the UI pointed at a filter they
  // can no longer use.
  useEffect(() => {
    if (allowedReportTabs.length > 0 && !allowedReportTabs.includes(activeReportTab)) {
      setActiveReportTab(allowedReportTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedReportTabs.join(',')]);
  // Defaults to the last 7 days ending today (not a fixed literal date) so the
  // Custom tab starts out showing a range that actually contains recent data
  // instead of whatever window happened to be "today" when this was written.
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const toIsoDate = (d: Date) => d.toISOString().split('T')[0];
    return { start: toIsoDate(weekAgo), end: toIsoDate(now) };
  });
  const retailEnabled = isRetailPricingEnabled({ id: currentUser.id, role: currentUser.role as PermissionRole }, data.rolePermissions, data.userPermissions);

  // Assets aren't part of the main ERPData blob (paginated separately, see
  // AdminAssets.tsx) - fetched here just for the Freezer Box/Asset History
  // reports' asset-code lookups below.
  const [assets, setAssets] = useState<Asset[]>([]);
  useEffect(() => {
    assetsApi.list().then(setAssets).catch(() => {});
  }, []);

  // Same definition as AdminDashboard.tsx's getOrderRevenue (tax-inclusive,
  // matching the invoice actually billed to the store) - kept as an
  // independent copy rather than shared, since these are now two separate
  // screens reachable without each other.
  const getOrderRevenue = (o: (typeof data.orders)[number]) => {
    const inv = data.invoices.find(i => i.order_id === o.id);
    return inv ? inv.grand_total : computeInvoiceTotals(o.items).grand_total;
  };

  // Ad-hoc "quantity * price" report math needs the same partial-box
  // awareness as computeInvoiceTotals - looks up the product's pieces_per_box
  // so quantity_pieces is weighted correctly instead of silently dropped.
  const effectiveLineValue = (item: { product_id: string; quantity: number; quantity_pieces?: number }, price: number) => {
    const ppb = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
    const perPiecePrice = price / Math.max(1, ppb);
    return item.quantity * price + (item.quantity_pieces ?? 0) * perPiecePrice;
  };

  const handleExport = async (reportName: string) => {
    // Guards the edge case the tab-bar fallback effect can't reach: every
    // period filter revoked for this operator, so activeReportTab is stuck
    // on a tab (e.g. the default 'Weekly') they're no longer allowed to use.
    // Live/point-in-time reports (Warehouse Stock, Outstanding, etc.) don't
    // read the period at all, so they're unaffected and stay exportable.
    if (PERIOD_DEPENDENT_REPORTS.has(reportName) && !allowedReportTabs.includes(activeReportTab)) {
      showAlert({ type: 'warning', message: `You don't have permission to use the ${activeReportTab} report filter.` });
      return;
    }

    // Opened synchronously, before any of the async data-gathering below
    // (the Assets reports await assetsApi calls) - see openWebPreviewWindow's
    // own comment for why this can't wait until exportHtmlReport is finally
    // called at the bottom of this function. Without this, those two
    // specific reports' popup was getting silently blocked by the browser
    // (no async work happening between click and window.open() elsewhere in
    // this file), which looked exactly like a broken Print/Save as PDF button.
    const previewWindow = openWebPreviewWindow();

    // Report period must be computed relative to the actual current date, not
    // a fixed literal - a hardcoded window stops matching any order created
    // after that literal date, which is what made this report export empty.
    const period = getReportPeriod(activeReportTab, dateRange);
    const { periodStr } = period;

    let html = '';
    let fileName = '';

    if (reportName === 'Sales and Profit Report') {
      const periodOrders = data.orders.filter(o => isWithinReportPeriod(o.created_at, period));
      const periodPayments = data.payments.filter(p => isWithinReportPeriod(p.date, period));

      let periodRevenue = 0, periodCOGS = 0, periodProfit = 0;
      periodOrders.forEach(o => {
        if (o.status === 'Delivered') {
          periodRevenue += getOrderRevenue(o);
          o.items.forEach(item => {
            // Costed the same way as the dashboard's Total Profit card
            // (latest actual purchase price, not the product's current
            // catalog price) so the two never disagree after a price update.
            const itemCost = effectiveLineValue(item, getLatestPurchasePrice(item.product_id, data.purchases));
            periodCOGS += itemCost;
          });
          // Profit is recognized on a cash basis (see calculateDeliveredOrderProfit)
          // - only the portion of this order's margin actually collected so
          // far counts, so periodProfit intentionally does not equal
          // periodRevenue - periodCOGS whenever orders are unpaid/partial.
          const invoice = data.invoices.find(i => i.order_id === o.id);
          periodProfit += calculateDeliveredOrderProfit(o, data.purchases, data.products, invoice);
        }
      });
      const totalPaymentsCollected = periodPayments.reduce((sum, p) => sum + p.amount, 0);

      const tableRows = periodOrders.map(o => {
        const store = data.stores.find(s => s.id === o.store_id);
        const totalQty = formatQty({ boxes: o.items.reduce((s, i) => s + i.quantity, 0), pieces: o.items.reduce((s, i) => s + i.quantity_pieces, 0) });
        let cost = 0;
        o.items.forEach(i => {
          cost += effectiveLineValue(i, getLatestPurchasePrice(i.product_id, data.purchases));
        });
        const rev = getOrderRevenue(o);
        const invoice = data.invoices.find(i => i.order_id === o.id);
        const profit = o.status === 'Delivered' ? calculateDeliveredOrderProfit(o, data.purchases, data.products, invoice) : 0;
        return `<tr>
            <td>${o.id}</td>
            <td>${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
            <td>${store?.name || 'Unknown Store'}</td>
            <td style="text-align:center">${totalQty}</td>
            <td style="text-align:right">Rs. ${rev.toFixed(2)}</td>
            <td style="text-align:right">Rs. ${cost.toFixed(2)}</td>
            <td style="text-align:right"><strong>Rs. ${profit.toFixed(2)}</strong></td>
            <td style="text-align:center">${o.status}</td>
          </tr>`;
      }).join('');

      html = renderPdfDocument({
        title: 'SALES & PROFIT EXECUTIVE REPORT',
        subtitle: `Period: ${activeReportTab} | Range: ${periodStr}`,
        bodyHtml: `
          ${renderSummaryLine([
            { label: 'Delivered Revenue', value: `Rs. ${periodRevenue.toFixed(2)}`, accent: true },
            { label: 'Cost of Sales (COGS)', value: `Rs. ${periodCOGS.toFixed(2)}` },
            { label: 'Profit (Collected Only)', value: `Rs. ${periodProfit.toFixed(2)}`, accent: true },
            { label: 'Collected Payments', value: `Rs. ${totalPaymentsCollected.toFixed(2)}` },
          ])}
          <div class="section-title">Logged Sales Orders in Period (${periodOrders.length})</div>
          <table><thead><tr><th>Order ID</th><th>Date</th><th>Store Partner</th><th style="text-align:center">Qty</th><th style="text-align:right">Revenue</th><th style="text-align:right">Cost</th><th style="text-align:right">Profit (Collected)</th><th style="text-align:center">Status</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No orders logged in this period.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated executive report and requires no physical signature.',
      });
      fileName = buildPdfFileName('Revenue_Report', freshReportRef('REV'));

    } else if (reportName === 'Store Outstanding Report') {
      const totalOutstanding = data.stores.reduce((sum, s) => sum + s.outstanding_balance, 0);
      const exceededCount = data.stores.filter(s => s.outstanding_balance > s.credit_limit).length;

      const storeRows = data.stores.map(s => {
        const exceeded = s.outstanding_balance > s.credit_limit ? 'EXCEEDED' : s.outstanding_balance === s.credit_limit ? 'AT LIMIT' : 'OK';
        return `<tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.owner_name}<br/><span class="muted">Ph: ${s.phone}</span></td>
            <td>${s.area}, ${s.city}</td>
            <td style="text-align:right">Rs. ${s.credit_limit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:right"><strong>Rs. ${s.outstanding_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
            <td style="text-align:center">${exceeded}</td>
            <td style="text-align:center">${s.last_purchase_date || 'N/A'}</td>
            <td style="text-align:center">${s.next_refill_date || 'N/A'}</td>
          </tr>`;
      }).join('');

      html = renderPdfDocument({
        title: 'STORE OUTSTANDING CREDIT LEDGER',
        subtitle: 'Live Risk Audit & Overdue Status Report',
        bodyHtml: `
          ${renderSummaryLine([
            { label: 'Total Stores Tracked', value: `${data.stores.length} Outlets` },
            { label: 'Accumulated Outstanding', value: `Rs. ${totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, accent: true },
            { label: 'Exceeded Credit Limit', value: `${exceededCount} Stores` },
          ])}
          <div class="section-title">Outstanding Balance and Credit Utilization by Outlet</div>
          <table><thead><tr><th>Store Name</th><th>Owner Contact</th><th>Area / City</th><th style="text-align:right">Credit Limit</th><th style="text-align:right">Outstanding</th><th style="text-align:center">Risk</th><th style="text-align:center">Last Purchase</th><th style="text-align:center">Next Refill</th></tr></thead>
          <tbody>${storeRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No store records registered.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated credit ledger and requires no physical signature.',
      });
      fileName = buildPdfFileName('Outstanding_Report', freshReportRef('OUT'));

    } else if (reportName === 'Warehouse Stock Valuation') {
      let totalStockBoxes = 0, totalStockPieces = 0, totalPurchaseValuation = 0, totalPotentialSalesValuation = 0;
      const getPurchaseValuation = (productId: string, qty: { boxes: number; pieces: number }, catalogPurchasePrice: number) => {
        if (!isPositiveQty(qty)) return 0;
        const ppb = data.products.find(pr => pr.id === productId)?.pieces_per_box ?? 1;
        const avgPurchasePrice = getAveragePurchasePrice(productId, data.purchases, ppb);
        const unitCost = avgPurchasePrice || catalogPurchasePrice;
        return qty.boxes * unitCost + (qty.pieces * unitCost / Math.max(1, ppb));
      };

      const productRows = data.products.map(p => {
        const inventory = data.warehouse_inventory.find(inv => inv.product_id === p.id);
        const qty = { boxes: inventory?.available_qty || 0, pieces: inventory?.available_pieces || 0 };
        const purchaseVal = getPurchaseValuation(p.id, qty, p.purchase_price);
        const salesVal = toTotalPieces(qty, p.pieces_per_box) * p.selling_price;
        const expectedProfit = salesVal - purchaseVal;
        totalStockBoxes += qty.boxes;
        totalStockPieces += qty.pieces;
        totalPurchaseValuation += purchaseVal;
        totalPotentialSalesValuation += salesVal;
        return `<tr>
            <td>${p.code}</td>
            <td>${p.name}</td>
            <td>${p.category}</td>
            <td style="text-align:center"><strong>${formatQty(qty)}</strong></td>
            <td style="text-align:right">Rs. ${p.purchase_price.toFixed(2)}</td>
            ${retailEnabled ? `<td style="text-align:right">Rs. ${p.selling_price.toFixed(2)}</td>` : ''}
            <td style="text-align:right">Rs. ${purchaseVal.toFixed(2)}</td>
            ${retailEnabled ? `<td style="text-align:right">Rs. ${salesVal.toFixed(2)}</td>
            <td style="text-align:right"><strong>Rs. ${expectedProfit.toFixed(2)}</strong></td>` : ''}
          </tr>`;
      }).join('');

      html = renderPdfDocument({
        title: 'WAREHOUSE INVENTORY STOCK VALUATION',
        subtitle: 'Live Audit Report',
        bodyHtml: `
          ${renderSummaryLine([
            { label: 'Unique SKUs', value: String(data.products.length) },
            { label: 'Total Items On-Hand', value: formatQty({ boxes: totalStockBoxes, pieces: totalStockPieces }) },
            { label: 'Wholesale Assets Cost', value: `Rs. ${totalPurchaseValuation.toFixed(2)}`, accent: true },
            ...(retailEnabled ? [{ label: 'Retail Potential Value', value: `Rs. ${totalPotentialSalesValuation.toFixed(2)}`, accent: true }] : []),
          ])}
          <div class="section-title">Valuation Breakdown by Product</div>
          <table><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th style="text-align:center">Qty</th><th style="text-align:right">Wholesale</th>${retailEnabled ? '<th style="text-align:right">Selling</th>' : ''}<th style="text-align:right">Wholesale Val</th>${retailEnabled ? '<th style="text-align:right">Retail Val</th><th style="text-align:right">Margin</th>' : ''}</tr></thead>
          <tbody>${productRows || `<tr><td colspan="${retailEnabled ? 9 : 6}" style="text-align:center;padding:20px;color:#94a3b8">No products registered.</td></tr>`}</tbody></table>`,
        footerNote: 'This is a computer-generated stock valuation report and requires no physical signature.',
      });
      fileName = buildPdfFileName('Warehouse_Report', freshReportRef('WH'));

    } else if (reportName === 'Truck Inventory Distribution') {
      let totalQtyBoxes = 0, totalQtyPieces = 0, totalTruckValuation = 0, totalTruckRetailValuation = 0;
      const itemsList: any[] = [];

      data.trucks.forEach(t => {
        const driver = data.users.find(u => u.id === t.driver_user_id);
        const inventories = data.truck_inventory.filter(ti => ti.truck_id === t.id);
        inventories.forEach(ti => {
          const prod = data.products.find(p => p.id === ti.product_id);
          const qty = { boxes: ti.quantity, pieces: ti.quantity_pieces };
          if (prod && isPositiveQty(qty)) {
            const costPrice = getAveragePurchasePrice(prod.id, data.purchases, prod.pieces_per_box) || prod.purchase_price;
            const eff = toTotalPieces(qty, prod.pieces_per_box);
            const costVal = eff * costPrice;
            const retailVal = eff * prod.selling_price;
            totalQtyBoxes += qty.boxes;
            totalQtyPieces += qty.pieces;
            totalTruckValuation += costVal;
            totalTruckRetailValuation += retailVal;
            itemsList.push({ vehicleNumber: t.vehicle_number, driverName: driver?.name || 'Unassigned', area: t.area, skuCode: prod.code, prodName: prod.name, qty, costPrice, sellingPrice: prod.selling_price, costVal, retailVal });
          }
        });
      });

      const tableRows = itemsList.map(item => `<tr>
            <td>${item.vehicleNumber}</td>
            <td>${item.driverName}</td>
            <td>${item.area}</td>
            <td>${item.skuCode}</td>
            <td>${item.prodName}</td>
            <td style="text-align:center"><strong>${formatQty(item.qty)}</strong></td>
            <td style="text-align:right">Rs. ${item.costPrice.toFixed(2)}${retailEnabled ? ` / Rs. ${item.sellingPrice.toFixed(2)}` : ''}</td>
            <td style="text-align:right">Rs. ${item.costVal.toFixed(2)}${retailEnabled ? ` (Cost)<br/>Rs. ${item.retailVal.toFixed(2)} (Retail)` : ''}</td>
          </tr>`).join('');

      html = renderPdfDocument({
        title: 'TRUCK TRANSIT INVENTORY DISTRIBUTION',
        subtitle: 'Live Route Stock Loading Audit',
        bodyHtml: `
          ${renderSummaryLine([
            { label: 'Fleet Size', value: `${data.trucks.length} Vehicles` },
            { label: 'Total Cargo Units', value: formatQty({ boxes: totalQtyBoxes, pieces: totalQtyPieces }), accent: true },
            { label: 'Cargo Asset Cost', value: `Rs. ${totalTruckValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, accent: true },
            ...(retailEnabled ? [{ label: 'Retail Sales Potential', value: `Rs. ${totalTruckRetailValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` }] : []),
          ])}
          <div class="section-title">Loaded Transit Stock Breakdown by Vehicle</div>
          <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Route</th><th>SKU</th><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Value</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No truck inventory currently dispatched.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated distribution audit and requires no physical signature.',
      });
      fileName = buildPdfFileName('Truck_Inventory', freshReportRef('TRK'));

    } else if (reportName === 'Sales by Partner Type') {
      const deliveredOrders = data.orders.filter(o => o.status === 'Delivered' && isWithinReportPeriod(o.created_at, period));
      const groups = new Map<string, { count: number; boxes: number; pieces: number; revenue: number }>();
      deliveredOrders.forEach(o => {
        const store = data.stores.find(s => s.id === o.store_id);
        const type = store?.partner_type || 'Retail Shop';
        const g = groups.get(type) || { count: 0, boxes: 0, pieces: 0, revenue: 0 };
        g.count += 1;
        g.boxes += o.items.reduce((s, i) => s + i.quantity, 0);
        g.pieces += o.items.reduce((s, i) => s + i.quantity_pieces, 0);
        g.revenue += getOrderRevenue(o);
        groups.set(type, g);
      });
      const rows = Array.from(groups.entries()).sort((a, b) => b[1].revenue - a[1].revenue).map(([type, g]) => `<tr>
            <td>${type}</td>
            <td style="text-align:center">${g.count}</td>
            <td style="text-align:center">${formatQty({ boxes: g.boxes, pieces: g.pieces })}</td>
            <td style="text-align:right">Rs. ${g.revenue.toFixed(2)}</td>
          </tr>`).join('');

      html = renderPdfDocument({
        title: 'SALES BY PARTNER TYPE',
        subtitle: `Period: ${activeReportTab} | Range: ${periodStr}`,
        bodyHtml: `
          ${renderSummaryLine([
            { label: 'Partner Types', value: String(groups.size) },
            { label: 'Delivered Orders', value: String(deliveredOrders.length) },
            { label: 'Total Revenue', value: `Rs. ${deliveredOrders.reduce((s, o) => s + getOrderRevenue(o), 0).toFixed(2)}`, accent: true },
          ])}
          <div class="section-title">Orders and Units Sold by Partner Type</div>
          <table><thead><tr><th>Partner Type</th><th style="text-align:center">Orders</th><th style="text-align:center">Units Sold</th><th style="text-align:right">Revenue</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8">No delivered orders yet.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated executive report and requires no physical signature.',
      });
      fileName = buildPdfFileName('Sales_By_Partner_Type', freshReportRef('SPT'));

    } else if (reportName === 'Partner Type Revenue Report') {
      const deliveredOrders = data.orders.filter(o => o.status === 'Delivered' && isWithinReportPeriod(o.created_at, period));
      const groups = new Map<string, { revenue: number; profit: number }>();
      deliveredOrders.forEach(o => {
        const store = data.stores.find(s => s.id === o.store_id);
        const type = store?.partner_type || 'Retail Shop';
        const invoice = data.invoices.find(i => i.order_id === o.id);
        const g = groups.get(type) || { revenue: 0, profit: 0 };
        g.revenue += getOrderRevenue(o);
        g.profit += calculateDeliveredOrderProfit(o, data.purchases, data.products, invoice);
        groups.set(type, g);
      });
      const rows = Array.from(groups.entries()).sort((a, b) => b[1].revenue - a[1].revenue).map(([type, g]) => `<tr>
            <td>${type}</td>
            <td style="text-align:right">Rs. ${g.revenue.toFixed(2)}</td>
            <td style="text-align:right"><strong>Rs. ${g.profit.toFixed(2)}</strong></td>
          </tr>`).join('');

      html = renderPdfDocument({
        title: 'PARTNER TYPE REVENUE REPORT',
        subtitle: `Period: ${activeReportTab} | Range: ${periodStr}`,
        bodyHtml: `
          <div class="section-title">Revenue and Collected Profit by Partner Type</div>
          <table><thead><tr><th>Partner Type</th><th style="text-align:right">Revenue</th><th style="text-align:right">Profit (Collected)</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8">No delivered orders yet.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated executive report and requires no physical signature.',
      });
      fileName = buildPdfFileName('Partner_Type_Revenue', freshReportRef('PTR'));

    } else if (reportName === 'Partner Type Outstanding Report') {
      const groups = new Map<string, { outstanding: number; count: number }>();
      data.stores.forEach(s => {
        const type = s.partner_type || 'Retail Shop';
        const g = groups.get(type) || { outstanding: 0, count: 0 };
        g.outstanding += s.outstanding_balance;
        g.count += 1;
        groups.set(type, g);
      });
      const rows = Array.from(groups.entries()).sort((a, b) => b[1].outstanding - a[1].outstanding).map(([type, g]) => `<tr>
            <td>${type}</td>
            <td style="text-align:center">${g.count}</td>
            <td style="text-align:right"><strong>Rs. ${g.outstanding.toFixed(2)}</strong></td>
          </tr>`).join('');

      html = renderPdfDocument({
        title: 'PARTNER TYPE OUTSTANDING REPORT',
        subtitle: 'Live Credit Risk Audit by Partner Type',
        bodyHtml: `
          ${renderSummaryLine([
            { label: 'Total Outstanding', value: `Rs. ${data.stores.reduce((s, x) => s + x.outstanding_balance, 0).toFixed(2)}`, accent: true },
          ])}
          <div class="section-title">Outstanding Balance by Partner Type</div>
          <table><thead><tr><th>Partner Type</th><th style="text-align:center">Partners</th><th style="text-align:right">Outstanding</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8">No partners registered.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated credit ledger and requires no physical signature.',
      });
      fileName = buildPdfFileName('Partner_Type_Outstanding', freshReportRef('PTO'));

    } else if (reportName === 'Freezer Box Inventory Report') {
      const allInventory = await assetsApi.allInventory().catch(() => []);
      const totalUnitsLabel = formatQty({
        boxes: allInventory.reduce((s: number, x: any) => s + x.quantity, 0),
        pieces: allInventory.reduce((s: number, x: any) => s + (x.quantity_pieces || 0), 0),
      });
      const rows = allInventory.map((inv: any) => {
        const asset = assets.find(a => a.id === inv.asset_id);
        const product = data.products.find(p => p.id === inv.product_id);
        return `<tr>
            <td>${asset?.code || inv.asset_id}</td>
            <td>${product?.name || inv.product_id}</td>
            <td style="text-align:center"><strong>${formatQty({ boxes: inv.quantity, pieces: inv.quantity_pieces || 0 })}</strong></td>
          </tr>`;
      }).join('');

      html = renderPdfDocument({
        title: 'FREEZER BOX INVENTORY REPORT',
        subtitle: 'Live Stock Tracked Inside Deployed Assets',
        bodyHtml: `
          ${renderSummaryLine([
            { label: 'Assets Tracking Stock', value: String(new Set(allInventory.map((i: any) => i.asset_id)).size) },
            { label: 'Total Units In Field', value: totalUnitsLabel, accent: true },
          ])}
          <div class="section-title">Stock Breakdown by Asset</div>
          <table><thead><tr><th>Asset</th><th>Product</th><th style="text-align:center">Qty</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8">No stock currently tracked in any asset.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated stock audit report and requires no physical signature.',
      });
      fileName = buildPdfFileName('Freezer_Box_Inventory', freshReportRef('FBI'));

    } else if (reportName === 'Asset Assignment History Report') {
      const history = await assetsApi.allHistory().catch(() => []);
      const rows = history.map((h: any) => {
        const asset = assets.find(a => a.id === h.asset_id);
        const partner = h.partner_id ? data.stores.find(s => s.id === h.partner_id) : null;
        return `<tr>
            <td>${asset?.code || h.asset_id}</td>
            <td>${h.event_type}</td>
            <td>${partner?.name || '-'}</td>
            <td>${new Date(h.date).toLocaleDateString('en-IN')}</td>
            <td>${h.actor_name || 'Unknown'}</td>
          </tr>`;
      }).join('');

      html = renderPdfDocument({
        title: 'ASSET ASSIGNMENT HISTORY REPORT',
        subtitle: 'Full Assignment/Return/Maintenance Trail Across All Assets',
        bodyHtml: `
          ${renderSummaryLine([{ label: 'Events Logged', value: String(history.length) }])}
          <div class="section-title">Assignment History</div>
          <table><thead><tr><th>Asset</th><th>Event</th><th>Partner</th><th>Date</th><th>By</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">No asset history recorded yet.</td></tr>'}</tbody></table>`,
        footerNote: 'This is a computer-generated audit report and requires no physical signature.',
      });
      fileName = buildPdfFileName('Asset_Assignment_History', freshReportRef('AAH'));
    }

    if (html) {
      await exportHtmlReport(html, fileName, showAlert, previewWindow);
    }
  };

  return (
    <View className="gap-4">
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="font-bold text-sm tracking-tight text-slate-800">ERP Executive Reports Hub</Text>
            <Text className="text-[10px] text-slate-500 font-medium">Export financial & logistics logs instantly</Text>
          </View>
        </View>

        {allowedReportTabs.length > 0 ? (
          <View className="flex-row bg-white/60 border border-white/50 p-0.5 rounded-lg mb-4 self-start">
            {allowedReportTabs.map(tab => (
              <Pressable
                key={tab}
                onPress={() => setActiveReportTab(tab)}
                className={`px-2 py-1 rounded ${activeReportTab === tab ? 'bg-indigo-600' : ''}`}
              >
                <Text className={`text-[10px] font-bold ${activeReportTab === tab ? 'text-white' : 'text-slate-500'}`}>{tab}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text className="text-[10px] text-amber-600 font-semibold mb-4">No report period filters are enabled for your account. Contact your administrator.</Text>
        )}

        {activeReportTab === 'Custom' && (
          <View className="flex-row gap-2 bg-white/60 border border-white/50 p-2 rounded-xl mb-4">
            <View className="flex-1">
              <Text className="text-[9px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Start Date</Text>
              <DateField
                value={dateRange.start}
                onValueChange={v => setDateRange({ ...dateRange, start: v })}
                title="Select Start Date"
                className="bg-white border border-slate-200/60 rounded p-1.5 flex-row items-center justify-between"
                textClassName="text-[11px] text-slate-700 flex-1"
              />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] text-slate-500 font-bold mb-1 uppercase tracking-wider">End Date</Text>
              <DateField
                value={dateRange.end}
                onValueChange={v => setDateRange({ ...dateRange, end: v })}
                title="Select End Date"
                className="bg-white border border-slate-200/60 rounded p-1.5 flex-row items-center justify-between"
                textClassName="text-[11px] text-slate-700 flex-1"
              />
            </View>
          </View>
        )}

        <View className="flex-row flex-wrap gap-2">
          <Pressable onPress={() => handleExport('Sales and Profit Report')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#ec4899" />
            <Text className="font-semibold text-slate-700 text-[11px]">Revenue/Profit PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Store Outstanding Report')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#3b82f6" />
            <Text className="font-semibold text-slate-700 text-[11px]">Outstanding Credit PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Warehouse Stock Valuation')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#f59e0b" />
            <Text className="font-semibold text-slate-700 text-[11px]">Warehouse Stock PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Truck Inventory Distribution')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#10b981" />
            <Text className="font-semibold text-slate-700 text-[11px]">Truck Inventory PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Sales by Partner Type')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#4f46e5" />
            <Text className="font-semibold text-slate-700 text-[11px]">Sales by Partner Type PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Partner Type Revenue Report')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#4f46e5" />
            <Text className="font-semibold text-slate-700 text-[11px]">Partner Type Revenue PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Partner Type Outstanding Report')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#4f46e5" />
            <Text className="font-semibold text-slate-700 text-[11px]">Partner Type Outstanding PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Freezer Box Inventory Report')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#0ea5e9" />
            <Text className="font-semibold text-slate-700 text-[11px]">Freezer Box Inventory PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Asset Assignment History Report')} className="flex-1 min-w-[45%] lg:min-w-[22%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#6366f1" />
            <Text className="font-semibold text-slate-700 text-[11px]">Asset History PDF</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
