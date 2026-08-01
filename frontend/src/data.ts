import type { Invoice, Order, Purchase, Store, Product } from './types';
import { toTotalPieces } from './utils/qty';

function piecesPerBoxOf(productId: string, products: Product[]): number {
  return products.find(p => p.id === productId)?.pieces_per_box ?? 1;
}

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
  const today = new Date();
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
export function getStoreMetrics(storeId: string, ordersList: Order[], purchases: Purchase[] = [], invoices: Invoice[] = [], products: Product[] = []) {
  const storeOrders = ordersList.filter(o => o.store_id === storeId && o.status === 'Delivered');
  const count = storeOrders.length;

  let totalRevenue = 0;
  let totalProfit = 0;

  storeOrders.forEach(o => {
    o.items.forEach(item => {
      // unit_price is a per-piece rate (MRP is printed per individual
      // sellable piece) - bill the total piece count, not the raw box count.
      totalRevenue += toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, piecesPerBoxOf(item.product_id, products)) * item.unit_price;
    });
    const invoice = invoices.find(i => i.order_id === o.id);
    totalProfit += calculateDeliveredOrderProfit(o, purchases, products, invoice);
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
export function calculateDeliveredOrderProfit(order: Order, purchases: Purchase[], products: Product[] = [], invoice?: { grand_total: number; paid_amount?: number }): number {
  const fullMargin = order.items.reduce((sum, item) => {
    // Fall back to the product's own reference cost (derived from MRP *
    // purchase discount %) when it has no purchase-history entries yet - e.g.
    // stock added via Warehouse "Adjust" and sold before any Purchase was
    // ever recorded for it. Without this, costPrice silently comes out 0 and
    // the item's full revenue gets counted as profit.
    const costPrice = getLatestPurchasePrice(item.product_id, purchases)
      || products.find(p => p.id === item.product_id)?.purchase_price
      || 0;
    // unit_price/costPrice are both per-piece rates - bill/cost the total
    // piece count (whole boxes worth, plus any loose pieces), not the raw
    // box count, or margins come out wildly wrong whenever a box is sold.
    const totalPieces = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, piecesPerBoxOf(item.product_id, products));
    const revenue = item.unit_price * totalPieces;
    const cost = costPrice * totalPieces;
    return sum + (revenue - cost);
  }, 0);

  if (!invoice || !invoice.grand_total) return 0;
  const collectedFraction = Math.min(1, Math.max(0, (invoice.paid_amount ?? 0) / invoice.grand_total));
  return fullMargin * collectedFraction;
}

export function getAveragePurchasePrice(productId: string, purchases: Purchase[] = [], piecesPerBox: number = 1): number {
  const purchaseItems = purchases
    .flatMap(purchase => purchase.items)
    .filter(item => item.product_id === productId);

  const totalPieces = purchaseItems.reduce((sum, item) => sum + toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, piecesPerBox), 0);
  if (totalPieces <= 0) {
    return getLatestPurchasePrice(productId, purchases);
  }

  const totalCost = purchaseItems.reduce((sum, item) => sum + toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, piecesPerBox) * item.purchase_price, 0);
  return totalCost / totalPieces;
}
