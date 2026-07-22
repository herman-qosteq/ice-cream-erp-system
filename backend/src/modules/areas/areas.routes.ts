import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as areasController from './areas.controller';

export const areasRouter = Router();

areasRouter.get('/', requireAuth, asyncHandler(areasController.list));
areasRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(areasController.create));
areasRouter.patch('/:id', requireAuth, requireRole('Admin'), asyncHandler(areasController.rename));
areasRouter.delete('/:id', requireAuth, requireRole('Admin'), asyncHandler(areasController.remove));
