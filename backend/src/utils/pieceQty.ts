import { ApiError } from './ApiError';

/**
 * Every stock quantity in the schema is a whole-box count plus a companion
 * `_pieces` loose-piece count (0 <= pieces < pieces_per_box). These helpers
 * are the single place that converts between that pair and a flat total-piece
 * count to do arithmetic, so every service adds/subtracts the same way
 * instead of re-implementing box/piece carry-over logic ad hoc.
 */
export interface BoxPieceQty {
  boxes: number;
  pieces: number;
}

export function toTotalPieces(qty: BoxPieceQty, piecesPerBox: number): number {
  return qty.boxes * piecesPerBox + qty.pieces;
}

export function fromTotalPieces(totalPieces: number, piecesPerBox: number): BoxPieceQty {
  const boxes = Math.floor(totalPieces / piecesPerBox);
  const pieces = totalPieces - boxes * piecesPerBox;
  return { boxes, pieces };
}

export function normalizeQty(qty: BoxPieceQty, piecesPerBox: number): BoxPieceQty {
  return fromTotalPieces(toTotalPieces(qty, piecesPerBox), piecesPerBox);
}

export function addQty(a: BoxPieceQty, b: BoxPieceQty, piecesPerBox: number): BoxPieceQty {
  return fromTotalPieces(toTotalPieces(a, piecesPerBox) + toTotalPieces(b, piecesPerBox), piecesPerBox);
}

export function subtractQty(a: BoxPieceQty, b: BoxPieceQty, piecesPerBox: number): BoxPieceQty {
  return fromTotalPieces(toTotalPieces(a, piecesPerBox) - toTotalPieces(b, piecesPerBox), piecesPerBox);
}

/** a - b, expressed as a signed total-piece delta (positive = a > b). */
export function compareQty(a: BoxPieceQty, b: BoxPieceQty, piecesPerBox: number): number {
  return toTotalPieces(a, piecesPerBox) - toTotalPieces(b, piecesPerBox);
}

export function isZeroQty(qty: BoxPieceQty): boolean {
  return qty.boxes === 0 && qty.pieces === 0;
}

export function isPositiveQty(qty: BoxPieceQty): boolean {
  return qty.boxes > 0 || qty.pieces > 0;
}

/** Throws if `have` is short of `need` (used by every "insufficient stock" check). */
export function assertSufficientQty(have: BoxPieceQty, need: BoxPieceQty, piecesPerBox: number, label: string): void {
  if (compareQty(have, need, piecesPerBox) < 0) {
    throw ApiError.badRequest(
      `Insufficient stock for ${label}: have ${formatQty(have)}, need ${formatQty(need)}`
    );
  }
}

export function formatQty(qty: BoxPieceQty): string {
  const boxLabel = `${qty.boxes} box${qty.boxes === 1 ? '' : 'es'}`;
  if (qty.pieces === 0) return boxLabel;
  const pieceLabel = `${qty.pieces} pc${qty.pieces === 1 ? '' : 's'}`;
  if (qty.boxes === 0) return pieceLabel;
  return `${boxLabel}, ${pieceLabel}`;
}

/** Reads a {boxes, pieces} pair off any Prisma row using its field-name prefix, e.g. prefix "available" -> { boxes: row.available_qty, pieces: row.available_pieces }. */
export function readQtyField<T extends Record<string, any>>(row: T, boxField: keyof T, pieceField: keyof T): BoxPieceQty {
  return { boxes: Number(row[boxField] ?? 0), pieces: Number(row[pieceField] ?? 0) };
}
