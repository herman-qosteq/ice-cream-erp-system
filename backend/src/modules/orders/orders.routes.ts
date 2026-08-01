import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole, requireAnyScreenAccess } from '../../middleware/auth';
import { SALES_CLUSTER_SCREENS } from '../../lib/permissions';
import * as ordersController from './orders.controller';

export const ordersRouter = Router();

// create/settle are already reachable by all three roles natively - no
// screen-grant gap possible there. confirm/deliver/cancel are native to
// Admin/Warehouse (individually revocable per operator via Manage
// Permissions, since Orders is now one shared toggle - see
// permissionsRegistry.ts's 'Orders' item); also honor an explicit grant of
// any sales-cluster screen (these buttons are shown unconditionally on the
// Orders tab, not hidden by hideAdminControls - see AdminSales.tsx's
// order-detail actions).
const requireOrderLifecycleAccess = requireAnyScreenAccess(...SALES_CLUSTER_SCREENS);

ordersRouter.get('/', requireAuth, asyncHandler(ordersController.list));
ordersRouter.get('/invoices', requireAuth, asyncHandler(ordersController.listInvoices));
ordersRouter.post('/', requireAuth, requireRole('Admin', 'Salesperson', 'Warehouse'), asyncHandler(ordersController.create));
ordersRouter.post('/:id/settle', requireAuth, requireRole('Admin', 'Salesperson', 'Warehouse'), asyncHandler(ordersController.settle));
ordersRouter.post('/:id/confirm', requireAuth, requireOrderLifecycleAccess, asyncHandler(ordersController.confirmDraft));
ordersRouter.post('/:id/deliver', requireAuth, requireOrderLifecycleAccess, asyncHandler(ordersController.deliverConfirmed));
ordersRouter.patch('/:id/cancel', requireAuth, requireOrderLifecycleAccess, asyncHandler(ordersController.cancel));
// Editing/deleting an order after it's been Confirmed or Delivered bypasses
// the normal one-way status pipeline - default ON for native Admin, but
// (unlike requireRoleOrScreenGrant's unconditional native-role bypass) still
// individually revocable per Admin operator, or grantable to anyone else, via
// Manage Permissions (see frontend/src/config/permissionsRegistry.ts's
// orders_edit_override/orders_delete_override and AdminSales.tsx's
// hasAdminOverride() calls, which gate the matching Edit/Delete buttons).
ordersRouter.patch(
  '/:id/edit',
  requireAuth,
  requireAnyScreenAccess({ ownerRole: 'Admin', key: 'orders_edit_override' }),
  asyncHandler(ordersController.editOrder)
);
ordersRouter.delete(
  '/:id',
  requireAuth,
  requireAnyScreenAccess({ ownerRole: 'Admin', key: 'orders_delete_override' }),
  asyncHandler(ordersController.deleteOrder)
);
