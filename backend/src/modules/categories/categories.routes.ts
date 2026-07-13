import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as categoriesController from './categories.controller';

export const categoriesRouter = Router();

categoriesRouter.get('/', requireAuth, asyncHandler(categoriesController.list));
categoriesRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(categoriesController.create));
categoriesRouter.patch('/:id', requireAuth, requireRole('Admin'), asyncHandler(categoriesController.rename));
