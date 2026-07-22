import { Request, Response } from 'express';
import { z } from 'zod';
import * as purchaseOrderRequestsService from './purchaseOrderRequests.service';
import { ApiError } from '../../utils/ApiError';

const createSchema = z.object({
  order_ref: z.string().min(1),
  supplier_id: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    order_case: z.number().positive(),
  })).min(1, 'Please select at least one product.'),
});

export async function list(req: Request, res: Response) {
  res.json(await purchaseOrderRequestsService.listPurchaseOrderRequests());
}

export async function create(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.status(201).json(await purchaseOrderRequestsService.createPurchaseOrderRequest(parsed.data, req.auth!.sub));
}

const updateSchema = z.object({
  supplier_id: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    order_case: z.number().positive(),
  })).min(1, 'Please select at least one product.'),
});

export async function update(req: Request, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await purchaseOrderRequestsService.updatePurchaseOrderRequest(req.params.id, parsed.data, req.auth!.sub));
}

export async function cancel(req: Request, res: Response) {
  res.json(await purchaseOrderRequestsService.cancelPurchaseOrderRequest(req.params.id, req.auth!.sub));
}
