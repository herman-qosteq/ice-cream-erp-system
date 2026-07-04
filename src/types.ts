export interface User {
  id: string;
  name: string;
  phone: string;
  role: 'Admin' | 'Salesperson' | 'Warehouse';
  password_hash: string;
  status: 'Active' | 'Inactive';
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
}

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  brand: string;
  description: string;
  image_url: string;
  purchase_price: number;
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
}

export interface Purchase {
  id: string;
  supplier_id: string;
  invoice_number: string;
  date: string;
  items: {
    product_id: string;
    quantity: number;
    purchase_price: number;
    mfg_date?: string;
    expiry_date?: string;
  }[];
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
}

export interface Invoice {
  id: string;
  order_id: string;
  invoice_number: string;
  total: number;
  tax: number;
  grand_total: number;
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

export interface AppNotification {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'expiry' | 'refill' | 'payment_due' | 'payment_received' | 'credit_exceeded'
    | 'new_order' | 'order_update' | 'delivery' | 'partner_update' | 'product_update' | 'user_update' | 'stock_update' | 'system';
  message: string;
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
