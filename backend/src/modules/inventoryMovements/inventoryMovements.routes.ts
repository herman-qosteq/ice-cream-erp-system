import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireAnyScreenAccess } from '../../middleware/auth';
import { WAREHOUSE_CLUSTER_SCREENS } from '../../lib/permissions';
import * as inventoryMovementsController from './inventoryMovements.controller';

export const inventoryMovementsRouter = Router();

inventoryMovementsRouter.get('/', requireAuth, asyncHandler(inventoryMovementsController.list));
// Native Admin/Warehouse (individually revocable per operator), plus any
// operator individually granted one of the screens AdminWarehouse.tsx
// renders (Movement Audit lives on its own tab).
inventoryMovementsRouter.post(
  '/move',
  requireAuth,
  requireAnyScreenAccess(...WAREHOUSE_CLUSTER_SCREENS),
  asyncHandler(inventoryMovementsController.move)
);
