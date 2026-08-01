import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num, dateOnly } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';
import { parsePageParams, parseDateRangeParams, containsInsensitive, buildPagedResult } from '../../utils/pagination';
import { addQty, readQtyField, formatQty } from '../../utils/pieceQty';

interface PurchaseItemInput {
  product_id: string;
  quantity: number;
  quantity_pieces?: number;
  purchase_price: number;
  mfg_date?: string;
  expiry_date?: string;
}

function serializePurchase(p: {
  id: string; supplier_id: string; invoice_number: string; date: Date;
  bill_file_url?: string | null; bill_file_name?: string | null; bill_file_type?: string | null;
  items: { product_id: string; quantity: number; quantity_pieces: number; purchase_price: any; mfg_date: Date | null; expiry_date: Date | null }[];
}) {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    invoice_number: p.invoice_number,
    date: dateOnly(p.date),
    bill_file_url: p.bill_file_url ?? undefined,
    bill_file_name: p.bill_file_name ?? undefined,
    bill_file_type: p.bill_file_type ?? undefined,
    items: p.items.map(i => ({
      product_id: i.product_id,
      quantity: i.quantity,
      quantity_pieces: i.quantity_pieces,
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

function buildPurchasesWhere(query: Record<string, unknown>): Prisma.PurchaseWhereInput {
  const { from, to } = parseDateRangeParams(query);
  const and: Prisma.PurchaseWhereInput[] = [];
  if (from || to) and.push({ date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });

  const supplierId = typeof query.supplier_id === 'string' ? query.supplier_id.trim() : '';
  if (supplierId) and.push({ supplier_id: supplierId });

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    and.push({
      OR: [
        { invoice_number: containsInsensitive(search) },
        { supplier: { name: containsInsensitive(search) } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export async function listPurchasesPaged(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePageParams(query);
  const where = buildPurchasesWhere(query);
  const [rows, total] = await Promise.all([
    prisma.purchase.findMany({ where, include: { items: true }, orderBy: { date: 'desc' }, skip, take }),
    prisma.purchase.count({ where }),
  ]);
  return buildPagedResult(rows.map(serializePurchase), total, page, pageSize);
}

export async function createPurchase(
  input: {
    supplier_id: string; invoice_number: string; date: string; items: PurchaseItemInput[];
    bill_file_url?: string; bill_file_name?: string; bill_file_type?: string;
    // Set when Receive Stock was pre-filled from a saved Purchase Order Excel
    // request - marks that request Fulfilled and links it to the resulting
    // Purchase, so it drops off the Pending list.
    source_request_id?: string;
  },
  actorId: string
) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplier_id } });
  const supplierName = supplier?.name ?? 'Supplier';
  const totalUnits = input.items.reduce((sum, i) => sum + Number(i.quantity), 0);

  const purchase = await prisma.$transaction(async tx => {
    const created = await tx.purchase.create({
      data: {
        supplier_id: input.supplier_id,
        invoice_number: input.invoice_number,
        date: new Date(input.date),
        bill_file_url: input.bill_file_url,
        bill_file_name: input.bill_file_name,
        bill_file_type: input.bill_file_type,
        items: {
          create: input.items.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity,
            quantity_pieces: i.quantity_pieces ?? 0,
            purchase_price: i.purchase_price,
            mfg_date: i.mfg_date ? new Date(i.mfg_date) : null,
            expiry_date: i.expiry_date ? new Date(i.expiry_date) : null,
          })),
        },
      },
      include: { items: true },
    });

    const products = await tx.product.findMany({ where: { id: { in: input.items.map(i => i.product_id) } } });
    const piecesPerBoxOf = new Map(products.map(p => [p.id, p.pieces_per_box]));

    for (const item of input.items) {
      const piecesPerBox = piecesPerBoxOf.get(item.product_id) ?? 1;
      const existing = await tx.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
      const current = existing ? readQtyField(existing, 'available_qty', 'available_pieces') : { boxes: 0, pieces: 0 };
      const next = addQty(current, { boxes: Number(item.quantity), pieces: Number(item.quantity_pieces ?? 0) }, piecesPerBox);

      await tx.warehouseInventory.upsert({
        where: { product_id: item.product_id },
        update: { available_qty: next.boxes, available_pieces: next.pieces },
        create: { product_id: item.product_id, available_qty: next.boxes, available_pieces: next.pieces },
      });
    }

    if (input.source_request_id) {
      await tx.purchaseOrderRequest.update({
        where: { id: input.source_request_id },
        data: { status: 'Fulfilled', fulfilled_purchase_id: created.id },
      });
    }

    return created;
  });

  await logAudit({ action: 'STOCK_RECEIVE', entity_type: 'Warehouse', entity_id: purchase.id, user_id: actorId, details: `Received inward cargo of ${totalUnits} items from ${supplierName}` });
  return serializePurchase(purchase);
}

// Lets a wrongly-attached supplier bill (uploaded the wrong photo/PDF/Excel)
// be removed or swapped for the correct one after the receipt was already
// confirmed - passing nulls clears the attachment, non-null values replace it.
export async function updatePurchaseBillFile(
  id: string,
  input: { bill_file_url: string | null; bill_file_name: string | null; bill_file_type: string | null },
  actorId: string
) {
  const existing = await prisma.purchase.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Purchase not found.');

  const updated = await prisma.purchase.update({
    where: { id },
    data: {
      bill_file_url: input.bill_file_url,
      bill_file_name: input.bill_file_name,
      bill_file_type: input.bill_file_type,
    },
    include: { items: true },
  });

  await logAudit({
    action: input.bill_file_url ? 'PURCHASE_BILL_REPLACE' : 'PURCHASE_BILL_REMOVE',
    entity_type: 'Purchase',
    entity_id: id,
    user_id: actorId,
    details: input.bill_file_url
      ? `Replaced the supplier bill attachment for invoice ${existing.invoice_number}.`
      : `Removed the supplier bill attachment for invoice ${existing.invoice_number}.`,
  });
  return serializePurchase(updated);
}
