import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as purchaseOrderRequestsController from './purchaseOrderRequests.controller';

export const purchaseOrderRequestsRouter = Router();

purchaseOrderRequestsRouter.get('/', requireAuth, asyncHandler(purchaseOrderRequestsController.list));
purchaseOrderRequestsRouter.post('/', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(purchaseOrderRequestsController.create));
purchaseOrderRequestsRouter.patch('/:id', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(purchaseOrderRequestsController.update));
purchaseOrderRequestsRouter.patch('/:id/cancel', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(purchaseOrderRequestsController.cancel));
