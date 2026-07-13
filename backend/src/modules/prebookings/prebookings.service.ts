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

function serializeBooking(b: any) {
  return {
    id: b.id,
    store_id: b.store_id,
    salesperson_id: b.salesperson_id,
    created_at: b.created_at,
    scheduled_delivery_date: dateOnly(b.scheduled_delivery_date),
    status: b.status,
    notes: b.notes ?? undefined,
    items: b.items.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: num(i.unit_price), tax_pct: num(i.tax_pct) })),
    dispatched_items: b.dispatched_items.map((d: any) => ({ product_id: d.product_id, quantity: d.quantity })),
  };
}

const bookingInclude = { items: true, dispatched_items: true };

export async function listPreBookings() {
  const bookings = await prisma.preBookingOrder.findMany({ include: bookingInclude, orderBy: { created_at: 'desc' } });
  return bookings.map(serializeBooking);
}

interface ItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_pct: number;
}

async function assertStockAvailable(items: ItemInput[], excludeBookingId?: string) {
  // When editing, the booking's own currently-held reservation is added back
  // to "available" first, so shrinking/growing quantities is validated
  // against what's truly free (mirrors getEffectiveAvailableForBooking()).
  let alreadyHeld: Record<string, number> = {};
  if (excludeBookingId) {
    const existing = await prisma.preBookingOrder.findUnique({ where: { id: excludeBookingId }, include: { items: true } });
    if (existing) {
      for (const item of existing.items) alreadyHeld[item.product_id] = (alreadyHeld[item.product_id] ?? 0) + item.quantity;
    }
  }

  for (const item of items) {
    const inv = await prisma.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
    const available = (inv?.available_qty ?? 0) + (alreadyHeld[item.product_id] ?? 0);
    if (item.quantity > available) {
      const product = await prisma.product.findUnique({ where: { id: item.product_id } });
      throw ApiError.conflict(`Insufficient warehouse stock for ${product?.name ?? item.product_id}. Only ${available} units are available.`);
    }
  }
}

