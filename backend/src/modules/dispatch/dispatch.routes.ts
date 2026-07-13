import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as dispatchController from './dispatch.controller';

export const dispatchRouter = Router();

dispatchRouter.use(requireAuth);

// Any authenticated role can read truck inventory (salespeople need to see their own truck's stock).
dispatchRouter.get('/trucks/inventory', asyncHandler(dispatchController.listAllTruckInventory));
dispatchRouter.get('/trucks/:truckId/inventory', asyncHandler(dispatchController.listTruckInventory));

// Only Admin/Warehouse actually load/return/transfer cargo (matches AdminWarehouse.tsx being the only caller).
dispatchRouter.post('/load', requireRole('Admin', 'Warehouse'), asyncHandler(dispatchController.load));
dispatchRouter.post('/trucks/:truckId/return', requireRole('Admin', 'Warehouse'), asyncHandler(dispatchController.returnStock));
dispatchRouter.post('/trucks/:truckId/return-all', requireRole('Admin', 'Warehouse'), asyncHandler(dispatchController.returnAll));
dispatchRouter.post('/transfer', requireRole('Admin', 'Warehouse'), asyncHandler(dispatchController.transfer));
