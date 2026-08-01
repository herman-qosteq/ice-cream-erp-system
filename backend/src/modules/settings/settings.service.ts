import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parsePageParams, parseDateRangeParams, containsInsensitive, buildPagedResult } from '../../utils/pagination';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

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
  if (typeof query.user_id === 'string' && query.user_id) where.user_id = query.user_id;

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

// Per-operator overrides (see UserPermission in schema.prisma). Read by
// every authenticated role - an operator needs their own overrides to
// filter their own nav, the same reasoning listRolePermissions already
// follows for role-level features.
export async function listUserPermissions() {
  return prisma.userPermission.findMany();
}

// A lone Admin disabling their own access to Operator Management would have
// no UI path back (enforcement here is UI-only, so the button itself would
// vanish) - block it the same way toggleUserStatus blocks self-deactivation.
const SELF_LOCKOUT_KEY = 'Admin:Users';

export async function setUserPermissionsBulk(
  userId: string,
  permissions: { feature: string; enabled: boolean }[],
  actorId: string
) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw ApiError.notFound('User not found');

  if (userId === actorId && permissions.some(p => p.feature === SELF_LOCKOUT_KEY && !p.enabled)) {
    throw ApiError.badRequest('You cannot remove your own access to Operator Management!');
  }

  const rows = await prisma.$transaction(
    permissions.map(p =>
      prisma.userPermission.upsert({
        where: { user_id_feature: { user_id: userId, feature: p.feature } },
        update: { enabled: p.enabled },
        create: { user_id: userId, feature: p.feature, enabled: p.enabled },
      })
    )
  );
  await logAudit({
    action: 'USER_PERMISSIONS_UPDATE',
    entity_type: 'User',
    entity_id: userId,
    user_id: actorId,
    details: `Updated ${permissions.length} permission override(s) for operator: ${target.name}`,
  });
  return rows;
}

export async function clearUserPermissions(userId: string, actorId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw ApiError.notFound('User not found');

  const result = await prisma.userPermission.deleteMany({ where: { user_id: userId } });
  await logAudit({
    action: 'USER_PERMISSIONS_RESET',
    entity_type: 'User',
    entity_id: userId,
    user_id: actorId,
    details: `Reset permission overrides to role default for operator: ${target.name}`,
  });
  return result;
}
