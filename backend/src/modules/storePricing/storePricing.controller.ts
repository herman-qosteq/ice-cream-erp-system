import { Request, Response } from 'express';
import { z } from 'zod';
import * as storePricingService from './storePricing.service';
import { ApiError } from '../../utils/ApiError';

const pctField = z.number().min(0).max(100).nullable();

const upsertSchema = z.object({
  store_id: z.string().min(1),
  product_id: z.string().min(1),
  wholesale_discount_pct: pctField,
  retail_discount_pct: pctField,
});

export async function list(req: Request, res: Response) {
  res.json(await storePricingService.listStorePricing());
}

export async function upsert(req: Request, res: Response) {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Please provide a store, product, and valid discount percentages (0-100).');
  res.json(await storePricingService.upsertStorePricing(parsed.data, req.auth!.sub));
}

const cloneSchema = z.object({
  source_store_id: z.string().min(1),
  target_store_ids: z.array(z.string().min(1)).min(1, 'Select at least one destination store.'),
});

export async function clone(req: Request, res: Response) {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await storePricingService.cloneStorePricing(parsed.data, req.auth!.sub));
}

export async function remove(req: Request, res: Response) {
  res.json(await storePricingService.removeStorePricing(req.params.id, req.auth!.sub));
}
