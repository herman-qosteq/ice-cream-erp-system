// Smoke test for a Total Profit bug on the Admin Dashboard: calculateDeliveredOrderProfit()
// priced an item's cost from getLatestPurchasePrice() with no fallback, so a
// product sold before it ever had a Purchase record (e.g. stock added via
// Warehouse "Adjust" instead of the Purchases module) silently costed out at
// 0 - counting its entire revenue as profit. Fixed by falling back to the
// product's own reference cost (product.purchase_price, derived from MRP *
// purchase discount %), matching the fallback getInventoryCostValue() already
// used elsewhere on the same dashboard. Run with `npm run test:smoke`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeliveredOrderProfit } from '../../data';
import type { Order, Purchase, Product } from '../../types';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1', name: 'Vanilla Cup', code: 'VC1', category: 'Cups', brand: '', description: '',
    image_url: '', mrp: 100, purchase_discount_pct: 40, wholesale_discount_pct: 0, retail_discount_pct: 0,
    purchase_price: 60, wholesale_price: 100, selling_price: 100, box_mrp: 100, tax_pct: 0,
    status: 'Active', unit_value: 100, unit_type: 'ml', pieces_per_box: 1,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1', store_id: 'st1', salesperson_id: 'u2', truck_id: 't1', status: 'Delivered',
    created_at: '2026-07-01T00:00:00',
    items: [{ product_id: 'p1', quantity: 0, quantity_pieces: 10, unit_price: 100, tax_pct: 0 }],
    ...overrides,
  };
}

const fullyPaidInvoice = { grand_total: 1000, paid_amount: 1000 };

test('regression: a product never purchased still gets a real cost, not 0', () => {
  const order = makeOrder();
  const products = [makeProduct()]; // purchase_price: 60, no purchase history for it
  const profit = calculateDeliveredOrderProfit(order, [], products, fullyPaidInvoice);

  // revenue = 10 * 100 = 1000; expected cost = 10 * 60 = 600; profit = 400.
  // Before the fix this came out 1000 (100% margin) because cost fell through to 0.
  assert.equal(profit, 400);
});

test('a recorded purchase price still takes priority over the product reference cost', () => {
  const order = makeOrder();
  const products = [makeProduct()]; // reference purchase_price: 60
  const purchases: Purchase[] = [{
    id: 'pu1', supplier_id: 's1', invoice_number: 'INV1', date: '2026-06-15',
    items: [{ product_id: 'p1', quantity: 0, quantity_pieces: 10, purchase_price: 45 }],
  }];
  const profit = calculateDeliveredOrderProfit(order, purchases, products, fullyPaidInvoice);

  // revenue = 1000; recorded cost = 10 * 45 = 450; profit = 550.
  assert.equal(profit, 550);
});

test('unpaid invoice still contributes 0 profit even with a valid fallback cost', () => {
  const order = makeOrder();
  const products = [makeProduct()];
  const profit = calculateDeliveredOrderProfit(order, [], products, { grand_total: 1000, paid_amount: 0 });
  assert.equal(profit, 0);
});
