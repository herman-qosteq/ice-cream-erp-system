import { prisma } from './prisma';

export type PermissionRole = 'Admin' | 'Salesperson' | 'Warehouse';

// Identifies one entry from frontend/src/config/permissionsRegistry.ts -
// ownerRole is whichever role's bucket the screen lives in (e.g. Products is
// owned by Admin), key is the bare registry key. Mirrors ScreenRef-shaped
// namespacing used by UserPermission.feature (see namespacedPermissionKey()
// in frontend/src/utils/permissions.ts).
export interface ScreenRef {
  ownerRole: PermissionRole;
  key: string;
  // Mirrors PermissionItem.defaultForRoles on the frontend registry - roles
  // (besides ownerRole) this screen is ALSO default-enabled for, without an
  // explicit grant (e.g. Admin's Warehouse/Trucks/TruckInventory/
  // MovementAudit screens are native to Warehouse too, see
  // WAREHOUSE_CLUSTER_SCREENS below), while still being individually
  // revocable per operator via an explicit UserPermission override.
  defaultForRoles?: PermissionRole[];
}

function namespacedKey(ref: ScreenRef): string {
  return `${ref.ownerRole}:${ref.key}`;
}

// True if this exact operator has been individually granted one of the
// given screens via the Manage Permissions modal. Screens are never opened
// up role-wide (RolePermission is only ever consulted for 'feature' kind
// registry items, e.g. the GST toggle - see getRoleDefault() on the
// frontend) - a screen outside an operator's own native role is reachable
// ONLY through an explicit UserPermission row, so that's the only thing
// worth querying here.
export async function hasExplicitScreenGrant(userId: string, screens: ScreenRef[]): Promise<boolean> {
  if (screens.length === 0) return false;
  const rows = await prisma.userPermission.findMany({
    where: { user_id: userId, feature: { in: screens.map(namespacedKey) }, enabled: true },
    select: { id: true },
    take: 1,
  });
  return rows.length > 0;
}

// Full override-aware resolution across a set of screens, mirroring the
// frontend's isPermissionEnabled()/getRoleDefault() cascade exactly: an
// explicit per-operator UserPermission row always wins; absent that, a
// screen defaults to enabled for its own ownerRole or for any role listed in
// its defaultForRoles, and to disabled for everyone else. True if ANY of the
// given screens resolves to enabled for this operator - used for routes
// whose UI lives inside a component that bundles several registry screens
// behind one ungated tab bar (see WAREHOUSE_CLUSTER_SCREENS below), where
// reaching the component via any one of them makes every tab reachable.
export async function isAnyScreenAllowedForUser(
  userId: string,
  actorRole: PermissionRole,
  screens: ScreenRef[]
): Promise<boolean> {
  if (screens.length === 0) return false;
  const rows = await prisma.userPermission.findMany({
    where: { user_id: userId, feature: { in: screens.map(namespacedKey) } },
    select: { feature: true, enabled: true },
  });
  const overrides = new Map(rows.map(r => [r.feature, r.enabled]));
  return screens.some(screen => {
    const override = overrides.get(namespacedKey(screen));
    if (override !== undefined) return override;
    return screen.ownerRole === actorRole || !!screen.defaultForRoles?.includes(actorRole);
  });
}

// AdminWarehouse.tsx renders 4 registry screens (Warehouse/Trucks/
// TruckInventory/MovementAudit) as ONE component with an internal tab bar
// that isn't itself permission-filtered (see allowedTabs in
// AdminWarehouse.tsx) - once an operator reaches the component via any one
// of these, only the tabs they were actually allowed end up rendered, but
// this list still needs to cover all 4 since any one of them can be the
// entry point. All 4 are also default-enabled for native Warehouse (they're
// literally the tabs inside Warehouse's own "Warehouse & Fleet" screen - see
// WarehouseFlow.tsx), individually revocable per operator just like a
// cross-role grant.
export const WAREHOUSE_CLUSTER_SCREENS: ScreenRef[] = [
  { ownerRole: 'Admin', key: 'Warehouse', defaultForRoles: ['Warehouse'] },
  { ownerRole: 'Admin', key: 'Trucks', defaultForRoles: ['Warehouse'] },
  { ownerRole: 'Admin', key: 'TruckInventory', defaultForRoles: ['Warehouse'] },
  { ownerRole: 'Admin', key: 'MovementAudit', defaultForRoles: ['Warehouse'] },
];

// Same reasoning as WAREHOUSE_CLUSTER_SCREENS above, for AdminSales.tsx,
// which bundles 8 Admin registry screens (Orders/Deliveries also
// default-enabled for Warehouse, individually revocable - its own
// orders/prebookings tabs reused this exact component via hideAdminControls,
// not a separate screen) behind one internal salesTab switcher.
export const SALES_CLUSTER_SCREENS: ScreenRef[] = [
  { ownerRole: 'Admin', key: 'Stores' },
  { ownerRole: 'Admin', key: 'Suppliers' },
  { ownerRole: 'Admin', key: 'Orders', defaultForRoles: ['Warehouse'] },
  { ownerRole: 'Admin', key: 'Deliveries', defaultForRoles: ['Warehouse'] },
  { ownerRole: 'Admin', key: 'Payments' },
  { ownerRole: 'Admin', key: 'Credit' },
  { ownerRole: 'Admin', key: 'Refill' },
  { ownerRole: 'Admin', key: 'Inactive' },
  { ownerRole: 'Salesperson', key: 'home' },
  { ownerRole: 'Salesperson', key: 'stores' },
  { ownerRole: 'Salesperson', key: 'deliveries' },
];
