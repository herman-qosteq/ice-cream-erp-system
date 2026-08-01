import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import * as assetTypesController from './assetTypes.controller';

export const assetTypesRouter = Router();

// Asset-type dropdown management is embedded in the Assets screen
// (AdminAssets.tsx) - same access rule as assets.routes.ts.
const requireAssetsAccess = requireRoleOrScreenGrant(['Admin'], { ownerRole: 'Admin', key: 'Assets' });

assetTypesRouter.get('/', requireAuth, asyncHandler(assetTypesController.list));
assetTypesRouter.post('/', requireAuth, requireAssetsAccess, asyncHandler(assetTypesController.create));
assetTypesRouter.patch('/:id', requireAuth, requireAssetsAccess, asyncHandler(assetTypesController.rename));
assetTypesRouter.delete('/:id', requireAuth, requireAssetsAccess, asyncHandler(assetTypesController.remove));
