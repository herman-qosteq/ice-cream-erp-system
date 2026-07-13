import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';

function serializePayment(p: any) {
  return { id: p.id, store_id: p.store_id, order_id: p.order_id ?? undefined, amount: num(p.amount), method: p.method, date: p.date, collected_by: p.collected_by };
}

export async function listPayments() {
  const payments = await prisma.payment.findMany({ orderBy: { date: 'desc' } });
  return payments.map(serializePayment);
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

  const result = await prisma.$transaction(async tx => {
    const payment = await tx.payment.create({
      data: { store_id: input.store_id, order_id: invoice?.order_id, amount: actualCollection, method: input.method, collected_by: actorId },
    });

    await tx.store.update({ where: { id: input.store_id }, data: { outstanding_balance: { decrement: actualCollection } } });
    const refreshed = await tx.store.findUnique({ where: { id: input.store_id } });
    if (refreshed && num(refreshed.outstanding_balance) < 0) {
      await tx.store.update({ where: { id: input.store_id }, data: { outstanding_balance: 0 } });
    }

    if (invoice) {
      const totalPaid = Math.min(num(invoice.grand_total), num(invoice.paid_amount) + actualCollection);
      const status = totalPaid >= num(invoice.grand_total) - 0.05 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
      await tx.invoice.update({ where: { id: invoice.id }, data: { paid_amount: parseFloat(totalPaid.toFixed(2)), payment_status: status, payment_method: input.method } });
    }

    return payment;
  });

  await logAudit({ action: 'PAYMENT_RECEIVE', entity_type: 'Store', entity_id: input.store_id, user_id: actorId, details: `Received payment of Rs${actualCollection.toFixed(2)} via ${input.method} from ${store.name}` });
  return { payment: serializePayment(result), actualCollection };
}
