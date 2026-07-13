import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as paymentsController from './payments.controller';

export const paymentsRouter = Router();

paymentsRouter.get('/', requireAuth, asyncHandler(paymentsController.list));
paymentsRouter.post('/', requireAuth, requireRole('Admin', 'Salesperson'), asyncHandler(paymentsController.create));
