const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const ppbCounts = await prisma.$queryRawUnsafe(`SELECT pieces_per_box, COUNT(*) as cnt FROM products GROUP BY pieces_per_box`);
    console.log('--- PIECES_PER_BOX DISTRIBUTION ---');
    console.log(ppbCounts);

    const nonOne = await prisma.$queryRawUnsafe(`SELECT id, name, pieces_per_box, mrp, purchase_discount_pct, wholesale_discount_pct, retail_discount_pct FROM products WHERE pieces_per_box != 1`);
    console.log('--- PRODUCTS WITH PIECES_PER_BOX != 1 ---');
    console.log(nonOne);

    const whPieces = await prisma.$queryRawUnsafe(`SELECT product_id, available_qty, available_pieces FROM warehouse_inventory WHERE available_pieces > 0`);
    console.log('--- WAREHOUSE ROWS WITH LOOSE PIECES ---');
    console.log(whPieces);

    const sample = await prisma.$queryRawUnsafe(`
      SELECT oi.order_id, oi.product_id, p.name, p.pieces_per_box, p.mrp, oi.quantity, oi.quantity_pieces, oi.unit_price
      FROM order_items oi JOIN products p ON p.id = oi.product_id
      ORDER BY oi.order_id LIMIT 15
    `);
    console.log('--- ORDER ITEMS JOINED WITH PRODUCT MRP ---');
    console.log(sample);
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
})();
