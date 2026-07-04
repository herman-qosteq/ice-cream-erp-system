import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { TrendingUp, DollarSign, Package, AlertTriangle, Calendar, Download, Trophy, Users, Award, Truck } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { calculateDeliveredOrderProfit, getAveragePurchasePrice } from '../../data';
import { exportHtmlReport } from '../../utils/reportExport';

interface AdminDashboardProps {
  data: ERPData;
  setActiveScreen: (screen: string) => void;
  showAlert: (opts: any) => void;
}

const inr = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminDashboard({ data, setActiveScreen, showAlert }: AdminDashboardProps) {
  const [activeReportTab, setActiveReportTab] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Custom'>('Weekly');
  const [dateRange, setDateRange] = useState({ start: '2026-06-20', end: '2026-06-27' });

  const totalRevenue = data.orders
    .filter(o => o.status === 'Delivered')
    .reduce((acc, o) => {
      const inv = data.invoices.find(i => i.order_id === o.id);
      return acc + (inv ? inv.grand_total : o.items.reduce((sum, item) => sum + (item.unit_price * item.quantity * (1 + item.tax_pct / 100)), 0));
    }, 0);
  const totalCollections = data.payments.reduce((acc, p) => acc + p.amount, 0);
  const pendingCollections = data.stores.reduce((acc, s) => acc + s.outstanding_balance, 0);

  const getInventoryCostValue = (productId: string, quantity: number) => {
    if (quantity <= 0) return 0;
    const product = data.products.find(p => p.id === productId);
    const avgPurchasePrice = getAveragePurchasePrice(productId, data.purchases);
    const fallbackPrice = product?.purchase_price ?? 0;
    return quantity * (avgPurchasePrice || fallbackPrice);
  };

  const warehouseStockValue = data.warehouse_inventory.reduce((sum, inv) => sum + getInventoryCostValue(inv.product_id, inv.available_qty), 0);

  let totalFleetStockValue = 0;
  data.truck_inventory.forEach(ti => {
    if (ti.quantity > 0) totalFleetStockValue += getInventoryCostValue(ti.product_id, ti.quantity);
  });

  const totalProfit = data.orders
    .filter(o => o.status === 'Delivered')
    .reduce((sum, order) => sum + calculateDeliveredOrderProfit(order, data.purchases), 0);

  const today = new Date('2026-06-27');
  const sevenDaysLater = new Date('2026-07-04');
  const upcomingRefills = data.stores.filter(s => {
    if (!s.next_refill_date) return false;
    const refDate = new Date(s.next_refill_date);
    return refDate >= today && refDate <= sevenDaysLater;
  });

  const storeRevenues = data.stores.map(st => {
    const orders = data.orders.filter(o => o.store_id === st.id && o.status === 'Delivered');
    const rev = orders.reduce((sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + (item.quantity * item.unit_price), 0), 0);
    return { name: st.name, revenue: rev, ranking: st.ranking };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const productSales = data.products.map(p => {
    const qty = data.orders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + o.items.filter(item => item.product_id === p.id).reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    return { name: p.name, qty, category: p.category };
  }).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const handleExport = async (reportName: string) => {
    const startStr = activeReportTab === 'Daily' ? '2026-06-27'
      : activeReportTab === 'Weekly' ? '2026-06-20'
      : activeReportTab === 'Monthly' ? '2026-05-27'
      : dateRange.start;
    const endStr = activeReportTab === 'Daily' ? '2026-06-27'
      : activeReportTab === 'Weekly' ? '2026-06-27'
      : activeReportTab === 'Monthly' ? '2026-06-27'
      : dateRange.end;

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    endDate.setHours(23, 59, 59, 999);
    const periodStr = `${startStr} to ${endStr}`;
    const generatedAt = new Date().toLocaleString('en-IN');

    let html = '';
    let fileName = '';

    const baseStyle = `
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 30px; color: #1e293b; background-color: #f8fafc; }
      .container { max-width: 950px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px solid #e2e8f0; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
      .title-section h1 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
      .title-section p { margin: 5px 0 0 0; font-size: 13px; color: #64748b; font-weight: 500; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
      .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; }
      .kpi-card span { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; display: block; }
      .kpi-card p { margin: 5px 0 0 0; font-size: 18px; font-weight: 900; color: #0f172a; }
      .kpi-card.highlight { border-left: 4px solid #16a34a; }
      .kpi-card.highlight p { color: #16a34a; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; text-align: left; }
      th { background-color: #f1f5f9; color: #475569; font-weight: bold; padding: 10px; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; font-size: 10px; }
      .footer { margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 15px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; font-weight: 500; }
    `;

    if (reportName === 'Sales and Profit Report') {
      const periodOrders = data.orders.filter(o => {
        const oDate = new Date(o.created_at);
        return oDate >= startDate && oDate <= endDate;
      });
      const periodPayments = data.payments.filter(p => {
        const pDate = new Date(p.date);
        return pDate >= startDate && pDate <= endDate;
      });

      let periodRevenue = 0, periodCOGS = 0, periodProfit = 0;
      periodOrders.forEach(o => {
        if (o.status === 'Delivered') {
          const inv = data.invoices.find(i => i.order_id === o.id);
          const orderGrossRev = inv ? inv.grand_total : o.items.reduce((sum, item) => sum + (item.unit_price * item.quantity * (1 + item.tax_pct / 100)), 0);
          periodRevenue += orderGrossRev;
          o.items.forEach(item => {
            const prod = data.products.find(p => p.id === item.product_id);
            if (prod) {
              const itemRevExclTax = item.unit_price * item.quantity;
              const itemCost = prod.purchase_price * item.quantity;
              periodCOGS += itemCost;
              periodProfit += (itemRevExclTax - itemCost);
            }
          });
        }
      });
      const totalPaymentsCollected = periodPayments.reduce((sum, p) => sum + p.amount, 0);

      const tableRows = periodOrders.map(o => {
        const store = data.stores.find(s => s.id === o.store_id);
        const inv = data.invoices.find(i => i.order_id === o.id);
        const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
        let revExclTax = 0, cost = 0;
        o.items.forEach(i => {
          const prod = data.products.find(p => p.id === i.product_id);
          revExclTax += i.unit_price * i.quantity;
          if (prod) cost += prod.purchase_price * i.quantity;
        });
        const rev = inv ? inv.grand_total : o.items.reduce((sum, item) => sum + (item.unit_price * item.quantity * (1 + item.tax_pct / 100)), 0);
        const profit = revExclTax - cost;
        return `<tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold; font-family: monospace;">${o.id}</td>
            <td style="padding: 10px;">${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
            <td style="padding: 10px; font-weight: 600;">${store?.name || 'Unknown Store'}</td>
            <td style="padding: 10px; text-align: center;">${totalQty}</td>
            <td style="padding: 10px; text-align: right; font-weight: 600;">Rs ${rev.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right;">Rs ${cost.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right; font-weight: bold; color: #16a34a;">Rs ${profit.toFixed(2)}</td>
            <td style="padding: 10px; text-align: center;">${o.status}</td>
          </tr>`;
      }).join('');

      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle}</style></head><body>
        <div class="container">
          <div class="header"><div class="title-section"><h1>Sales & Profit Executive Report</h1><p>Period: <strong>${activeReportTab}</strong> | Range: <strong>${periodStr}</strong></p></div></div>
          <div class="kpis">
            <div class="kpi-card highlight"><span>Delivered Revenue</span><p>Rs ${periodRevenue.toFixed(2)}</p></div>
            <div class="kpi-card"><span>Cost of Sales (COGS)</span><p>Rs ${periodCOGS.toFixed(2)}</p></div>
            <div class="kpi-card highlight" style="border-left-color:#2563eb"><span>Gross Profit</span><p style="color:#2563eb">Rs ${periodProfit.toFixed(2)}</p></div>
            <div class="kpi-card"><span>Collected Payments</span><p>Rs ${totalPaymentsCollected.toFixed(2)}</p></div>
          </div>
          <h3>LOGGED SALES ORDERS IN PERIOD (${periodOrders.length} orders)</h3>
          <table><thead><tr><th>Order ID</th><th>Date</th><th>Store Partner</th><th>Qty</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Status</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No orders logged in this period.</td></tr>'}</tbody></table>
          <div class="footer"><span>Generated by FrostyFlow Ice Cream ERP Hub</span><span>Timestamp: ${generatedAt}</span></div>
        </div></body></html>`;
      fileName = `${activeReportTab.toLowerCase()}_sales_report_${startStr}_to_${endStr}.pdf`;

    } else if (reportName === 'Store Outstanding Report') {
      const totalOutstanding = data.stores.reduce((sum, s) => sum + s.outstanding_balance, 0);
      const exceededCount = data.stores.filter(s => s.outstanding_balance > s.credit_limit).length;

      const storeRows = data.stores.map(s => {
        const exceeded = s.outstanding_balance > s.credit_limit ? 'EXCEEDED' : s.outstanding_balance === s.credit_limit ? 'AT LIMIT' : 'OK';
        return `<tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold;">${s.name}</td>
            <td style="padding: 10px;">${s.owner_name}<br/><span style="font-size:10px;color:#64748b">Ph: ${s.phone}</span></td>
            <td style="padding: 10px;">${s.area}, ${s.city}</td>
            <td style="padding: 10px; text-align: right;">Rs ${s.credit_limit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 10px; text-align: right; font-weight: bold;">Rs ${s.outstanding_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 10px; text-align: center;">${exceeded}</td>
            <td style="padding: 10px; text-align: center; font-size: 11px;">${s.last_purchase_date || 'N/A'}</td>
            <td style="padding: 10px; text-align: center; font-size: 11px;">${s.next_refill_date || 'N/A'}</td>
          </tr>`;
      }).join('');

      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle}</style></head><body>
        <div class="container">
          <div class="header"><div class="title-section"><h1>Store Outstanding Credit Ledger</h1><p>Live Risk Audit & Overdue Status Report</p></div></div>
          <div class="kpis">
            <div class="kpi-card"><span>Total Stores Tracked</span><p>${data.stores.length} Outlets</p></div>
            <div class="kpi-card highlight" style="border-left-color:#dc2626"><span>Accumulated Outstanding Balance</span><p style="color:#dc2626">Rs ${totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
            <div class="kpi-card" style="border-left:4px solid #15803d"><span>Exceeded Credit Limit</span><p style="color:#15803d">${exceededCount} Stores</p></div>
          </div>
          <h3>OUTSTANDING BALANCE AND CREDIT UTILIZATION BY OUTLET</h3>
          <table><thead><tr><th>Store Name</th><th>Owner Contact</th><th>Area / City</th><th>Credit Limit</th><th>Outstanding</th><th>Risk</th><th>Last Purchase</th><th>Next Refill</th></tr></thead>
          <tbody>${storeRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No store records registered.</td></tr>'}</tbody></table>
          <div class="footer"><span>Generated by FrostyFlow Ice Cream ERP Hub</span><span>Timestamp: ${generatedAt}</span></div>
        </div></body></html>`;
      fileName = `store_outstanding_report_${new Date().toISOString().split('T')[0]}.pdf`;

    } else if (reportName === 'Warehouse Stock Valuation') {
      let totalStockItems = 0, totalPurchaseValuation = 0, totalPotentialSalesValuation = 0;
      const getPurchaseValuation = (productId: string, currentQty: number, catalogPurchasePrice: number) => {
        if (currentQty <= 0) return 0;
        const avgPurchasePrice = getAveragePurchasePrice(productId, data.purchases);
        return currentQty * (avgPurchasePrice || catalogPurchasePrice);
      };

      const productRows = data.products.map(p => {
        const inventory = data.warehouse_inventory.find(inv => inv.product_id === p.id);
        const qty = inventory?.available_qty || 0;
        const purchaseVal = getPurchaseValuation(p.id, qty, p.purchase_price);
        const salesVal = qty * p.selling_price;
        const expectedProfit = salesVal - purchaseVal;
        totalStockItems += qty;
        totalPurchaseValuation += purchaseVal;
        totalPotentialSalesValuation += salesVal;
        return `<tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold; font-family: monospace;">${p.code}</td>
            <td style="padding: 10px; font-weight: 600;">${p.name}</td>
            <td style="padding: 10px;">${p.category}</td>
            <td style="padding: 10px; text-align: center; font-weight: bold;">${qty}</td>
            <td style="padding: 10px; text-align: right;">Rs ${p.purchase_price.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right;">Rs ${p.selling_price.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right; font-weight: 600;">Rs ${purchaseVal.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right; font-weight: 600;">Rs ${salesVal.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right; font-weight: bold; color: #2563eb;">Rs ${expectedProfit.toFixed(2)}</td>
          </tr>`;
      }).join('');

      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle}</style></head><body>
        <div class="container">
          <div class="header"><div class="title-section"><h1>Warehouse Inventory Stock Valuation</h1><p>Live Audit Report</p></div></div>
          <div class="kpis">
            <div class="kpi-card"><span>Unique SKUs</span><p>${data.products.length}</p></div>
            <div class="kpi-card"><span>Total Items On-Hand</span><p>${totalStockItems.toLocaleString('en-IN')}</p></div>
            <div class="kpi-card highlight" style="border-left-color:#3b82f6"><span>Wholesale Assets Cost</span><p style="color:#2563eb">Rs ${totalPurchaseValuation.toFixed(2)}</p></div>
            <div class="kpi-card highlight" style="border-left-color:#16a34a"><span>Retail Potential Value</span><p style="color:#16a34a">Rs ${totalPotentialSalesValuation.toFixed(2)}</p></div>
          </div>
          <h3>VALUATION BREAKDOWN BY PRODUCT</h3>
          <table><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Qty</th><th>Wholesale</th><th>Selling</th><th>Wholesale Val</th><th>Retail Val</th><th>Margin</th></tr></thead>
          <tbody>${productRows || '<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8">No products registered.</td></tr>'}</tbody></table>
          <div class="footer"><span>Generated by FrostyFlow Ice Cream ERP Hub</span><span>Timestamp: ${generatedAt}</span></div>
        </div></body></html>`;
      fileName = `warehouse_stock_valuation_${new Date().toISOString().split('T')[0]}.pdf`;

    } else if (reportName === 'Truck Inventory Distribution') {
      let totalQtyLoaded = 0, totalTruckValuation = 0, totalTruckRetailValuation = 0;
      const itemsList: any[] = [];

      data.trucks.forEach(t => {
        const driver = data.users.find(u => u.id === t.driver_user_id);
        const inventories = data.truck_inventory.filter(ti => ti.truck_id === t.id);
        inventories.forEach(ti => {
          const prod = data.products.find(p => p.id === ti.product_id);
          if (prod && ti.quantity > 0) {
            const costPrice = getAveragePurchasePrice(prod.id, data.purchases) || prod.purchase_price;
            const costVal = ti.quantity * costPrice;
            const retailVal = ti.quantity * prod.selling_price;
            totalQtyLoaded += ti.quantity;
            totalTruckValuation += costVal;
            totalTruckRetailValuation += retailVal;
            itemsList.push({ vehicleNumber: t.vehicle_number, driverName: driver?.name || 'Unassigned', area: t.area, skuCode: prod.code, prodName: prod.name, qty: ti.quantity, costPrice, sellingPrice: prod.selling_price, costVal, retailVal });
          }
        });
      });

      const tableRows = itemsList.map(item => `<tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold; font-family: monospace;">${item.vehicleNumber}</td>
            <td style="padding: 10px;">${item.driverName}</td>
            <td style="padding: 10px;">${item.area}</td>
            <td style="padding: 10px; font-family: monospace; font-weight: bold;">${item.skuCode}</td>
            <td style="padding: 10px;">${item.prodName}</td>
            <td style="padding: 10px; text-align: center; font-weight: bold; color: #2563eb;">${item.qty} units</td>
            <td style="padding: 10px; text-align: right;">Rs ${item.costPrice.toFixed(2)} / Rs ${item.sellingPrice.toFixed(2)}</td>
            <td style="padding: 10px; text-align: right; font-weight: bold; color: #16a34a;">Rs ${item.costVal.toFixed(2)} (Cost)<br/>Rs ${item.retailVal.toFixed(2)} (Retail)</td>
          </tr>`).join('');

      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${baseStyle}</style></head><body>
        <div class="container">
          <div class="header"><div class="title-section"><h1>Truck Transit Inventory Distribution</h1><p>Live Route Stock Loading Audit</p></div></div>
          <div class="kpis">
            <div class="kpi-card"><span>Fleet Size</span><p>${data.trucks.length} Vehicles</p></div>
            <div class="kpi-card highlight" style="border-left-color:#2563eb"><span>Total Cargo Units</span><p style="color:#2563eb">${totalQtyLoaded.toLocaleString('en-IN')} Units</p></div>
            <div class="kpi-card highlight" style="border-left-color:#16a34a"><span>Cargo Asset Cost</span><p style="color:#16a34a">Rs ${totalTruckValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
            <div class="kpi-card highlight" style="border-left-color:#f59e0b"><span>Retail Sales Potential</span><p style="color:#f59e0b">Rs ${totalTruckRetailValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div>
          </div>
          <h3>LOADED TRANSIT STOCK BREAKDOWN BY VEHICLE</h3>
          <table><thead><tr><th>Vehicle</th><th>Driver</th><th>Route</th><th>SKU</th><th>Product</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No truck inventory currently dispatched.</td></tr>'}</tbody></table>
          <div class="footer"><span>Generated by FrostyFlow Ice Cream ERP Hub</span><span>Timestamp: ${generatedAt}</span></div>
        </div></body></html>`;
      fileName = `truck_distribution_report_${new Date().toISOString().split('T')[0]}.pdf`;
    }

    if (html) {
      await exportHtmlReport(html, fileName, showAlert);
    }
  };

  return (
    <View className="gap-6">
      {/* MAIN KPIS */}
      <View className="flex-row flex-wrap gap-4">
        <View className="flex-1 min-w-[45%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-blue-400">
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Revenue</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{inr(totalRevenue)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">Accumulated collected</Text>
        </View>

        <View className="flex-1 min-w-[45%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-emerald-400">
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Profit</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{inr(totalProfit)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">After purchase deductions</Text>
        </View>

        <View className="flex-1 min-w-[45%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-violet-400">
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Collections</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{inr(totalCollections)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">Cash/UPI/Cards settled</Text>
        </View>

        <Pressable
          onPress={() => setActiveScreen('Credit')}
          className="flex-1 min-w-[45%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-pink-400 active:bg-white"
        >
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Pending Collections</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{inr(pendingCollections)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">Overdue customer credit</Text>
        </Pressable>
      </View>

      {/* Warehouse and Truck stock valuation */}
      <View className="gap-4">
        <View className="bg-white/70 border border-white/50 p-4 rounded-2xl flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="p-3 bg-blue-500/10 rounded-xl border border-blue-200/50">
              <Package size={20} color="#2563eb" />
            </View>
            <View>
              <Text className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Warehouse Value</Text>
              <Text className="text-lg font-bold text-slate-800">{inr(warehouseStockValue)}</Text>
            </View>
          </View>
          <Pressable onPress={() => setActiveScreen('Warehouse')} className="bg-blue-500/10 py-1.5 px-3 rounded-lg border border-blue-200/50 active:bg-blue-500/20">
            <Text className="text-xs font-bold text-blue-700">Manage Stock</Text>
          </Pressable>
        </View>

        <View className="bg-white/70 border border-white/50 p-4 rounded-2xl flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-200/50">
              <Truck size={20} color="#059669" />
            </View>
            <View>
              <Text className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Fleet Transit Value</Text>
              <Text className="text-lg font-bold text-slate-800">{inr(totalFleetStockValue)}</Text>
            </View>
          </View>
          <Pressable onPress={() => setActiveScreen('Warehouse')} className="bg-emerald-500/10 py-1.5 px-3 rounded-lg border border-emerald-200/50 active:bg-emerald-500/20">
            <Text className="text-xs font-bold text-emerald-700">View Routes</Text>
          </Pressable>
        </View>
      </View>

      {/* UPCOMING REFILLS */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-1.5">
            <Calendar size={16} color="#ec4899" />
            <Text className="font-bold text-slate-800 text-sm">Upcoming Refills (7 Days)</Text>
          </View>
          <Text className="text-[10px] bg-pink-100 text-pink-700 border border-pink-200/50 font-extrabold px-2.5 py-0.5 rounded-full">
            {upcomingRefills.length} Stores Due
          </Text>
        </View>

        {upcomingRefills.length === 0 ? (
          <Text className="text-xs text-slate-400 text-center py-4 font-medium italic">No refills due in the next 7 days.</Text>
        ) : (
          <View className="gap-2">
            {upcomingRefills.map(s => {
              const daysDiff = Math.ceil((new Date(s.next_refill_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              let badgeClass = 'bg-white text-slate-700 border border-slate-200';
              let label = `In ${daysDiff} days`;
              if (daysDiff === 0) { badgeClass = 'bg-rose-500'; label = 'Due Today'; }
              else if (daysDiff === 1) { badgeClass = 'bg-pink-500'; label = 'Due Tomorrow'; }
              const isColored = daysDiff <= 1;

              return (
                <View key={s.id} className="p-2.5 rounded-xl bg-white/80 border border-white/60 flex-row items-center justify-between">
                  <View>
                    <Text className="font-bold text-slate-800 text-xs">{s.name}</Text>
                    <Text className="text-slate-400 text-[10px] font-medium">Area: {s.area} - Last Order: {s.last_purchase_date || 'N/A'}</Text>
                  </View>
                  <Text className={`text-[10px] font-bold px-2 py-1 rounded-lg ${badgeClass} ${isColored ? 'text-white' : ''}`}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* TOP STORES & PRODUCTS */}
      <View className="gap-4">
        <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
          <View className="flex-row items-center gap-1.5 mb-3">
            <Trophy size={16} color="#f59e0b" />
            <Text className="font-bold text-slate-800 text-sm">Top Stores (by Revenue)</Text>
          </View>
          <View>
            {storeRevenues.map((st, i) => (
              <View key={i} className="flex-row items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-slate-400 text-xs">#{i + 1}</Text>
                  <View>
                    <Text className="font-semibold text-slate-800 text-xs">{st.name}</Text>
                    <Text className="text-[10px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded self-start">{st.ranking} Partner</Text>
                  </View>
                </View>
                <Text className="font-bold text-slate-700 text-xs">Rs {st.revenue.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
          <View className="flex-row items-center gap-1.5 mb-3">
            <Award size={16} color="#0ea5e9" />
            <Text className="font-bold text-slate-800 text-sm">Top Products (by Volume)</Text>
          </View>
          <View>
            {productSales.map((p, i) => (
              <View key={i} className="flex-row items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-slate-400 text-xs">#{i + 1}</Text>
                  <View>
                    <Text className="font-semibold text-slate-800 text-xs">{p.name}</Text>
                    <Text className="text-[9px] text-slate-400 font-medium">{p.category}</Text>
                  </View>
                </View>
                <Text className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded-full text-[10px]">{p.qty} sold</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* TRUCK INVENTORY */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Truck size={16} color="#059669" />
          <Text className="font-bold text-slate-800 text-sm">Truck Inventory & Stock Value</Text>
        </View>
        <View className="flex-row border-b border-slate-100 pb-2 mb-1">
          <Text className="flex-1 text-slate-400 font-semibold uppercase text-[9px]">Vehicle / Driver</Text>
          <Text className="w-20 text-slate-400 font-semibold uppercase text-[9px] text-center">Route</Text>
          <Text className="w-14 text-slate-400 font-semibold uppercase text-[9px] text-right">Qty</Text>
        </View>
        {data.trucks.map(t => {
          const driver = data.users.find(u => u.id === t.driver_user_id);
          const inventories = data.truck_inventory.filter(ti => ti.truck_id === t.id);
          let totalQty = 0, totalVal = 0;
          inventories.forEach(ti => {
            const prod = data.products.find(p => p.id === ti.product_id);
            if (prod && ti.quantity > 0) {
              totalQty += ti.quantity;
              totalVal += getInventoryCostValue(ti.product_id, ti.quantity);
            }
          });
          return (
            <View key={t.id} className="flex-row items-center py-2.5 border-b border-slate-50 last:border-0">
              <View className="flex-1">
                <Text className="font-bold text-slate-800 text-xs">{t.vehicle_number}</Text>
                <Text className="text-[9px] text-slate-500 font-medium">{driver?.name || 'Unassigned'}</Text>
                <Text className="text-emerald-600 font-bold text-[10px]">Rs {totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
              <Text className="w-20 text-slate-600 font-medium text-center text-xs">{t.area}</Text>
              <Text className="w-14 font-semibold text-slate-700 text-right text-xs">{totalQty}</Text>
            </View>
          );
        })}
        {data.trucks.length === 0 && (
          <Text className="py-4 text-center text-slate-400 italic text-xs">No trucks registered in the fleet.</Text>
        )}
      </View>

      {/* SALESPERSON PERFORMANCE */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Users size={16} color="#6366f1" />
          <Text className="font-bold text-slate-800 text-sm">Salesperson / Driver Stats</Text>
        </View>
        {data.users.filter(u => u.role === 'Salesperson').map(u => {
          const driverOrders = data.orders.filter(o => o.salesperson_id === u.id);
          const count = driverOrders.length;
          const revenue = driverOrders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + o.items.reduce((sSum, item) => sSum + (item.quantity * item.unit_price), 0), 0);
          const collections = data.payments.filter(p => p.collected_by === u.id).reduce((sum, p) => sum + p.amount, 0);
          return (
            <View key={u.id} className="flex-row items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
              <Text className="font-bold text-slate-800 text-xs">{u.name.split(' ')[0]}</Text>
              <Text className="text-slate-600 font-medium text-xs">{count} orders</Text>
              <Text className="font-semibold text-slate-700 text-xs">Rs {revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              <Text className="text-emerald-600 font-bold text-xs">Rs {collections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            </View>
          );
        })}
      </View>

      {/* REPORT EXPORT CENTER */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4 mb-4">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="font-bold text-sm tracking-tight text-slate-800">ERP Executive Reports Hub</Text>
            <Text className="text-[10px] text-slate-500 font-medium">Export financial & logistics logs instantly</Text>
          </View>
        </View>

        <View className="flex-row bg-white/60 border border-white/50 p-0.5 rounded-lg mb-4 self-start">
          {(['Daily', 'Weekly', 'Monthly', 'Custom'] as const).map(tab => (
            <Pressable
              key={tab}
              onPress={() => setActiveReportTab(tab)}
              className={`px-2 py-1 rounded ${activeReportTab === tab ? 'bg-white' : ''}`}
            >
              <Text className={`text-[10px] font-bold ${activeReportTab === tab ? 'text-slate-800' : 'text-slate-500'}`}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        {activeReportTab === 'Custom' && (
          <View className="flex-row gap-2 bg-white/60 border border-white/50 p-2 rounded-xl mb-4">
            <View className="flex-1">
              <Text className="text-[9px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Start Date (YYYY-MM-DD)</Text>
              <TextInput
                value={dateRange.start}
                onChangeText={v => setDateRange({ ...dateRange, start: v })}
                className="bg-white border border-slate-200/60 rounded p-1.5 text-[11px] text-slate-700"
              />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] text-slate-500 font-bold mb-1 uppercase tracking-wider">End Date (YYYY-MM-DD)</Text>
              <TextInput
                value={dateRange.end}
                onChangeText={v => setDateRange({ ...dateRange, end: v })}
                className="bg-white border border-slate-200/60 rounded p-1.5 text-[11px] text-slate-700"
              />
            </View>
          </View>
        )}

        <View className="flex-row flex-wrap gap-2">
          <Pressable onPress={() => handleExport('Sales and Profit Report')} className="flex-1 min-w-[45%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#ec4899" />
            <Text className="font-semibold text-slate-700 text-[11px]">Revenue/Profit PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Store Outstanding Report')} className="flex-1 min-w-[45%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#3b82f6" />
            <Text className="font-semibold text-slate-700 text-[11px]">Outstanding Credit PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Warehouse Stock Valuation')} className="flex-1 min-w-[45%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#f59e0b" />
            <Text className="font-semibold text-slate-700 text-[11px]">Warehouse Stock PDF</Text>
          </Pressable>
          <Pressable onPress={() => handleExport('Truck Inventory Distribution')} className="flex-1 min-w-[45%] flex-row items-center gap-1.5 bg-white/80 border border-white/60 py-2.5 px-2.5 rounded-xl">
            <Download size={14} color="#10b981" />
            <Text className="font-semibold text-slate-700 text-[11px]">Truck Inventory PDF</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
