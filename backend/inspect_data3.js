const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const migrations = await prisma.$queryRawUnsafe(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at`);
    console.log('--- MIGRATIONS ---');
    console.log(migrations);

    const comboIds = ['2c71d624-5376-4d83-b6e2-2cf2de61cf9e', '6f9be8ba-af3d-4bb8-9969-25c8d768fdbb', 'b246ff39-3691-482d-a179-1ed4e7692e14', 'f4540b68-ceff-4e72-a393-0bd79391cc5c'];
    const placeholders = comboIds.map(() => '?').join(',');

    const wh = await prisma.$queryRawUnsafe(`SELECT product_id, available_qty, available_pieces, reserved_qty, reserved_pieces, damaged_qty, damaged_pieces, expired_qty, expired_pieces, updated_at FROM warehouse_inventory WHERE product_id IN (${placeholders})`, ...comboIds);
    console.log('--- WAREHOUSE ROWS FOR COMBO PRODUCTS (with updated_at) ---');
    console.log(wh);

    const ti = await prisma.$queryRawUnsafe(`SELECT truck_id, product_id, quantity, quantity_pieces FROM truck_inventory WHERE product_id IN (${placeholders})`, ...comboIds);
    console.log('--- TRUCK INVENTORY FOR COMBO PRODUCTS ---');
    console.log(ti);

    const oi = await prisma.$queryRawUnsafe(`
      SELECT o.id as order_id, o.created_at, o.status, oi.product_id, oi.quantity, oi.quantity_pieces, oi.unit_price
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id IN (${placeholders}) ORDER BY o.created_at`, ...comboIds);
    console.log('--- ORDER ITEMS FOR COMBO PRODUCTS (with order created_at) ---');
    console.log(oi);

    const pi = await prisma.$queryRawUnsafe(`
      SELECT p.id as purchase_id, p.date, pi.product_id, pi.quantity, pi.quantity_pieces, pi.purchase_price
      FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
      WHERE pi.product_id IN (${placeholders}) ORDER BY p.date`, ...comboIds);
    console.log('--- PURCHASE ITEMS FOR COMBO PRODUCTS (with purchase date) ---');
    console.log(pi);

    const pbi = await prisma.$queryRawUnsafe(`
      SELECT pb.id as booking_id, pb.created_at, pb.status, pbi.product_id, pbi.quantity, pbi.quantity_pieces, pbi.unit_price
      FROM pre_booking_items pbi JOIN pre_booking_orders pb ON pb.id = pbi.pre_booking_id
      WHERE pbi.product_id IN (${placeholders}) ORDER BY pb.created_at`, ...comboIds);
    console.log('--- PREBOOKING ITEMS FOR COMBO PRODUCTS ---');
    console.log(pbi);

    const im = await prisma.$queryRawUnsafe(`SELECT id, from_location_type, to_location_type, product_id, quantity, quantity_pieces, created_at FROM inventory_movements WHERE product_id IN (${placeholders}) ORDER BY created_at`, ...comboIds);
    console.log('--- INVENTORY MOVEMENTS FOR COMBO PRODUCTS ---');
    console.log(im);

    const al = await prisma.$queryRawUnsafe(`SELECT id, action, entity_type, entity_id, timestamp, details FROM audit_logs WHERE details LIKE '%Combo%' ORDER BY timestamp`);
    console.log('--- AUDIT LOGS MENTIONING COMBO ---');
    console.log(al);
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
})();
