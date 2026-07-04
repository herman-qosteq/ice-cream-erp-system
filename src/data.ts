import { User, Product, Supplier, Store, Truck, WarehouseInventory, TruckInventory, Payment, Order, Invoice, AppNotification, Purchase, Category } from './types';

// Initial Product Categories
export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat1', name: 'Cups' },
  { id: 'cat2', name: 'Sticks' },
  { id: 'cat3', name: 'Tubs' },
  { id: 'cat4', name: 'Bars' },
  { id: 'cat5', name: 'Popsicles' }
];

// Initial Users List
export const INITIAL_USERS: User[] = [
  {
    id: 'u1',
    name: 'Sarah Jenkins (Admin)',
    phone: '+1 (555) 123-4567',
    role: 'Admin',
    password_hash: 'admin',
    status: 'Active'
  },
  {
    id: 'u2',
    name: 'David Miller (Driver)',
    phone: '+1 (555) 987-6543',
    role: 'Salesperson',
    password_hash: 'driver',
    status: 'Active'
  },
  {
    id: 'u3',
    name: 'Robert Chen (Warehouse)',
    phone: '+1 (555) 456-7890',
    role: 'Warehouse',
    password_hash: 'warehouse',
    status: 'Active'
  },
  {
    id: 'u4',
    name: 'Alice Cooper (Backup Driver)',
    phone: '+1 (555) 234-5678',
    role: 'Salesperson',
    password_hash: 'driver2',
    status: 'Active'
  }
];

// Initial Products List
export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Classic Vanilla Cup (100ml)',
    code: 'IC-VAN-100',
    category: 'Cups',
    brand: 'Gelato Peaks',
    description: 'Smooth, rich vanilla bean ice cream cup.',
    image_url: 'https://images.unsplash.com/photo-1570145820259-b5b80c5c8bd6?w=200&auto=format&fit=crop',
    purchase_price: 0.80,
    selling_price: 1.50,
    tax_pct: 12,
    status: 'Active',
    unit_value: 100,
    unit_type: 'ml'
  },
  {
    id: 'p2',
    name: 'Strawberry Dream Stick',
    code: 'IC-STR-STK',
    category: 'Sticks',
    brand: 'Gelato Peaks',
    description: 'Strawberry flavored ice cream coated in strawberry crunch.',
    image_url: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=200&auto=format&fit=crop',
    purchase_price: 1.10,
    selling_price: 2.20,
    tax_pct: 12,
    status: 'Active',
    unit_value: 1,
    unit_type: 'pcs'
  },
  {
    id: 'p3',
    name: 'Belgian Chocolate Tub (1L)',
    code: 'IC-CHO-TUB',
    category: 'Tubs',
    brand: 'Creamy Royalty',
    description: 'Premium dark Belgian chocolate tub for family sharing.',
    image_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&auto=format&fit=crop',
    purchase_price: 3.50,
    selling_price: 6.99,
    tax_pct: 18,
    status: 'Active',
    unit_value: 1,
    unit_type: 'L'
  },
  {
    id: 'p4',
    name: 'Mint Chocolate Chip Bar',
    code: 'IC-MNT-BAR',
    category: 'Bars',
    brand: 'Frosty Leaf',
    description: 'Refreshing mint ice cream with dark chocolate chunks.',
    image_url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=200&auto=format&fit=crop',
    purchase_price: 1.20,
    selling_price: 2.50,
    tax_pct: 12,
    status: 'Active',
    unit_value: 1,
    unit_type: 'pcs'
  },
  {
    id: 'p5',
    name: 'Mango Magic Popsicle',
    code: 'IC-MNG-POP',
    category: 'Popsicles',
    brand: 'Fruit Splash',
    description: '100% real Alphonso mango pulp frozen treat.',
    image_url: 'https://images.unsplash.com/photo-1505394033343-40a290cf7a0c?w=200&auto=format&fit=crop',
    purchase_price: 0.60,
    selling_price: 1.25,
    tax_pct: 5,
    status: 'Active',
    unit_value: 1,
    unit_type: 'pcs'
  },
  {
    id: 'p6',
    name: 'Salted Caramel Crunch Tub (1L)',
    code: 'IC-CAR-TUB',
    category: 'Tubs',
    brand: 'Creamy Royalty',
    description: 'Rich buttery caramel flavor with sea salt swirls and praline crunch.',
    image_url: 'https://images.unsplash.com/photo-1580915411954-282cb1bc3978?w=200&auto=format&fit=crop',
    purchase_price: 3.75,
    selling_price: 7.50,
    tax_pct: 18,
    status: 'Active',
    unit_value: 1,
    unit_type: 'L'
  },
  {
    id: 'p7',
    name: 'Matcha Green Tea Stick',
    code: 'IC-MTC-STK',
    category: 'Sticks',
    brand: 'Frosty Leaf',
    description: 'Authentic Kyoto Uji matcha flavor with white chocolate shell.',
    image_url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=200&auto=format&fit=crop',
    purchase_price: 1.40,
    selling_price: 3.00,
    tax_pct: 12,
    status: 'Active',
    unit_value: 1,
    unit_type: 'pcs'
  }
];

