import { Invoice, Order, Purchase, Store } from './types';

// Calculate Customer Health Score based on parameters: Outstanding, Ranking, Refill delay
export function calculateStoreHealthScore(store: Store): number {
  let score = 100;

  // Outstanding limit ratio
  const limitRatio = store.outstanding_balance / (store.credit_limit || 1);
  if (limitRatio > 0.8) score -= 30;
  else if (limitRatio > 0.5) score -= 15;
  else if (limitRatio > 0.2) score -= 5;

  // Overdue status
  const nextRefill = new Date(store.next_refill_date);
  const today = new Date('2026-06-27');
  if (nextRefill < today) {
    const diffDays = Math.ceil((today.getTime() - nextRefill.getTime()) / (1000 * 60 * 60 * 24));
    score -= Math.min(25, diffDays * 5); // lose 5 points per overdue day, max 25
  }

  // No purchases at all
  if (!store.last_purchase_date) {
    score = 50;
  }

  return Math.max(0, score);
}

// Get store metrics
export function getStoreMetrics(storeId: string, ordersList: Order[], purchases: Purchase[] = [], invoices: Invoice[] = []) {
  const storeOrders = ordersList.filter(o => o.store_id === storeId && o.status === 'Delivered');
  const count = storeOrders.length;

  let totalRevenue = 0;
  let totalProfit = 0;

  storeOrders.forEach(o => {
    o.items.forEach(item => {
      totalRevenue += item.quantity * item.unit_price;
    });
    const invoice = invoices.find(i => i.order_id === o.id);
    totalProfit += calculateDeliveredOrderProfit(o, purchases, invoice);
  });

  const avgOrderVal = count > 0 ? totalRevenue / count : 0;

  return {
    orderCount: count,
    revenue: parseFloat(totalRevenue.toFixed(2)),
    // Only the portion of each order's profit backed by money actually
    // collected so far (see calculateDeliveredOrderProfit) - not the full
    // invoiced/order profit.
    profit: parseFloat(totalProfit.toFixed(2)),
    avgOrderValue: parseFloat(avgOrderVal.toFixed(2))
  };
}

export function getLatestPurchasePrice(productId: string, purchases: Purchase[] = []): number {
  const latestPurchasedItem = [...purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap(purchase => purchase.items.map(item => ({ ...item, date: purchase.date })))
    .find(item => item.product_id === productId);

  return latestPurchasedItem?.purchase_price ?? 0;
}

// Profit is recognized on a cash basis, not an accrual one: money isn't
// collected the moment an order is delivered (stores often carry balances on
// credit), so an order's profit only counts once - and to the extent that -
// its invoice has actually been paid. A fully-unpaid invoice contributes 0,
// a fully-paid one contributes the full margin, and a partially-paid one
// contributes that same proportion of the margin, so partial collections are
// still reflected instead of being invisible until "Paid" is reached.
export function calculateDeliveredOrderProfit(order: Order, purchases: Purchase[], invoice?: { grand_total: number; paid_amount?: number }): number {
  const fullMargin = order.items.reduce((sum, item) => {
    const costPrice = getLatestPurchasePrice(item.product_id, purchases);
    const revenue = item.unit_price * item.quantity;
    const cost = costPrice * item.quantity;
    return sum + (revenue - cost);
  }, 0);

  if (!invoice || !invoice.grand_total) return 0;
  const collectedFraction = Math.min(1, Math.max(0, (invoice.paid_amount ?? 0) / invoice.grand_total));
  return fullMargin * collectedFraction;
}

export function getAveragePurchasePrice(productId: string, purchases: Purchase[] = []): number {
  const purchaseItems = purchases
    .flatMap(purchase => purchase.items)
    .filter(item => item.product_id === productId);

  const totalQty = purchaseItems.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQty <= 0) {
    return getLatestPurchasePrice(productId, purchases);
  }

  const totalCost = purchaseItems.reduce((sum, item) => sum + (item.quantity * item.purchase_price), 0);
  return totalCost / totalQty;
}
