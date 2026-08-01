import type { BoxPieceQty } from '../types';

// Mirrors backend/src/utils/pieceQty.ts - every stock quantity in this app is
// a whole-box count plus a companion loose-pieces count (0 <= pieces <
// pieces_per_box). These helpers are the single place that converts between
// that pair and a flat total-piece count to do arithmetic/comparisons, so
// every screen adds/subtracts/compares the same way.

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

export function formatQty(qty: BoxPieceQty): string {
  const boxLabel = `${qty.boxes} box${qty.boxes === 1 ? '' : 'es'}`;
  if (qty.pieces === 0) return boxLabel;
  const pieceLabel = `${qty.pieces} pc${qty.pieces === 1 ? '' : 's'}`;
  if (qty.boxes === 0) return pieceLabel;
  return `${boxLabel}, ${pieceLabel}`;
}

// Compact form for tight table cells, e.g. "1b 4p" / "3b" / "5p".
export function formatQtyShort(qty: BoxPieceQty): string {
  if (qty.pieces === 0) return `${qty.boxes}b`;
  if (qty.boxes === 0) return `${qty.pieces}p`;
  return `${qty.boxes}b ${qty.pieces}p`;
}

/** Reads a {boxes, pieces} pair off any row using its field-name prefix. */
export function readQtyField<T extends Record<string, any>>(row: T | undefined | null, boxField: keyof T, pieceField: keyof T): BoxPieceQty {
  return { boxes: Number(row?.[boxField] ?? 0), pieces: Number(row?.[pieceField] ?? 0) };
}

// unit_price/purchase_price are always PER-PIECE rates, so printing that raw
// number next to a box-only (or mixed) quantity reads as if a single box
// costs just one piece's price - e.g. "1 box x Rs. 2.00" next to a Rs. 20.00
// line total looks like a miscalculation even though the total is right. This
// derives the rate label that actually applies to what's shown, deriving the
// per-box rate (price * piecesPerBox) whenever boxes are involved.
export function formatUnitRate(qty: BoxPieceQty, unitPrice: number, piecesPerBox: number): string {
  const boxPrice = unitPrice * piecesPerBox;
  if (qty.pieces === 0) return `Rs. ${boxPrice.toFixed(2)}/box`;
  if (qty.boxes === 0) return `Rs. ${unitPrice.toFixed(2)}/pc`;
  return `Rs. ${boxPrice.toFixed(2)}/box + Rs. ${unitPrice.toFixed(2)}/pc`;
}