// Initial Suppliers
export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 's1',
    name: 'Golden Valley Creamery Inc.',
    contact_person: 'Johnathan Myers',
    phone: '+1 (800) 555-8811',
    email: 'supply@goldenvalley.com',
    address: '450 Pasture Lane, Milkville, WI 53001'
  },
  {
    id: 's2',
    name: 'Belgian Cocoa Imports Ltd.',
    contact_person: 'Marta De Vos',
    phone: '+1 (800) 555-4422',
    email: 'imports@belgiancocoa.co',
    address: '77 Dockside Blvd, Suite 4B, Boston, MA 02110'
  },
  {
    id: 's3',
    name: 'Organic Fruit Concentrates Co.',
    contact_person: 'Elena Rostova',
    phone: '+1 (888) 777-6655',
    email: 'orders@organicfruit.com',
    address: '109 Orchard Road, Yakima, WA 98901'
  }
];

// Helper to calculate next dates relative to the current local time: 2026-06-27
const dateDaysAgo = (days: number): string => {
  const d = new Date('2026-06-27T10:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const dateDaysFromNow = (days: number): string => {
  const d = new Date('2026-06-27T10:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

// Initial Stores
export const INITIAL_STORES: Store[] = [
  {
    id: 'st1',
    name: 'Sweet Tooth Emporium',
    owner_name: 'Angela Basset',
    phone: '+1 (555) 771-2299',
    alt_phone: '+1 (555) 771-2288',
    address: '742 Sweet Street',
    area: 'Downtown',
    city: 'Metro City',
    state: 'New York',
    pincode: '10001',
    gst_number: '22AAAAA0000A1Z1',
    credit_limit: 5000,
    outstanding_balance: 1450,
    refill_frequency: 'Weekly',
    last_purchase_date: dateDaysAgo(8), // Overdue by 1 day (Weekly)
    next_refill_date: dateDaysAgo(1),
    ranking: 'Platinum'
  },
  {
    id: 'st2',
    name: 'Corner Grocery & Deli',
    owner_name: 'Raj Patel',
    phone: '+1 (555) 303-9182',
    alt_phone: '',
    address: '1105 Corner Avenue',
    area: 'Westside',
    city: 'Metro City',
    state: 'New York',
    pincode: '10012',
    gst_number: '22BBBBB1111B2Z2',
    credit_limit: 2000,
    outstanding_balance: 850,
    refill_frequency: 'Weekly',
    last_purchase_date: dateDaysAgo(7), // Due Today
    next_refill_date: dateDaysFromNow(0),
    ranking: 'Gold'
  },
  {
    id: 'st3',
    name: 'Ocean Breeze Beach Shacks',
    owner_name: 'Gary Soneji',
    phone: '+1 (555) 211-5050',
    alt_phone: '+1 (555) 211-5060',
    address: 'Beachfront Boardwalk Stall #12',
    area: 'Sandy Bay',
    city: 'Coastal Town',
    state: 'New Jersey',
    pincode: '07701',
    gst_number: '34CCCCC2222C3Z3',
    credit_limit: 1000,
    outstanding_balance: 0,
    refill_frequency: 'Weekly',
    last_purchase_date: dateDaysAgo(6), // Due Tomorrow
    next_refill_date: dateDaysFromNow(1),
    ranking: 'Silver'
  },
  {
    id: 'st4',
    name: 'Mega Mart Superstore',
    owner_name: 'District Purchasing Manager',
    phone: '+1 (800) 999-1000',
    alt_phone: '',
    address: '88 Highway Expressway',
    area: 'Suburbs',
    city: 'Metro City',
    state: 'New York',
    pincode: '10450',
    gst_number: '22DDDDD3333D4Z4',
    credit_limit: 15000,
    outstanding_balance: 6200, // Large outstanding
    refill_frequency: '15 Days',
    last_purchase_date: dateDaysAgo(13), // Due in 2 days
    next_refill_date: dateDaysFromNow(2),
    ranking: 'Platinum'
  },
  {
    id: 'st5',
    name: 'The Sundae Palace',
    owner_name: 'Melissa Thorne',
    phone: '+1 (555) 880-1432',
    alt_phone: '',
    address: '32 Cinema Galleria Plaza',
    area: 'North Uptown',
    city: 'Metro City',
    state: 'New York',
    pincode: '10025',
    gst_number: '22EEEEE4444E5Z5',
    credit_limit: 3000,
    outstanding_balance: 150,
    refill_frequency: 'Monthly',
    last_purchase_date: dateDaysAgo(27), // Due in 3 days (Monthly)
    next_refill_date: dateDaysFromNow(3),
    ranking: 'Gold'
  },
  {
    id: 'st6',
    name: 'Little Sprouts Ice Cream Parlor',
    owner_name: 'Timmy Thompson',
    phone: '+1 (555) 443-8822',
    alt_phone: '',
    address: '89 Family Center Blvd',
    area: 'Westside',
    city: 'Metro City',
    state: 'New York',
    pincode: '10014',
    gst_number: '',
    credit_limit: 500,
    outstanding_balance: 450, // High utilization
    refill_frequency: 'Weekly',
    last_purchase_date: dateDaysAgo(32), // Inactive Customer (No purchase in 32 days)
    next_refill_date: dateDaysAgo(25),
    ranking: 'Bronze'
  },
  {
    id: 'st7',
    name: 'Central Park Kiosk',
    owner_name: 'Frankie Valli',
    phone: '+1 (555) 505-1960',
    alt_phone: '',
    address: 'Central Park Walkway East',
    area: 'Downtown',
    city: 'Metro City',
    state: 'New York',
    pincode: '10022',
    gst_number: '',
    credit_limit: 1500,
    outstanding_balance: 0,
    refill_frequency: 'Weekly',
    last_purchase_date: dateDaysAgo(62), // Inactive over 60 days
    next_refill_date: dateDaysAgo(55),
    ranking: 'Bronze'
  }
];

// Initial Trucks Config
export const INITIAL_TRUCKS: Truck[] = [
  {
    id: 't1',
    vehicle_number: 'NY-TX-4521',
    driver_user_id: 'u2', // David Miller
    route: 'Route A - Downtown & Westside',
    area: 'Downtown / Westside'
  },
  {
    id: 't2',
    vehicle_number: 'NY-TX-9876',
    driver_user_id: 'u4', // Alice Cooper
    route: 'Route B - Suburbs & Coastal Highway',
    area: 'Suburbs / Coastal'
  }
];

// Initial Warehouse Inventory
export const INITIAL_WAREHOUSE_INVENTORY: WarehouseInventory[] = [
  { product_id: 'p1', available_qty: 1500, reserved_qty: 120, damaged_qty: 15, expired_qty: 0 },
  { product_id: 'p2', available_qty: 80, reserved_qty: 20, damaged_qty: 5, expired_qty: 12 }, // Low Stock Alert!
  { product_id: 'p3', available_qty: 450, reserved_qty: 50, damaged_qty: 2, expired_qty: 0 },
  { product_id: 'p4', available_qty: 0, reserved_qty: 0, damaged_qty: 10, expired_qty: 25 }, // Out of Stock Alert!
  { product_id: 'p5', available_qty: 2000, reserved_qty: 300, damaged_qty: 40, expired_qty: 0 },
  { product_id: 'p6', available_qty: 300, reserved_qty: 40, damaged_qty: 0, expired_qty: 0 },
  { product_id: 'p7', available_qty: 150, reserved_qty: 15, damaged_qty: 8, expired_qty: 30 } // High Expiry item
];

// Initial Truck Inventory
export const INITIAL_TRUCK_INVENTORIES: TruckInventory[] = [
  // Truck 1 (David's Truck)
  { truck_id: 't1', product_id: 'p1', quantity: 200 },
  { truck_id: 't1', product_id: 'p2', quantity: 45 },
  { truck_id: 't1', product_id: 'p3', quantity: 30 },
  { truck_id: 't1', product_id: 'p5', quantity: 150 },
  { truck_id: 't1', product_id: 'p6', quantity: 15 },
  // Truck 2 (Alice's Truck)
  { truck_id: 't2', product_id: 'p1', quantity: 150 },
  { truck_id: 't2', product_id: 'p3', quantity: 40 },
  { truck_id: 't2', product_id: 'p5', quantity: 200 }
];

// Initial Orders & Historical orders
export const INITIAL_ORDERS: Order[] = [
  {
    id: 'o1',
    store_id: 'st1',
    salesperson_id: 'u2',
    truck_id: 't1',
    status: 'Delivered',
    created_at: dateDaysAgo(8) + 'T11:00:00',
    items: [
      { product_id: 'p1', quantity: 100, unit_price: 1.50, tax_pct: 12 },
      { product_id: 'p2', quantity: 50, unit_price: 2.20, tax_pct: 12 },
      { product_id: 'p3', quantity: 10, unit_price: 6.99, tax_pct: 18 }
    ]
  },
  {
    id: 'o2',
    store_id: 'st4',
    salesperson_id: 'u4',
    truck_id: 't2',
    status: 'Delivered',
    created_at: dateDaysAgo(13) + 'T14:30:00',
    items: [
      { product_id: 'p1', quantity: 500, unit_price: 1.50, tax_pct: 12 },
      { product_id: 'p5', quantity: 800, unit_price: 1.25, tax_pct: 5 },
      { product_id: 'p6', quantity: 100, unit_price: 7.50, tax_pct: 18 }
    ]
  },
  {
    id: 'o3',
    store_id: 'st2',
    salesperson_id: 'u2',
    truck_id: 't1',
    status: 'Confirmed',
    created_at: dateDaysAgo(1) + 'T09:15:00',
    items: [
      { product_id: 'p1', quantity: 120, unit_price: 1.50, tax_pct: 12 },
      { product_id: 'p3', quantity: 15, unit_price: 6.99, tax_pct: 18 }
    ]
  },
  {
    id: 'o4',
    store_id: 'st3',
    salesperson_id: 'u2',
    truck_id: 't1',
    status: 'Draft',
    created_at: dateDaysAgo(0) + 'T14:00:00',
    items: [
      { product_id: 'p2', quantity: 30, unit_price: 2.20, tax_pct: 12 },
      { product_id: 'p5', quantity: 100, unit_price: 1.25, tax_pct: 5 }
    ]
  }
];

// Initial Invoices List
export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv1',
    order_id: 'o1',
    invoice_number: 'INV-2026-0001',
    total: 329.90,
    tax: 44.58,
    grand_total: 374.48,
    created_at: dateDaysAgo(8) + 'T11:05:00',
    paid_amount: 374.48,
    payment_status: 'Paid',
    payment_method: 'UPI'
  },
  {
    id: 'inv2',
    order_id: 'o2',
    invoice_number: 'INV-2026-0002',
    total: 2500.00,
    tax: 265.00,
    grand_total: 2765.00,
    created_at: dateDaysAgo(13) + 'T14:45:00',
    paid_amount: 1500.00,
    payment_status: 'Partial',
    payment_method: 'Bank Transfer'
  }
];

// Initial Payments
export const INITIAL_PAYMENTS: Payment[] = [
  {
    id: 'pay1',
    store_id: 'st1',
    order_id: 'o1',
    amount: 374.48,
    method: 'UPI',
    date: dateDaysAgo(8) + 'T11:30:00',
    collected_by: 'u2'
  },
  {
    id: 'pay2',
    store_id: 'st4',
    order_id: 'o2',
    amount: 1500.00,
    method: 'Bank Transfer',
    date: dateDaysAgo(12) + 'T10:00:00',
    collected_by: 'u4'
  }
];

// Initial Notifications
export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    type: 'low_stock',
    message: 'Strawberry Dream Stick stock is low in the warehouse (80 available). Please order refill from supplier.',
    is_read: false,
    created_at: '2026-06-26T08:30:00'
  },
  {
    id: 'n2',
    type: 'out_of_stock',
    message: 'Mint Chocolate Chip Bar is OUT of stock in the warehouse.',
    is_read: false,
    created_at: '2026-06-25T14:15:00'
  },
  {
    id: 'n3',
    type: 'refill',
    message: 'Sweet Tooth Emporium is OVERDUE for a refill. Last purchase was 8 days ago.',
    is_read: false,
    created_at: '2026-06-27T07:00:00'
  },
  {
    id: 'n4',
    type: 'payment_due',
    message: 'Mega Mart Superstore is close to credit limit (Balance: ₹6,200 / Limit: ₹15,000).',
    is_read: true,
    created_at: '2026-06-24T11:20:00'
  }
];

