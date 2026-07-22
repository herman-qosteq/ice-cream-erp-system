import { Request, Response } from 'express';
import { z } from 'zod';
import * as areasService from './areas.service';
import { ApiError } from '../../utils/ApiError';

const nameSchema = z.object({ name: z.string().min(1) });

export async function list(req: Request, res: Response) {
  res.json(await areasService.listAreas());
}

export async function create(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Please enter an area name.');
  res.status(201).json(await areasService.createArea(parsed.data.name, req.auth!.sub));
}

export async function rename(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Area name cannot be empty.');
  res.json(await areasService.renameArea(req.params.id, parsed.data.name, req.auth!.sub));
}

export async function remove(req: Request, res: Response) {
  res.json(await areasService.deleteArea(req.params.id, req.auth!.sub));
}
