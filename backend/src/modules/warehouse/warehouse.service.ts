import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';

export async function listInventory() {
  return prisma.warehouseInventory.findMany();
}

type AdjustType = 'available_qty' | 'reserved_qty' | 'damaged_qty' | 'expired_qty';

export async function adjustStock(input: { product_id: string; type: AdjustType; direction: 'add' | 'subtract'; qty: number; reason: string }, actorId: string) {
  const product = await prisma.product.findUnique({ where: { id: input.product_id } });
  const productName = product?.name ?? 'Product';
  const signedQty = input.direction === 'subtract' ? -Math.abs(input.qty) : Math.abs(input.qty);

  const existing = await prisma.warehouseInventory.findUnique({ where: { product_id: input.product_id } });
  const currentVal = existing ? existing[input.type] : 0;
  const nextVal = Math.max(0, currentVal + signedQty);

  const zeroed = { available_qty: 0, reserved_qty: 0, damaged_qty: 0, expired_qty: 0 };
  let updated;
  switch (input.type) {
    case 'available_qty':
      updated = await prisma.warehouseInventory.upsert({ where: { product_id: input.product_id }, update: { available_qty: nextVal }, create: { product_id: input.product_id, ...zeroed, available_qty: nextVal } });
      break;
    case 'reserved_qty':
      updated = await prisma.warehouseInventory.upsert({ where: { product_id: input.product_id }, update: { reserved_qty: nextVal }, create: { product_id: input.product_id, ...zeroed, reserved_qty: nextVal } });
      break;
    case 'damaged_qty':
      updated = await prisma.warehouseInventory.upsert({ where: { product_id: input.product_id }, update: { damaged_qty: nextVal }, create: { product_id: input.product_id, ...zeroed, damaged_qty: nextVal } });
      break;
    case 'expired_qty':
      updated = await prisma.warehouseInventory.upsert({ where: { product_id: input.product_id }, update: { expired_qty: nextVal }, create: { product_id: input.product_id, ...zeroed, expired_qty: nextVal } });
      break;
  }

  const displayQty = input.direction === 'subtract' ? `-${input.qty}` : `+${input.qty}`;
  const details = `Stock Adjustment for ${productName}: Changed ${input.type.replace('_', ' ')} by quantity ${displayQty}. Reason: ${input.reason}`;
  await logAudit({ action: 'STOCK_ADJUST', entity_type: 'Warehouse', entity_id: input.product_id, user_id: actorId, details });

  return updated;
}
