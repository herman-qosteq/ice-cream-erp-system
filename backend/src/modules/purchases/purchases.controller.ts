import { Request, Response } from 'express';
import { z } from 'zod';
import * as purchasesService from './purchases.service';
import { ApiError } from '../../utils/ApiError';
import { isPaginationRequested } from '../../utils/pagination';

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
  bill_file_url: z.string().optional(),
  bill_file_name: z.string().optional(),
  bill_file_type: z.string().optional(),
  source_request_id: z.string().optional(),
});

export async function list(req: Request, res: Response) {
  if (isPaginationRequested(req.query)) {
    res.json(await purchasesService.listPurchasesPaged(req.query));
  } else {
    res.json(await purchasesService.listPurchases());
  }
}

export async function create(req: Request, res: Response) {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.status(201).json(await purchasesService.createPurchase(parsed.data, req.auth!.sub));
}

const billFileSchema = z.object({
  bill_file_url: z.string().nullable(),
  bill_file_name: z.string().nullable(),
  bill_file_type: z.string().nullable(),
});

export async function updateBillFile(req: Request, res: Response) {
  const parsed = billFileSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.json(await purchasesService.updatePurchaseBillFile(req.params.id, parsed.data, req.auth!.sub));
}
