import { Request, Response } from 'express';
import { z } from 'zod';
import * as villagesService from './villages.service';
import { ApiError } from '../../utils/ApiError';

const nameSchema = z.object({ name: z.string().min(1) });

export async function list(req: Request, res: Response) {
  res.json(await villagesService.listVillages());
}

export async function create(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Please enter a village name.');
  res.status(201).json(await villagesService.createVillage(parsed.data.name, req.auth!.sub));
}

export async function rename(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Village name cannot be empty.');
  res.json(await villagesService.renameVillage(req.params.id, parsed.data.name, req.auth!.sub));
}

export async function remove(req: Request, res: Response) {
  res.json(await villagesService.deleteVillage(req.params.id, req.auth!.sub));
}
