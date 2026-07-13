import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as settingsController from './settings.controller';

export const settingsRouter = Router();

settingsRouter.get('/qr-code', requireAuth, asyncHandler(settingsController.getQr));
settingsRouter.patch('/qr-code', requireAuth, requireRole('Admin'), asyncHandler(settingsController.updateQr));
// Read-only for any authenticated role — it's part of the shared app-data
// blob (e.g. Warehouse's own "Movement Logs" tab reads this too).
settingsRouter.get('/audit-logs', requireAuth, asyncHandler(settingsController.listAuditLogs));
