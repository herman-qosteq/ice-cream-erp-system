import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import { ApiError } from '../../utils/ApiError';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Phone or name is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');

  const { identifier, password } = parsed.data;
  const result = await authService.login(identifier, password);
  res.json(result);
}

export async function me(req: Request, res: Response) {
  const user = await authService.getUserById(req.auth!.sub);
  res.json(user);
}
