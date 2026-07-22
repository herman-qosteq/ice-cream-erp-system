import { Request, Response } from 'express';
import { z } from 'zod';
import * as preBookingsService from './prebookings.service';
import { ApiError } from '../../utils/ApiError';
import { isPaginationRequested } from '../../utils/pagination';

const itemSchema = z.object({
  product_id: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_pct: z.number().nonnegative(),
});

const createSchema = z.object({
  store_id: z.string().min(1, 'Please select a store for the pre-booking order.'),
  salesperson_id: z.string().min(1),
  scheduled_delivery_date: z.string().min(1),
  items: z.array(itemSchema),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  store_id: z.string().min(1),
  scheduled_delivery_date: z.string().min(1),
  items: z.array(itemSchema),
  notes: z.string().optional(),
});

const deliverSchema = z.object({
  method: z.enum(['Cash', 'UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Credit']),
  amount: z.number().nonnegative(),
});

const editDeliveredSchema = z.object({
  items: z.array(itemSchema).min(1, 'A pre-booking must have at least one item.'),
});

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  if (isPaginationRequested(req.query)) {
    res.json(await preBookingsService.listPreBookingsPaged(req.query));
  } else {
    res.json(await preBookingsService.listPreBookings());
  }
}

export async function create(req: Request, res: Response) {
  const input = parseOr400(createSchema, req.body);
  res.status(201).json(await preBookingsService.createPreBooking(input, req.auth!.sub));
}

export async function update(req: Request, res: Response) {
  const input = parseOr400(updateSchema, req.body);
  res.json(await preBookingsService.updatePreBooking(req.params.id, input, req.auth!.sub));
}

export async function deliver(req: Request, res: Response) {
  const input = parseOr400(deliverSchema, req.body);
  res.json(await preBookingsService.deliverPreBooking(req.params.id, input, req.auth!.sub));
}

export async function cancel(req: Request, res: Response) {
  res.json(await preBookingsService.cancelPreBooking(req.params.id, req.auth!.sub));
}

export async function editDelivered(req: Request, res: Response) {
  const input = parseOr400(editDeliveredSchema, req.body);
  res.json(await preBookingsService.editDeliveredPreBooking(req.params.id, input, req.auth!.sub));
}

export async function deleteDelivered(req: Request, res: Response) {
  res.json(await preBookingsService.deleteDeliveredPreBooking(req.params.id, req.auth!.sub));
}
