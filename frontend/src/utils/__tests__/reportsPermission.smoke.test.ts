// Smoke test for the Executive Reports Hub per-operator period-filter
// permissions (Manage Permissions -> Daily/Weekly/Monthly/Custom toggles).
// Run with `npm run test:smoke`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPermissionEnabled } from '../permissions';
import { REPORTS_FILTER_DAILY_FEATURE, REPORTS_FILTER_WEEKLY_FEATURE } from '../../config/permissionsRegistry';
import type { RolePermission, UserPermission } from '../../types';

test('report filter permissions default ON for everyone with no rows configured', () => {
  const enabled = isPermissionEnabled('Admin', 'Admin', REPORTS_FILTER_DAILY_FEATURE, 'user-1', [], []);
  assert.equal(enabled, true);
});

test('an explicit per-operator override to Daily-only hides the other tabs for that user', () => {
  const rolePermissions: RolePermission[] = [];
  const userPermissions: UserPermission[] = [
    { user_id: 'user-1', feature: 'Admin:reports_filter_weekly', enabled: false } as UserPermission,
    { user_id: 'user-1', feature: 'Admin:reports_filter_monthly', enabled: false } as UserPermission,
    { user_id: 'user-1', feature: 'Admin:reports_filter_custom', enabled: false } as UserPermission,
  ];

  assert.equal(isPermissionEnabled('Admin', 'Admin', REPORTS_FILTER_DAILY_FEATURE, 'user-1', rolePermissions, userPermissions), true);
  assert.equal(isPermissionEnabled('Admin', 'Admin', REPORTS_FILTER_WEEKLY_FEATURE, 'user-1', rolePermissions, userPermissions), false);

  // A different operator with no overrides of their own is unaffected.
  assert.equal(isPermissionEnabled('Admin', 'Admin', REPORTS_FILTER_WEEKLY_FEATURE, 'user-2', rolePermissions, userPermissions), true);
});

test('an opt-in feature (gst_toggle) keeps its existing off-by-default behavior, unaffected by the new defaultEnabled path', () => {
  const enabled = isPermissionEnabled('Salesperson', 'Salesperson', 'gst_toggle', 'user-1', [], []);
  assert.equal(enabled, false);
});
