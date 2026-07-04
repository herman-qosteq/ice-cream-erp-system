import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User, Product, Supplier, Store, Truck, WarehouseInventory, TruckInventory,
  Order, Invoice, Payment, AppNotification, SyncQueueItem, CreditLedger, Purchase, PreBookingOrder
} from './types';
import {
  INITIAL_USERS, INITIAL_PRODUCTS, INITIAL_SUPPLIERS, INITIAL_STORES,
  INITIAL_TRUCKS, INITIAL_WAREHOUSE_INVENTORY, INITIAL_TRUCK_INVENTORIES,
  INITIAL_ORDERS, INITIAL_INVOICES, INITIAL_PAYMENTS, INITIAL_NOTIFICATIONS
} from './data';

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
  visits: any[];
  preBookingOrders: PreBookingOrder[];
  syncQueue: SyncQueueItem[];
  isOffline: boolean;
  qrCodeSettings: {
    image_url: string;
    is_enabled: boolean;
  };
  auditLogs: ERPAuditLog[];
}

async function getOrSeed<T>(key: string, seed: T): Promise<T> {
  const val = await AsyncStorage.getItem(key);
  if (val === null) {
    await AsyncStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(val);
  } catch (e) {
    return seed;
  }
}

// Initialise storage if it does not exist
export async function loadAllData(): Promise<ERPData> {
  const isOfflineVal = (await AsyncStorage.getItem('erp_is_offline')) === 'true';

  const qrSettingsSeed = {
    image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=distributor@ic-erp&pn=Ice%20Cream%20Distributors&am=0&cu=INR',
    is_enabled: true
  };

  const warehouseSeedActor = resolveActor(INITIAL_USERS, 'u3');
  const initialAuditLogs: ERPAuditLog[] = [
    {
      id: 'a1',
      action: 'STOCK_RECEIVE',
      entity_type: 'Supplier',
      entity_id: 's1',
      user_id: 'u3',
      user_name: warehouseSeedActor.name,
      user_role: warehouseSeedActor.role,
      timestamp: '2026-06-25T09:00:00',
      details: 'Received raw goods from Golden Valley Creamery Inc. into Warehouse.'
    },
    {
      id: 'a2',
      action: 'LOAD_TRUCK',
      entity_type: 'Truck',
      entity_id: 't1',
      user_id: 'u3',
      user_name: warehouseSeedActor.name,
      user_role: warehouseSeedActor.role,
      timestamp: '2026-06-26T06:00:00',
      details: 'Loaded 200 Vanilla Cups and 45 Strawberry Sticks onto NY-TX-4521 (Truck 1).'
    }
  ];

  const initialPurchases: Purchase[] = [
    {
      id: 'pur1',
      supplier_id: 's1',
      invoice_number: 'SUP-INV-889',
      date: '2026-06-25',
      items: [
        { product_id: 'p1', quantity: 1000, purchase_price: 0.80 },
        { product_id: 'p2', quantity: 500, purchase_price: 1.10 }
      ]
    }
  ];

  const [
    users, products, suppliers, stores, trucks, warehouse_inventory,
    truck_inventory, orders, invoices, payments, notifications,
    purchases, visits, preBookingOrders, syncQueue, qrCodeSettings, auditLogs
  ] = await Promise.all([
    getOrSeed<User[]>('erp_users', INITIAL_USERS),
    getOrSeed<Product[]>('erp_products', INITIAL_PRODUCTS),
    getOrSeed<Supplier[]>('erp_suppliers', INITIAL_SUPPLIERS),
    getOrSeed<Store[]>('erp_stores', INITIAL_STORES),
    getOrSeed<Truck[]>('erp_trucks', INITIAL_TRUCKS),
    getOrSeed<WarehouseInventory[]>('erp_warehouse_inventory', INITIAL_WAREHOUSE_INVENTORY),
    getOrSeed<TruckInventory[]>('erp_truck_inventory', INITIAL_TRUCK_INVENTORIES),
    getOrSeed<Order[]>('erp_orders', INITIAL_ORDERS),
    getOrSeed<Invoice[]>('erp_invoices', INITIAL_INVOICES),
    getOrSeed<Payment[]>('erp_payments', INITIAL_PAYMENTS),
    getOrSeed<AppNotification[]>('erp_notifications', INITIAL_NOTIFICATIONS),
    getOrSeed<Purchase[]>('erp_purchases', initialPurchases),
    getOrSeed<any[]>('erp_visits', []),
    getOrSeed<PreBookingOrder[]>('erp_prebooking_orders', []),
    getOrSeed<SyncQueueItem[]>('erp_sync_queue', []),
    getOrSeed<any>('erp_qr_code', qrSettingsSeed),
    getOrSeed<ERPAuditLog[]>('erp_audit_logs', initialAuditLogs),
  ]);

  return {
    users, products, suppliers, stores, trucks, warehouse_inventory,
    truck_inventory, orders, invoices, payments, notifications,
    purchases, visits, preBookingOrders, syncQueue,
    isOffline: isOfflineVal, qrCodeSettings, auditLogs
  };
}

export async function saveData(key: string, data: any) {
  await AsyncStorage.setItem(key, JSON.stringify(data));
}

export async function saveAllDataToLocalStorage(erpData: ERPData) {
  await Promise.all([
    saveData('erp_users', erpData.users),
    saveData('erp_products', erpData.products),
    saveData('erp_suppliers', erpData.suppliers),
    saveData('erp_stores', erpData.stores),
    saveData('erp_trucks', erpData.trucks),
    saveData('erp_warehouse_inventory', erpData.warehouse_inventory),
    saveData('erp_truck_inventory', erpData.truck_inventory),
    saveData('erp_orders', erpData.orders),
    saveData('erp_invoices', erpData.invoices),
    saveData('erp_payments', erpData.payments),
    saveData('erp_notifications', erpData.notifications),
    saveData('erp_purchases', erpData.purchases),
    saveData('erp_visits', erpData.visits),
    saveData('erp_prebooking_orders', erpData.preBookingOrders),
    saveData('erp_sync_queue', erpData.syncQueue),
    saveData('erp_qr_code', erpData.qrCodeSettings),
    AsyncStorage.setItem('erp_is_offline', erpData.isOffline ? 'true' : 'false'),
  ]);
}

export async function clearAllData() {
  await AsyncStorage.clear();
}

export function logAudit(
  erpData: ERPData,
  action: string,
  entity_type: string,
  entity_id: string,
  user_id: string,
  details: string
): ERPData {
  const actor = resolveActor(erpData.users, user_id);
  const newLog: ERPAuditLog = {
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    action,
    entity_type,
    entity_id,
    user_id,
    user_name: actor.name,
    user_role: actor.role,
    timestamp: new Date().toISOString(),
    details
  };
  const updatedLogs = [newLog, ...erpData.auditLogs];
  const updatedData = { ...erpData, auditLogs: updatedLogs };
  saveData('erp_audit_logs', updatedLogs);
  return updatedData;
}
