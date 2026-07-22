import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parsePageParams, parseDateRangeParams, containsInsensitive, buildPagedResult } from '../../utils/pagination';

export async function getQrCodeSettings() {
  const settings = await prisma.qrCodeSettings.findUnique({ where: { id: 1 } });
  return settings ?? { image_url: '', is_enabled: true };
}

export async function updateQrCodeSettings(input: { image_url?: string; is_enabled?: boolean }) {
  return prisma.qrCodeSettings.upsert({
    where: { id: 1 },
    update: input,
    create: { id: 1, image_url: input.image_url ?? '', is_enabled: input.is_enabled ?? true },
  });
}

export async function listAuditLogs() {
  return prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' } });
}

function buildAuditLogWhere(query: Record<string, unknown>): Prisma.AuditLogWhereInput {
  const { from, to } = parseDateRangeParams(query);
  const where: Prisma.AuditLogWhereInput = {};
  if (from || to) where.timestamp = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (typeof query.action === 'string' && query.action) where.action = query.action;
  if (typeof query.entity_type === 'string' && query.entity_type) where.entity_type = query.entity_type;

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    where.OR = [
      { entity_id: containsInsensitive(search) },
      { user_name: containsInsensitive(search) },
      { action: containsInsensitive(search) },
      { details: containsInsensitive(search) },
    ];
  }
  return where;
}

// Page-number pagination (replaces the earlier "Load More" cursor design):
// Movement Logs now shows Page X of Y with Prev/Next, matching the other
// paginated list pages. Deep OFFSET pagination is more expensive than a
// keyset cursor at very large page numbers, but that's an acceptable
// trade-off here in exchange for page-jump UX - revisit only if this table's
// real-world usage pattern ever makes it a measured problem.
export async function listAuditLogsPaged(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePageParams(query);
  const where = buildAuditLogWhere(query);
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);
  return buildPagedResult(data, total, page, pageSize);
}

export async function listRolePermissions() {
  return prisma.rolePermission.findMany();
}

export async function setRolePermission(input: { role: 'Admin' | 'Salesperson' | 'Warehouse'; feature: string; enabled: boolean }) {
  return prisma.rolePermission.upsert({
    where: { role_feature: { role: input.role, feature: input.feature } },
    update: { enabled: input.enabled },
    create: input,
  });
}
