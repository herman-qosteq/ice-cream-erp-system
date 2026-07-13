import { Order, Purchase, Store } from './types';

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
export function getStoreMetrics(storeId: string, ordersList: Order[]) {
  const storeOrders = ordersList.filter(o => o.store_id === storeId && o.status === 'Delivered');
  const count = storeOrders.length;

  let totalRevenue = 0;
  let totalCost = 0;

  storeOrders.forEach(o => {
    o.items.forEach(item => {
      const cost = getLatestPurchasePrice(item.product_id);
      totalRevenue += item.quantity * item.unit_price;
      totalCost += item.quantity * cost;
    });
  });

  const profit = totalRevenue - totalCost;
  const avgOrderVal = count > 0 ? totalRevenue / count : 0;

  return {
    orderCount: count,
    revenue: parseFloat(totalRevenue.toFixed(2)),
    profit: parseFloat(profit.toFixed(2)),
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

export function calculateDeliveredOrderProfit(order: Order, purchases: Purchase[]): number {
  return order.items.reduce((sum, item) => {
    const costPrice = getLatestPurchasePrice(item.product_id, purchases);
    const revenue = item.unit_price * item.quantity;
    const cost = costPrice * item.quantity;
    return sum + (revenue - cost);
  }, 0);
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
