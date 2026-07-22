import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

// MySQL's default Prisma constraint naming is `<table>_<field>_key`. These are
// the ones reachable from user-facing forms; anything else falls back to a
// generic message rather than leaking the raw constraint/index name.
const FRIENDLY_UNIQUE_MESSAGES: Record<string, string> = {
  users_phone_key: 'A user with this phone number already exists.',
  trucks_vehicle_number_key: 'A truck with this vehicle number already exists.',
  products_code_key: 'A product with this SKU code already exists.',
  categories_name_key: 'A category with this name already exists.',
  invoices_invoice_number_key: 'An invoice with this number already exists.',
  areas_name_key: 'A district area with this name already exists.',
  purchase_order_requests_order_ref_key: 'A purchase order with this reference already exists.',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = String((err.meta as any)?.target ?? '');
      return res.status(409).json({ error: FRIENDLY_UNIQUE_MESSAGES[target] ?? 'This value must be unique and is already in use.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'One of the referenced records (e.g. product, store, truck, or user) does not exist.' });
    }
  }

  // express.json() throws a SyntaxError with a `status`/`statusCode` of 400
  // when the request body isn't valid JSON — surface that instead of a 500.
  if (err instanceof SyntaxError && ('status' in err || 'statusCode' in err)) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}
