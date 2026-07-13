import { Request, Response } from 'express';
import { z } from 'zod';
import * as notificationsService from './notifications.service';
import { ApiError } from '../../utils/ApiError';
import { broadcastExcept } from '../../realtime';

const createSchema = z.object({ type: z.string().min(1), message: z.string().min(1) });

export async function list(req: Request, res: Response) {
  res.json(await notificationsService.listNotifications());
}

export async function create(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  const notification = await notificationsService.createNotification(parsed.data.type, parsed.data.message);
  // Pushed as its own event (not just the generic `data:changed`) so every
  // other open dashboard can show the toast + bump the badge instantly,
  // without waiting on a full data reload.
  broadcastExcept(req.header('x-socket-id') || undefined, 'notification:new', notification);
  res.status(201).json(notification);
}

export async function markRead(req: Request, res: Response) {
  res.json(await notificationsService.markRead(req.params.id));
}

export async function clearAll(req: Request, res: Response) {
  await notificationsService.clearAll();
  res.json({ ok: true });
}
