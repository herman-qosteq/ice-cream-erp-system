import { Request, Response } from 'express';
import { z } from 'zod';
import * as dispatchService from './dispatch.service';
import { ApiError } from '../../utils/ApiError';

const loadSchema = z.object({
  truck_id: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    qty: z.number().positive(),
    source: z.enum(['available_qty', 'reserved_qty']),
    pre_booking_id: z.string().optional(),
  })).min(1),
});

const returnSchema = z.object({
  product_id: z.string().min(1),
  qty: z.number().positive(),
});

const transferSchema = z.object({
  from_truck_id: z.string().min(1),
  to_truck_id: z.string().min(1),
  items: z.array(z.object({ product_id: z.string().min(1), qty: z.number().positive() })).min(1),
});

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function listTruckInventory(req: Request, res: Response) {
  res.json(await dispatchService.listTruckInventory(req.params.truckId));
}

export async function listAllTruckInventory(req: Request, res: Response) {
  res.json(await dispatchService.listAllTruckInventory());
}

export async function load(req: Request, res: Response) {
  const input = parseOr400(loadSchema, req.body);
  res.json(await dispatchService.loadCargo(input.truck_id, input.items, req.auth!.sub));
}

export async function returnStock(req: Request, res: Response) {
  const input = parseOr400(returnSchema, req.body);
  res.json(await dispatchService.returnStock(req.params.truckId, input.product_id, input.qty, req.auth!.sub));
}

export async function returnAll(req: Request, res: Response) {
  res.json(await dispatchService.returnAllStock(req.params.truckId, req.auth!.sub));
}

export async function transfer(req: Request, res: Response) {
  const input = parseOr400(transferSchema, req.body);
  res.json(await dispatchService.transferBetweenTrucks(input.from_truck_id, input.to_truck_id, input.items, req.auth!.sub));
}
