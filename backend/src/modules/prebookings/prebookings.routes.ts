import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole, requireAnyScreenAccess } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
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
// Native Admin/Salesperson, and native Warehouse (individually revocable per
// operator now that Deliveries is one shared toggle - see
// permissionsRegistry.ts's 'Deliveries' item), plus any explicit sales-cluster grant.
preBookingsRouter.patch('/:id/cancel', requireAuth, requireAnyScreenAccess(...SALES_CLUSTER_SCREENS), asyncHandler(preBookingsController.cancel));
// Editing/deleting a Delivered booking operates on the real order it
// produced - default ON for native Admin, but (unlike
// requireRoleOrScreenGrant's unconditional native-role bypass) still
// individually revocable per Admin operator, or grantable to anyone else, via
// Manage Permissions (see frontend/src/config/permissionsRegistry.ts's
// prebookings_edit_override/prebookings_delete_override), same pattern as
// orders.routes.ts's edit/:id and delete/:id.
preBookingsRouter.patch(
  '/:id/edit-delivered',
  requireAuth,
  requireAnyScreenAccess({ ownerRole: 'Admin', key: 'prebookings_edit_override' }),
  asyncHandler(preBookingsController.editDelivered)
);
preBookingsRouter.delete(
  '/:id',
  requireAuth,
  requireAnyScreenAccess({ ownerRole: 'Admin', key: 'prebookings_delete_override' }),
  asyncHandler(preBookingsController.deleteDelivered)
);
