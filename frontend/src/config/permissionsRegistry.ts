import { RETAIL_PRICING_FEATURE } from '../utils/pricing';

// Action-level override privileges (kind 'feature', not a screen) that let
// an Admin individually grant another operator the ability to edit/delete a
// Confirmed/Delivered order or a Delivered pre-booking - actions normally
// restricted to Admin's own role. Checked via hasAdminOverride() in
// utils/permissions.ts, which keeps native Admin unconditionally allowed and
// only ever grants anyone else through an explicit per-operator
// UserPermission row - same reasoning as isForeignScreenGranted().
export const ORDERS_EDIT_OVERRIDE_FEATURE = 'orders_edit_override';
export const ORDERS_DELETE_OVERRIDE_FEATURE = 'orders_delete_override';
export const PREBOOKINGS_EDIT_OVERRIDE_FEATURE = 'prebookings_edit_override';
export const PREBOOKINGS_DELETE_OVERRIDE_FEATURE = 'prebookings_delete_override';

// Per-operator control over which of the Executive Reports Hub's 4 period
// tabs (AdminReports.tsx) an operator is allowed to use - e.g. an operator
// restricted to Daily-only can't pull a Weekly/Monthly/Custom export. Unlike
// the override features above, these default ON for everyone (see
// defaultEnabled on the registry items below) since they narrow an
// existing default-open capability rather than grant a new one.
export const REPORTS_FILTER_DAILY_FEATURE = 'reports_filter_daily';
export const REPORTS_FILTER_WEEKLY_FEATURE = 'reports_filter_weekly';
export const REPORTS_FILTER_MONTHLY_FEATURE = 'reports_filter_monthly';
export const REPORTS_FILTER_CUSTOM_FEATURE = 'reports_filter_custom';

// Hoisted out of AdminFlow.tsx/SalespersonFlow.tsx/WarehouseFlow.tsx so this
// registry is the one place that lists every screen per role - those files
// import these types instead of declaring their own local unions, so the
// registry and what each Flow file actually renders can't drift apart.
export type AdminScreen =
  | 'Dashboard' | 'Reports' | 'Products' | 'Pricing' | 'Suppliers' | 'Purchases'
  | 'Warehouse' | 'Trucks' | 'TruckInventory' | 'MovementAudit'
  | 'Stores' | 'Orders' | 'Deliveries' | 'Invoices' | 'Payments' | 'QRCodePayment' | 'Credit' | 'Refill' | 'Inactive'
  | 'Assets'
  | 'Users' | 'Notifications' | 'BusinessSettings';

export type SalespersonScreen = 'home' | 'inventory' | 'stores' | 'deliveries' | 'visits';

// Warehouse has no registry-owned screens of its own (see PERMISSION_REGISTRY.Warehouse
// below) - every native Warehouse screen is a restricted view of an
// Admin-owned screen (Warehouse & Fleet, Orders, Pre-Bookings), expressed via
// that screen's defaultForRoles instead of a separate WarehouseScreen union.
// WarehouseFlow.tsx's sidebar section ids are purely local to that file.

export type PermissionRole = 'Admin' | 'Salesperson' | 'Warehouse';

// Maps each of Admin's Warehouse/Trucks/TruckInventory/MovementAudit/Assets
// screens to the internal AdminWarehouse.tsx tab it renders - the one shared
// place WarehouseFlow.tsx (native Warehouse access) and ScreenHost.tsx (a
// different role granted one of these individually) both derive which tabs
// an operator is allowed to see, so the two can't drift apart. Note this is
// UI-tab visibility only - it does NOT imply backend access to the other
// warehouse-stock endpoints the way backend/src/lib/permissions.ts's
// WAREHOUSE_CLUSTER_SCREENS does; Assets is deliberately left out of that
// backend list since it's a separate resource (freezer/asset tracking, not
// stock movement) with its own dedicated route guards - see assets.routes.ts.
export const WAREHOUSE_CLUSTER_TAB_MAP: { screen: AdminScreen; tab: 'warehouse' | 'transfers' | 'trucks' | 'audits' | 'assets' }[] = [
  { screen: 'Warehouse', tab: 'warehouse' },
  { screen: 'Trucks', tab: 'transfers' },
  { screen: 'TruckInventory', tab: 'trucks' },
  { screen: 'MovementAudit', tab: 'audits' },
  { screen: 'Assets', tab: 'assets' },
];

