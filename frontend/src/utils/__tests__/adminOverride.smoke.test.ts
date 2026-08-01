// Smoke test for the "Order & Pre-Booking Overrides" permissions
// (Edit/Delete Confirmed/Delivered Orders & Pre-Bookings). These used to be a
// hardcoded `role === 'Admin'` bypass in hasAdminOverride() that no
// permission row could ever override - an Admin disabling the toggle in
// Manage Permissions had no real effect. Now they default ON for native
// Admin (matching prior behavior) but are individually revocable per
// operator. Run with `npm run test:smoke`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAdminOverride } from '../permissions';
import { ORDERS_EDIT_OVERRIDE_FEATURE, ORDERS_DELETE_OVERRIDE_FEATURE } from '../../config/permissionsRegistry';
import type { RolePermission, UserPermission } from '../../types';

test('native Admin has the override by default with no permission rows configured', () => {
  const admin = { id: 'u-admin', role: 'Admin' as const };
  assert.equal(hasAdminOverride(admin, ORDERS_EDIT_OVERRIDE_FEATURE, [], []), true);
});

test('an explicit per-operator revocation blocks a specific Admin operator - this is the reported bug/fix', () => {
  const admin = { id: 'u-admin', role: 'Admin' as const };
  const rolePermissions: RolePermission[] = [];
  const userPermissions: UserPermission[] = [
    { user_id: 'u-admin', feature: 'Admin:orders_edit_override', enabled: false } as UserPermission,
  ];
  assert.equal(hasAdminOverride(admin, ORDERS_EDIT_OVERRIDE_FEATURE, rolePermissions, userPermissions), false);
  // A different Admin operator without that override row is unaffected.
  assert.equal(hasAdminOverride({ id: 'u-admin-2', role: 'Admin' }, ORDERS_EDIT_OVERRIDE_FEATURE, rolePermissions, userPermissions), true);
  // Revoking edit doesn't touch the separate delete override for the same operator.
  assert.equal(hasAdminOverride(admin, ORDERS_DELETE_OVERRIDE_FEATURE, rolePermissions, userPermissions), true);
});

test('Salesperson does NOT have the override by default', () => {
  const salesperson = { id: 'u-sp', role: 'Salesperson' as const };
  assert.equal(hasAdminOverride(salesperson, ORDERS_EDIT_OVERRIDE_FEATURE, [], []), false);
});

test('a Salesperson individually granted the override DOES have it', () => {
  const salesperson = { id: 'u-sp', role: 'Salesperson' as const };
  const userPermissions: UserPermission[] = [
    { user_id: 'u-sp', feature: 'Admin:orders_delete_override', enabled: true } as UserPermission,
  ];
  assert.equal(hasAdminOverride(salesperson, ORDERS_DELETE_OVERRIDE_FEATURE, [], userPermissions), true);
  // Only the granted feature, not the sibling one.
  assert.equal(hasAdminOverride(salesperson, ORDERS_EDIT_OVERRIDE_FEATURE, [], userPermissions), false);
});
