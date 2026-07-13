import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num, dateOnly } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';

const TODAY = new Date('2026-06-27');

function refillDaysFor(refill_frequency: string, custom_days?: number | null): number {
  if (refill_frequency === 'Weekly') return 7;
  if (refill_frequency === '15 Days') return 15;
  if (refill_frequency === 'Monthly') return 30;
  if (refill_frequency === 'Custom') return custom_days || 7;
  return 7;
}

function serializeOrder(o: any) {
  return {
    id: o.id,
    store_id: o.store_id,
    salesperson_id: o.salesperson_id,
    truck_id: o.truck_id ?? '',
    status: o.status,
    created_at: o.created_at,
    items: o.items.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: num(i.unit_price), tax_pct: num(i.tax_pct) })),
  };
}

function serializeInvoice(inv: any) {
  return {
    id: inv.id,
    order_id: inv.order_id,
    invoice_number: inv.invoice_number,
    total: num(inv.total),
    tax: num(inv.tax),
    grand_total: num(inv.grand_total),
    created_at: inv.created_at,
    paid_amount: inv.paid_amount === null ? undefined : num(inv.paid_amount),
    payment_status: inv.payment_status ?? undefined,
    payment_method: inv.payment_method ?? undefined,
  };
}

export async function listOrders() {
  const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { created_at: 'desc' } });
  return orders.map(serializeOrder);
}

export async function listInvoices() {
  const invoices = await prisma.invoice.findMany({ orderBy: { created_at: 'desc' } });
  return invoices.map(serializeInvoice);
}

interface OrderItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_pct: number;
}

// Mirrors handleFinalizeOrderOnly(): an instant truck-stock sale. Deducts the
// truck's cargo, generates the invoice, and adds the full grand_total to the
// store's outstanding balance (settled down later via settleOrder()).
export async function createOrder(input: { store_id: string; salesperson_id: string; truck_id: string; items: OrderItemInput[] }, actorId: string) {
  // Round total/tax to cents *before* summing them into grand_total — summing
  // the raw (unrounded) figures and rounding that sum independently can land
  // grand_total a cent away from total+tax as actually stored (e.g. total
  // rounds to 9.90, tax rounds to 0.50, but the unrounded sum rounds to
  // 10.39 instead of 10.40).
  const total = parseFloat(input.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0).toFixed(2));
  const tax = parseFloat(input.items.reduce((sum, i) => sum + i.quantity * i.unit_price * (i.tax_pct / 100), 0).toFixed(2));
  const grandTotal = parseFloat((total + tax).toFixed(2));

  const store = await prisma.store.findUnique({ where: { id: input.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  const result = await prisma.$transaction(async tx => {
    for (const item of input.items) {
      const truckInv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: input.truck_id, product_id: item.product_id } } });
      const remaining = (truckInv?.quantity ?? 0) - item.quantity;
      if (remaining > 0) {
        await tx.truckInventory.update({ where: { truck_id_product_id: { truck_id: input.truck_id, product_id: item.product_id } }, data: { quantity: remaining } });
      } else if (truckInv) {
        await tx.truckInventory.delete({ where: { truck_id_product_id: { truck_id: input.truck_id, product_id: item.product_id } } });
      }
    }

    const order = await tx.order.create({
      data: {
        store_id: input.store_id,
        salesperson_id: input.salesperson_id,
        truck_id: input.truck_id,
        status: 'Delivered',
        items: { create: input.items },
      },
      include: { items: true },
    });

    const invoice = await tx.invoice.create({
      data: {
        order_id: order.id,
        invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
        total,
        tax,
        grand_total: grandTotal,
      },
    });

    const refillDays = refillDaysFor(store.refill_frequency, store.custom_days);
    await tx.store.update({
      where: { id: input.store_id },
      data: {
        outstanding_balance: { increment: grandTotal },
        last_purchase_date: TODAY,
        next_refill_date: new Date(TODAY.getTime() + refillDays * 86400000),
      },
    });

    return { order, invoice };
  });

  await logAudit({ action: 'ORDER_CREATE', entity_type: 'Order', entity_id: result.order.id, user_id: actorId, details: `Created & delivered order ID ${result.order.id} for ${store.name}. Total: Rs${grandTotal.toFixed(2)}` });

  return { order: serializeOrder(result.order), invoice: serializeInvoice(result.invoice) };
}

// Mirrors handleFinalizeSettlementOnly(): records a payment against an
// invoice, topping up any prior partial payment, and reduces the store's
// outstanding balance by only the newly-collected amount.
export async function settleOrder(orderId: string, input: { method: string; amount: number }, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw ApiError.notFound('Order not found');
  const invoice = await prisma.invoice.findUnique({ where: { order_id: orderId } });
  if (!invoice) throw ApiError.notFound('Invoice not found for this order');

  const priorPaid = num(invoice.paid_amount);
  const grandTotal = num(invoice.grand_total);
  const remainingOwed = Math.max(0, grandTotal - priorPaid);
  const isPayLater = input.method === 'Credit' || input.amount === 0;
  const actualCollection = isPayLater ? 0 : Math.min(input.amount, remainingOwed);
  const finalPaidAmount = parseFloat((priorPaid + actualCollection).toFixed(2));
  const paymentStatus = finalPaidAmount >= grandTotal - 0.05 ? 'Paid' : finalPaidAmount > 0 ? 'Partial' : 'Credit';

  const result = await prisma.$transaction(async tx => {
    const updatedInvoice = await tx.invoice.update({
      where: { order_id: orderId },
      data: { paid_amount: finalPaidAmount, payment_status: paymentStatus, payment_method: actualCollection > 0 ? input.method : (invoice.payment_method ?? 'Credit') },
    });

    await tx.store.update({ where: { id: order.store_id }, data: { outstanding_balance: { decrement: actualCollection } } });
    // Clamp to zero in case of any prior floating drift.
    const store = await tx.store.findUnique({ where: { id: order.store_id } });
    if (store && num(store.outstanding_balance) < 0) {
      await tx.store.update({ where: { id: order.store_id }, data: { outstanding_balance: 0 } });
    }

    let payment = null;
    if (actualCollection > 0) {
      payment = await tx.payment.create({
        data: { store_id: order.store_id, order_id: orderId, amount: actualCollection, method: input.method, collected_by: actorId },
      });
    }

    return { invoice: updatedInvoice, payment };
  });

  if (result.payment) {
    await logAudit({ action: 'PAYMENT_RECEIVE', entity_type: 'Store', entity_id: order.store_id, user_id: actorId, details: `Collected payment of Rs${actualCollection.toFixed(2)} via ${input.method}` });
  }

  return { invoice: serializeInvoice(result.invoice), actualCollection, paymentStatus };
}

