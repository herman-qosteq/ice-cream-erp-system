import type { RolePermission, UserPermission, User } from '../types';
import { PERMISSION_REGISTRY } from '../config/permissionsRegistry';
import type { PermissionRole, PermissionModule, PermissionItem } from '../config/permissionsRegistry';
import { RETAIL_PRICING_FEATURE } from './pricing';

// UserPermission.feature is namespaced by the item's OWNING role (e.g.
// "Admin:Orders") - not necessarily the target operator's own role, since an
// operator can now be granted a screen that belongs to a different role
// entirely. This also means that if an operator's role is later changed,
// old override rows are harmlessly orphaned instead of silently misapplying.
// RolePermission.feature does NOT need this - it already scopes by role via
// its own column (see schema.prisma), so feature keys there stay bare.
export function namespacedPermissionKey(ownerRole: PermissionRole, key: string): string {
  return `${ownerRole}:${key}`;
}

function findRegistryItem(ownerRole: PermissionRole, key: string): PermissionItem | undefined {
  for (const module of PERMISSION_REGISTRY[ownerRole]) {
    const item = module.items.find(i => i.key === key);
    if (item) return item;
  }
  return undefined;
}

// Ignores any operator-specific override entirely - used for the modal's
// "Role default" display and for Reset to Role Default. An item belonging to
// a role OTHER than the operator's own is never a "role default" for them,
// UNLESS the item explicitly lists targetRole in defaultForRoles (e.g.
// Admin's Warehouse/Trucks/TruckInventory/MovementAudit screens, which are
// also native to Warehouse - see permissionsRegistry.ts) - otherwise it can
// only ever be enabled via an explicit grant (see isPermissionEnabled).
export function getRoleDefault(ownerRole: PermissionRole, targetRole: PermissionRole, key: string, rolePermissions: RolePermission[]): boolean {
  const item = findRegistryItem(ownerRole, key);
  if (ownerRole !== targetRole) {
    return !!item && item.kind === 'screen' && !!item.defaultForRoles?.includes(targetRole);
  }
  // Screens have no existing role-level default mechanism - every screen the
  // registry lists for a role is on by default (matches today's unfiltered
  // behavior, so nothing regresses for any existing account).
  if (!item || item.kind === 'screen') return true;
  // A registry item that explicitly declares defaultEnabled (true or false)
  // is authoritative for that role's baseline - it's no longer overridable
  // by a legacy RolePermission row (only by a per-operator UserPermission
  // override, via isPermissionEnabled above). This matters for gst_toggle/
  // RETAIL_PRICING_FEATURE specifically: they used to be set app-wide via
  // the now-removed "Role Permissions" page, which wrote rows straight into
  // the rolePermissions table - any such leftover row must not silently
  // resurrect the old app-wide toggle now that each role owns its own
  // hardcoded default.
  if (item.defaultEnabled !== undefined) return item.defaultEnabled;
  // No hardcoded default declared: fall back to a role-wide RolePermission
  // row if one exists (legacy mechanism, kept for any future feature that
  // wants it), otherwise off.
  const explicitRow = rolePermissions.find(rp => rp.role === ownerRole && rp.feature === key);
  return explicitRow ? explicitRow.enabled : false;
}

// Resolution cascade for a registry item (identified by which role's bucket
// it lives in, `ownerRole`, plus its bare `key`) for an operator whose own
// role is `targetRole`: an explicit per-operator override always wins;
// absent that, fall back to the role default above (which is only ever true
// when ownerRole === targetRole).
export function isPermissionEnabled(
  ownerRole: PermissionRole,
  targetRole: PermissionRole,
  key: string,
  userId: string,
  rolePermissions: RolePermission[],
  userPermissions: UserPermission[]
): boolean {
  const namespaced = namespacedPermissionKey(ownerRole, key);
  const override = userPermissions.find(up => up.user_id === userId && up.feature === namespaced);
  if (override) return override.enabled;
  return getRoleDefault(ownerRole, targetRole, key, rolePermissions);
}

// Every role-bucket paired with its modules, for the Manage Permissions
// modal's unified Role -> Module -> Item listing.
export function getAllPermissionModules(): { role: PermissionRole; modules: PermissionModule[] }[] {
  return (Object.keys(PERMISSION_REGISTRY) as PermissionRole[]).map(role => ({ role, modules: PERMISSION_REGISTRY[role] }));
}

