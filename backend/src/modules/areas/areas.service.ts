import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

export async function listAreas() {
  return prisma.area.findMany({ orderBy: { name: 'asc' } });
}

export async function createArea(name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Please enter an area name.');
  const existing = await prisma.area.findFirst({ where: { name: { equals: trimmed } } });
  if (existing) throw ApiError.conflict(`A district area named "${trimmed}" already exists.`);

  const area = await prisma.area.create({ data: { name: trimmed } });
  await logAudit({ action: 'AREA_CREATE', entity_type: 'Area', entity_id: area.id, user_id: actorId, details: `Added district area ${trimmed}` });
  return area;
}

export async function renameArea(id: string, name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Area name cannot be empty.');

  const area = await prisma.area.findUnique({ where: { id } });
  if (!area) throw ApiError.notFound('District area not found.');

  const existing = await prisma.area.findFirst({ where: { name: { equals: trimmed }, NOT: { id } } });
  if (existing) throw ApiError.conflict(`A district area named "${trimmed}" already exists.`);

  // Store.area is matched by name (not a foreign key - see schema.prisma),
  // so every store currently using the old name is renamed along with it to
  // keep them pointing at the same, still-valid area.
  await prisma.$transaction([
    prisma.store.updateMany({ where: { area: area.name }, data: { area: trimmed } }),
    prisma.area.update({ where: { id }, data: { name: trimmed } }),
  ]);

  await logAudit({ action: 'AREA_EDIT', entity_type: 'Area', entity_id: id, user_id: actorId, details: `Renamed district area "${area.name}" to "${trimmed}"` });
  return { ...area, name: trimmed };
}

export async function deleteArea(id: string, actorId: string) {
  const area = await prisma.area.findUnique({ where: { id } });
  if (!area) throw ApiError.notFound('District area not found.');

  const storesUsingArea = await prisma.store.count({ where: { area: area.name } });
  if (storesUsingArea > 0) {
    throw ApiError.conflict(`Cannot delete "${area.name}": ${storesUsingArea} partner outlet(s) still use this area. Move those outlets to a different area first.`);
  }

  await prisma.area.delete({ where: { id } });
  await logAudit({ action: 'AREA_DELETE', entity_type: 'Area', entity_id: id, user_id: actorId, details: `Deleted district area ${area.name}` });
  return { id };
}
