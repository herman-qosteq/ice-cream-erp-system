import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

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

const FIELD_LABELS: Record<AdjustType, string> = {
  available_qty: 'Available Qty',
  reserved_qty: 'Reserved Qty',
  damaged_qty: 'Damaged Qty',
  expired_qty: 'Expired Qty',
};

// Direct-entry correction: the warehouse staff types the exact counts they
// counted (not a +/- delta), for all four fields at once. Only fields that
// actually changed are written to the audit trail, and if no comment was
// typed, one is generated from those changes (e.g. "Damaged Qty changed
// from 2 to 5.") so there's always a readable reason in the log.
export async function correctStock(input: { product_id: string; available_qty: number; reserved_qty: number; damaged_qty: number; expired_qty: number; comment: string }, actorId: string) {
  const product = await prisma.product.findUnique({ where: { id: input.product_id } });
  const productName = product?.name ?? 'Product';

  const existing = await prisma.warehouseInventory.findUnique({ where: { product_id: input.product_id } });
  const before = {
    available_qty: existing?.available_qty ?? 0,
    reserved_qty: existing?.reserved_qty ?? 0,
    damaged_qty: existing?.damaged_qty ?? 0,
    expired_qty: existing?.expired_qty ?? 0,
  };
  const after = {
    available_qty: Math.max(0, Math.round(input.available_qty)),
    reserved_qty: Math.max(0, Math.round(input.reserved_qty)),
    damaged_qty: Math.max(0, Math.round(input.damaged_qty)),
    expired_qty: Math.max(0, Math.round(input.expired_qty)),
  };

  const changedFields = (Object.keys(FIELD_LABELS) as AdjustType[]).filter(f => before[f] !== after[f]);
  if (changedFields.length === 0) throw ApiError.badRequest('No stock values were changed.');

  const updated = await prisma.warehouseInventory.upsert({
    where: { product_id: input.product_id },
    update: after,
    create: { product_id: input.product_id, ...after },
  });

  const changeLines = changedFields.map(f => `${FIELD_LABELS[f]} changed from ${before[f]} to ${after[f]}.`);
  const comment = input.comment.trim() || changeLines.join(' ');
  const details = `Stock Correction for ${productName}: ${changeLines.join(' ')} Comment: ${comment}`;
  await logAudit({ action: 'STOCK_ADJUST', entity_type: 'Warehouse', entity_id: input.product_id, user_id: actorId, details });

  return updated;
}
