import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireAnyScreenAccess } from '../../middleware/auth';
import { WAREHOUSE_CLUSTER_SCREENS } from '../../lib/permissions';
import * as dispatchController from './dispatch.controller';

export const dispatchRouter = Router();

dispatchRouter.use(requireAuth);

// Any authenticated role can read truck inventory (salespeople need to see their own truck's stock).
dispatchRouter.get('/trucks/inventory', asyncHandler(dispatchController.listAllTruckInventory));
dispatchRouter.get('/trucks/:truckId/inventory', asyncHandler(dispatchController.listTruckInventory));

// Native Admin/Warehouse (individually revocable per operator), plus any
// operator individually granted one of the screens AdminWarehouse.tsx
// renders (matches it being the only caller).
const requireWarehouseAccess = requireAnyScreenAccess(...WAREHOUSE_CLUSTER_SCREENS);
dispatchRouter.post('/load', requireWarehouseAccess, asyncHandler(dispatchController.load));
dispatchRouter.post('/trucks/:truckId/return', requireWarehouseAccess, asyncHandler(dispatchController.returnStock));
dispatchRouter.post('/trucks/:truckId/return-all', requireWarehouseAccess, asyncHandler(dispatchController.returnAll));
dispatchRouter.post('/transfer', requireWarehouseAccess, asyncHandler(dispatchController.transfer));
