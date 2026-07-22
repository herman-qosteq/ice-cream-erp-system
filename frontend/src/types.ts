export interface User {
  id: string;
  name: string;
  phone: string;
  role: 'Admin' | 'Salesperson' | 'Warehouse';
  password_hash: string;
  status: 'Active' | 'Inactive';
}

// Admin-toggleable feature flag scoped to a role (e.g. granting Salesperson
// access to the GST/non-GST order toggle). A role/feature pair with no row
// is treated as disabled.
export interface RolePermission {
  role: 'Admin' | 'Salesperson' | 'Warehouse';
  feature: string;
  enabled: boolean;
}

export interface ScheduledPrice {
  id: string;
  purchase_price: number;
  selling_price: number;
  effective_date: string;
  applied: boolean;
}

export interface Category {
  id: string;
  name: string;
  status: 'Active' | 'Inactive';
}

export interface Area {
  id: string;
  name: string;
}

export interface StorePricing {
  id: string;
  store_id: string;
  product_id: string;
  wholesale_discount_pct?: number;
  retail_discount_pct?: number;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  brand: string;
  description: string;
  image_url: string;
  mrp: number;
  purchase_discount_pct: number;
  wholesale_discount_pct: number;
  retail_discount_pct: number;
  // Derived from mrp and the discount % fields above (computed server-side);
  // kept here so existing screens can keep reading them directly.
  purchase_price: number;
  wholesale_price: number;
  selling_price: number;
  tax_pct: number;
  status: 'Active' | 'Inactive';
  unit_value: number;
  unit_type: 'ml' | 'L' | 'g' | 'kg' | 'pcs';
  expiry_date?: string; // for expiry alerts simulation
  scheduled_prices?: ScheduledPrice[];
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  status: 'Active' | 'Inactive';
}

export interface Purchase {
  id: string;
  supplier_id: string;
  invoice_number: string;
  date: string;
  // The supplier's own bill/price-list sent back after packing the order -
  // stored as a base64 data URI, since there's no object storage backend.
  // Can be a photo, PDF, or spreadsheet; bill_file_type is a MIME type.
  bill_file_url?: string;
  bill_file_name?: string;
  bill_file_type?: string;
  items: {
    product_id: string;
    quantity: number;
    purchase_price: number;
    mfg_date?: string;
    expiry_date?: string;
  }[];
}

// A Purchase Order Excel generated from the Warehouse page (product list, no
// rates) and sent to a supplier - saved so it can later pre-fill Receive
// Stock once the supplier packs the order and sends prices back, instead of
// retyping the same product/quantity list.
export interface PurchaseOrderRequest {
  id: string;
  order_ref: string;
  supplier_id: string;
  status: 'Pending' | 'Fulfilled' | 'Cancelled';
  created_at: string;
  fulfilled_purchase_id?: string;
  items: { product_id: string; order_case: number }[];
}

export interface WarehouseInventory {
  product_id: string;
  available_qty: number;
  reserved_qty: number;
  damaged_qty: number;
  expired_qty: number;
}

export interface Truck {
  id: string;
  vehicle_number: string;
  driver_user_id: string;
  route: string;
  area: string;
  status: 'Active' | 'Inactive';
}

export interface TruckInventory {
  truck_id: string;
  product_id: string;
  quantity: number;
}

export interface InventoryTransfer {
  id: string;
  from_type: 'supplier' | 'warehouse' | 'truck';
  from_id: string;
  to_type: 'warehouse' | 'truck' | 'store';
  to_id: string;
  product_id: string;
  quantity: number;
  timestamp: string;
  transferred_by: string;
  reason?: string;
}

export interface Store {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  alt_phone: string;
  address: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  gst_number: string;
  credit_limit: number;
  outstanding_balance: number;
  refill_frequency: 'Weekly' | '15 Days' | 'Monthly' | 'Custom';
  custom_days?: number;
  last_purchase_date: string;
  next_refill_date: string;
  ranking: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  status: 'Active' | 'Inactive';
}

export interface StoreVisit {
  id: string;
  store_id: string;
  salesperson_id: string;
  date: string;
  notes: string;
  follow_up_date?: string;
  completed: boolean;
}

export interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_pct: number;
}

export interface Order {
  id: string;
  store_id: string;
  salesperson_id: string;
  truck_id: string;
  status: 'Draft' | 'Confirmed' | 'Delivered' | 'Cancelled';
  created_at: string;
  items: OrderItem[];
}

export interface PreBookingItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_pct: number;
}

export interface PreBookingOrder {
  id: string;
  store_id: string;
  salesperson_id: string;
  created_at: string;
  scheduled_delivery_date: string;
  status: 'Booked' | 'Delivered' | 'Cancelled';
  items: PreBookingItem[];
  notes?: string;
  dispatched_items?: { product_id: string; quantity: number }[];
  // Set once delivered - the real Order this booking produced. Lets the
  // Admin-only Edit/Delete-delivered actions know there's something to
  // operate on (older, pre-existing deliveries won't have this).
  fulfilled_order_id?: string;
}

export interface Invoice {
  id: string;
  order_id: string;
  invoice_number: string;
  total: number;
  tax: number;
  grand_total: number;
  // Indian tax-invoice "Round Off": grand_total minus the exact (unrounded)
  // total+tax. Optional because offline-queued/legacy invoices built before
  // this field existed won't have it - treat as 0 when absent.
  round_off?: number;
  created_at: string;
  paid_amount?: number;
  payment_status?: 'Paid' | 'Partial' | 'Unpaid' | 'Credit';
  payment_method?: string;
}

export interface Payment {
  id: string;
  store_id: string;
  order_id?: string;
  amount: number;
  method: 'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit';
  date: string;
  collected_by: string;
}

export interface CreditLedger {
  id: string;
  store_id: string;
  amount: number;
  type: 'credit' | 'debit';
  date: string;
  reference: string;
}

// What kind of record entity_id points at, so a notification tap knows which
// screen to switch to and which record to open there. Absent (undefined) for
// notification types with nothing to navigate to, e.g. 'system'.
export type NotificationEntityType = 'order' | 'prebooking' | 'purchase' | 'store' | 'supplier' | 'product' | 'user' | 'truck';

export interface AppNotification {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'expiry' | 'refill' | 'payment_due' | 'payment_received' | 'credit_exceeded'
    | 'new_order' | 'order_update' | 'delivery' | 'partner_update' | 'product_update' | 'user_update' | 'stock_update' | 'system';
  message: string;
  entity_type?: NotificationEntityType | null;
  entity_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SyncQueueItem {
  id: string;
  action: string; // e.g. 'CREATE_ORDER', 'RECORD_PAYMENT', 'REGISTER_STORE'
  payload: any;
  timestamp: string;
}

export interface QRCodeSettings {
  image_url: string; // base64 or placeholder URL
  is_enabled: boolean;
}
