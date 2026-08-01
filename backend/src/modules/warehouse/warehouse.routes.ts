import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireAnyScreenAccess } from '../../middleware/auth';
import { WAREHOUSE_CLUSTER_SCREENS } from '../../lib/permissions';
import * as warehouseController from './warehouse.controller';

export const warehouseRouter = Router();

// Native Admin/Warehouse (individually revocable per operator), plus any
// operator individually granted one of the screens AdminWarehouse.tsx
// renders (see WAREHOUSE_CLUSTER_SCREENS).
const requireWarehouseAccess = requireAnyScreenAccess(...WAREHOUSE_CLUSTER_SCREENS);

warehouseRouter.get('/inventory', requireAuth, asyncHandler(warehouseController.listInventory));
warehouseRouter.post('/inventory/adjust', requireAuth, requireWarehouseAccess, asyncHandler(warehouseController.adjust));
warehouseRouter.post('/inventory/correct', requireAuth, requireWarehouseAccess, asyncHandler(warehouseController.correct));
