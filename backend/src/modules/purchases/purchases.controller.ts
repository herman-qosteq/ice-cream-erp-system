import { Request, Response } from 'express';
import { z } from 'zod';
import * as purchasesService from './purchases.service';
import { ApiError } from '../../utils/ApiError';

const purchaseSchema = z.object({
  supplier_id: z.string().min(1),
  invoice_number: z.string().min(1, 'Supplier invoice number is required.'),
  date: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number().positive(),
    purchase_price: z.number().nonnegative(),
    mfg_date: z.string().optional(),
    expiry_date: z.string().optional(),
  })).min(1),
});

export async function list(req: Request, res: Response) {
  res.json(await purchasesService.listPurchases());
}

export async function create(req: Request, res: Response) {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.status(201).json(await purchasesService.createPurchase(parsed.data, req.auth!.sub));
}
