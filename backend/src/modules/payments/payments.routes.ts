import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRoleOrScreenGrant } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as paymentsController from './payments.controller';

export const paymentsRouter = Router();

paymentsRouter.get('/', requireAuth, asyncHandler(paymentsController.list));
// Native Admin/Salesperson, plus any operator individually granted one of
// the screens AdminSales.tsx renders (Payments & UPI QR lives on its own tab).
paymentsRouter.post('/', requireAuth, requireRoleOrScreenGrant(['Admin', 'Salesperson'], ...SALES_CLUSTER_SCREENS), asyncHandler(paymentsController.create));
