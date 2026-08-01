import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireAnyScreenAccess } from '../../middleware/auth';
import { WAREHOUSE_CLUSTER_SCREENS } from '../../lib/permissions';
import * as purchasesController from './purchases.controller';

export const purchasesRouter = Router();

// Native Admin/Warehouse (individually revocable per operator), plus any
// operator individually granted one of the screens AdminWarehouse.tsx
// renders (Receive Stock lives on its Warehouse tab).
const requireWarehouseAccess = requireAnyScreenAccess(...WAREHOUSE_CLUSTER_SCREENS);

purchasesRouter.get('/', requireAuth, asyncHandler(purchasesController.list));
purchasesRouter.post('/', requireAuth, requireWarehouseAccess, asyncHandler(purchasesController.create));
purchasesRouter.patch('/:id/bill-file', requireAuth, requireWarehouseAccess, asyncHandler(purchasesController.updateBillFile));
