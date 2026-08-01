import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

interface RequestItemInput {
  product_id: string;
  order_case: number;
  order_case_pieces?: number;
}

function serializeRequest(r: {
  id: string; order_ref: string; supplier_id: string; status: string; created_at: Date;
  fulfilled_purchase_id: string | null;
  items: { product_id: string; order_case: number; order_case_pieces: number }[];
}) {
  return {
    id: r.id,
    order_ref: r.order_ref,
    supplier_id: r.supplier_id,
    status: r.status,
    created_at: r.created_at,
    fulfilled_purchase_id: r.fulfilled_purchase_id ?? undefined,
    items: r.items.map(i => ({ product_id: i.product_id, order_case: i.order_case, order_case_pieces: i.order_case_pieces })),
  };
}

export async function listPurchaseOrderRequests() {
  const requests = await prisma.purchaseOrderRequest.findMany({ include: { items: true }, orderBy: { created_at: 'desc' } });
  return requests.map(serializeRequest);
}

export async function createPurchaseOrderRequest(input: { order_ref: string; supplier_id: string; items: RequestItemInput[] }, actorId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplier_id } });
  if (!supplier) throw ApiError.notFound('Supplier not found');

  const request = await prisma.purchaseOrderRequest.create({
    data: {
      order_ref: input.order_ref,
      supplier_id: input.supplier_id,
      items: { create: input.items.map(i => ({ product_id: i.product_id, order_case: i.order_case, order_case_pieces: i.order_case_pieces ?? 0 })) },
    },
    include: { items: true },
  });

  await logAudit({ action: 'PURCHASE_ORDER_REQUEST_CREATE', entity_type: 'PurchaseOrderRequest', entity_id: request.id, user_id: actorId, details: `Generated Purchase Order ${input.order_ref} (${input.items.length} product(s)) for ${supplier.name}.` });
  return serializeRequest(request);
}

// Lets a mistake in a still-unsent-to-warehouse draft (wrong product/case
// count picked when the Excel was generated) be corrected in place, rather
// than cancelling and re-creating a fresh one. Only allowed while Pending -
// once Fulfilled/Cancelled the record is historical and shouldn't move.
export async function updatePurchaseOrderRequest(
  id: string,
  input: { supplier_id: string; items: RequestItemInput[] },
  actorId: string
) {
  const request = await prisma.purchaseOrderRequest.findUnique({ where: { id } });
  if (!request) throw ApiError.notFound('Purchase order request not found');
  if (request.status !== 'Pending') throw ApiError.conflict('Only a pending purchase order can be edited.');

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplier_id } });
  if (!supplier) throw ApiError.notFound('Supplier not found');

  const updated = await prisma.$transaction(async tx => {
    await tx.purchaseOrderRequestItem.deleteMany({ where: { request_id: id } });
    return tx.purchaseOrderRequest.update({
      where: { id },
      data: {
        supplier_id: input.supplier_id,
        items: { create: input.items.map(i => ({ product_id: i.product_id, order_case: i.order_case, order_case_pieces: i.order_case_pieces ?? 0 })) },
      },
      include: { items: true },
    });
  });

  await logAudit({ action: 'PURCHASE_ORDER_REQUEST_UPDATE', entity_type: 'PurchaseOrderRequest', entity_id: id, user_id: actorId, details: `Edited Purchase Order ${request.order_ref} (${input.items.length} product(s)) for ${supplier.name}.` });
  return serializeRequest(updated);
}

export async function cancelPurchaseOrderRequest(id: string, actorId: string) {
  const request = await prisma.purchaseOrderRequest.findUnique({ where: { id } });
  if (!request) throw ApiError.notFound('Purchase order request not found');
  if (request.status !== 'Pending') throw ApiError.conflict('Only a pending purchase order can be cancelled.');

  const updated = await prisma.purchaseOrderRequest.update({ where: { id }, data: { status: 'Cancelled' }, include: { items: true } });
  await logAudit({ action: 'PURCHASE_ORDER_REQUEST_CANCEL', entity_type: 'PurchaseOrderRequest', entity_id: id, user_id: actorId, details: `Cancelled Purchase Order ${request.order_ref}.` });
  return serializeRequest(updated);
}
