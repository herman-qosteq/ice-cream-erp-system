import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num, dateOnly } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';

function serializeStore(s: any) {
  return {
    ...s,
    credit_limit: num(s.credit_limit),
    outstanding_balance: num(s.outstanding_balance),
    last_purchase_date: dateOnly(s.last_purchase_date) ?? '',
    next_refill_date: dateOnly(s.next_refill_date) ?? '',
  };
}

function refillDaysFor(refill_frequency: string, custom_days?: number | null): number {
  if (refill_frequency === 'Weekly') return 7;
  if (refill_frequency === '15 Days') return 15;
  if (refill_frequency === 'Monthly') return 30;
  if (refill_frequency === 'Custom') return custom_days || 7;
  return 7;
}

export async function listStores() {
  const stores = await prisma.store.findMany({ orderBy: { created_at: 'desc' } });
  return stores.map(serializeStore);
}

interface StoreInput {
  name: string;
  owner_name: string;
  phone: string;
  alt_phone?: string;
  address: string;
  area: string;
  village?: string;
  city: string;
  state: string;
  pincode: string;
  gst_number?: string;
  credit_limit: number;
  refill_frequency: string;
  custom_days?: number;
  ranking: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  partner_type: string;
}

// Must be computed fresh at the point of use, not once at module load - a
// module-level `new Date()` would still freeze at server-start time and
// silently drift stale exactly like the literal date this replaced (this
// used to be `new Date('2026-06-27')`, a frozen demo anchor that made every
// store's next_refill_date/last_purchase_date drift further wrong every day
// past that literal date).
function today(): Date {
  return new Date();
}

// No DB-level unique constraint on Store - phone (every outlet's primary
// contact number) and GST number (a real legal identifier when present) are
// checked here instead, so the same partner outlet can't be registered twice.
async function assertNoDuplicateStore(input: StoreInput, excludeId?: string) {
  const phone = input.phone.trim();
  if (phone) {
    const byPhone = await prisma.store.findFirst({ where: { phone: { equals: phone }, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
    if (byPhone) throw ApiError.conflict(`A store with this phone number already exists.`);
  }

  const gst = input.gst_number?.trim();
  if (gst) {
    const byGst = await prisma.store.findFirst({ where: { gst_number: { equals: gst }, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
    if (byGst) throw ApiError.conflict(`A store with this GST number already exists.`);
  }
}

// Validated against PartnerType.name rather than a DB foreign key (same
// denormalized-string reasoning as Store.area/PartnerType itself) so an
// invalid/typo'd type can't silently attach to a partner.
async function assertValidPartnerType(partner_type: string) {
  const exists = await prisma.partnerType.findFirst({ where: { name: { equals: partner_type } } });
  if (!exists) throw ApiError.badRequest(`"${partner_type}" is not a recognized partner type.`);
}

export async function createStore(input: StoreInput, actorId: string) {
  await assertNoDuplicateStore(input);
  await assertValidPartnerType(input.partner_type);
  const refillDays = refillDaysFor(input.refill_frequency, input.custom_days);
  const nextRefillDate = new Date(today().getTime() + refillDays * 86400000);

  const store = await prisma.store.create({
    data: { ...input, outstanding_balance: 0, last_purchase_date: null, next_refill_date: nextRefillDate, status: 'Active' },
  });
  await logAudit({ action: 'STORE_REGISTER', entity_type: 'Store', entity_id: store.id, user_id: actorId, details: `Registered new client store: ${store.name}` });
  return serializeStore(store);
}

export async function updateStore(id: string, input: StoreInput, actorId: string) {
  const existing = await prisma.store.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Store not found');

  await assertNoDuplicateStore(input, id);
  await assertValidPartnerType(input.partner_type);

  const refillDays = refillDaysFor(input.refill_frequency, input.custom_days);
  const baseDate = existing.last_purchase_date ?? today();
  const nextRefillDate = new Date(baseDate.getTime() + refillDays * 86400000);

  const store = await prisma.store.update({ where: { id }, data: { ...input, next_refill_date: nextRefillDate } });
  await logAudit({ action: 'STORE_EDIT', entity_type: 'Store', entity_id: id, user_id: actorId, details: `Modified client details for ${store.name}` });
  return serializeStore(store);
}

export async function setStatus(id: string, status: 'Active' | 'Inactive', actorId: string) {
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) throw ApiError.notFound('Store not found');

  if (status === 'Inactive' && num(store.outstanding_balance) > 0) {
    throw ApiError.conflict(`Cannot remove ${store.name}: it still has Rs. ${num(store.outstanding_balance).toFixed(2)} outstanding balance owed. Collect or write off the balance first so it isn't lost from your credit reports.`);
  }

  const updated = await prisma.store.update({ where: { id }, data: { status } });
  if (status === 'Inactive') {
    await logAudit({ action: 'STORE_DELETE', entity_type: 'Store', entity_id: id, user_id: actorId, details: `Deactivated partner store ${store.name}` });
  } else {
    await logAudit({ action: 'STORE_REACTIVATE', entity_type: 'Store', entity_id: id, user_id: actorId, details: `Reactivated partner store ${store.name}` });
  }
  return serializeStore(updated);
}

export async function listVisits(storeId?: string) {
  const visits = await prisma.storeVisit.findMany({ where: storeId ? { store_id: storeId } : undefined, orderBy: { date: 'desc' } });
  return visits.map(v => ({ ...v, follow_up_date: dateOnly(v.follow_up_date) }));
}

export async function recordVisit(input: { store_id: string; notes: string; follow_up_date?: string }, actorId: string) {
  const visit = await prisma.storeVisit.create({
    data: {
      store_id: input.store_id,
      salesperson_id: actorId,
      notes: input.notes,
      follow_up_date: input.follow_up_date ? new Date(input.follow_up_date) : null,
      completed: true,
    },
  });
  const store = await prisma.store.findUnique({ where: { id: input.store_id } });
  await logAudit({ action: 'SITE_VISIT', entity_type: 'Store', entity_id: input.store_id, user_id: actorId, details: `Visited store ${store?.name ?? 'store'}. Notes: ${input.notes}` });
  return { ...visit, follow_up_date: dateOnly(visit.follow_up_date) };
}
