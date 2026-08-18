import React, { useState } from 'react';
import { ERPData } from '../../storage';
import { AppNotification, NotificationEntityType } from '../../types';
import { AdminScreen, SalespersonScreen, WAREHOUSE_CLUSTER_TAB_MAP } from '../../config/permissionsRegistry';
import { isForeignScreenGranted } from '../../utils/permissions';
import AdminDashboard from '../admin/AdminDashboard';
import AdminReports from '../admin/AdminReports';
import AdminProducts from '../admin/AdminProducts';
import AdminWarehouse from '../admin/AdminWarehouse';
import AdminSales from '../admin/AdminSales';
import SalespersonSales, { SalespersonSalesForm } from '../salesperson/SalespersonSales';
import SalespersonCargo from '../salesperson/SalespersonCargo';
import SalespersonDeliveries from '../salesperson/SalespersonDeliveries';
import SalespersonVisits from '../salesperson/SalespersonVisits';

// Every registry key across all three roles that has a real, mountable
// component - i.e. everything except Admin's 'Users'/'Notifications'/
// 'BusinessSettings' (never cross-granted, see permissionsRegistry.ts and
// ManagePermissionsModal.tsx - BusinessSettings holds the company's legal
// GSTIN/contact identity, administrative in the same spirit as Users/
// Notifications rather than a field-ops screen worth cross-granting).
export type HostableScreen = Exclude<AdminScreen, 'Users' | 'Notifications' | 'BusinessSettings'> | SalespersonScreen;

interface ScreenHostProps {
  screen: HostableScreen;
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  showAlert: (opts: any) => void;
}

// The single source of truth mapping every hostable registry key to the
// component that actually renders it - used by all three Flow files, both
// for their own native screens and any cross-role "Additional Access"
// grants. Adding a new screen anywhere in the app means adding one case
// here; nothing else needs to change for it to become grantable and
// renderable for any role (see ManagePermissionsModal.tsx / the Flow files'
// "Additional Access" sections, which are driven entirely by
// permissionsRegistry.ts + this mapping).
export default function ScreenHost({ screen, data, setData, addNotification, currentUser, showAlert }: ScreenHostProps) {
  // Local to this one host mount - a foreign screen has no persistent
  // identity across mounts, so any internal sub-navigation it needs
  // (Salesperson's own form overlays) just resets each time it's opened.
  const [salesForm, setSalesForm] = useState<SalespersonSalesForm>('list');

  switch (screen) {
    case 'Dashboard':
      // Quick-nav shortcuts on Dashboard normally jump to another Admin
      // screen within AdminFlow's own unified nav - there's no equivalent
      // "jump elsewhere" concept for a single foreign-hosted screen, so
      // this is a no-op here (a known, minor limitation, not a crash risk).
      return <AdminDashboard data={data} setActiveScreen={() => {}} showAlert={showAlert} />;
    case 'Reports':
      return <AdminReports data={data} currentUser={currentUser} showAlert={showAlert} />;
    case 'Products':
    case 'Pricing':
      return <AdminProducts data={data} setData={setData} addNotification={addNotification} currentUser={currentUser} activeScreen={screen} showAlert={showAlert} />;
    case 'Warehouse':
    case 'Trucks':
    case 'TruckInventory':
    case 'MovementAudit':
    case 'Assets': {
      // This operator may have been granted more than one of the 5 screens
      // AdminWarehouse.tsx bundles behind one ungated tab bar (see
      // WarehouseFlow.tsx) - restrict to exactly the ones they actually
      // have, the same way native Warehouse access does, instead of showing
      // every tab the moment any single one is granted.
      const allowedTabs = WAREHOUSE_CLUSTER_TAB_MAP
        .filter(({ screen: s }) => isForeignScreenGranted(currentUser, 'Admin', s, data.rolePermissions, data.userPermissions))
        .map(({ tab }) => tab);
      return <AdminWarehouse data={data} setData={setData} addNotification={addNotification} currentUser={currentUser} activeScreen={screen} showAlert={showAlert} hideAdminControls allowedTabs={allowedTabs} />;
    }
    case 'Stores':
    case 'Suppliers':
    case 'Purchases':
    case 'Orders':
    case 'Deliveries':
    case 'Invoices':
    case 'Payments':
    case 'QRCodePayment':
    case 'Credit':
    case 'Refill':
    case 'Inactive':
      return <AdminSales data={data} setData={setData} addNotification={addNotification} currentUser={currentUser} activeScreen={screen} showAlert={showAlert} hideAdminControls />;
    case 'home':
    case 'stores':
      return (
        <SalespersonSales
          data={data} setData={setData} addNotification={addNotification} currentUser={currentUser} showAlert={showAlert}
          activeScreen={screen}
          activeForm={salesForm}
          setActiveForm={setSalesForm}
        />
      );
    case 'inventory':
      return <SalespersonCargo data={data} currentUser={currentUser} />;
    case 'deliveries':
      return <SalespersonDeliveries data={data} setData={setData} addNotification={addNotification} currentUser={currentUser} showAlert={showAlert} />;
    case 'visits':
      return <SalespersonVisits data={data} />;
    // Warehouse has no registry keys of its own left at all now - its
    // "Warehouse & Fleet"/Orders/Pre-Bookings screens are all just
    // restricted (hideAdminControls) views of Admin-owned screens, already
    // handled by the cases above (see permissionsRegistry.ts).
    default:
      return null;
  }
}
