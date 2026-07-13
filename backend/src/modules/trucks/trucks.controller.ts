import { Request, Response } from 'express';
import { z } from 'zod';
import * as trucksService from './trucks.service';
import { ApiError } from '../../utils/ApiError';

const truckSchema = z.object({
  vehicle_number: z.string().min(1, 'Vehicle number and area are required.'),
  driver_user_id: z.string().min(1),
  route: z.string().default(''),
  area: z.string().min(1, 'Vehicle number and area are required.'),
});

const statusSchema = z.object({ status: z.enum(['Active', 'Inactive']) });

function parseOr400<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function list(req: Request, res: Response) {
  res.json(await trucksService.listTrucks());
}

export async function create(req: Request, res: Response) {
  const input = parseOr400(truckSchema, req.body);
  res.status(201).json(await trucksService.createTruck(input, req.auth!.sub));
}

export async function update(req: Request, res: Response) {
  const input = parseOr400(truckSchema, req.body);
  res.json(await trucksService.updateTruck(req.params.id, input, req.auth!.sub));
}

export async function setStatus(req: Request, res: Response) {
  const input = parseOr400(statusSchema, req.body);
  res.json(await trucksService.setStatus(req.params.id, input.status, req.auth!.sub));
}