export interface PermissionItem {
  // For kind 'screen', this is the literal AdminScreen/SalespersonScreen/
  // WarehouseScreen value used by that role's Flow file. For kind 'feature'
  // it's the same key already used by RolePermission (see utils/pricing.ts).
  key: string;
  kind: 'screen' | 'feature';
  label: string;
  description?: string;
  // Screen-kind only. Normally a screen defaults to enabled ONLY for its own
  // owning role (see getRoleDefault in utils/permissions.ts) and is
  // otherwise reachable by another role solely through an explicit
  // per-operator UserPermission grant. Listing a role here makes the screen
  // ALSO default-enabled (still individually revocable via that role's own
  // UserPermission override) for operators of that role, without it needing
  // an explicit grant - used for Admin's Warehouse/Trucks/TruckInventory/
  // MovementAudit items, which are literally the tabs inside Warehouse's own
  // native screen.
  defaultForRoles?: PermissionRole[];
  // Feature-kind only. A feature normally defaults OFF for a role until an
  // explicit RolePermission row enables it (see gst_toggle/RETAIL_PRICING_FEATURE
  // above - deliberately opt-in). Setting this instead makes the feature
  // default ON (still individually revocable per-operator, and per-role via
  // an explicit disabling RolePermission row) - for features that narrow an
  // existing default-open capability rather than grant a new one, e.g. the
  // Reports period-filter items below.
  defaultEnabled?: boolean;
}

export interface PermissionModule {
  id: string;
  title: string;
  items: PermissionItem[];
}

