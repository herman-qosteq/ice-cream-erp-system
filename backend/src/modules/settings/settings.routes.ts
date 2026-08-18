import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as settingsController from './settings.controller';

export const settingsRouter = Router();

settingsRouter.get('/qr-code', requireAuth, asyncHandler(settingsController.getQr));
settingsRouter.patch('/qr-code', requireAuth, requireRole('Admin'), asyncHandler(settingsController.updateQr));
// Read-only for any authenticated role — every PDF/Excel export this app
// generates (invoices, reports, GRNs) prints this company name/GSTIN/phone/
// email regardless of who's exporting it.
settingsRouter.get('/company-profile', requireAuth, asyncHandler(settingsController.getCompanyProfile));
settingsRouter.patch('/company-profile', requireAuth, requireRole('Admin'), asyncHandler(settingsController.updateCompanyProfile));
// Read-only for any authenticated role — it's part of the shared app-data
// blob (e.g. Warehouse's own "Movement Logs" tab reads this too).
settingsRouter.get('/audit-logs', requireAuth, asyncHandler(settingsController.listAuditLogs));
// Read-only for any authenticated role — every role's client needs to know
// which features Admin has switched on for its own role.
settingsRouter.get('/permissions', requireAuth, asyncHandler(settingsController.listPermissions));
settingsRouter.patch('/permissions', requireAuth, requireRole('Admin'), asyncHandler(settingsController.updatePermission));
// Read-only for any authenticated role — an operator needs their own
// overrides to filter their own nav, same reasoning as /permissions above.
settingsRouter.get('/user-permissions', requireAuth, asyncHandler(settingsController.listUserPermissions));
settingsRouter.patch('/user-permissions/:id', requireAuth, requireRole('Admin'), asyncHandler(settingsController.updateUserPermissions));
settingsRouter.delete('/user-permissions/:id', requireAuth, requireRole('Admin'), asyncHandler(settingsController.resetUserPermissions));
