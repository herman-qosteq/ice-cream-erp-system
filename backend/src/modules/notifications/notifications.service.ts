import { prisma } from '../../lib/prisma';

export async function listNotifications() {
  return prisma.appNotification.findMany({ orderBy: { created_at: 'desc' } });
}

export async function createNotification(type: string, message: string) {
  return prisma.appNotification.create({ data: { type: type as any, message, is_read: false } });
}

export async function markRead(id: string) {
  return prisma.appNotification.update({ where: { id }, data: { is_read: true } });
}

export async function clearAll() {
  await prisma.appNotification.deleteMany();
}
