import { Request, Response } from 'express';
import { z } from 'zod';
import * as inventoryMovementsService from './inventoryMovements.service';
import { isPaginationRequested } from '../../utils/pagination';
import { ApiError } from '../../utils/ApiError';
import { positiveQtySchema } from '../../utils/pieceQtySchema';

const locationType = z.enum(['Warehouse', 'Truck', 'Partner', 'Asset']);

const moveSchema = z.object({
  from_type: locationType,
  from_id: z.string().optional(),
  to_type: locationType,
  to_id: z.string().optional(),
  product_id: z.string().min(1),
  qty: positiveQtySchema,
  reason: z.string().optional(),
});

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function move(req: Request, res: Response) {
  const input = parseOr400(moveSchema, req.body);
  res.status(201).json(await inventoryMovementsService.moveStock(input, req.auth!.sub));
}

export async function list(req: Request, res: Response) {
  if (isPaginationRequested(req.query as Record<string, unknown>)) {
    res.json(await inventoryMovementsService.listMovementsPaged(req.query as Record<string, unknown>));
  } else {
    res.json(await inventoryMovementsService.listMovements(req.query as Record<string, unknown>));
  }
}
