import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as storesController from './stores.controller';

export const storesRouter = Router();

// Native Admin/Salesperson, plus any operator individually granted one of
// the screens AdminSales.tsx (or SalespersonSales.tsx) renders.
const requireSalesAccess = requireRoleOrScreenGrant(['Admin', 'Salesperson'], ...SALES_CLUSTER_SCREENS);
const requireSalesAccessAdminOnly = requireRoleOrScreenGrant(['Admin'], ...SALES_CLUSTER_SCREENS);

storesRouter.get('/', requireAuth, asyncHandler(storesController.list));
storesRouter.post('/', requireAuth, requireSalesAccess, asyncHandler(storesController.create));
storesRouter.patch('/:id', requireAuth, requireSalesAccessAdminOnly, asyncHandler(storesController.update));
storesRouter.patch('/:id/status', requireAuth, requireSalesAccessAdminOnly, asyncHandler(storesController.setStatus));

storesRouter.get('/visits', requireAuth, asyncHandler(storesController.listVisits));
// Native Salesperson (recordVisit is only ever called from SalespersonSales.tsx),
// plus any operator individually granted one of the same sales-cluster screens.
storesRouter.post('/visits', requireAuth, requireRoleOrScreenGrant(['Salesperson'], ...SALES_CLUSTER_SCREENS), asyncHandler(storesController.recordVisit));
