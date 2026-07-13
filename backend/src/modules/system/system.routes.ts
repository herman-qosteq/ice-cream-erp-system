import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as systemController from './system.controller';

export const systemRouter = Router();

systemRouter.use(requireAuth, requireRole('Admin'));

systemRouter.post('/clear-warehouse-stock', asyncHandler(systemController.clearWarehouseStock));
systemRouter.post('/factory-reset', asyncHandler(systemController.factoryReset));