// Calculate Customer Health Score based on parameters: Outstanding, Ranking, Refill delay
export function calculateStoreHealthScore(store: Store): number {
  let score = 100;
  
  // Outstanding limit ratio
  const limitRatio = store.outstanding_balance / (store.credit_limit || 1);
  if (limitRatio > 0.8) score -= 30;
  else if (limitRatio > 0.5) score -= 15;
  else if (limitRatio > 0.2) score -= 5;
  
  // Overdue status
  const nextRefill = new Date(store.next_refill_date);
  const today = new Date('2026-06-27');
  if (nextRefill < today) {
    const diffDays = Math.ceil((today.getTime() - nextRefill.getTime()) / (1000 * 60 * 60 * 24));
    score -= Math.min(25, diffDays * 5); // lose 5 points per overdue day, max 25
  }
  
  // No purchases at all
  if (!store.last_purchase_date) {
    score = 50;
  }
  
  return Math.max(0, score);
}

// Get store metrics
export function getStoreMetrics(storeId: string, ordersList: Order[]) {
  const storeOrders = ordersList.filter(o => o.store_id === storeId && o.status === 'Delivered');
  const count = storeOrders.length;
  
  let totalRevenue = 0;
  let totalCost = 0;
  
  storeOrders.forEach(o => {
    o.items.forEach(item => {
      const cost = getLatestPurchasePrice(item.product_id);
      totalRevenue += item.quantity * item.unit_price;
      totalCost += item.quantity * cost;
    });
  });
  
  const profit = totalRevenue - totalCost;
  const avgOrderVal = count > 0 ? totalRevenue / count : 0;
  
  return {
    orderCount: count,
    revenue: parseFloat(totalRevenue.toFixed(2)),
    profit: parseFloat(profit.toFixed(2)),
    avgOrderValue: parseFloat(avgOrderVal.toFixed(2))
  };
}

