import { Request, Response } from 'express';
import { z } from 'zod';
import * as settingsService from './settings.service';
import { ApiError } from '../../utils/ApiError';
import { isPaginationRequested } from '../../utils/pagination';

const qrSchema = z.object({ image_url: z.string().optional(), is_enabled: z.boolean().optional() });
const permissionSchema = z.object({
  role: z.enum(['Admin', 'Salesperson', 'Warehouse']),
  feature: z.string().min(1),
  enabled: z.boolean(),
});

export async function getQr(req: Request, res: Response) {
  res.json(await settingsService.getQrCodeSettings());
}

export async function updateQr(req: Request, res: Response) {
  const parsed = qrSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await settingsService.updateQrCodeSettings(parsed.data));
}

export async function listAuditLogs(req: Request, res: Response) {
  // Bare array (today's shape, used by loadAllData() and any other
  // unmigrated caller) unless the caller explicitly asks for a page.
  if (isPaginationRequested(req.query)) {
    res.json(await settingsService.listAuditLogsPaged(req.query));
  } else {
    res.json(await settingsService.listAuditLogs());
  }
}

export async function listPermissions(req: Request, res: Response) {
  res.json(await settingsService.listRolePermissions());
}

export async function updatePermission(req: Request, res: Response) {
  const parsed = permissionSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await settingsService.setRolePermission(parsed.data));
}
