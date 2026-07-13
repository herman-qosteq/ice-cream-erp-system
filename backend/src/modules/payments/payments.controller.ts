import { Request, Response } from 'express';
import { z } from 'zod';
import * as paymentsService from './payments.service';
import { ApiError } from '../../utils/ApiError';

const paymentSchema = z.object({
  store_id: z.string().min(1),
  invoice_id: z.string().optional(),
  amount: z.number().positive('Please enter a valid payment amount.'),
  method: z.enum(['Cash', 'UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Credit']),
});

export async function list(req: Request, res: Response) {
  res.json(await paymentsService.listPayments());
}

export async function create(req: Request, res: Response) {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  res.status(201).json(await paymentsService.recordPayment(parsed.data, req.auth!.sub));
}
