import { prisma } from '../../lib/prisma';

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
