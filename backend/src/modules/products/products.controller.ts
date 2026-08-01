import { Request, Response } from 'express';
import { z } from 'zod';
import * as productsService from './products.service';
import { ApiError } from '../../utils/ApiError';

const productSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string().min(1),
  brand: z.string().min(1),
  description: z.string().default(''),
  image_url: z.string().default(''),
  mrp: z.number().nonnegative(),
  purchase_discount_pct: z.number().min(0).max(100),
  wholesale_discount_pct: z.number().min(0).max(100),
  retail_discount_pct: z.number().min(0).max(100),
  tax_pct: z.number().nonnegative(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  unit_value: z.number().nonnegative(),
  unit_type: z.enum(['ml', 'L', 'g', 'kg', 'pcs']),
  pieces_per_box: z.number().int().positive().default(1),
});

const priceSchema = z.object({
  mrp: z.number().nonnegative(),
  purchase_discount_pct: z.number().min(0).max(100),
  wholesale_discount_pct: z.number().min(0).max(100),
  retail_discount_pct: z.number().min(0).max(100),
});

const statusSchema = z.object({ status: z.enum(['Active', 'Inactive']) });

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  res.json(await productsService.listProducts());
}

export async function create(req: Request, res: Response) {
  const input = parseOr400(productSchema, req.body);
  res.status(201).json(await productsService.createProduct(input, req.auth!.sub));
}

export async function update(req: Request, res: Response) {
  const input = parseOr400(productSchema, req.body);
  res.json(await productsService.updateProduct(req.params.id, input, req.auth!.sub));
}

export async function updatePrice(req: Request, res: Response) {
  const input = parseOr400(priceSchema, req.body);
  res.json(await productsService.updatePrice(req.params.id, input, req.auth!.sub));
}

export async function setStatus(req: Request, res: Response) {
  const input = parseOr400(statusSchema, req.body);
  res.json(await productsService.setStatus(req.params.id, input.status, req.auth!.sub));
}
