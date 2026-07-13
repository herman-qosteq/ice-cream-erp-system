import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
}

export async function createCategory(name: string, actorId: string) {
  const trimmed = name.trim();
  const existing = await prisma.category.findFirst({ where: { name: { equals: trimmed } } });
  if (existing) throw ApiError.conflict(`A category named "${trimmed}" already exists.`);

  const category = await prisma.category.create({ data: { name: trimmed } });
  await logAudit({ action: 'CATEGORY_CREATE', entity_type: 'Category', entity_id: category.id, user_id: actorId, details: `Created product category ${trimmed}` });
  return category;
}

export async function renameCategory(id: string, name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Category name cannot be empty.');

  const existing = await prisma.category.findFirst({ where: { name: { equals: trimmed }, NOT: { id } } });
  if (existing) throw ApiError.conflict(`A category named "${trimmed}" already exists.`);

  const category = await prisma.category.update({ where: { id }, data: { name: trimmed } });
  await logAudit({ action: 'CATEGORY_EDIT', entity_type: 'Category', entity_id: id, user_id: actorId, details: `Renamed product category to ${trimmed}` });
  return category;
}
