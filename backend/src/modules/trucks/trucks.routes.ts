import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireAnyScreenAccess } from '../../middleware/auth';
import { WAREHOUSE_CLUSTER_SCREENS } from '../../lib/permissions';
import * as trucksController from './trucks.controller';

export const trucksRouter = Router();

// Native Admin AND native Warehouse (individually revocable per operator -
// AdminWarehouse.tsx's internal tab bar isn't gated by hideAdminControls, so
// the "Truck Fleet Management" tab - and its Add/Edit/Deactivate Truck
// buttons - is reachable the moment a Warehouse operator opens their own
// native "Warehouse & Fleet" screen unless an Admin has specifically
// revoked that one tab for them), plus any operator individually granted
// one of the screens AdminWarehouse.tsx renders.
const requireWarehouseAccess = requireAnyScreenAccess(...WAREHOUSE_CLUSTER_SCREENS);

trucksRouter.get('/', requireAuth, asyncHandler(trucksController.list));
trucksRouter.post('/', requireAuth, requireWarehouseAccess, asyncHandler(trucksController.create));
trucksRouter.patch('/:id', requireAuth, requireWarehouseAccess, asyncHandler(trucksController.update));
trucksRouter.patch('/:id/status', requireAuth, requireWarehouseAccess, asyncHandler(trucksController.setStatus));
