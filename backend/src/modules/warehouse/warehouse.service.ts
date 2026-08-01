import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';
import { BoxPieceQty, toTotalPieces, fromTotalPieces, formatQty, readQtyField } from '../../utils/pieceQty';

export async function listInventory() {
  return prisma.warehouseInventory.findMany();
}

type AdjustType = 'available_qty' | 'reserved_qty' | 'damaged_qty' | 'expired_qty';

const PIECE_FIELD: Record<AdjustType, string> = {
  available_qty: 'available_pieces',
  reserved_qty: 'reserved_pieces',
  damaged_qty: 'damaged_pieces',
  expired_qty: 'expired_pieces',
};

const ZEROED = {
  available_qty: 0, available_pieces: 0,
  reserved_qty: 0, reserved_pieces: 0,
  damaged_qty: 0, damaged_pieces: 0,
  expired_qty: 0, expired_pieces: 0,
};

export async function adjustStock(input: { product_id: string; type: AdjustType; direction: 'add' | 'subtract'; qty: BoxPieceQty; reason: string }, actorId: string) {
  const product = await prisma.product.findUnique({ where: { id: input.product_id } });
  if (!product) throw ApiError.notFound('Product not found');
  const productName = product.name;
  const piecesPerBox = product.pieces_per_box;

  const existing = await prisma.warehouseInventory.findUnique({ where: { product_id: input.product_id } });
  const pieceField = PIECE_FIELD[input.type];
  const current = existing ? readQtyField(existing as any, input.type, pieceField as any) : { boxes: 0, pieces: 0 };

  const deltaTotal = toTotalPieces(input.qty, piecesPerBox);
  const signedTotal = input.direction === 'subtract' ? -deltaTotal : deltaTotal;
  const nextTotal = Math.max(0, toTotalPieces(current, piecesPerBox) + signedTotal);
  const next = fromTotalPieces(nextTotal, piecesPerBox);

  const updateData = { [input.type]: next.boxes, [pieceField]: next.pieces };
  const updated = await prisma.warehouseInventory.upsert({
    where: { product_id: input.product_id },
    update: updateData,
    create: { product_id: input.product_id, ...ZEROED, ...updateData },
  });

  const sign = input.direction === 'subtract' ? '-' : '+';
  const details = `Stock Adjustment for ${productName}: Changed ${input.type.replace('_', ' ')} by ${sign}${formatQty(input.qty)}. Reason: ${input.reason}`;
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
// from 2 boxes to 1 box, 5 pcs.") so there's always a readable reason in the log.
export async function correctStock(input: { product_id: string; available_qty: BoxPieceQty; reserved_qty: BoxPieceQty; damaged_qty: BoxPieceQty; expired_qty: BoxPieceQty; comment: string }, actorId: string) {
  const product = await prisma.product.findUnique({ where: { id: input.product_id } });
  if (!product) throw ApiError.notFound('Product not found');
  const productName = product.name;
  const piecesPerBox = product.pieces_per_box;

  const existing = await prisma.warehouseInventory.findUnique({ where: { product_id: input.product_id } });
  const beforeQty: Record<AdjustType, BoxPieceQty> = {
    available_qty: existing ? readQtyField(existing as any, 'available_qty', 'available_pieces') : { boxes: 0, pieces: 0 },
    reserved_qty: existing ? readQtyField(existing as any, 'reserved_qty', 'reserved_pieces') : { boxes: 0, pieces: 0 },
    damaged_qty: existing ? readQtyField(existing as any, 'damaged_qty', 'damaged_pieces') : { boxes: 0, pieces: 0 },
    expired_qty: existing ? readQtyField(existing as any, 'expired_qty', 'expired_pieces') : { boxes: 0, pieces: 0 },
  };
  const afterQty: Record<AdjustType, BoxPieceQty> = {
    available_qty: fromTotalPieces(Math.max(0, toTotalPieces(input.available_qty, piecesPerBox)), piecesPerBox),
    reserved_qty: fromTotalPieces(Math.max(0, toTotalPieces(input.reserved_qty, piecesPerBox)), piecesPerBox),
    damaged_qty: fromTotalPieces(Math.max(0, toTotalPieces(input.damaged_qty, piecesPerBox)), piecesPerBox),
    expired_qty: fromTotalPieces(Math.max(0, toTotalPieces(input.expired_qty, piecesPerBox)), piecesPerBox),
  };

  const changedFields = (Object.keys(FIELD_LABELS) as AdjustType[]).filter(
    f => beforeQty[f].boxes !== afterQty[f].boxes || beforeQty[f].pieces !== afterQty[f].pieces
  );
  if (changedFields.length === 0) throw ApiError.badRequest('No stock values were changed.');

  const updateData = {
    available_qty: afterQty.available_qty.boxes, available_pieces: afterQty.available_qty.pieces,
    reserved_qty: afterQty.reserved_qty.boxes, reserved_pieces: afterQty.reserved_qty.pieces,
    damaged_qty: afterQty.damaged_qty.boxes, damaged_pieces: afterQty.damaged_qty.pieces,
    expired_qty: afterQty.expired_qty.boxes, expired_pieces: afterQty.expired_qty.pieces,
  };
  const updated = await prisma.warehouseInventory.upsert({
    where: { product_id: input.product_id },
    update: updateData,
    create: { product_id: input.product_id, ...updateData },
  });

  const changeLines = changedFields.map(f => `${FIELD_LABELS[f]} changed from ${formatQty(beforeQty[f])} to ${formatQty(afterQty[f])}.`);
  const comment = input.comment.trim() || changeLines.join(' ');
  const details = `Stock Correction for ${productName}: ${changeLines.join(' ')} Comment: ${comment}`;
  await logAudit({ action: 'STOCK_ADJUST', entity_type: 'Warehouse', entity_id: input.product_id, user_id: actorId, details });

  return updated;
}
