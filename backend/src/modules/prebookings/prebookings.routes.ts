import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as preBookingsController from './prebookings.controller';

export const preBookingsRouter = Router();

// Warehouse also needs to read pending pre-bookings (shown as a reminder in
// the truck-loading screen), can create new pre-bookings directly from the
// depot, and can cancel one of their own upcoming orders; editing or
// fulfilling (delivering) a pre-booking stays restricted to Admin/Salesperson.
preBookingsRouter.get('/', requireAuth, asyncHandler(preBookingsController.list));
preBookingsRouter.post('/', requireAuth, requireRole('Admin', 'Salesperson', 'Warehouse'), asyncHandler(preBookingsController.create));
preBookingsRouter.patch('/:id', requireAuth, requireRole('Admin', 'Salesperson'), asyncHandler(preBookingsController.update));
preBookingsRouter.post('/:id/deliver', requireAuth, requireRole('Admin', 'Salesperson'), asyncHandler(preBookingsController.deliver));
preBookingsRouter.patch('/:id/cancel', requireAuth, requireRole('Admin', 'Salesperson', 'Warehouse'), asyncHandler(preBookingsController.cancel));
