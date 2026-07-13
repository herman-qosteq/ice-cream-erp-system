import { Request, Response } from 'express';
import { z } from 'zod';
import * as usersService from './users.service';
import { ApiError } from '../../utils/ApiError';

function omitPasswordHash<T extends { password_hash: string }>(user: T) {
  const { password_hash, ...rest } = user;
  return rest;
}

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  role: z.enum(['Admin', 'Salesperson', 'Warehouse']),
  password_hash: z.string().min(1, 'Password is required'),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  role: z.enum(['Admin', 'Salesperson', 'Warehouse']).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(1),
});

export async function list(req: Request, res: Response) {
  const users = await usersService.listUsers();
  res.json(users.map(omitPasswordHash));
}

export async function create(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  const user = await usersService.createUser(parsed.data, req.auth!.sub);
  res.status(201).json(omitPasswordHash(user));
}

export async function update(req: Request, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  const user = await usersService.updateUser(req.params.id, parsed.data, req.auth!.sub);
  res.json(omitPasswordHash(user));
}

export async function toggleStatus(req: Request, res: Response) {
  const user = await usersService.toggleUserStatus(req.params.id, req.auth!.sub);
  res.json(omitPasswordHash(user));
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');
  const result = await usersService.resetPassword(req.params.id, parsed.data.password, req.auth!.sub);
  res.json(result);
}
