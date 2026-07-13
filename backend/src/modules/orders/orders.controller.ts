import { Request, Response } from 'express';
import { z } from 'zod';
import * as ordersService from './orders.service';
import { ApiError } from '../../utils/ApiError';

const orderSchema = z.object({
  store_id: z.string().min(1),
  salesperson_id: z.string().min(1),
  truck_id: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
    tax_pct: z.number().nonnegative(),
  })).min(1, 'Please add at least one ice cream item to create an order.'),
});

const settleSchema = z.object({
  method: z.enum(['Cash', 'UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Credit']),
  amount: z.number().nonnegative(),
});

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  res.json(await ordersService.listOrders());
}

export async function listInvoices(req: Request, res: Response) {
  res.json(await ordersService.listInvoices());
}

export async function create(req: Request, res: Response) {
  const input = parseOr400(orderSchema, req.body);
  res.status(201).json(await ordersService.createOrder(input, req.auth!.sub));
}

export async function settle(req: Request, res: Response) {
  const input = parseOr400(settleSchema, req.body);
  res.json(await ordersService.settleOrder(req.params.id, input, req.auth!.sub));
}

export async function confirmDraft(req: Request, res: Response) {
  res.json(await ordersService.confirmDraftOrder(req.params.id, req.auth!.sub));
}

export async function deliverConfirmed(req: Request, res: Response) {
  res.json(await ordersService.deliverConfirmedOrder(req.params.id, req.auth!.sub));
}

export async function cancel(req: Request, res: Response) {
  res.json(await ordersService.cancelOrder(req.params.id, req.auth!.sub));
}
