import { z } from 'zod';

/** Shared request-body shape for a box/pieces quantity input. Values are
 * normalized against the product's pieces_per_box in the service layer
 * (pieces >= pieces_per_box is carried over into extra boxes there), so this
 * only needs to guard against negative/non-integer input. */
export const qtySchema = z.object({
  boxes: z.number().int().min(0),
  pieces: z.number().int().min(0),
});

export const positiveQtySchema = qtySchema.refine(q => q.boxes > 0 || q.pieces > 0, {
  message: 'Quantity must be greater than zero',
});