// Convenience for nav filtering in the three Flow files - checks an
// operator's OWN native screens, keyed off the CURRENTLY LOGGED IN user, not
// whichever operator an Admin might be viewing/editing elsewhere in the app.
export function isScreenVisible(
  currentUser: Pick<User, 'id' | 'role'>,
  screenKey: string,
  rolePermissions: RolePermission[],
  userPermissions: UserPermission[]
): boolean {
  const role = currentUser.role as PermissionRole;
  return isPermissionEnabled(role, role, screenKey, currentUser.id, rolePermissions, userPermissions);
}

// Convenience for nav filtering of screens belonging to a DIFFERENT role
// than the current operator's own - used by each Flow file's "Additional
// Access" section to find cross-role grants.
export function isForeignScreenGranted(
  currentUser: Pick<User, 'id' | 'role'>,
  ownerRole: PermissionRole,
  screenKey: string,
  rolePermissions: RolePermission[],
  userPermissions: UserPermission[]
): boolean {
  return isPermissionEnabled(ownerRole, currentUser.role as PermissionRole, screenKey, currentUser.id, rolePermissions, userPermissions);
}

// Whether `user` can actually open Admin's 'Notifications' (System Alert
// Hub) screen - used by AppContext.tsx to decide whether a REMOTE real-time
// notification (someone else's order/stock/system alert, delivered to every
// connected socket with no per-role targeting - see backend/src/realtime.ts)
// should pop an in-app toast for them. Native Admin gets it like any other
// own-role screen; anyone else only if individually granted it, same as any
// other cross-role screen grant - everyone else has no notification list to
// act on this from, so it would just be noise.
export function canSeeNotificationHub(
  user: Pick<User, 'id' | 'role'>,
  rolePermissions: RolePermission[],
  userPermissions: UserPermission[]
): boolean {
  return user.role === 'Admin'
    ? isScreenVisible(user, 'Notifications', rolePermissions, userPermissions)
    : isForeignScreenGranted(user, 'Admin', 'Notifications', rolePermissions, userPermissions);
}

// For the Admin-owned action-level override privileges in
// permissionsRegistry.ts (edit/delete a Confirmed/Delivered order or
// Delivered pre-booking) - these default ON for native Admin (see
// defaultEnabled on the registry items) so nothing regresses out of the box,
// but unlike the old hardcoded `role === 'Admin'` bypass, an explicit
// per-operator UserPermission override now wins either direction: it can
// revoke the privilege from a specific Admin operator, or grant it to a
// Salesperson/Warehouse operator who wouldn't have it by default. Just the
// standard isPermissionEnabled() cascade, scoped to this one call shape.
export function hasAdminOverride(
  currentUser: Pick<User, 'id' | 'role'>,
  key: string,
  rolePermissions: RolePermission[],
  userPermissions: UserPermission[]
): boolean {
  return isPermissionEnabled('Admin', currentUser.role as PermissionRole, key, currentUser.id, rolePermissions, userPermissions);
}

// Formerly "Role Permissions" (a separate Admin-only page writing straight
// into the rolePermissions table, app-wide and un-overridable per operator).
// Both gst_toggle and RETAIL_PRICING_FEATURE now live in Manage Permissions
// like any other feature: each role owns its own bare-key entry with its own
// hardcoded default (Admin: on, Salesperson/Warehouse: off - see
// permissionsRegistry.ts), individually revocable/grantable per operator via
// the normal isPermissionEnabled cascade. Both checks are keyed off the
// CURRENTLY LOGGED IN user's own role (ownerRole === targetRole), same
// pattern as isScreenVisible.
export function isGstToggleEnabled(
  currentUser: Pick<User, 'id' | 'role'>,
  rolePermissions: RolePermission[],
  userPermissions: UserPermission[]
): boolean {
  const role = currentUser.role as PermissionRole;
  return isPermissionEnabled(role, role, 'gst_toggle', currentUser.id, rolePermissions, userPermissions);
}

export function isRetailPricingEnabled(
  currentUser: Pick<User, 'id' | 'role'>,
  rolePermissions: RolePermission[],
  userPermissions: UserPermission[]
): boolean {
  const role = currentUser.role as PermissionRole;
  return isPermissionEnabled(role, role, RETAIL_PRICING_FEATURE, currentUser.id, rolePermissions, userPermissions);
}
