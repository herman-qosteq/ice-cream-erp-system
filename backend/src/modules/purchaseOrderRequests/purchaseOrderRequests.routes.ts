import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireAnyScreenAccess } from '../../middleware/auth';
import { WAREHOUSE_CLUSTER_SCREENS } from '../../lib/permissions';
import * as purchaseOrderRequestsController from './purchaseOrderRequests.controller';

export const purchaseOrderRequestsRouter = Router();

// Native Admin/Warehouse (individually revocable per operator), plus any
// operator individually granted one of the screens AdminWarehouse.tsx
// renders (PO requests live on its Warehouse tab).
const requireWarehouseAccess = requireAnyScreenAccess(...WAREHOUSE_CLUSTER_SCREENS);

purchaseOrderRequestsRouter.get('/', requireAuth, asyncHandler(purchaseOrderRequestsController.list));
purchaseOrderRequestsRouter.post('/', requireAuth, requireWarehouseAccess, asyncHandler(purchaseOrderRequestsController.create));
purchaseOrderRequestsRouter.patch('/:id', requireAuth, requireWarehouseAccess, asyncHandler(purchaseOrderRequestsController.update));
purchaseOrderRequestsRouter.patch('/:id/cancel', requireAuth, requireWarehouseAccess, asyncHandler(purchaseOrderRequestsController.cancel));