// The single point of truth driving both the Manage Permissions modal and
// nav filtering in every Flow file. Adding a new screen later means adding
// one line here (plus the usual routing case in the Flow file, as today) -
// nothing else in the permissions UI needs touching.
export const PERMISSION_REGISTRY: Record<PermissionRole, PermissionModule[]> = {
  Admin: [
    {
      id: 'business-reporting',
      title: 'Business & Reporting',
      items: [
        { key: 'Dashboard', kind: 'screen', label: 'Executive Dashboard' },
        // Separated out of the Dashboard screen into its own page/permission
        // (previously the "ERP Executive Reports Hub" card lived inside
        // AdminDashboard.tsx and was reachable by anyone with Dashboard
        // access, with no independent way to grant/revoke report exports on
        // their own - see AdminReports.tsx).
        { key: 'Reports', kind: 'screen', label: 'Executive Reports Hub' },
        // Sub-permissions of 'Reports' above - only meaningful once that
        // screen is already granted. Default ON for everyone (defaultEnabled)
        // so nothing regresses for existing operators; an Admin narrows an
        // operator down to e.g. Daily-only by unchecking the other 3 for
        // them in Manage Permissions (see AdminReports.tsx).
        {
          key: REPORTS_FILTER_DAILY_FEATURE,
          kind: 'feature',
          label: 'Reports Filter: Daily',
          description: 'Allow using the Daily period filter/tab when exporting Executive Reports Hub PDFs.',
          defaultEnabled: true,
        },
        {
          key: REPORTS_FILTER_WEEKLY_FEATURE,
          kind: 'feature',
          label: 'Reports Filter: Weekly',
          description: 'Allow using the Weekly period filter/tab when exporting Executive Reports Hub PDFs.',
          defaultEnabled: true,
        },
        {
          key: REPORTS_FILTER_MONTHLY_FEATURE,
          kind: 'feature',
          label: 'Reports Filter: Monthly',
          description: 'Allow using the Monthly period filter/tab when exporting Executive Reports Hub PDFs.',
          defaultEnabled: true,
        },
        {
          key: REPORTS_FILTER_CUSTOM_FEATURE,
          kind: 'feature',
          label: 'Reports Filter: Custom',
          description: 'Allow using the Custom date-range filter/tab when exporting Executive Reports Hub PDFs.',
          defaultEnabled: true,
        },
        { key: 'Notifications', kind: 'screen', label: 'System Alert Hub' },
      ],
    },
    {
      id: 'cargo-catalog',
      title: 'Cargo & Catalog',
      items: [{ key: 'Products', kind: 'screen', label: 'Ice Cream Catalog' }],
    },
    {
      id: 'warehouse-fleet',
      title: 'Depot, Fleet & Assets (Admin)',
      items: [
        // These 4 are also default-enabled for native Warehouse operators
        // (they're literally the tabs inside Warehouse's own "Warehouse &
        // Fleet" screen - see WarehouseFlow.tsx) - listing defaultForRoles
        // here is the single source of truth for that, instead of a second
        // bundled 'stock' permission item duplicating them. Assets is now
        // also rendered as a 5th tab of that same AdminWarehouse.tsx
        // component (see WAREHOUSE_CLUSTER_TAB_MAP above) but deliberately
        // keeps no defaultForRoles: Warehouse operators only see it once an
        // Admin explicitly grants "Assets & Freezer Boxes" via Manage
        // Permissions, unlike the other 4 which are on by default.
        { key: 'Warehouse', kind: 'screen', label: 'Warehouse Inventory', defaultForRoles: ['Warehouse'] },
        { key: 'Trucks', kind: 'screen', label: 'Truck Fleet Load', defaultForRoles: ['Warehouse'] },
        { key: 'TruckInventory', kind: 'screen', label: 'Trucks', defaultForRoles: ['Warehouse'] },
        { key: 'MovementAudit', kind: 'screen', label: 'Logistics Audit Trail', defaultForRoles: ['Warehouse'] },
        { key: 'Assets', kind: 'screen', label: 'Assets & Freezer Boxes' },
      ],
    },
    {
      id: 'partners-sales',
      title: 'Partners & Sales',
      items: [
        { key: 'Stores', kind: 'screen', label: 'Partners' },
        { key: 'Suppliers', kind: 'screen', label: 'Supply Partners' },
        // Also default-enabled for native Warehouse (individually revocable
        // per operator) - same reasoning as the Warehouse/Trucks/
        // TruckInventory/MovementAudit items above: Warehouse's own
        // orders/prebookings screens reused this exact AdminSales.tsx
        // component (via hideAdminControls, unaffected by this toggle -
        // see WarehouseFlow.tsx), so a separate bundled registry item for
        // Warehouse was showing the same permission twice.
        { key: 'Orders', kind: 'screen', label: 'Order Dispatches', defaultForRoles: ['Warehouse'] },
        { key: 'Deliveries', kind: 'screen', label: 'Pre-Booking Management', defaultForRoles: ['Warehouse'] },
        { key: 'Payments', kind: 'screen', label: 'Payments & UPI QR' },
        { key: 'Credit', kind: 'screen', label: 'Credit' },
        { key: 'Refill', kind: 'screen', label: 'Refill' },
        { key: 'Inactive', kind: 'screen', label: 'Inactive Partners' },
      ],
    },
    {
      id: 'system-security',
      title: 'System & Security',
      items: [
        { key: 'Users', kind: 'screen', label: 'Operator Accounts' },
        { key: 'BusinessSettings', kind: 'screen', label: 'Business Settings' },
      ],
    },
    {
      id: 'order-overrides',
      title: 'Order & Pre-Booking Overrides',
      // Default ON (defaultEnabled) so native Admin keeps today's behavior
      // out of the box - these used to be a hardcoded `role === 'Admin'`
      // bypass in hasAdminOverride()/requireRoleOrScreenGrant() that no
      // permission row could ever override. Now they resolve through the
      // normal cascade like every other feature: an Admin can still revoke
      // one of these from a specific Admin operator via Manage Permissions
      // (e.g. a junior/shared Admin account that shouldn't be able to edit a
      // Confirmed order), and can still grant it to a Salesperson/Warehouse
      // operator who wouldn't have it by default.
      items: [
        {
          key: ORDERS_EDIT_OVERRIDE_FEATURE,
          kind: 'feature',
          label: 'Edit Confirmed/Delivered Orders',
          description: 'Edit an order after it has been Confirmed or Delivered, reversing/reapplying warehouse stock and the invoice as needed.',
          defaultEnabled: true,
        },
        {
          key: ORDERS_DELETE_OVERRIDE_FEATURE,
          kind: 'feature',
          label: 'Delete Orders',
          description: 'Permanently delete an order, reversing any stock and payments it produced.',
          defaultEnabled: true,
        },
        {
          key: PREBOOKINGS_EDIT_OVERRIDE_FEATURE,
          kind: 'feature',
          label: 'Edit Delivered Pre-Bookings',
          description: 'Edit the real order/invoice a Delivered pre-booking produced, reversing/reapplying warehouse stock as needed.',
          defaultEnabled: true,
        },
        {
          key: PREBOOKINGS_DELETE_OVERRIDE_FEATURE,
          kind: 'feature',
          label: 'Delete Pre-Bookings',
          description: 'Permanently delete a Delivered pre-booking and the real order/invoice it produced.',
          defaultEnabled: true,
        },
      ],
    },
    {
      id: 'feature-flags',
      title: 'Feature Flags',
      // Both default ON for Admin (defaultEnabled) - matches today's
      // unconditional behavior for native Admin (the GST toggle and Retail
      // pricing tier have always just been there for Admin). Salesperson's
      // and Warehouse's own buckets below list these same two bare keys
      // again with defaultEnabled left off (false), since each role now
      // owns its own independent on/off default instead of sharing one
      // global RolePermission-backed switch - see isGstToggleEnabled/
      // isRetailPricingEnabled in utils/permissions.ts.
      items: [
        {
          key: 'gst_toggle',
          kind: 'feature',
          label: 'With GST / Without GST Order Toggle',
          description: 'Choose GST or non-GST pricing when creating an order or pre-booking, instead of always applying the product\'s default tax rate.',
          defaultEnabled: true,
        },
        {
          key: RETAIL_PRICING_FEATURE,
          kind: 'feature',
          label: 'Retail Pricing Tier',
          description: 'Show the Retail/Selling price tier across pricing tools.',
          defaultEnabled: true,
        },
      ],
    },
  ],
  Salesperson: [
    {
      id: 'daily-operations',
      title: 'Daily Operations',
      items: [
        { key: 'home', kind: 'screen', label: 'Shift Home' },
        { key: 'inventory', kind: 'screen', label: 'My Cargo' },
      ],
    },
    {
      id: 'partners-sales',
      // Distinct from Admin's identically-worded "Partners & Sales" module
      // above - same id/title text there was rendering as the same heading
      // twice in Manage Permissions (every role's modules are always shown
      // for every operator - see ManagePermissionsModal.tsx), even though
      // the 2 items here are Salesperson's own narrower field-ops screens,
      // not the same permissions as Admin's 8.
      title: "Salesperson's Outlets & Bookings",
      items: [
        { key: 'stores', kind: 'screen', label: 'Outlets' },
        // "(Field Booking)" for the same reason Admin's/Warehouse's sibling
        // items were disambiguated - see those items' comments above.
        { key: 'deliveries', kind: 'screen', label: 'Pre-Booking (Field Booking)' },
      ],
    },
    {
      id: 'field-visits',
      title: 'Field Visits',
      items: [{ key: 'visits', kind: 'screen', label: 'Audits Visit' }],
    },
    {
      id: 'feature-flags',
      // Distinct from Admin's identically-worded "Feature Flags" module
      // above - same collision reasoning as "Partners & Sales" above.
      title: "Salesperson's Feature Flags",
      items: [
        {
          key: 'gst_toggle',
          kind: 'feature',
          label: 'GST Toggle',
          description: 'Allow switching orders between GST and non-GST billing.',
          defaultEnabled: false,
        },
        {
          key: RETAIL_PRICING_FEATURE,
          kind: 'feature',
          label: 'Retail Pricing Tier',
          description: 'Show the Retail/Selling price tier across pricing tools.',
          defaultEnabled: false,
        },
      ],
    },
  ],
  // Warehouse has no registry-owned screens of its own (every native
  // Warehouse screen is a restricted view of an Admin-owned screen - see the
  // comment this replaced, preserved below) but does own its own feature-flag
  // defaults, same reasoning as Salesperson's bucket above: each role gets an
  // independent on/off default for these two bare keys instead of sharing one
  // global RolePermission-backed switch.
  //
  // Every native Warehouse screen (Warehouse & Fleet, Orders, Pre-Bookings)
  // is a restricted (hideAdminControls) view of an Admin-owned screen,
  // expressed via that screen's defaultForRoles instead of a duplicate
  // bundled item here - see WarehouseFlow.tsx, which derives its whole
  // sidebar from Admin's registry items via isForeignScreenGranted().
  Warehouse: [
    {
      id: 'feature-flags',
      title: "Warehouse's Feature Flags",
      items: [
        {
          key: 'gst_toggle',
          kind: 'feature',
          label: 'With GST / Without GST Order Toggle',
          description: 'Choose GST or non-GST pricing when creating an order or pre-booking, instead of always applying the product\'s default tax rate.',
          defaultEnabled: false,
        },
        {
          key: RETAIL_PRICING_FEATURE,
          kind: 'feature',
          label: 'Retail Pricing Tier',
          description: 'Show the Retail/Selling price tier across pricing tools.',
          defaultEnabled: false,
        },
      ],
    },
  ],
};
