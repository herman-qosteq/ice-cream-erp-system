// Smoke test for the "unwanted notification" bug: the backend broadcasts
// every real-time notification to every connected socket with no per-role
// targeting (see backend/src/realtime.ts's broadcastExcept), so a Salesperson
// or Warehouse session was popping an in-app toast for admin-only alerts
// (low stock, another operator's order, a user_update, etc.) it has no
// notification list to ever act on. AppContext.tsx's handleRemoteNotification
// now gates that toast on canSeeNotificationHub(). Run with `npm run test:smoke`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSeeNotificationHub } from '../permissions';
import type { RolePermission, UserPermission } from '../../types';

test('native Admin sees the notification toast by default', () => {
  const admin = { id: 'u-admin', role: 'Admin' as const };
  assert.equal(canSeeNotificationHub(admin, [], []), true);
});

test('Salesperson does NOT see the toast by default - this is the reported bug', () => {
  const salesperson = { id: 'u-sp', role: 'Salesperson' as const };
  assert.equal(canSeeNotificationHub(salesperson, [], []), false);
});

test('Warehouse does NOT see the toast by default', () => {
  const warehouse = { id: 'u-wh', role: 'Warehouse' as const };
  assert.equal(canSeeNotificationHub(warehouse, [], []), false);
});

test('a Salesperson individually granted Admin:Notifications DOES see the toast', () => {
  const salesperson = { id: 'u-sp', role: 'Salesperson' as const };
  const userPermissions: UserPermission[] = [
    { user_id: 'u-sp', feature: 'Admin:Notifications', enabled: true } as UserPermission,
  ];
  assert.equal(canSeeNotificationHub(salesperson, [], userPermissions), true);
});

test('an Admin operator with Notifications explicitly revoked does NOT see the toast', () => {
  const admin = { id: 'u-admin2', role: 'Admin' as const };
  const userPermissions: UserPermission[] = [
    { user_id: 'u-admin2', feature: 'Admin:Notifications', enabled: false } as UserPermission,
  ];
  const rolePermissions: RolePermission[] = [];
  assert.equal(canSeeNotificationHub(admin, rolePermissions, userPermissions), false);
});
