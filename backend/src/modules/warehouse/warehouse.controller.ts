import { Request, Response } from 'express';
import { z } from 'zod';
import * as warehouseService from './warehouse.service';
import { ApiError } from '../../utils/ApiError';
import { qtySchema, positiveQtySchema } from '../../utils/pieceQtySchema';

const adjustSchema = z.object({
  product_id: z.string().min(1),
  type: z.enum(['available_qty', 'reserved_qty', 'damaged_qty', 'expired_qty']),
  direction: z.enum(['add', 'subtract']),
  qty: positiveQtySchema,
  reason: z.string().default(''),
});

const correctSchema = z.object({
  product_id: z.string().min(1),
  available_qty: qtySchema,
  reserved_qty: qtySchema,
  damaged_qty: qtySchema,
  expired_qty: qtySchema,
  comment: z.string().default(''),
});

export async function listInventory(req: Request, res: Response) {
  res.json(await warehouseService.listInventory());
}

export async function adjust(req: Request, res: Response) {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await warehouseService.adjustStock(parsed.data, req.auth!.sub));
}

export async function correct(req: Request, res: Response) {
  const parsed = correctSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await warehouseService.correctStock(parsed.data, req.auth!.sub));
}
