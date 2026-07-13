import { Request, Response } from 'express';
import { z } from 'zod';
import * as suppliersService from './suppliers.service';
import { ApiError } from '../../utils/ApiError';

const supplierSchema = z.object({
  name: z.string().min(1),
  contact_person: z.string().default(''),
  phone: z.string().min(1),
  email: z.string().default(''),
  address: z.string().default(''),
});

const statusSchema = z.object({ status: z.enum(['Active', 'Inactive']) });

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  res.json(await suppliersService.listSuppliers());
}

export async function create(req: Request, res: Response) {
  const input = parseOr400(supplierSchema, req.body);
  res.status(201).json(await suppliersService.createSupplier(input, req.auth!.sub));
}

export async function update(req: Request, res: Response) {
  const input = parseOr400(supplierSchema, req.body);
  res.json(await suppliersService.updateSupplier(req.params.id, input, req.auth!.sub));
}

export async function setStatus(req: Request, res: Response) {
  const input = parseOr400(statusSchema, req.body);
  res.json(await suppliersService.setStatus(req.params.id, input.status, req.auth!.sub));
}
