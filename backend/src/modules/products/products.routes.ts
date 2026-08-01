import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant, requireAnyScreenAccess } from '../../middleware/auth';
import * as productsController from './products.controller';

export const productsRouter = Router();

// Native Admin, plus any operator individually granted the "Ice Cream
// Catalog" (Products) screen via Manage Permissions - see requireRoleOrScreenGrant.
const requireProductsAccess = requireRoleOrScreenGrant(['Admin'], { ownerRole: 'Admin', key: 'Products' });
// Native Warehouse too: AdminWarehouse.tsx's Receive Stock flow silently
// syncs a product's MRP/discount % here whenever the admin edits pricing
// while receiving a purchase (see handleSavePurchase in AdminWarehouse.tsx)
// - that's reachable the moment a Warehouse operator opens their own native
// "Warehouse & Fleet" screen, not something that should need a separate
// "Ice Cream Catalog" grant. Kept as a route-local defaultForRoles (not
// added to the shared Products registry item) so the full Catalog screen
// itself still stays Admin-only-by-default everywhere else.
const requireProductsAccessOrWarehouse = requireAnyScreenAccess({ ownerRole: 'Admin', key: 'Products', defaultForRoles: ['Warehouse'] });

productsRouter.get('/', requireAuth, asyncHandler(productsController.list));
productsRouter.post('/', requireAuth, requireProductsAccess, asyncHandler(productsController.create));
productsRouter.patch('/:id', requireAuth, requireProductsAccess, asyncHandler(productsController.update));
productsRouter.patch('/:id/price', requireAuth, requireProductsAccessOrWarehouse, asyncHandler(productsController.updatePrice));
productsRouter.patch('/:id/status', requireAuth, requireProductsAccess, asyncHandler(productsController.setStatus));
