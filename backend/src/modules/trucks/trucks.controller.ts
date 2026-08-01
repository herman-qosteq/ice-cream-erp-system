import { Request, Response } from 'express';
import { z } from 'zod';
import * as trucksService from './trucks.service';
import { ApiError } from '../../utils/ApiError';

// Normalizes '' (the SelectField's "Unassigned" option, see AdminWarehouse.tsx)
// and omitted/null to a real null, so downstream code only ever deals with
// "a driver id" or "null" - never an empty string sitting in the column.
const driverIdField = z.string().nullable().optional().transform(v => (v && v.trim() ? v.trim() : null));

const createTruckSchema = z.object({
  vehicle_number: z.string().min(1, 'Vehicle number and area are required.'),
  // A truck can only ever be created Active (see trucks.service.ts
  // createTruck), so it needs a driver from the start - unassigning is only
  // ever done via Edit (updateTruckSchema below) or via deactivating.
  driver_user_id: z.string().min(1, 'A driver must be assigned to register a new truck.'),
  route: z.string().default(''),
  area: z.string().min(1, 'Vehicle number and area are required.'),
});

// Same shape, but driver_user_id is optional - Edit Truck can unassign the
// driver (leaving it Unassigned) without deactivating the whole truck.
const updateTruckSchema = z.object({
  vehicle_number: z.string().min(1, 'Vehicle number and area are required.'),
  driver_user_id: driverIdField,
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
  const input = parseOr400(createTruckSchema, req.body);
  res.status(201).json(await trucksService.createTruck(input, req.auth!.sub));
}

export async function update(req: Request, res: Response) {
  const input = parseOr400(updateTruckSchema, req.body);
  res.json(await trucksService.updateTruck(req.params.id, input, req.auth!.sub));
}

export async function setStatus(req: Request, res: Response) {
  const input = parseOr400(statusSchema, req.body);
  res.json(await trucksService.setStatus(req.params.id, input.status, req.auth!.sub));
}
