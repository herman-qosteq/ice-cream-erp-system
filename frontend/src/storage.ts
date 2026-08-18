import AsyncStorage from './utils/asyncStorage';
import {
  User, Product, Supplier, Store, Truck, WarehouseInventory, TruckInventory,
  Order, Invoice, Payment, AppNotification, SyncQueueItem, CreditLedger, Purchase, PurchaseOrderRequest, PreBookingOrder, Category, Area, Village, StorePricing, RolePermission, UserPermission,
  PartnerType, AssetType,
} from './types';
import {
  authApi, usersApi, categoriesApi, areasApi, villagesApi, storePricingApi, productsApi, suppliersApi, storesApi, trucksApi,
  warehouseApi, dispatchApi, ordersApi, paymentsApi, notificationsApi, purchasesApi, purchaseOrderRequestsApi,
  preBookingsApi, settingsApi, partnerTypesApi, assetTypesApi,
} from './api/endpoints';
import { configureBrandProfile } from './utils/pdfTemplate';

export interface ERPAuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  timestamp: string;
  details: string;
}

// Resolves a user_id into a display-friendly name + role for audit log entries.
// Falls back gracefully for 'system' actions or users that no longer resolve (renamed/removed).
export function resolveActor(users: User[], userId: string): { name: string; role: string } {
  if (userId === 'system') return { name: 'System', role: 'System' };
  const user = users.find(u => u.id === userId);
  if (!user) return { name: userId, role: 'Unknown' };
  const cleanName = user.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { name: cleanName, role: user.role };
}

export interface ERPData {
  users: User[];
  products: Product[];
  categories: Category[];
  areas: Area[];
  villages: Village[];
  partnerTypes: PartnerType[];
  assetTypes: AssetType[];
  storePricing: StorePricing[];
  suppliers: Supplier[];
  stores: Store[];
  trucks: Truck[];
  warehouse_inventory: WarehouseInventory[];
  truck_inventory: TruckInventory[];
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  notifications: AppNotification[];
  purchases: Purchase[];
  purchaseOrderRequests: PurchaseOrderRequest[];
  visits: any[];
  preBookingOrders: PreBookingOrder[];
  syncQueue: SyncQueueItem[];
  isOffline: boolean;
  qrCodeSettings: {
    image_url: string;
    is_enabled: boolean;
  };
  companyProfile: {
    name: string;
    gstin: string;
    phone: string;
    email: string;
  };
  auditLogs: ERPAuditLog[];
  rolePermissions: RolePermission[];
  userPermissions: UserPermission[];
}

// Empty placeholder shown before login (no session yet, nothing to fetch).
export function emptyErpData(): ERPData {
  return {
    users: [], products: [], categories: [], areas: [], villages: [], partnerTypes: [], assetTypes: [], storePricing: [], suppliers: [], stores: [], trucks: [],
    warehouse_inventory: [], truck_inventory: [], orders: [], invoices: [], payments: [],
    notifications: [], purchases: [], purchaseOrderRequests: [], visits: [], preBookingOrders: [], syncQueue: [],
    isOffline: false, qrCodeSettings: { image_url: '', is_enabled: true },
    companyProfile: { name: 'Mayben traders', gstin: '27AAAAA1111A1Z1', phone: '+91 73736 74757', email: 'support@maybentraders.in' },
    auditLogs: [], rolePermissions: [], userPermissions: [],
  };
}

// Loads the full application dataset from the backend REST API (replacing
// the old AsyncStorage-backed local blob). Requires a valid auth session.
export async function loadAllData(): Promise<ERPData> {
  const isOfflineVal = (await AsyncStorage.getItem('erp_is_offline')) === 'true';
  const syncQueue = (await AsyncStorage.getItem('erp_sync_queue')) as string | null;

  const [
    users, products, categories, areas, villages, partnerTypes, assetTypes, storePricing, suppliers, stores, trucks, warehouse_inventory,
    truck_inventory, orders, invoices, payments, notifications,
    purchases, purchaseOrderRequests, visits, preBookingOrders, qrCodeSettings, companyProfile, auditLogs, rolePermissions, userPermissions,
  ] = await Promise.all([
    usersApi.list(),
    productsApi.list(),
    categoriesApi.list(),
    areasApi.list(),
    villagesApi.list(),
    partnerTypesApi.list(),
    assetTypesApi.list(),
    storePricingApi.list(),
    suppliersApi.list(),
    storesApi.list(),
    trucksApi.list(),
    warehouseApi.listInventory(),
    dispatchApi.listAllTruckInventory(),
    ordersApi.list(),
    ordersApi.listInvoices(),
    paymentsApi.list(),
    notificationsApi.list(),
    purchasesApi.list(),
    purchaseOrderRequestsApi.list(),
    storesApi.listVisits(),
    preBookingsApi.list(),
    settingsApi.getQr(),
    settingsApi.getCompanyProfile(),
    settingsApi.listAuditLogs(),
    settingsApi.listPermissions(),
    settingsApi.listUserPermissions(),
  ]);

  // Keeps pdfTemplate.ts's brand getters (used by every PDF/Excel export,
  // none of which carry a companyProfile parameter of their own) in sync
  // with the backend on every load - see configureBrandProfile's own
  // comment for why this indirection exists instead of threading the value
  // through every builder function's signature.
  configureBrandProfile(companyProfile);

  return {
    users, products, categories, areas, villages, partnerTypes, assetTypes, storePricing, suppliers, stores, trucks, warehouse_inventory,
    truck_inventory, orders, invoices, payments, notifications,
    purchases, purchaseOrderRequests, visits, preBookingOrders,
    syncQueue: syncQueue ? JSON.parse(syncQueue) : [],
    isOffline: isOfflineVal, qrCodeSettings, companyProfile, auditLogs, rolePermissions, userPermissions,
  };
}

// The offline sync queue and the offline toggle are the only pieces of state
// that remain genuinely device-local (everything else now lives in MySQL).
export async function saveSyncQueue(queue: SyncQueueItem[]) {
  await AsyncStorage.setItem('erp_sync_queue', JSON.stringify(queue));
}

export async function saveOfflineFlag(isOffline: boolean) {
  await AsyncStorage.setItem('erp_is_offline', isOffline ? 'true' : 'false');
}

export async function clearAllData() {
  await AsyncStorage.clear();
}
