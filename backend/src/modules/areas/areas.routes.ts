import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as areasController from './areas.controller';

export const areasRouter = Router();

// District-area dropdown management is embedded in the Stores screen
// (AdminSales.tsx) - same access rule as stores.routes.ts.
const requireSalesAccess = requireRoleOrScreenGrant(['Admin'], ...SALES_CLUSTER_SCREENS);

areasRouter.get('/', requireAuth, asyncHandler(areasController.list));
areasRouter.post('/', requireAuth, requireSalesAccess, asyncHandler(areasController.create));
areasRouter.patch('/:id', requireAuth, requireSalesAccess, asyncHandler(areasController.rename));
areasRouter.delete('/:id', requireAuth, requireSalesAccess, asyncHandler(areasController.remove));
