import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import * as assetsController from './assets.controller';

export const assetsRouter = Router();

// Native Admin, plus any operator individually granted the "Assets &
// Freezer Boxes" screen via Manage Permissions.
const requireAssetsAccess = requireRoleOrScreenGrant(['Admin'], { ownerRole: 'Admin', key: 'Assets' });
// Assign/return/maintenance/mark-lost were already native to Warehouse too
// (physical handling happens at the depot) - preserved here unchanged,
// alongside the same grant check as the rest of the screen.
const requireAssetsAccessOrWarehouse = requireRoleOrScreenGrant(['Admin', 'Warehouse'], { ownerRole: 'Admin', key: 'Assets' });

assetsRouter.get('/', requireAuth, asyncHandler(assetsController.list));
assetsRouter.get('/inventory-summary', requireAuth, asyncHandler(assetsController.inventorySummary));
assetsRouter.get('/inventory', requireAuth, asyncHandler(assetsController.allInventory));
assetsRouter.get('/history', requireAuth, asyncHandler(assetsController.allHistory));
assetsRouter.post('/', requireAuth, requireAssetsAccess, asyncHandler(assetsController.create));
assetsRouter.patch('/:id', requireAuth, requireAssetsAccess, asyncHandler(assetsController.update));
assetsRouter.post('/:id/assign', requireAuth, requireAssetsAccessOrWarehouse, asyncHandler(assetsController.assign));
assetsRouter.post('/:id/return', requireAuth, requireAssetsAccessOrWarehouse, asyncHandler(assetsController.returnAsset));
assetsRouter.post('/:id/maintenance-start', requireAuth, requireAssetsAccessOrWarehouse, asyncHandler(assetsController.maintenanceStart));
assetsRouter.post('/:id/maintenance-end', requireAuth, requireAssetsAccessOrWarehouse, asyncHandler(assetsController.maintenanceEnd));
assetsRouter.post('/:id/mark-lost', requireAuth, requireAssetsAccessOrWarehouse, asyncHandler(assetsController.markLost));
assetsRouter.post('/:id/reactivate', requireAuth, requireAssetsAccess, asyncHandler(assetsController.reactivate));
assetsRouter.post('/:id/deactivate', requireAuth, requireAssetsAccess, asyncHandler(assetsController.deactivate));
assetsRouter.get('/:id/history', requireAuth, asyncHandler(assetsController.history));
assetsRouter.get('/:id/inventory', requireAuth, asyncHandler(assetsController.inventory));
