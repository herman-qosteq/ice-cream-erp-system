import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as trucksController from './trucks.controller';

export const trucksRouter = Router();

trucksRouter.get('/', requireAuth, asyncHandler(trucksController.list));
trucksRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(trucksController.create));
trucksRouter.patch('/:id', requireAuth, requireRole('Admin'), asyncHandler(trucksController.update));
trucksRouter.patch('/:id/status', requireAuth, requireRole('Admin'), asyncHandler(trucksController.setStatus));