export function getLatestPurchasePrice(productId: string, purchases: Purchase[] = []): number {
  const latestPurchasedItem = [...purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap(purchase => purchase.items.map(item => ({ ...item, date: purchase.date })))
    .find(item => item.product_id === productId);

  if (latestPurchasedItem) {
    return latestPurchasedItem.purchase_price;
  }

  const product = INITIAL_PRODUCTS.find(p => p.id === productId);
  return product?.purchase_price ?? 0;
}

export function calculateDeliveredOrderProfit(order: Order, purchases: Purchase[]): number {
  return order.items.reduce((sum, item) => {
    const costPrice = getLatestPurchasePrice(item.product_id, purchases);
    const revenue = item.unit_price * item.quantity;
    const cost = costPrice * item.quantity;
    return sum + (revenue - cost);
  }, 0);
}



export function getAveragePurchasePrice(productId: string, purchases: Purchase[] = []): number {
  const purchaseItems = purchases
    .flatMap(purchase => purchase.items)
    .filter(item => item.product_id === productId);

  const totalQty = purchaseItems.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQty <= 0) {
    return getLatestPurchasePrice(productId, purchases);
  }

  const totalCost = purchaseItems.reduce((sum, item) => sum + (item.quantity * item.purchase_price), 0);
  return totalCost / totalQty;
}
