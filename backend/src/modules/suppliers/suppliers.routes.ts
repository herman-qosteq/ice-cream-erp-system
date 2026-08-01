import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as suppliersController from './suppliers.controller';

export const suppliersRouter = Router();

// Native Admin, plus any operator individually granted one of the screens
// AdminSales.tsx renders (Supply Partners lives on its own tab there).
const requireSalesAccess = requireRoleOrScreenGrant(['Admin'], ...SALES_CLUSTER_SCREENS);

suppliersRouter.get('/', requireAuth, asyncHandler(suppliersController.list));
suppliersRouter.post('/', requireAuth, requireSalesAccess, asyncHandler(suppliersController.create));
suppliersRouter.patch('/:id', requireAuth, requireSalesAccess, asyncHandler(suppliersController.update));
suppliersRouter.patch('/:id/status', requireAuth, requireSalesAccess, asyncHandler(suppliersController.setStatus));
