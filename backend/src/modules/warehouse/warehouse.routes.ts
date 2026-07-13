import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as warehouseController from './warehouse.controller';

export const warehouseRouter = Router();

warehouseRouter.get('/inventory', requireAuth, asyncHandler(warehouseController.listInventory));
warehouseRouter.post('/inventory/adjust', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(warehouseController.adjust));
