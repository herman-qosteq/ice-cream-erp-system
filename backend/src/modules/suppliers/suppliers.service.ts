import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

export async function listSuppliers() {
  return prisma.supplier.findMany({ orderBy: { created_at: 'desc' } });
}

interface SupplierInput {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
}

// No DB-level unique constraint on Supplier (unlike Truck/User/Category/Area)
// - name and phone are checked here instead, matching the pattern already
// used for Category/Area, so a supplier can't be registered twice under a
// different-looking form submission.
async function assertNoDuplicateSupplier(input: SupplierInput, excludeId?: string) {
  const name = input.name.trim();
  const phone = input.phone.trim();

  const byName = await prisma.supplier.findFirst({ where: { name: { equals: name }, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
  if (byName) throw ApiError.conflict(`A supplier named "${name}" already exists.`);

  if (phone) {
    const byPhone = await prisma.supplier.findFirst({ where: { phone: { equals: phone }, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
    if (byPhone) throw ApiError.conflict(`A supplier with this phone number already exists.`);
  }
}

export async function createSupplier(input: SupplierInput, actorId: string) {
  await assertNoDuplicateSupplier(input);
  const supplier = await prisma.supplier.create({ data: { ...input, status: 'Active' } });
  await logAudit({ action: 'SUPPLIER_CREATE', entity_type: 'Supplier', entity_id: supplier.id, user_id: actorId, details: `Registered supplier ${supplier.name}` });
  return supplier;
}

export async function updateSupplier(id: string, input: SupplierInput, actorId: string) {
  await assertNoDuplicateSupplier(input, id);
  const supplier = await prisma.supplier.update({ where: { id }, data: input });
  await logAudit({ action: 'SUPPLIER_UPDATE', entity_type: 'Supplier', entity_id: id, user_id: actorId, details: `Updated details for supplier ${supplier.name}` });
  return supplier;
}

export async function setStatus(id: string, status: 'Active' | 'Inactive', actorId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw ApiError.notFound('Supplier not found');

  const updated = await prisma.supplier.update({ where: { id }, data: { status } });
  if (status === 'Inactive') {
    await logAudit({ action: 'SUPPLIER_DELETE', entity_type: 'Supplier', entity_id: id, user_id: actorId, details: `Deactivated supplier ${supplier.name}` });
  } else {
    await logAudit({ action: 'SUPPLIER_REACTIVATE', entity_type: 'Supplier', entity_id: id, user_id: actorId, details: `Reactivated supplier ${supplier.name}` });
  }
  return updated;
}
