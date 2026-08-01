import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as partnerTypesController from './partnerTypes.controller';

export const partnerTypesRouter = Router();

// Partner-type dropdown management is embedded in the Stores screen
// (AdminSales.tsx) - same access rule as stores.routes.ts.
const requireSalesAccess = requireRoleOrScreenGrant(['Admin'], ...SALES_CLUSTER_SCREENS);

partnerTypesRouter.get('/', requireAuth, asyncHandler(partnerTypesController.list));
partnerTypesRouter.post('/', requireAuth, requireSalesAccess, asyncHandler(partnerTypesController.create));
partnerTypesRouter.patch('/:id', requireAuth, requireSalesAccess, asyncHandler(partnerTypesController.rename));
partnerTypesRouter.delete('/:id', requireAuth, requireSalesAccess, asyncHandler(partnerTypesController.remove));
