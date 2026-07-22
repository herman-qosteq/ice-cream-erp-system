import { Request, Response } from 'express';
import { z } from 'zod';
import * as categoriesService from './categories.service';
import { ApiError } from '../../utils/ApiError';

const nameSchema = z.object({ name: z.string().min(1) });

export async function list(req: Request, res: Response) {
  res.json(await categoriesService.listCategories());
}

export async function create(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Please enter a category name.');
  res.status(201).json(await categoriesService.createCategory(parsed.data.name, req.auth!.sub));
}

export async function rename(req: Request, res: Response) {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Category name cannot be empty.');
  res.json(await categoriesService.renameCategory(req.params.id, parsed.data.name, req.auth!.sub));
}

export async function toggleStatus(req: Request, res: Response) {
  res.json(await categoriesService.toggleCategoryStatus(req.params.id, req.auth!.sub));
}