// Mirrors handleSavePreBooking() create branch: reserves the requested
// quantities immediately (available_qty -> reserved_qty).
export async function createPreBooking(input: { store_id: string; salesperson_id: string; scheduled_delivery_date: string; items: ItemInput[]; notes?: string }, actorId: string) {
  if (input.items.length === 0) throw ApiError.badRequest('Please add at least one product with quantity > 0.');
  await assertStockAvailable(input.items);

  const store = await prisma.store.findUnique({ where: { id: input.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  const booking = await prisma.$transaction(async tx => {
    for (const item of input.items) {
      await tx.warehouseInventory.update({ where: { product_id: item.product_id }, data: { available_qty: { decrement: item.quantity }, reserved_qty: { increment: item.quantity } } });
    }
    return tx.preBookingOrder.create({
      data: {
        store_id: input.store_id,
        salesperson_id: input.salesperson_id,
        scheduled_delivery_date: new Date(input.scheduled_delivery_date),
        status: 'Booked',
        notes: input.notes,
        items: { create: input.items },
      },
      include: bookingInclude,
    });
  });

  await logAudit({ action: 'PREBOOKING_CREATE', entity_type: 'Store', entity_id: input.store_id, user_id: actorId, details: `Reserved warehouse stock for pre-booking order ${booking.id} at ${store.name}.` });
  return serializeBooking(booking);
}

// Mirrors handleSavePreBooking() edit branch: releases the old reservation,
// re-validates against the resulting free stock, then reserves the new
// quantities.
export async function updatePreBooking(id: string, input: { store_id: string; scheduled_delivery_date: string; items: ItemInput[]; notes?: string }, actorId: string) {
  if (input.items.length === 0) throw ApiError.badRequest('Please add at least one product with quantity > 0.');

  const existing = await prisma.preBookingOrder.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw ApiError.notFound('This pre-booking no longer exists.');

  await assertStockAvailable(input.items, id);

  const store = await prisma.store.findUnique({ where: { id: input.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  const booking = await prisma.$transaction(async tx => {
    for (const item of existing.items) {
      await tx.warehouseInventory.update({ where: { product_id: item.product_id }, data: { available_qty: { increment: item.quantity }, reserved_qty: { decrement: item.quantity } } });
    }
    for (const item of input.items) {
      await tx.warehouseInventory.update({ where: { product_id: item.product_id }, data: { available_qty: { decrement: item.quantity }, reserved_qty: { increment: item.quantity } } });
    }
    await tx.preBookingItem.deleteMany({ where: { pre_booking_id: id } });
    return tx.preBookingOrder.update({
      where: { id },
      data: {
        store_id: input.store_id,
        scheduled_delivery_date: new Date(input.scheduled_delivery_date),
        notes: input.notes,
        items: { create: input.items },
      },
      include: bookingInclude,
    });
  });

  await logAudit({ action: 'PREBOOKING_UPDATE', entity_type: 'PreBookingOrder', entity_id: id, user_id: actorId, details: `Updated pre-booking order ${id} for ${store.name} and adjusted warehouse reservation.` });
  return serializeBooking(booking);
}

// Mirrors handleDeliverPreBooking(): releases only the not-yet-dispatched
// portion of the reservation (dispatched_items already left the warehouse
// when loaded onto a truck), generates the resulting Order/Invoice/Payment,
// and adds the outstanding difference to the store's balance.
export async function deliverPreBooking(id: string, input: { method: string; amount: number }, actorId: string) {
  const booking = await prisma.preBookingOrder.findUnique({ where: { id }, include: bookingInclude });
  if (!booking) throw ApiError.notFound('Pre-booking not found');

  const store = await prisma.store.findUnique({ where: { id: booking.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  // Round total/tax to cents before summing into grand_total, so grand_total
  // always equals total+tax exactly as stored (see orders.service.ts).
  const total = parseFloat(booking.items.reduce((sum, i) => sum + i.quantity * num(i.unit_price), 0).toFixed(2));
  const tax = parseFloat(booking.items.reduce((sum, i) => sum + i.quantity * num(i.unit_price) * (num(i.tax_pct) / 100), 0).toFixed(2));
  const grandTotal = parseFloat((total + tax).toFixed(2));

  const isPayLater = input.method === 'Credit' || input.amount <= 0;
  const actualCollection = isPayLater ? 0 : Math.min(parseFloat(input.amount.toFixed(2)), grandTotal);
  const paymentStatus = actualCollection >= grandTotal - 0.05 ? 'Paid' : actualCollection > 0 ? 'Partial' : 'Credit';

  const dispatchedByProduct: Record<string, number> = {};
  for (const d of booking.dispatched_items) dispatchedByProduct[d.product_id] = d.quantity;

  const result = await prisma.$transaction(async tx => {
    for (const item of booking.items) {
      const stillReserved = Math.max(0, item.quantity - (dispatchedByProduct[item.product_id] ?? 0));
      if (stillReserved > 0) {
        const inv = await tx.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
        const nextReserved = Math.max(0, (inv?.reserved_qty ?? 0) - stillReserved);
        await tx.warehouseInventory.update({ where: { product_id: item.product_id }, data: { reserved_qty: nextReserved } });
      }
    }

    const order = await tx.order.create({
      data: {
        store_id: booking.store_id,
        salesperson_id: booking.salesperson_id,
        status: 'Delivered',
        items: { create: booking.items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, tax_pct: i.tax_pct })) },
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        order_id: order.id,
        invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
        total,
        tax,
        grand_total: grandTotal,
        paid_amount: actualCollection,
        payment_status: paymentStatus,
        payment_method: actualCollection > 0 ? input.method : 'Credit',
      },
    });

    let payment = null;
    if (actualCollection > 0) {
      payment = await tx.payment.create({ data: { store_id: booking.store_id, order_id: order.id, amount: actualCollection, method: input.method, collected_by: booking.salesperson_id } });
    }

    const refillDays = refillDaysFor(store.refill_frequency, store.custom_days);
    await tx.store.update({
      where: { id: booking.store_id },
      data: {
        outstanding_balance: { increment: parseFloat((grandTotal - actualCollection).toFixed(2)) },
        last_purchase_date: TODAY,
        next_refill_date: new Date(TODAY.getTime() + refillDays * 86400000),
      },
    });

    await tx.preBookingOrder.update({ where: { id }, data: { status: 'Delivered' } });

    return { order, invoice, payment };
  });

  await logAudit({ action: 'PREBOOKING_DELIVER', entity_type: 'PreBookingOrder', entity_id: id, user_id: actorId, details: `Delivered pre-booking order ${id}, generated order ${result.order.id} (Rs${grandTotal.toFixed(2)}, ${paymentStatus}), and released reserved warehouse stock.` });
  return { order_id: result.order.id, invoice_id: result.invoice.id, grand_total: grandTotal, payment_status: paymentStatus };
}

// Mirrors handleCancelPreBooking(): releases only the not-yet-dispatched
// portion of the reservation back to available (the dispatched portion
// already physically left on a truck and can't be silently un-shipped).
export async function cancelPreBooking(id: string, actorId: string) {
  const booking = await prisma.preBookingOrder.findUnique({ where: { id }, include: bookingInclude });
  if (!booking) throw ApiError.notFound('Pre-booking not found');

  const dispatchedByProduct: Record<string, number> = {};
  for (const d of booking.dispatched_items) dispatchedByProduct[d.product_id] = d.quantity;

  await prisma.$transaction(async tx => {
    for (const item of booking.items) {
      const stillReserved = Math.max(0, item.quantity - (dispatchedByProduct[item.product_id] ?? 0));
      if (stillReserved > 0) {
        const inv = await tx.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
        await tx.warehouseInventory.update({
          where: { product_id: item.product_id },
          data: { available_qty: (inv?.available_qty ?? 0) + stillReserved, reserved_qty: Math.max(0, (inv?.reserved_qty ?? 0) - stillReserved) },
        });
      }
    }
    await tx.preBookingOrder.update({ where: { id }, data: { status: 'Cancelled' } });
  });

  await logAudit({ action: 'PREBOOKING_CANCEL', entity_type: 'PreBookingOrder', entity_id: id, user_id: actorId, details: `Cancelled pre-booking order ${id} and released reserved warehouse stock.` });
  return { id, status: 'Cancelled' as const };
}
