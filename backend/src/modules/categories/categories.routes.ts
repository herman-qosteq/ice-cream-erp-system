import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import * as categoriesController from './categories.controller';

export const categoriesRouter = Router();

// Category management is embedded in the Products screen (AdminProducts.tsx)
// - same access rule as products.routes.ts.
const requireProductsAccess = requireRoleOrScreenGrant(['Admin'], { ownerRole: 'Admin', key: 'Products' });

categoriesRouter.get('/', requireAuth, asyncHandler(categoriesController.list));
categoriesRouter.post('/', requireAuth, requireProductsAccess, asyncHandler(categoriesController.create));
categoriesRouter.patch('/:id', requireAuth, requireProductsAccess, asyncHandler(categoriesController.rename));
categoriesRouter.patch('/:id/status', requireAuth, requireProductsAccess, asyncHandler(categoriesController.toggleStatus));
