import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as villagesController from './villages.controller';

export const villagesRouter = Router();

// Village dropdown management is embedded in the Stores screen
// (AdminSales.tsx) - same access rule as areas.routes.ts/stores.routes.ts.
const requireSalesAccess = requireRoleOrScreenGrant(['Admin'], ...SALES_CLUSTER_SCREENS);

villagesRouter.get('/', requireAuth, asyncHandler(villagesController.list));
villagesRouter.post('/', requireAuth, requireSalesAccess, asyncHandler(villagesController.create));
villagesRouter.patch('/:id', requireAuth, requireSalesAccess, asyncHandler(villagesController.rename));
villagesRouter.delete('/:id', requireAuth, requireSalesAccess, asyncHandler(villagesController.remove));
