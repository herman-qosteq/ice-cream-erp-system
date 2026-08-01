import { Prisma, StockLocationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';
import { parsePageParams, parseDateRangeParams, buildPagedResult } from '../../utils/pagination';
import { MoveStockInput } from './inventoryMovements.types';
import { BoxPieceQty, addQty, subtractQty, compareQty, isPositiveQty, formatQty } from '../../utils/pieceQty';

type Tx = Prisma.TransactionClient;

// The two pairs already owned end-to-end by dispatch.service.ts
// (loadCargo/returnStock/returnAllStock/transferBetweenTrucks) - rejected
// here so there's exactly one supported code path per movement pair.
function isReservedForDispatchModule(fromType: StockLocationType, toType: StockLocationType): boolean {
  const isWarehouse = (t: StockLocationType) => t === 'Warehouse';
  const isTruck = (t: StockLocationType) => t === 'Truck';
  return (isWarehouse(fromType) && isTruck(toType)) || (isTruck(fromType) && isWarehouse(toType)) || (isTruck(fromType) && isTruck(toType));
}

async function readQty(tx: Tx, type: StockLocationType, id: string | null | undefined, productId: string): Promise<BoxPieceQty> {
  if (type === 'Warehouse') {
    const inv = await tx.warehouseInventory.findUnique({ where: { product_id: productId } });
    return { boxes: inv?.available_qty ?? 0, pieces: inv?.available_pieces ?? 0 };
  }
  if (type === 'Truck') {
    if (!id) throw ApiError.badRequest('A truck location requires a truck id.');
    const inv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: id, product_id: productId } } });
    return { boxes: inv?.quantity ?? 0, pieces: inv?.quantity_pieces ?? 0 };
  }
  if (type === 'Partner') {
    if (!id) throw ApiError.badRequest('A partner location requires a partner id.');
    const inv = await tx.partnerInventory.findUnique({ where: { partner_id_product_id: { partner_id: id, product_id: productId } } });
    return { boxes: inv?.quantity ?? 0, pieces: inv?.quantity_pieces ?? 0 };
  }
  // Asset
  if (!id) throw ApiError.badRequest('An asset location requires an asset id.');
  const inv = await tx.assetInventory.findUnique({ where: { asset_id_product_id: { asset_id: id, product_id: productId } } });
  return { boxes: inv?.quantity ?? 0, pieces: inv?.quantity_pieces ?? 0 };
}

async function decrementQty(tx: Tx, type: StockLocationType, id: string | null | undefined, productId: string, qty: BoxPieceQty, currentQty: BoxPieceQty, piecesPerBox: number) {
  const remaining = subtractQty(currentQty, qty, piecesPerBox);
  if (type === 'Warehouse') {
    await tx.warehouseInventory.update({ where: { product_id: productId }, data: { available_qty: remaining.boxes, available_pieces: remaining.pieces } });
    return;
  }
  if (type === 'Truck') {
    if (isPositiveQty(remaining)) await tx.truckInventory.update({ where: { truck_id_product_id: { truck_id: id!, product_id: productId } }, data: { quantity: remaining.boxes, quantity_pieces: remaining.pieces } });
    else await tx.truckInventory.delete({ where: { truck_id_product_id: { truck_id: id!, product_id: productId } } });
    return;
  }
  if (type === 'Partner') {
    if (isPositiveQty(remaining)) await tx.partnerInventory.update({ where: { partner_id_product_id: { partner_id: id!, product_id: productId } }, data: { quantity: remaining.boxes, quantity_pieces: remaining.pieces } });
    else await tx.partnerInventory.delete({ where: { partner_id_product_id: { partner_id: id!, product_id: productId } } });
    return;
  }
  // Asset
  if (isPositiveQty(remaining)) await tx.assetInventory.update({ where: { asset_id_product_id: { asset_id: id!, product_id: productId } }, data: { quantity: remaining.boxes, quantity_pieces: remaining.pieces } });
  else await tx.assetInventory.delete({ where: { asset_id_product_id: { asset_id: id!, product_id: productId } } });
}

