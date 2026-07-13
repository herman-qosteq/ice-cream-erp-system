import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as suppliersController from './suppliers.controller';

export const suppliersRouter = Router();

suppliersRouter.get('/', requireAuth, asyncHandler(suppliersController.list));
suppliersRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(suppliersController.create));
suppliersRouter.patch('/:id', requireAuth, requireRole('Admin'), asyncHandler(suppliersController.update));
suppliersRouter.patch('/:id/status', requireAuth, requireRole('Admin'), asyncHandler(suppliersController.setStatus));
