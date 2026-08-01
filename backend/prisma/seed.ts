// Demo dataset for FrostyFlow Ice Cream Distributors — a Pune, Maharashtra
// based ice cream distribution business. Indian names, addresses, phone
// numbers (+91), GSTIN-format tax IDs and INR pricing throughout, so the
// seeded data is representative of a real Indian client demo.
//
// TODAY stays fixed (rather than tracking the real clock) because
// calculateStoreHealthScore() in the frontend (src/data.ts) computes
// overdue/health-score logic against this exact same anchor date — moving
// one without the other would silently break the "overdue store" and
// "credit near limit" demo scenarios below.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Demo login passwords stay the same ('admin', 'driver', etc.) - only the
// at-rest storage changes from plaintext to a proper bcrypt hash.
const hash = (plain: string) => bcrypt.hashSync(plain, 10);

const TODAY = new Date('2026-06-27T10:00:00');

function daysAgo(days: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  // ---- Categories ----
  const categories = [
    { id: 'cat1', name: 'Cups' },
    { id: 'cat2', name: 'Sticks' },
    { id: 'cat3', name: 'Tubs' },
    { id: 'cat4', name: 'Bars' },
    { id: 'cat5', name: 'Popsicles' },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { id: c.id }, update: {}, create: c });
  }

  // ---- District Areas ----
  // Tamil Nadu's 38 districts, offered on the Store form's "District Area"
  // dropdown (see AdminSales.tsx's "Manage District Areas" screen).
  const areas = [
    'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
    'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanniyakumari', 'Karur',
    'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris',
    'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga',
    'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
    'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore',
    'Viluppuram', 'Virudhunagar',
  ].map((name, i) => ({ id: `tn_area${i + 1}`, name }));
  for (const a of areas) {
    await prisma.area.upsert({ where: { id: a.id }, update: { name: a.name }, create: a });
  }

  // ---- Partner Types ----
  // Offered on the Store form's "Partner Type" dropdown. 'Retail Shop' is the
  // default new/existing stores backfill to (Store.partner_type's DB
  // default) and can never be deleted (see partnerTypes.service.ts).
  const partnerTypes = [
    'Retail Shop', 'Auto Shop', 'Freezer Box Partner', 'Distributor', 'Super Market', 'Restaurant', 'Others',
  ].map((name, i) => ({ id: `ptype${i + 1}`, name }));
  for (const pt of partnerTypes) {
    await prisma.partnerType.upsert({ where: { id: pt.id }, update: { name: pt.name }, create: pt });
  }

  // ---- Asset Types ----
  // Offered on the Asset form's "Asset Type" dropdown.
  const assetTypes = ['Freezer Box', 'Refrigerator', 'Deep Freezer', 'Ice Cream Cart'].map((name, i) => ({
    id: `atype${i + 1}`,
    name,
  }));
  for (const at of assetTypes) {
    await prisma.assetType.upsert({ where: { id: at.id }, update: { name: at.name }, create: at });
  }

  // ---- Users ----
  const users = [
    { id: 'u1', name: 'Aditya Sharma (Admin)', phone: '+91 7373674757', role: 'Admin' as const, password_hash: hash('admin'), status: 'Active' as const },
    { id: 'u2', name: 'Rohit Verma (Driver)', phone: '+91 91234 56789', role: 'Salesperson' as const, password_hash: hash('driver'), status: 'Active' as const },
    { id: 'u3', name: 'Suresh Iyer (Warehouse)', phone: '+91 99887 76655', role: 'Warehouse' as const, password_hash: hash('warehouse'), status: 'Active' as const },
    { id: 'u4', name: 'Vikram Singh (Backup Driver)', phone: '+91 90909 12345', role: 'Salesperson' as const, password_hash: hash('driver2'), status: 'Active' as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { id: u.id }, update: {}, create: u });
  }

  // ---- Products (+ warehouse_inventory) ----
  // GST on ice cream (HSN 2105) is a flat 18% in India, so every SKU below
  // carries the same tax_pct rather than the mixed rates a mock US catalog
  // would use.
  const products = [
    // Percentage-based pricing: mrp is the base list price, and
    // purchase/wholesale/retail prices are each mrp discounted by their %.
    { id: 'p1', name: 'Classic Vanilla Cup (100ml)', code: 'IC-VAN-100', category: 'Cups', brand: 'FrostyFlow Creamery', description: 'Smooth, rich vanilla bean ice cream cup.', image_url: 'https://images.unsplash.com/photo-1570145820259-b5b80c5c8bd6?w=200&auto=format&fit=crop', mrp: 28.00, purchase_discount_pct: 50.00, wholesale_discount_pct: 28.57, retail_discount_pct: 0, tax_pct: 18, unit_value: 100, unit_type: 'ml' as const, pieces_per_box: 24 },
    { id: 'p2', name: 'Kesar Pista Cup (100ml)', code: 'IC-KSR-100', category: 'Cups', brand: 'FrostyFlow Creamery', description: 'Saffron and pistachio ice cream cup, a classic Indian favourite.', image_url: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=200&auto=format&fit=crop', mrp: 35.00, purchase_discount_pct: 48.57, wholesale_discount_pct: 25.71, retail_discount_pct: 0, tax_pct: 18, unit_value: 100, unit_type: 'ml' as const, pieces_per_box: 24 },
    { id: 'p3', name: 'Chocolate Crunch Stick', code: 'IC-CHO-STK', category: 'Sticks', brand: 'FrostyFlow Creamery', description: 'Chocolate ice cream stick coated in a crunchy chocolate shell.', image_url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=200&auto=format&fit=crop', mrp: 20.00, purchase_discount_pct: 50.00, wholesale_discount_pct: 25.00, retail_discount_pct: 0, tax_pct: 18, unit_value: 1, unit_type: 'pcs' as const, pieces_per_box: 24 },
    { id: 'p4', name: 'Mango Kulfi Stick', code: 'IC-KUL-STK', category: 'Sticks', brand: 'Rajwada Kulfi', description: 'Traditional mawa-mango kulfi on a stick.', image_url: 'https://images.unsplash.com/photo-1580915411954-282cb1bc3978?w=200&auto=format&fit=crop', mrp: 25.00, purchase_discount_pct: 52.00, wholesale_discount_pct: 28.00, retail_discount_pct: 0, tax_pct: 18, unit_value: 1, unit_type: 'pcs' as const, pieces_per_box: 20 },
    { id: 'p5', name: 'Butterscotch Tub (1L)', code: 'IC-BUT-TUB', category: 'Tubs', brand: 'Creamy Royale', description: 'Buttery caramel ice cream loaded with praline crunch, family tub.', image_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&auto=format&fit=crop', mrp: 199.00, purchase_discount_pct: 44.72, wholesale_discount_pct: 24.62, retail_discount_pct: 0, tax_pct: 18, unit_value: 1, unit_type: 'L' as const, pieces_per_box: 6 },
    { id: 'p6', name: 'Belgian Chocolate Tub (1L)', code: 'IC-CHO-TUB', category: 'Tubs', brand: 'Creamy Royale', description: 'Premium dark Belgian chocolate tub for family sharing.', image_url: 'https://images.unsplash.com/photo-1580915411954-282cb1bc3978?w=200&auto=format&fit=crop', mrp: 230.00, purchase_discount_pct: 43.48, wholesale_discount_pct: 23.91, retail_discount_pct: 0, tax_pct: 18, unit_value: 1, unit_type: 'L' as const, pieces_per_box: 6 },
    { id: 'p7', name: 'Alphonso Mango Bar', code: 'IC-MNG-BAR', category: 'Bars', brand: 'Ratnagiri Fresh', description: '100% real Ratnagiri Alphonso mango pulp bar.', image_url: 'https://images.unsplash.com/photo-1505394033343-40a290cf7a0c?w=200&auto=format&fit=crop', mrp: 30.00, purchase_discount_pct: 50.00, wholesale_discount_pct: 26.67, retail_discount_pct: 0, tax_pct: 18, unit_value: 1, unit_type: 'pcs' as const, pieces_per_box: 24 },
    { id: 'p8', name: 'Rose Falooda Popsicle', code: 'IC-ROS-POP', category: 'Popsicles', brand: 'Fruity Splash', description: 'Rose and falooda flavoured frozen popsicle.', image_url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=200&auto=format&fit=crop', mrp: 18.00, purchase_discount_pct: 55.56, wholesale_discount_pct: 33.33, retail_discount_pct: 0, tax_pct: 18, unit_value: 1, unit_type: 'pcs' as const, pieces_per_box: 30 },
  ];
  const categoryIdByName = Object.fromEntries(categories.map(c => [c.name, c.id]));
  for (const p of products) {
    const { category, ...rest } = p;
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...rest, status: 'Active', category_id: categoryIdByName[category] },
    });
  }

  const warehouseInventory = [
    { product_id: 'p1', available_qty: 1500, reserved_qty: 120, damaged_qty: 15, expired_qty: 0 },
    { product_id: 'p2', available_qty: 900, reserved_qty: 80, damaged_qty: 8, expired_qty: 0 },
    { product_id: 'p3', available_qty: 80, reserved_qty: 20, damaged_qty: 5, expired_qty: 12 },
    { product_id: 'p4', available_qty: 0, reserved_qty: 0, damaged_qty: 10, expired_qty: 25 },
    { product_id: 'p5', available_qty: 450, reserved_qty: 50, damaged_qty: 2, expired_qty: 0 },
    { product_id: 'p6', available_qty: 300, reserved_qty: 40, damaged_qty: 0, expired_qty: 0 },
    { product_id: 'p7', available_qty: 2000, reserved_qty: 300, damaged_qty: 40, expired_qty: 0 },
    { product_id: 'p8', available_qty: 150, reserved_qty: 15, damaged_qty: 8, expired_qty: 30 },
  ];
  for (const w of warehouseInventory) {
    await prisma.warehouseInventory.upsert({ where: { product_id: w.product_id }, update: {}, create: w });
  }

  // ---- Suppliers ----
  const suppliers = [
    { id: 's1', name: 'Mahalaxmi Dairy Cooperative Ltd.', contact_person: 'Bhavesh Patil', phone: '+91 98250 12345', email: 'supply@mahalaxmidairy.in', address: 'Plot 14, MIDC Industrial Area, Ambad, Nashik, Maharashtra 422010' },
    { id: 's2', name: 'Konkan Cocoa & Ingredients Pvt. Ltd.', contact_person: "Meera D'Souza", phone: '+91 98200 55667', email: 'orders@konkancocoa.in', address: 'Gala No. 7, Sativali Industrial Estate, Vasai, Palghar, Maharashtra 401208' },
    { id: 's3', name: 'Ratnagiri Fruit Concentrates Co.', contact_person: 'Suhas Kulkarni', phone: '+91 94221 33445', email: 'sales@ratnagirifruits.in', address: 'Near APMC Market Yard, Ratnagiri, Maharashtra 415612' },
  ];
  for (const s of suppliers) {
    await prisma.supplier.upsert({ where: { id: s.id }, update: {}, create: { ...s, status: 'Active' } });
  }

  // ---- Purchases (+ items) ----
  await prisma.purchase.upsert({
    where: { id: 'pur1' },
    update: {},
    create: {
      id: 'pur1',
      supplier_id: 's1',
      invoice_number: 'MDC-INV-2291',
      date: daysAgo(2),
      items: {
        create: [
          { id: 'puri1', product_id: 'p1', quantity: 1000, purchase_price: 14.00 },
          { id: 'puri2', product_id: 'p2', quantity: 500, purchase_price: 18.00 },
        ],
      },
    },
  });

  // ---- Trucks (+ truck_inventory) ----
  const trucks = [
    { id: 't1', vehicle_number: 'MH12 AB 4521', driver_user_id: 'u2', route: 'Route A - Deccan & Kothrud', area: 'Deccan Gymkhana / Kothrud' },
    { id: 't2', vehicle_number: 'MH14 CD 7789', driver_user_id: 'u4', route: 'Route B - Hinjewadi & Viman Nagar', area: 'Hinjewadi Phase 1 / Viman Nagar' },
  ];
  for (const t of trucks) {
    await prisma.truck.upsert({ where: { id: t.id }, update: {}, create: { ...t, status: 'Active' } });
  }

  const truckInventory = [
    { truck_id: 't1', product_id: 'p1', quantity: 200 },
    { truck_id: 't1', product_id: 'p2', quantity: 90 },
    { truck_id: 't1', product_id: 'p3', quantity: 30 },
    { truck_id: 't1', product_id: 'p7', quantity: 150 },
    { truck_id: 't1', product_id: 'p6', quantity: 15 },
    { truck_id: 't2', product_id: 'p1', quantity: 150 },
    { truck_id: 't2', product_id: 'p3', quantity: 40 },
    { truck_id: 't2', product_id: 'p7', quantity: 200 },
    { truck_id: 't2', product_id: 'p5', quantity: 25 },
  ];
  for (const ti of truckInventory) {
    await prisma.truckInventory.upsert({
      where: { truck_id_product_id: { truck_id: ti.truck_id, product_id: ti.product_id } },
      update: {},
      create: ti,
    });
  }

  // ---- Stores ----
  const stores = [
    { id: 'st1', name: 'Sweet Treats Corner', owner_name: 'Anjali Deshmukh', phone: '+91 98221 45678', alt_phone: '+91 98221 45679', address: 'Shop No. 4, FC Road', area: 'Deccan Gymkhana', city: 'Pune', state: 'Maharashtra', pincode: '411004', gst_number: '27AAWPD1234A1Z5', credit_limit: 40000, outstanding_balance: 12500, refill_frequency: 'Weekly', last_purchase_date: daysAgo(8), next_refill_date: daysAgo(1), ranking: 'Platinum' as const },
    { id: 'st2', name: 'Patel General Stores', owner_name: 'Rajesh Patil', phone: '+91 90211 34567', alt_phone: '', address: '1105, Karve Road', area: 'Kothrud', city: 'Pune', state: 'Maharashtra', pincode: '411038', gst_number: '27AAXPP5678B1Z2', credit_limit: 15000, outstanding_balance: 6200, refill_frequency: 'Weekly', last_purchase_date: daysAgo(7), next_refill_date: daysFromNow(0), ranking: 'Gold' as const },
    { id: 'st3', name: 'Sagar Beach Cabin', owner_name: 'Ganesh Koli', phone: '+91 91581 22110', alt_phone: '+91 91581 22111', address: 'Alibaug Beach Road, Stall #12', area: 'Alibaug Beach Road', city: 'Alibaug', state: 'Maharashtra', pincode: '402201', gst_number: '27AAYPK9999C1Z8', credit_limit: 10000, outstanding_balance: 0, refill_frequency: 'Weekly', last_purchase_date: daysAgo(6), next_refill_date: daysFromNow(1), ranking: 'Silver' as const },
    { id: 'st4', name: 'Metro Super Bazaar', owner_name: 'Purchasing Manager', phone: '+91 98800 10001', alt_phone: '', address: 'Plot 88, Hinjewadi Phase 1', area: 'Hinjewadi Phase 1', city: 'Pune', state: 'Maharashtra', pincode: '411057', gst_number: '27AAZCM4321D1Z9', credit_limit: 70000, outstanding_balance: 62000, refill_frequency: '15 Days', last_purchase_date: daysAgo(13), next_refill_date: daysFromNow(2), ranking: 'Platinum' as const },
    { id: 'st5', name: 'Sundae Junction', owner_name: 'Priya Nair', phone: '+91 98509 87654', alt_phone: '', address: 'Cinema Complex, Viman Nagar', area: 'Viman Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411014', gst_number: '27AABFS6543E1Z1', credit_limit: 30000, outstanding_balance: 1500, refill_frequency: 'Monthly', last_purchase_date: daysAgo(27), next_refill_date: daysFromNow(3), ranking: 'Gold' as const },
    { id: 'st6', name: 'Little Angels Ice Cream Parlour', owner_name: 'Sunita Joshi', phone: '+91 97640 33221', alt_phone: '', address: 'Shop 9, Karve Nagar Society', area: 'Karve Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411052', gst_number: '', credit_limit: 5000, outstanding_balance: 4500, refill_frequency: 'Weekly', last_purchase_date: daysAgo(32), next_refill_date: daysAgo(25), ranking: 'Bronze' as const },
    { id: 'st7', name: 'Garden Walk Kiosk', owner_name: 'Iqbal Shaikh', phone: '+91 96650 77889', alt_phone: '', address: 'Bund Garden Walkway', area: 'Bund Garden', city: 'Pune', state: 'Maharashtra', pincode: '411001', gst_number: '', credit_limit: 15000, outstanding_balance: 0, refill_frequency: 'Weekly', last_purchase_date: daysAgo(62), next_refill_date: daysAgo(55), ranking: 'Bronze' as const },
  ];
  for (const s of stores) {
    await prisma.store.upsert({ where: { id: s.id }, update: {}, create: { ...s, status: 'Active' } });
  }

  // ---- Orders (+ items) ----
  const orders = [
    { id: 'o1', store_id: 'st1', salesperson_id: 'u2', truck_id: 't1', status: 'Delivered' as const, created_at: new Date(`${daysAgo(8).toISOString().split('T')[0]}T11:00:00`),
      items: [
        { product_id: 'p1', quantity: 100, unit_price: 28.00, tax_pct: 18 },
        { product_id: 'p2', quantity: 50, unit_price: 35.00, tax_pct: 18 },
        { product_id: 'p6', quantity: 10, unit_price: 230.00, tax_pct: 18 },
      ] },
    { id: 'o2', store_id: 'st4', salesperson_id: 'u4', truck_id: 't2', status: 'Delivered' as const, created_at: new Date(`${daysAgo(13).toISOString().split('T')[0]}T14:30:00`),
      items: [
        { product_id: 'p1', quantity: 500, unit_price: 28.00, tax_pct: 18 },
        { product_id: 'p7', quantity: 800, unit_price: 30.00, tax_pct: 18 },
        { product_id: 'p5', quantity: 100, unit_price: 199.00, tax_pct: 18 },
      ] },
    { id: 'o3', store_id: 'st2', salesperson_id: 'u2', truck_id: 't1', status: 'Confirmed' as const, created_at: new Date(`${daysAgo(1).toISOString().split('T')[0]}T09:15:00`),
      items: [
        { product_id: 'p1', quantity: 120, unit_price: 28.00, tax_pct: 18 },
        { product_id: 'p6', quantity: 15, unit_price: 230.00, tax_pct: 18 },
      ] },
    { id: 'o4', store_id: 'st3', salesperson_id: 'u2', truck_id: 't1', status: 'Draft' as const, created_at: new Date(`${daysAgo(0).toISOString().split('T')[0]}T14:00:00`),
      items: [
        { product_id: 'p2', quantity: 30, unit_price: 35.00, tax_pct: 18 },
        { product_id: 'p7', quantity: 100, unit_price: 30.00, tax_pct: 18 },
      ] },
  ];
  for (const o of orders) {
    const { items, ...rest } = o;
    await prisma.order.upsert({
      where: { id: o.id },
      update: {},
      create: { ...rest, items: { create: items.map((it, idx) => ({ id: `${o.id}i${idx + 1}`, ...it })) } },
    });
  }

  // ---- Invoices ----
  // o1: (100*28)+(50*35)+(10*230) = 6850 total, 18% tax = 1233, grand 8083 (fully paid via pay1)
  // o2: (500*28)+(800*30)+(100*199) = 57900 total, 18% tax = 10422, grand 68322 (partially paid via pay2)
  const invoices = [
    { id: 'inv1', order_id: 'o1', invoice_number: 'INV-2026-0001', total: 6850.00, tax: 1233.00, grand_total: 8083.00, created_at: new Date(`${daysAgo(8).toISOString().split('T')[0]}T11:05:00`), paid_amount: 8083.00, payment_status: 'Paid' as const, payment_method: 'UPI' },
    { id: 'inv2', order_id: 'o2', invoice_number: 'INV-2026-0002', total: 57900.00, tax: 10422.00, grand_total: 68322.00, created_at: new Date(`${daysAgo(13).toISOString().split('T')[0]}T14:45:00`), paid_amount: 30000.00, payment_status: 'Partial' as const, payment_method: 'Bank Transfer' },
  ];
  for (const inv of invoices) {
    await prisma.invoice.upsert({ where: { id: inv.id }, update: {}, create: inv });
  }

  // ---- Payments ----
  const payments = [
    { id: 'pay1', store_id: 'st1', order_id: 'o1', amount: 8083.00, method: 'UPI', date: new Date(`${daysAgo(8).toISOString().split('T')[0]}T11:30:00`), collected_by: 'u2' },
    { id: 'pay2', store_id: 'st4', order_id: 'o2', amount: 30000.00, method: 'Bank Transfer', date: new Date(`${daysAgo(12).toISOString().split('T')[0]}T10:00:00`), collected_by: 'u4' },
  ];
  for (const p of payments) {
    await prisma.payment.upsert({ where: { id: p.id }, update: {}, create: p });
  }

  // ---- Notifications ----
  const notifications = [
    { id: 'n1', type: 'low_stock' as const, message: 'Chocolate Crunch Stick stock is low in the warehouse (80 available). Please order refill from supplier.', is_read: false, created_at: new Date('2026-06-26T08:30:00') },
    { id: 'n2', type: 'out_of_stock' as const, message: 'Mango Kulfi Stick is OUT of stock in the warehouse.', is_read: false, created_at: new Date('2026-06-25T14:15:00') },
    { id: 'n3', type: 'refill' as const, message: 'Sweet Treats Corner is OVERDUE for a refill. Last purchase was 8 days ago.', is_read: false, created_at: new Date('2026-06-27T07:00:00') },
    { id: 'n4', type: 'payment_due' as const, message: 'Metro Super Bazaar is close to credit limit (Balance: ₹62,000 / Limit: ₹70,000).', is_read: true, created_at: new Date('2026-06-24T11:20:00') },
  ];
  for (const n of notifications) {
    await prisma.appNotification.upsert({ where: { id: n.id }, update: {}, create: n });
  }

  // ---- Audit logs ----
  const auditLogs = [
    { id: 'a1', action: 'STOCK_RECEIVE', entity_type: 'Supplier', entity_id: 's1', user_id: 'u3', user_name: 'Suresh Iyer', user_role: 'Warehouse', timestamp: new Date('2026-06-25T09:00:00'), details: 'Received raw goods from Mahalaxmi Dairy Cooperative Ltd. into Warehouse.' },
    { id: 'a2', action: 'LOAD_TRUCK', entity_type: 'Truck', entity_id: 't1', user_id: 'u3', user_name: 'Suresh Iyer', user_role: 'Warehouse', timestamp: new Date('2026-06-26T06:00:00'), details: 'Loaded 200 Vanilla Cups and 90 Kesar Pista Cups onto MH12 AB 4521 (Truck 1).' },
  ];
  for (const a of auditLogs) {
    await prisma.auditLog.upsert({ where: { id: a.id }, update: {}, create: a });
  }

  // ---- QR code settings (singleton) ----
  await prisma.qrCodeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=frostyflow@upi&pn=FrostyFlow%20Ice%20Cream%20Distributors&am=0&cu=INR',
      is_enabled: true,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
