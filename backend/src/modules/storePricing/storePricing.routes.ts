import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as storePricingController from './storePricing.controller';

export const storePricingRouter = Router();

// Per-store pricing overrides are managed from the Stores screen
// (AdminSales.tsx) - same access rule as stores.routes.ts.
const requireSalesAccess = requireRoleOrScreenGrant(['Admin'], ...SALES_CLUSTER_SCREENS);

storePricingRouter.get('/', requireAuth, asyncHandler(storePricingController.list));
storePricingRouter.put('/', requireAuth, requireSalesAccess, asyncHandler(storePricingController.upsert));
storePricingRouter.post('/clone', requireAuth, requireSalesAccess, asyncHandler(storePricingController.clone));
storePricingRouter.delete('/:id', requireAuth, requireSalesAccess, asyncHandler(storePricingController.remove));