async function incrementQty(tx: Tx, type: StockLocationType, id: string | null | undefined, productId: string, qty: BoxPieceQty, piecesPerBox: number) {
  if (type === 'Warehouse') {
    const inv = await tx.warehouseInventory.findUnique({ where: { product_id: productId } });
    const next = addQty({ boxes: inv?.available_qty ?? 0, pieces: inv?.available_pieces ?? 0 }, qty, piecesPerBox);
    await tx.warehouseInventory.upsert({ where: { product_id: productId }, update: { available_qty: next.boxes, available_pieces: next.pieces }, create: { product_id: productId, available_qty: next.boxes, available_pieces: next.pieces } });
    return;
  }
  if (type === 'Truck') {
    const inv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: id!, product_id: productId } } });
    const next = addQty({ boxes: inv?.quantity ?? 0, pieces: inv?.quantity_pieces ?? 0 }, qty, piecesPerBox);
    await tx.truckInventory.upsert({
      where: { truck_id_product_id: { truck_id: id!, product_id: productId } },
      update: { quantity: next.boxes, quantity_pieces: next.pieces },
      create: { truck_id: id!, product_id: productId, quantity: next.boxes, quantity_pieces: next.pieces },
    });
    return;
  }
  if (type === 'Partner') {
    const inv = await tx.partnerInventory.findUnique({ where: { partner_id_product_id: { partner_id: id!, product_id: productId } } });
    const next = addQty({ boxes: inv?.quantity ?? 0, pieces: inv?.quantity_pieces ?? 0 }, qty, piecesPerBox);
    await tx.partnerInventory.upsert({
      where: { partner_id_product_id: { partner_id: id!, product_id: productId } },
      update: { quantity: next.boxes, quantity_pieces: next.pieces },
      create: { partner_id: id!, product_id: productId, quantity: next.boxes, quantity_pieces: next.pieces },
    });
    return;
  }
  // Asset
  const inv = await tx.assetInventory.findUnique({ where: { asset_id_product_id: { asset_id: id!, product_id: productId } } });
  const next = addQty({ boxes: inv?.quantity ?? 0, pieces: inv?.quantity_pieces ?? 0 }, qty, piecesPerBox);
  await tx.assetInventory.upsert({
    where: { asset_id_product_id: { asset_id: id!, product_id: productId } },
    update: { quantity: next.boxes, quantity_pieces: next.pieces },
    create: { asset_id: id!, product_id: productId, quantity: next.boxes, quantity_pieces: next.pieces },
  });
}

async function assertLocationExists(type: StockLocationType, id: string | null | undefined) {
  if (type === 'Warehouse') return;
  if (type === 'Truck') {
    if (!id || !(await prisma.truck.findUnique({ where: { id } }))) throw ApiError.notFound('Truck not found.');
    return;
  }
  if (type === 'Partner') {
    if (!id || !(await prisma.store.findUnique({ where: { id } }))) throw ApiError.notFound('Partner not found.');
    return;
  }
  if (!id || !(await prisma.asset.findUnique({ where: { id } }))) throw ApiError.notFound('Asset not found.');
}

async function resolveLocationLabel(type: StockLocationType, id: string | null | undefined): Promise<string> {
  if (type === 'Warehouse') return 'Warehouse';
  if (type === 'Truck') return id ? (await prisma.truck.findUnique({ where: { id } }))?.vehicle_number ?? 'Truck' : 'Truck';
  if (type === 'Partner') return id ? (await prisma.store.findUnique({ where: { id } }))?.name ?? 'Partner' : 'Partner';
  return id ? (await prisma.asset.findUnique({ where: { id } }))?.code ?? 'Asset' : 'Asset';
}

