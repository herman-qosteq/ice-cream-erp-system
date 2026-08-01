import { Request, Response } from 'express';
import { z } from 'zod';
import * as partnerTypesService from './partnerTypes.service';
import { ApiError } from '../../utils/ApiError';

const nameSchema = z.object({ name: z.string().min(1) });

export async function list(req: Request, res: Response) {
  res.json(await partnerTypesService.listPartnerTypes());
}

export async function create(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Please enter a partner type name.');
  res.status(201).json(await partnerTypesService.createPartnerType(parsed.data.name, req.auth!.sub));
}

export async function rename(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Partner type name cannot be empty.');
  res.json(await partnerTypesService.renamePartnerType(req.params.id, parsed.data.name, req.auth!.sub));
}

export async function remove(req: Request, res: Response) {
  res.json(await partnerTypesService.deletePartnerType(req.params.id, req.auth!.sub));
}
