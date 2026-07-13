import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as ordersController from './orders.controller';

export const ordersRouter = Router();

ordersRouter.get('/', requireAuth, asyncHandler(ordersController.list));
ordersRouter.get('/invoices', requireAuth, asyncHandler(ordersController.listInvoices));
ordersRouter.post('/', requireAuth, requireRole('Admin', 'Salesperson'), asyncHandler(ordersController.create));
ordersRouter.post('/:id/settle', requireAuth, requireRole('Admin', 'Salesperson'), asyncHandler(ordersController.settle));
ordersRouter.post('/:id/confirm', requireAuth, requireRole('Admin'), asyncHandler(ordersController.confirmDraft));
ordersRouter.post('/:id/deliver', requireAuth, requireRole('Admin'), asyncHandler(ordersController.deliverConfirmed));
ordersRouter.patch('/:id/cancel', requireAuth, requireRole('Admin'), asyncHandler(ordersController.cancel));
