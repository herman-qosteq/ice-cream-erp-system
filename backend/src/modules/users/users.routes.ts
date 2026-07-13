import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as usersController from './users.controller';

export const usersRouter = Router();

// Every logged-in user (any role) needs to read the roster — it's part of the
// shared app-data blob every screen pulls from (resolving driver/actor names,
// populating driver dropdowns, etc.). Only the actual account-management
// mutations are Admin-only.
usersRouter.get('/', requireAuth, asyncHandler(usersController.list));
usersRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(usersController.create));
usersRouter.patch('/:id', requireAuth, requireRole('Admin'), asyncHandler(usersController.update));
usersRouter.patch('/:id/status', requireAuth, requireRole('Admin'), asyncHandler(usersController.toggleStatus));
usersRouter.patch('/:id/password', requireAuth, requireRole('Admin'), asyncHandler(usersController.resetPassword));
