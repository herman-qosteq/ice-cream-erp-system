import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num, dateOnly } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';
import { computeInvoiceTotals } from '../../utils/billing';
import { parsePageParams, parseDateRangeParams, containsInsensitive, buildPagedResult } from '../../utils/pagination';

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
    round_off: num(inv.round_off),
    created_at: inv.created_at,
    paid_amount: inv.paid_amount === null ? undefined : num(inv.paid_amount),
    payment_status: inv.payment_status ?? undefined,
    payment_method: inv.payment_method ?? undefined,
  };
}

export async function listOrders() {
  const orders = await prisma.order.findMany({ include: { items: { orderBy: { position: 'asc' } } }, orderBy: { created_at: 'desc' } });
  return orders.map(serializeOrder);
}

export async function listInvoices() {
  const invoices = await prisma.invoice.findMany({ orderBy: { created_at: 'desc' } });
  return invoices.map(serializeInvoice);
}

// Payment-status filtering only ever applies to Delivered orders (an
// undelivered order has no payment outcome yet) - mirrors the equivalent
// client-side filter this replaces exactly, including the fact that
// combining it with an explicit, different `status` filter yields no
// results, same as it always would have client-side.
function buildOrdersWhere(query: Record<string, unknown>): Prisma.OrderWhereInput {
  const { from, to } = parseDateRangeParams(query);
  const and: Prisma.OrderWhereInput[] = [];
  if (from || to) and.push({ created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });

  const status = typeof query.status === 'string' && query.status !== 'All' ? query.status : '';
  if (status) and.push({ status: status as Prisma.EnumOrderStatusFilter['equals'] });

  const paymentStatus = typeof query.paymentStatus === 'string' && query.paymentStatus !== 'All' ? query.paymentStatus : '';
  if (paymentStatus) {
    and.push({ status: 'Delivered' });
    if (paymentStatus === 'Paid') and.push({ invoice: { payment_status: 'Paid' } });
    else if (paymentStatus === 'Partial') and.push({ invoice: { payment_status: 'Partial' } });
    else if (paymentStatus === 'Unpaid') {
      and.push({ OR: [{ invoice: null }, { invoice: { payment_status: 'Credit' } }, { invoice: { payment_status: null } }] });
    }
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    and.push({
      OR: [
        { id: containsInsensitive(search) },
        { store: { name: containsInsensitive(search) } },
        { store: { owner_name: containsInsensitive(search) } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

// Offset-paginated: Orders/Invoices is a jump-around, filter-and-search list
// (not an append-only feed), same reasoning as every other paginated list
// page. Invoices themselves aren't separately paginated here - the frontend
// still cross-references the (deliberately unbounded) invoices blob from
// loadAllData() by order_id, which stays valid since Invoices isn't
// independently growing beyond what Orders growth already implies.
export async function listOrdersPaged(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePageParams(query);
  const where = buildOrdersWhere(query);
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, include: { items: { orderBy: { position: 'asc' } } }, orderBy: { created_at: 'desc' }, skip, take }),
    prisma.order.count({ where }),
  ]);
  return buildPagedResult(rows.map(serializeOrder), total, page, pageSize);
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
export async function createOrder(input: { store_id: string; salesperson_id: string; truck_id?: string | null; items: OrderItemInput[] }, actorId: string) {
  const { total, tax, grand_total: grandTotal, round_off: roundOff } = computeInvoiceTotals(input.items);

  const store = await prisma.store.findUnique({ where: { id: input.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  const result = await prisma.$transaction(async tx => {
    if (input.truck_id) {
      // Salesperson/Driver flow: sell straight out of the truck's loaded cargo.
      const truckId = input.truck_id;
      for (const item of input.items) {
        const truckInv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: truckId, product_id: item.product_id } } });
        const remaining = (truckInv?.quantity ?? 0) - item.quantity;
        if (remaining > 0) {
          await tx.truckInventory.update({ where: { truck_id_product_id: { truck_id: truckId, product_id: item.product_id } }, data: { quantity: remaining } });
        } else if (truckInv) {
          await tx.truckInventory.delete({ where: { truck_id_product_id: { truck_id: truckId, product_id: item.product_id } } });
        }
      }
    } else {
      // Admin flow: sell directly out of warehouse stock, no truck involved.
      for (const item of input.items) {
        const wh = await tx.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
        if (!wh || wh.available_qty < item.quantity) {
          const product = await tx.product.findUnique({ where: { id: item.product_id } });
          throw ApiError.conflict(`Insufficient warehouse stock for ${product?.name ?? item.product_id}. Only ${wh?.available_qty ?? 0} units available, but ${item.quantity} requested.`);
        }
        await tx.warehouseInventory.update({ where: { product_id: item.product_id }, data: { available_qty: { decrement: item.quantity } } });
      }
    }

    const order = await tx.order.create({
      data: {
        store_id: input.store_id,
        salesperson_id: input.salesperson_id,
        truck_id: input.truck_id || null,
        status: 'Delivered',
        items: { create: input.items.map((item, idx) => ({ ...item, position: idx })) },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });

    const invoice = await tx.invoice.create({
      data: {
        order_id: order.id,
        invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
        total,
        tax,
        grand_total: grandTotal,
        round_off: roundOff,
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
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { position: 'asc' } } } });
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
    return tx.order.update({ where: { id: orderId }, data: { status: 'Confirmed' }, include: { items: { orderBy: { position: 'asc' } } } });
  });

  await logAudit({ action: 'ORDER_CONFIRM', entity_type: 'Order', entity_id: orderId, user_id: actorId, details: `Confirmed Draft order ID ${orderId}. Moved items to reserved warehouse stock.` });
  return serializeOrder(updated);
}

// Mirrors handleDeliverConfirmedOrder(): releases the reserved warehouse
// stock for a Confirmed order, marks it Delivered, and generates its invoice
// (billing the store) only if one doesn't already exist.
export async function deliverConfirmedOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { position: 'asc' } } } });
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

    const updatedOrder = await tx.order.update({ where: { id: orderId }, data: { status: 'Delivered' }, include: { items: { orderBy: { position: 'asc' } } } });

    let invoice = await tx.invoice.findUnique({ where: { order_id: orderId } });
    let createdInvoice = false;
    if (!invoice) {
      const itemsForTotals = order.items.map(i => ({ quantity: i.quantity, unit_price: num(i.unit_price), tax_pct: num(i.tax_pct) }));
      const { total, tax, grand_total: grandTotal, round_off: roundOff } = computeInvoiceTotals(itemsForTotals);
      invoice = await tx.invoice.create({
        data: {
          order_id: orderId,
          invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
          total,
          tax,
          grand_total: grandTotal,
          round_off: roundOff,
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

// Admin-only override: edits the item list of an already Confirmed or
// Delivered order (every other order-status transition already has its own
// dedicated action - this exists specifically to correct mistakes after the
// normal flow has moved on). Reconciles warehouse stock, the invoice (if one
// already exists), and the store's outstanding balance so nothing is left
// stale by the change - see deleteOrder() below for the equivalent on removal.
export async function editOrder(orderId: string, input: { items: OrderItemInput[] }, actorId: string) {
  if (!input.items || input.items.length === 0) throw ApiError.badRequest('An order must have at least one item.');

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { position: 'asc' } } } });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'Confirmed' && order.status !== 'Delivered') {
    throw ApiError.conflict('Only confirmed or delivered orders can be edited this way.');
  }

  const store = await prisma.store.findUnique({ where: { id: order.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  // Net per-product warehouse delta across the old -> new item lists (positive
  // = this edit needs MORE of that product than the order already holds,
  // negative = it returns some). Netting old and new here means a product
  // appearing on both sides never triggers a false "insufficient stock" dip.
  const deltas = new Map<string, number>();
  for (const item of order.items) deltas.set(item.product_id, (deltas.get(item.product_id) ?? 0) - item.quantity);
  for (const item of input.items) deltas.set(item.product_id, (deltas.get(item.product_id) ?? 0) + item.quantity);

  for (const [productId, delta] of deltas) {
    if (delta <= 0) continue;
    const wh = await prisma.warehouseInventory.findUnique({ where: { product_id: productId } });
    if (!wh || wh.available_qty < delta) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      throw ApiError.conflict(`Cannot apply this edit: insufficient warehouse stock for ${product?.name ?? productId}. Only ${wh?.available_qty ?? 0} additional unit(s) available, but ${delta} more are needed.`);
    }
  }

  const { total, tax, grand_total: grandTotal, round_off: roundOff } = computeInvoiceTotals(input.items);

  const result = await prisma.$transaction(async tx => {
    for (const [productId, delta] of deltas) {
      if (delta === 0) continue;
      if (order.status === 'Confirmed') {
        // Still just reserved (not yet delivered) - grow/shrink the
        // reservation, moving the difference to/from available stock.
        await tx.warehouseInventory.upsert({
          where: { product_id: productId },
          update: { available_qty: { decrement: delta }, reserved_qty: { increment: delta } },
          create: { product_id: productId, reserved_qty: Math.max(0, delta), available_qty: Math.max(0, -delta) },
        });
      } else {
        // Delivered - stock already left tracking entirely; a positive delta
        // consumes more from available, a negative delta (reduced quantity)
        // returns it.
        await tx.warehouseInventory.upsert({
          where: { product_id: productId },
          update: { available_qty: { decrement: delta } },
          create: { product_id: productId, available_qty: Math.max(0, -delta) },
        });
      }
    }

    await tx.orderItem.deleteMany({ where: { order_id: orderId } });
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { items: { create: input.items.map((item, idx) => ({ ...item, position: idx })) } },
      include: { items: { orderBy: { position: 'asc' } } },
    });

    let updatedInvoice = null;
    const existingInvoice = await tx.invoice.findUnique({ where: { order_id: orderId } });
    if (existingInvoice) {
      const oldGrandTotal = num(existingInvoice.grand_total);
      const paid = num(existingInvoice.paid_amount) || 0;

      // If the edit shrinks the order below what's already been collected,
      // an invoice can't stay "paid_amount > grand_total" - that's not a
      // real state. Claw the excess back off the most recently collected
      // Payment row(s) first (deleting one entirely if it's fully absorbed)
      // so collection totals (Total Collections, etc.) only ever reflect
      // money that's actually still owed against a total that still exists.
      let clampedPaid = paid;
      if (paid > grandTotal + 0.005) {
        let excess = parseFloat((paid - grandTotal).toFixed(2));
        const payments = await tx.payment.findMany({ where: { order_id: orderId }, orderBy: { date: 'desc' } });
        for (const payment of payments) {
          if (excess <= 0.005) break;
          const pAmount = num(payment.amount);
          const reduceBy = Math.min(pAmount, excess);
          if (pAmount - reduceBy <= 0.005) {
            await tx.payment.delete({ where: { id: payment.id } });
          } else {
            await tx.payment.update({ where: { id: payment.id }, data: { amount: parseFloat((pAmount - reduceBy).toFixed(2)) } });
          }
          excess = parseFloat((excess - reduceBy).toFixed(2));
        }
        clampedPaid = grandTotal;
      }

      // Re-derive payment status from the new total against what's actually
      // still collected - preserves an explicit 'Credit' choice, otherwise
      // falls back to 'Unpaid' the same way a fresh delivery would.
      const newStatus: 'Paid' | 'Partial' | 'Unpaid' | 'Credit' =
        clampedPaid >= grandTotal - 0.05 ? 'Paid' : clampedPaid > 0 ? 'Partial' : (existingInvoice.payment_status === 'Credit' ? 'Credit' : 'Unpaid');

      updatedInvoice = await tx.invoice.update({
        where: { order_id: orderId },
        data: { total, tax, grand_total: grandTotal, round_off: roundOff, paid_amount: clampedPaid, payment_status: newStatus },
      });

      // Balance moves by the change in what's actually still owed (new total
      // minus new paid, vs. old total minus old paid) - not just the raw
      // total delta, since a payment clawback above can itself change what's
      // owed independently of the total moving.
      const balanceDelta = (grandTotal - clampedPaid) - (oldGrandTotal - paid);
      if (balanceDelta !== 0) {
        await tx.store.update({ where: { id: order.store_id }, data: { outstanding_balance: { increment: balanceDelta } } });
        const refreshed = await tx.store.findUnique({ where: { id: order.store_id } });
        if (refreshed && num(refreshed.outstanding_balance) < 0) {
          await tx.store.update({ where: { id: order.store_id }, data: { outstanding_balance: 0 } });
        }
      }
    }

    return { order: updatedOrder, invoice: updatedInvoice };
  });

  await logAudit({
    action: 'ORDER_EDIT', entity_type: 'Order', entity_id: orderId, user_id: actorId,
    details: `Edited ${order.status.toLowerCase()} order ${orderId} for ${store.name}. Items and totals were recalculated${result.invoice ? ` (new invoice total: Rs${grandTotal.toFixed(2)})` : ''}, and warehouse stock was adjusted to match.`,
  });

  return { order: serializeOrder(result.order), invoice: result.invoice ? serializeInvoice(result.invoice) : undefined };
}

