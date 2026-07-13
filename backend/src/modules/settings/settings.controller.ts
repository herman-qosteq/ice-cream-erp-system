import { Request, Response } from 'express';
import { z } from 'zod';
import * as settingsService from './settings.service';
import { ApiError } from '../../utils/ApiError';

const qrSchema = z.object({ image_url: z.string().optional(), is_enabled: z.boolean().optional() });

export async function getQr(req: Request, res: Response) {
  res.json(await settingsService.getQrCodeSettings());
}

export async function updateQr(req: Request, res: Response) {
  const parsed = qrSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await settingsService.updateQrCodeSettings(parsed.data));
}

export async function listAuditLogs(req: Request, res: Response) {
  res.json(await settingsService.listAuditLogs());
}
