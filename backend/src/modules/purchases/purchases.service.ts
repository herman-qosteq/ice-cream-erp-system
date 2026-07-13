import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num, dateOnly } from '../../utils/serialize';

interface PurchaseItemInput {
  product_id: string;
  quantity: number;
  purchase_price: number;
  mfg_date?: string;
  expiry_date?: string;
}

function serializePurchase(p: {
  id: string; supplier_id: string; invoice_number: string; date: Date;
  items: { product_id: string; quantity: number; purchase_price: any; mfg_date: Date | null; expiry_date: Date | null }[];
}) {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    invoice_number: p.invoice_number,
    date: dateOnly(p.date),
    items: p.items.map(i => ({
      product_id: i.product_id,
      quantity: i.quantity,
      purchase_price: num(i.purchase_price),
      mfg_date: dateOnly(i.mfg_date),
      expiry_date: dateOnly(i.expiry_date),
    })),
  };
}

export async function listPurchases() {
  const purchases = await prisma.purchase.findMany({ include: { items: true }, orderBy: { date: 'desc' } });
  return purchases.map(serializePurchase);
}

export async function createPurchase(input: { supplier_id: string; invoice_number: string; date: string; items: PurchaseItemInput[] }, actorId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplier_id } });
  const supplierName = supplier?.name ?? 'Supplier';
  const totalUnits = input.items.reduce((sum, i) => sum + Number(i.quantity), 0);

  const purchase = await prisma.$transaction(async tx => {
    const created = await tx.purchase.create({
      data: {
        supplier_id: input.supplier_id,
        invoice_number: input.invoice_number,
        date: new Date(input.date),
        items: {
          create: input.items.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity,
            purchase_price: i.purchase_price,
            mfg_date: i.mfg_date ? new Date(i.mfg_date) : null,
            expiry_date: i.expiry_date ? new Date(i.expiry_date) : null,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of input.items) {
      await tx.warehouseInventory.upsert({
        where: { product_id: item.product_id },
        update: { available_qty: { increment: Number(item.quantity) } },
        create: { product_id: item.product_id, available_qty: Number(item.quantity) },
      });
    }

    return created;
  });

  await logAudit({ action: 'STOCK_RECEIVE', entity_type: 'Warehouse', entity_id: purchase.id, user_id: actorId, details: `Received inward cargo of ${totalUnits} items from ${supplierName}` });
  return serializePurchase(purchase);
}