// Generalized ledger transfer covering every from/to pair NOT already owned
// by dispatch.service.ts: Warehouse<->Partner, Warehouse<->Asset,
// Truck<->Partner, Truck<->Asset, Asset->Warehouse (and their reverses).
export async function moveStock(input: MoveStockInput, actorId: string) {
  if (input.qty.boxes <= 0 && input.qty.pieces <= 0) throw ApiError.badRequest('Quantity must be greater than zero.');
  if (input.from_type === input.to_type && (input.from_id ?? null) === (input.to_id ?? null)) {
    throw ApiError.badRequest('Source and destination must be different.');
  }
  if (isReservedForDispatchModule(input.from_type, input.to_type)) {
    throw ApiError.badRequest('Use the existing Load/Return/Transfer screens for Warehouse/Truck movements.');
  }

  await assertLocationExists(input.from_type, input.from_id);
  await assertLocationExists(input.to_type, input.to_id);

  const product = await prisma.product.findUnique({ where: { id: input.product_id } });
  if (!product) throw ApiError.notFound('Product not found.');
  const piecesPerBox = product.pieces_per_box;

  await prisma.$transaction(async tx => {
    const available = await readQty(tx, input.from_type, input.from_id, input.product_id);
    if (compareQty(available, input.qty, piecesPerBox) < 0) {
      throw ApiError.conflict(`Insufficient stock: only ${formatQty(available)} of ${product.name} available at the source location (requested: ${formatQty(input.qty)}).`);
    }
    await decrementQty(tx, input.from_type, input.from_id, input.product_id, input.qty, available, piecesPerBox);
    await incrementQty(tx, input.to_type, input.to_id, input.product_id, input.qty, piecesPerBox);
    await tx.inventoryMovement.create({
      data: {
        from_location_type: input.from_type,
        from_location_id: input.from_id || null,
        to_location_type: input.to_type,
        to_location_id: input.to_id || null,
        product_id: input.product_id,
        quantity: input.qty.boxes,
        quantity_pieces: input.qty.pieces,
        reason: input.reason,
        actor_id: actorId,
      },
    });
  });

  const fromLabel = await resolveLocationLabel(input.from_type, input.from_id);
  const toLabel = await resolveLocationLabel(input.to_type, input.to_id);
  await logAudit({
    action: 'STOCK_MOVE',
    entity_type: input.to_type === 'Asset' || input.from_type === 'Asset' ? 'Asset' : 'Warehouse',
    entity_id: input.to_id || input.from_id || 'warehouse',
    user_id: actorId,
    details: `${input.from_type} -> ${input.to_type}: Transferred ${formatQty(input.qty)} of ${product.name} from ${fromLabel} to ${toLabel}`,
  });

  return { success: true as const };
}

function buildMovementsWhere(query: Record<string, unknown>): Prisma.InventoryMovementWhereInput {
  const { from, to } = parseDateRangeParams(query);
  const and: Prisma.InventoryMovementWhereInput[] = [];
  if (from || to) and.push({ created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });

  const fromType = typeof query.from_location_type === 'string' && query.from_location_type !== 'All' ? query.from_location_type : '';
  if (fromType) and.push({ from_location_type: fromType as StockLocationType });

  const toType = typeof query.to_location_type === 'string' && query.to_location_type !== 'All' ? query.to_location_type : '';
  if (toType) and.push({ to_location_type: toType as StockLocationType });

  const productId = typeof query.product_id === 'string' ? query.product_id : '';
  if (productId) and.push({ product_id: productId });

  return and.length ? { AND: and } : {};
}

async function withResolvedLabels(rows: Awaited<ReturnType<typeof prisma.inventoryMovement.findMany>>) {
  return Promise.all(rows.map(async r => ({
    ...r,
    from_location_label: await resolveLocationLabel(r.from_location_type, r.from_location_id),
    to_location_label: await resolveLocationLabel(r.to_location_type, r.to_location_id),
  })));
}

export async function listMovements(query: Record<string, unknown> = {}) {
  const rows = await prisma.inventoryMovement.findMany({ where: buildMovementsWhere(query), orderBy: { created_at: 'desc' }, take: 200 });
  return withResolvedLabels(rows);
}

export async function listMovementsPaged(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePageParams(query);
  const where = buildMovementsWhere(query);
  const [rows, total] = await Promise.all([
    prisma.inventoryMovement.findMany({ where, orderBy: { created_at: 'desc' }, skip, take }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return buildPagedResult(await withResolvedLabels(rows), total, page, pageSize);
}