// Admin-only override: permanently removes a Confirmed or Delivered order.
// Returns its items to warehouse stock, reverses whatever portion of its
// invoice was still owed from the store's outstanding balance, and deletes
// any Payment rows collected against it - deleting the order is treated as
// undoing the whole transaction, so dashboard figures like Total Collections
// (a plain sum over Payment.amount) stay accurate and never keep counting
// money tied to an order that no longer exists.
export async function deleteOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { position: 'asc' } } } });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'Confirmed' && order.status !== 'Delivered') {
    throw ApiError.conflict('Only confirmed or delivered orders can be deleted this way.');
  }

  const store = await prisma.store.findUnique({ where: { id: order.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  const invoice = await prisma.invoice.findUnique({ where: { order_id: orderId } });

  await prisma.$transaction(async tx => {
    for (const item of order.items) {
      if (order.status === 'Confirmed') {
        await tx.warehouseInventory.upsert({
          where: { product_id: item.product_id },
          update: { available_qty: { increment: item.quantity }, reserved_qty: { decrement: item.quantity } },
          create: { product_id: item.product_id, available_qty: item.quantity },
        });
      } else {
        await tx.warehouseInventory.upsert({
          where: { product_id: item.product_id },
          update: { available_qty: { increment: item.quantity } },
          create: { product_id: item.product_id, available_qty: item.quantity },
        });
      }
    }

    if (invoice) {
      const stillOwed = Math.max(0, num(invoice.grand_total) - (num(invoice.paid_amount) || 0));
      if (stillOwed > 0) {
        await tx.store.update({ where: { id: order.store_id }, data: { outstanding_balance: { decrement: stillOwed } } });
        const refreshed = await tx.store.findUnique({ where: { id: order.store_id } });
        if (refreshed && num(refreshed.outstanding_balance) < 0) {
          await tx.store.update({ where: { id: order.store_id }, data: { outstanding_balance: 0 } });
        }
      }
      await tx.invoice.delete({ where: { order_id: orderId } });
    }

    // Remove the collected-payment record(s) too, not just null their
    // order_id - Total Collections and other payment-sum figures must not
    // keep counting money against an order that's being deleted.
    await tx.payment.deleteMany({ where: { order_id: orderId } });

    await tx.order.delete({ where: { id: orderId } });
  });

  await logAudit({
    action: 'ORDER_DELETE', entity_type: 'Order', entity_id: orderId, user_id: actorId,
    details: `Deleted ${order.status.toLowerCase()} order ${orderId} for ${store.name}. Warehouse stock was returned, any outstanding balance from this order was reversed, and its collected payments were removed from collection totals.`,
  });

  return { id: orderId, deleted: true as const };
}

// Mirrors executeCancelOrder(): releases any reserved warehouse stock if the
// order was still 'Confirmed' (not yet delivered), then marks it Cancelled.
export async function cancelOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { position: 'asc' } } } });
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
