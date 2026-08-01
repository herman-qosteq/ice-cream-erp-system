import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

// Store.partner_type's DB default and the value every existing store
// automatically maps to - always selectable, never deletable, so a Store
// always has somewhere valid to fall back to.
const DEFAULT_PARTNER_TYPE = 'Retail Shop';

export async function listPartnerTypes() {
  const types = await prisma.partnerType.findMany({ orderBy: { name: 'asc' } });
  if (types.length > 0) return types;

  // Defensive bootstrap for a real deployment that never ran `prisma db
  // seed` - mirrors the seed.ts list so the dropdown is never empty.
  const defaults = ['Retail Shop', 'Auto Shop', 'Freezer Box Partner', 'Distributor', 'Super Market', 'Restaurant', 'Others'];
  await prisma.partnerType.createMany({ data: defaults.map(name => ({ name })), skipDuplicates: true });
  return prisma.partnerType.findMany({ orderBy: { name: 'asc' } });
}

export async function createPartnerType(name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Please enter a partner type name.');
  const existing = await prisma.partnerType.findFirst({ where: { name: { equals: trimmed } } });
  if (existing) throw ApiError.conflict(`A partner type named "${trimmed}" already exists.`);

  const partnerType = await prisma.partnerType.create({ data: { name: trimmed } });
  await logAudit({ action: 'PARTNER_TYPE_CREATE', entity_type: 'PartnerType', entity_id: partnerType.id, user_id: actorId, details: `Added partner type ${trimmed}` });
  return partnerType;
}

export async function renamePartnerType(id: string, name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Partner type name cannot be empty.');

  const partnerType = await prisma.partnerType.findUnique({ where: { id } });
  if (!partnerType) throw ApiError.notFound('Partner type not found.');
  if (partnerType.name === DEFAULT_PARTNER_TYPE) {
    throw ApiError.conflict(`"${DEFAULT_PARTNER_TYPE}" is the default partner type and cannot be renamed.`);
  }

  const existing = await prisma.partnerType.findFirst({ where: { name: { equals: trimmed }, NOT: { id } } });
  if (existing) throw ApiError.conflict(`A partner type named "${trimmed}" already exists.`);

  // Store.partner_type is matched by name (not a foreign key), so every
  // store currently using the old name is renamed along with it.
  await prisma.$transaction([
    prisma.store.updateMany({ where: { partner_type: partnerType.name }, data: { partner_type: trimmed } }),
    prisma.partnerType.update({ where: { id }, data: { name: trimmed } }),
  ]);

  await logAudit({ action: 'PARTNER_TYPE_EDIT', entity_type: 'PartnerType', entity_id: id, user_id: actorId, details: `Renamed partner type "${partnerType.name}" to "${trimmed}"` });
  return { ...partnerType, name: trimmed };
}

export async function deletePartnerType(id: string, actorId: string) {
  const partnerType = await prisma.partnerType.findUnique({ where: { id } });
  if (!partnerType) throw ApiError.notFound('Partner type not found.');
  if (partnerType.name === DEFAULT_PARTNER_TYPE) {
    throw ApiError.conflict(`"${DEFAULT_PARTNER_TYPE}" is the default partner type and cannot be deleted.`);
  }

  const storesUsingType = await prisma.store.count({ where: { partner_type: partnerType.name } });
  if (storesUsingType > 0) {
    throw ApiError.conflict(`Cannot delete "${partnerType.name}": ${storesUsingType} partner(s) still use this type. Move those partners to a different type first.`);
  }

  await prisma.partnerType.delete({ where: { id } });
  await logAudit({ action: 'PARTNER_TYPE_DELETE', entity_type: 'PartnerType', entity_id: id, user_id: actorId, details: `Deleted partner type ${partnerType.name}` });
  return { id };
}
