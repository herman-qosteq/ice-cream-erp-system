import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

export async function listVillages() {
  return prisma.village.findMany({ orderBy: { name: 'asc' } });
}

export async function createVillage(name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Please enter a village name.');
  const existing = await prisma.village.findFirst({ where: { name: { equals: trimmed } } });
  if (existing) throw ApiError.conflict(`A village named "${trimmed}" already exists.`);

  const village = await prisma.village.create({ data: { name: trimmed } });
  await logAudit({ action: 'VILLAGE_CREATE', entity_type: 'Village', entity_id: village.id, user_id: actorId, details: `Added village ${trimmed}` });
  return village;
}

export async function renameVillage(id: string, name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Village name cannot be empty.');

  const village = await prisma.village.findUnique({ where: { id } });
  if (!village) throw ApiError.notFound('Village not found.');

  const existing = await prisma.village.findFirst({ where: { name: { equals: trimmed }, NOT: { id } } });
  if (existing) throw ApiError.conflict(`A village named "${trimmed}" already exists.`);

  // Store.village is matched by name (not a foreign key - see schema.prisma),
  // so every store currently using the old name is renamed along with it to
  // keep them pointing at the same, still-valid village.
  await prisma.$transaction([
    prisma.store.updateMany({ where: { village: village.name }, data: { village: trimmed } }),
    prisma.village.update({ where: { id }, data: { name: trimmed } }),
  ]);

  await logAudit({ action: 'VILLAGE_EDIT', entity_type: 'Village', entity_id: id, user_id: actorId, details: `Renamed village "${village.name}" to "${trimmed}"` });
  return { ...village, name: trimmed };
}

export async function deleteVillage(id: string, actorId: string) {
  const village = await prisma.village.findUnique({ where: { id } });
  if (!village) throw ApiError.notFound('Village not found.');

  const storesUsingVillage = await prisma.store.count({ where: { village: village.name } });
  if (storesUsingVillage > 0) {
    throw ApiError.conflict(`Cannot delete "${village.name}": ${storesUsingVillage} partner outlet(s) still use this village. Move those outlets to a different village first.`);
  }

  await prisma.village.delete({ where: { id } });
  await logAudit({ action: 'VILLAGE_DELETE', entity_type: 'Village', entity_id: id, user_id: actorId, details: `Deleted village ${village.name}` });
  return { id };
}
