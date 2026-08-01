const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const products = await prisma.$queryRawUnsafe(`SELECT id, name, pieces_per_box FROM products LIMIT 10`);
    console.log('--- PRODUCTS (pieces_per_box) ---');
    console.log(products);

    const wh = await prisma.$queryRawUnsafe(`SELECT product_id, available_qty, available_pieces, reserved_qty, reserved_pieces FROM warehouse_inventory LIMIT 15`);
    console.log('--- WAREHOUSE INVENTORY ---');
    console.log(wh);

    const ti = await prisma.$queryRawUnsafe(`SELECT truck_id, product_id, quantity, quantity_pieces FROM truck_inventory LIMIT 15`);
    console.log('--- TRUCK INVENTORY ---');
    console.log(ti);

    const oi = await prisma.$queryRawUnsafe(`SELECT order_id, product_id, quantity, quantity_pieces, unit_price, tax_pct FROM order_items ORDER BY order_id LIMIT 20`);
    console.log('--- ORDER ITEMS ---');
    console.log(oi);

    const pi = await prisma.$queryRawUnsafe(`SELECT purchase_id, product_id, quantity, quantity_pieces, purchase_price FROM purchase_items ORDER BY purchase_id LIMIT 20`);
    console.log('--- PURCHASE ITEMS ---');
    console.log(pi);

    const inv = await prisma.$queryRawUnsafe(`SELECT id, order_id, invoice_number, total, tax, grand_total FROM invoices LIMIT 10`);
    console.log('--- INVOICES ---');
    console.log(inv);
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
})();