// Mirrors handleConfirmDraftOrder(): moves a Draft order's items from
// available -> reserved warehouse stock, guarding on sufficient available_qty.
export async function confirmDraftOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw ApiError.notFound('Order not found');

  for (const item of order.items) {
    const inv = await prisma.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
    const product = await prisma.product.findUnique({ where: { id: item.product_id } });
    if (!inv || inv.available_qty < item.quantity) {
      throw ApiError.conflict(`Cannot confirm order: Insufficient available stock for ${product?.name ?? item.product_id}. Only ${inv?.available_qty ?? 0} units available, but ${item.quantity} are requested.`);
    }
  }

  const updated = await prisma.$transaction(async tx => {
    for (const item of order.items) {
      await tx.warehouseInventory.update({
        where: { product_id: item.product_id },
        data: { available_qty: { decrement: item.quantity }, reserved_qty: { increment: item.quantity } },
      });
    }
    return tx.order.update({ where: { id: orderId }, data: { status: 'Confirmed' }, include: { items: true } });
  });

  await logAudit({ action: 'ORDER_CONFIRM', entity_type: 'Order', entity_id: orderId, user_id: actorId, details: `Confirmed Draft order ID ${orderId}. Moved items to reserved warehouse stock.` });
  return serializeOrder(updated);
}

// Mirrors handleDeliverConfirmedOrder(): releases the reserved warehouse
// stock for a Confirmed order, marks it Delivered, and generates its invoice
// (billing the store) only if one doesn't already exist.
export async function deliverConfirmedOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw ApiError.notFound('Order not found');
  const store = await prisma.store.findUnique({ where: { id: order.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  const result = await prisma.$transaction(async tx => {
    for (const item of order.items) {
      await tx.warehouseInventory.upsert({
        where: { product_id: item.product_id },
        update: { reserved_qty: { decrement: item.quantity } },
        create: { product_id: item.product_id },
      });
    }

    const updatedOrder = await tx.order.update({ where: { id: orderId }, data: { status: 'Delivered' }, include: { items: true } });

    let invoice = await tx.invoice.findUnique({ where: { order_id: orderId } });
    let createdInvoice = false;
    if (!invoice) {
      const total = parseFloat(order.items.reduce((sum, i) => sum + i.quantity * num(i.unit_price), 0).toFixed(2));
      const tax = parseFloat(order.items.reduce((sum, i) => sum + i.quantity * num(i.unit_price) * (num(i.tax_pct) / 100), 0).toFixed(2));
      const grandTotal = parseFloat((total + tax).toFixed(2));
      invoice = await tx.invoice.create({
        data: {
          order_id: orderId,
          invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
          total,
          tax,
          grand_total: grandTotal,
          paid_amount: 0,
          payment_status: 'Unpaid',
        },
      });
      createdInvoice = true;
      await tx.store.update({ where: { id: order.store_id }, data: { outstanding_balance: { increment: grandTotal } } });
    }

    return { order: updatedOrder, invoice, createdInvoice };
  });

  await logAudit({
    action: 'DELIVERY_CONFIRM', entity_type: 'Order', entity_id: orderId, user_id: actorId,
    details: `Delivered confirmed order ID ${orderId}. Fulfilled reserved stock${result.createdInvoice ? ' and billed the store for the invoice total' : ''}.`,
  });

  return { order: serializeOrder(result.order), invoice: serializeInvoice(result.invoice) };
}

// Mirrors executeCancelOrder(): releases any reserved warehouse stock if the
// order was still 'Confirmed' (not yet delivered), then marks it Cancelled.
export async function cancelOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw ApiError.notFound('Order not found');

  await prisma.$transaction(async tx => {
    if (order.status === 'Confirmed') {
      for (const item of order.items) {
        await tx.warehouseInventory.upsert({
          where: { product_id: item.product_id },
          update: { available_qty: { increment: item.quantity }, reserved_qty: { decrement: item.quantity } },
          create: { product_id: item.product_id, available_qty: item.quantity },
        });
      }
    }
    await tx.order.update({ where: { id: orderId }, data: { status: 'Cancelled' } });
  });

  await logAudit({ action: 'ORDER_CANCEL', entity_type: 'Order', entity_id: orderId, user_id: actorId, details: `Cancelled order ID ${orderId}. Released any reserved stock back to available.` });
  return { id: orderId, status: 'Cancelled' as const };
}
