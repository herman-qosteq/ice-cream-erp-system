import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';
import { parsePageParams, parseDateRangeParams, containsInsensitive, buildPagedResult } from '../../utils/pagination';

function serializePayment(p: any) {
  return { id: p.id, store_id: p.store_id, order_id: p.order_id ?? undefined, amount: num(p.amount), method: p.method, date: p.date, collected_by: p.collected_by };
}

export async function listPayments() {
  const payments = await prisma.payment.findMany({ orderBy: { date: 'desc' } });
  return payments.map(serializePayment);
}

function buildPaymentsWhere(query: Record<string, unknown>): Prisma.PaymentWhereInput {
  const { from, to } = parseDateRangeParams(query);
  const and: Prisma.PaymentWhereInput[] = [];
  if (from || to) and.push({ date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });

  const method = typeof query.method === 'string' && query.method !== 'All' ? query.method : '';
  if (method) and.push({ method });

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    and.push({
      OR: [
        { store: { name: containsInsensitive(search) } },
        { store: { owner_name: containsInsensitive(search) } },
        { order_id: containsInsensitive(search) },
      ],
    });
  }

  // partner_type is never denormalized onto Payment - always read via the
  // existing store_id join, same as the store name/owner_name search above.
  const partnerType = typeof query.partnerType === 'string' && query.partnerType !== 'All' ? query.partnerType : '';
  if (partnerType) and.push({ store: { partner_type: partnerType } });

  return and.length ? { AND: and } : {};
}

export async function listPaymentsPaged(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePageParams(query);
  const where = buildPaymentsWhere(query);
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { date: 'desc' }, skip, take }),
    prisma.payment.count({ where }),
  ]);
  return buildPagedResult(rows.map(serializePayment), total, page, pageSize);
}

// Mirrors handleSavePayment(): a general credit-recovery payment, either
// against a specific invoice or just the store's overall outstanding balance.
export async function recordPayment(input: { store_id: string; invoice_id?: string; amount: number; method: string }, actorId: string) {
  const store = await prisma.store.findUnique({ where: { id: input.store_id } });
  if (!store) throw ApiError.notFound('Store not found');

  const invoice = input.invoice_id && input.invoice_id !== 'general' ? await prisma.invoice.findUnique({ where: { id: input.invoice_id } }) : null;
  const amountOwed = invoice ? Math.max(0, num(invoice.grand_total) - num(invoice.paid_amount)) : num(store.outstanding_balance);
  const actualCollection = Math.min(input.amount, amountOwed);
  if (actualCollection <= 0) throw ApiError.badRequest('Nothing is currently owed, so no payment was recorded.');

  // General (no specific bill) payment: walk the store's outstanding invoices
  // oldest-first and apply the collection like a waterfall, so each bill's
  // paid_amount/payment_status reflects the recovery instead of only the
  // store's aggregate outstanding_balance moving while every invoice stays Unpaid.
  const outstandingInvoices = invoice
    ? []
    : (await prisma.invoice.findMany({ where: { order: { store_id: input.store_id } }, orderBy: { created_at: 'asc' } }))
        .filter(inv => num(inv.grand_total) - num(inv.paid_amount) > 0.01);

  const result = await prisma.$transaction(async tx => {
    await tx.store.update({ where: { id: input.store_id }, data: { outstanding_balance: { decrement: actualCollection } } });
    const refreshed = await tx.store.findUnique({ where: { id: input.store_id } });
    if (refreshed && num(refreshed.outstanding_balance) < 0) {
      await tx.store.update({ where: { id: input.store_id }, data: { outstanding_balance: 0 } });
    }

    let firstPayment = null as Awaited<ReturnType<typeof tx.payment.create>> | null;

    if (invoice) {
      const totalPaid = Math.min(num(invoice.grand_total), num(invoice.paid_amount) + actualCollection);
      const status = totalPaid >= num(invoice.grand_total) - 0.05 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
      await tx.invoice.update({ where: { id: invoice.id }, data: { paid_amount: parseFloat(totalPaid.toFixed(2)), payment_status: status, payment_method: input.method } });
      firstPayment = await tx.payment.create({
        data: { store_id: input.store_id, order_id: invoice.order_id, amount: actualCollection, method: input.method, collected_by: actorId },
      });
    } else {
      // Record one Payment row per invoice actually touched (instead of a
      // single order-less row) so the collected amount shows up in that
      // specific bill's own "Partial Payments History" when you open it.
      let remaining = actualCollection;
      for (const inv of outstandingInvoices) {
        if (remaining <= 0.01) break;
        const owed = num(inv.grand_total) - num(inv.paid_amount);
        const applied = parseFloat(Math.min(remaining, owed).toFixed(2));
        const totalPaid = parseFloat((num(inv.paid_amount) + applied).toFixed(2));
        const status = totalPaid >= num(inv.grand_total) - 0.05 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
        await tx.invoice.update({ where: { id: inv.id }, data: { paid_amount: totalPaid, payment_status: status, payment_method: input.method } });
        const p = await tx.payment.create({
          data: { store_id: input.store_id, order_id: inv.order_id, amount: applied, method: input.method, collected_by: actorId },
        });
        firstPayment ??= p;
        remaining -= applied;
      }
      if (remaining > 0.01) {
        // Leftover beyond what any tracked invoice owes (e.g. balance drift) —
        // still record it so the total collected amount is accounted for.
        const p = await tx.payment.create({
          data: { store_id: input.store_id, order_id: null, amount: parseFloat(remaining.toFixed(2)), method: input.method, collected_by: actorId },
        });
        firstPayment ??= p;
      }
    }

    return firstPayment!;
  });

  await logAudit({ action: 'PAYMENT_RECEIVE', entity_type: 'Store', entity_id: input.store_id, user_id: actorId, details: `Received payment of Rs. ${actualCollection.toFixed(2)} via ${input.method} from ${store.name}` });
  return { payment: serializePayment(result), actualCollection };
}
