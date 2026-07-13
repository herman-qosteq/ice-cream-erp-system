import { Request, Response } from 'express';
import { z } from 'zod';
import * as storesService from './stores.service';
import { ApiError } from '../../utils/ApiError';

const storeSchema = z.object({
  name: z.string().min(1, 'Store name and primary phone are required.'),
  owner_name: z.string().default(''),
  phone: z.string().min(1, 'Store name and primary phone are required.'),
  alt_phone: z.string().optional(),
  address: z.string().default(''),
  area: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  pincode: z.string().default(''),
  gst_number: z.string().optional(),
  credit_limit: z.number().nonnegative(),
  refill_frequency: z.enum(['Weekly', '15 Days', 'Monthly', 'Custom']),
  custom_days: z.number().positive().optional(),
  ranking: z.enum(['Platinum', 'Gold', 'Silver', 'Bronze']),
});

const statusSchema = z.object({ status: z.enum(['Active', 'Inactive']) });

const visitSchema = z.object({
  store_id: z.string().min(1),
  notes: z.string().default(''),
  follow_up_date: z.string().optional(),
});

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  res.json(await storesService.listStores());
}

export async function create(req: Request, res: Response) {
  const input = parseOr400(storeSchema, req.body);
  res.status(201).json(await storesService.createStore(input, req.auth!.sub));
}

export async function update(req: Request, res: Response) {
  const input = parseOr400(storeSchema, req.body);
  res.json(await storesService.updateStore(req.params.id, input, req.auth!.sub));
}

export async function setStatus(req: Request, res: Response) {
  const input = parseOr400(statusSchema, req.body);
  res.json(await storesService.setStatus(req.params.id, input.status, req.auth!.sub));
}

export async function listVisits(req: Request, res: Response) {
  res.json(await storesService.listVisits(req.query.store_id as string | undefined));
}

export async function recordVisit(req: Request, res: Response) {
  const input = parseOr400(visitSchema, req.body);
  res.status(201).json(await storesService.recordVisit(input, req.auth!.sub));
}
