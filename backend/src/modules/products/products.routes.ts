import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as productsController from './products.controller';

export const productsRouter = Router();

productsRouter.get('/', requireAuth, asyncHandler(productsController.list));
productsRouter.post('/', requireAuth, requireRole('Admin'), asyncHandler(productsController.create));
productsRouter.patch('/:id', requireAuth, requireRole('Admin'), asyncHandler(productsController.update));
productsRouter.patch('/:id/price', requireAuth, requireRole('Admin'), asyncHandler(productsController.updatePrice));
productsRouter.patch('/:id/status', requireAuth, requireRole('Admin'), asyncHandler(productsController.setStatus));
