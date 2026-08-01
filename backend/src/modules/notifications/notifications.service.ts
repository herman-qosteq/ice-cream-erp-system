import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parsePageParams, parseDateRangeParams, buildPagedResult, containsInsensitive } from '../../utils/pagination';

export async function listNotifications() {
  return prisma.appNotification.findMany({ orderBy: { created_at: 'desc' } });
}

function buildNotificationsWhere(query: Record<string, unknown>): Prisma.AppNotificationWhereInput {
  const { from, to } = parseDateRangeParams(query);
  const and: Prisma.AppNotificationWhereInput[] = [];
  if (from || to) and.push({ created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) and.push({ message: containsInsensitive(search) });

  return and.length ? { AND: and } : {};
}

export async function listNotificationsPaged(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePageParams(query);
  const where = buildNotificationsWhere(query);
  const [rows, total] = await Promise.all([
    prisma.appNotification.findMany({ where, orderBy: { created_at: 'desc' }, skip, take }),
    prisma.appNotification.count({ where }),
  ]);
  return buildPagedResult(rows, total, page, pageSize);
}

export async function createNotification(type: string, message: string, entityType?: string, entityId?: string) {
  return prisma.appNotification.create({
    data: { type: type as any, message, entity_type: entityType ?? null, entity_id: entityId ?? null, is_read: false },
  });
}

export async function markRead(id: string) {
  return prisma.appNotification.update({ where: { id }, data: { is_read: true } });
}

export async function clearAll() {
  await prisma.appNotification.deleteMany();
}
