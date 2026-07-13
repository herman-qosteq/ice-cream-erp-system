import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as purchasesController from './purchases.controller';

export const purchasesRouter = Router();

purchasesRouter.get('/', requireAuth, asyncHandler(purchasesController.list));
purchasesRouter.post('/', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(purchasesController.create));
