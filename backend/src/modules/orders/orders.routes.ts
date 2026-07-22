import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as ordersController from './orders.controller';

export const ordersRouter = Router();

ordersRouter.get('/', requireAuth, asyncHandler(ordersController.list));
ordersRouter.get('/invoices', requireAuth, asyncHandler(ordersController.listInvoices));
ordersRouter.post('/', requireAuth, requireRole('Admin', 'Salesperson', 'Warehouse'), asyncHandler(ordersController.create));
ordersRouter.post('/:id/settle', requireAuth, requireRole('Admin', 'Salesperson', 'Warehouse'), asyncHandler(ordersController.settle));
ordersRouter.post('/:id/confirm', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(ordersController.confirmDraft));
ordersRouter.post('/:id/deliver', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(ordersController.deliverConfirmed));
ordersRouter.patch('/:id/cancel', requireAuth, requireRole('Admin', 'Warehouse'), asyncHandler(ordersController.cancel));
// Admin-only: editing/deleting an order after it has been Confirmed or
// Delivered bypasses the normal one-way status pipeline, so it's restricted
// to Admin rather than opened up to Warehouse like the rest of this router.
ordersRouter.patch('/:id/edit', requireAuth, requireRole('Admin'), asyncHandler(ordersController.editOrder));
ordersRouter.delete('/:id', requireAuth, requireRole('Admin'), asyncHandler(ordersController.deleteOrder));
