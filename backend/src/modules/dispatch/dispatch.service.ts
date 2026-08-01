import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';
import { BoxPieceQty, addQty, subtractQty, compareQty, isPositiveQty, formatQty, readQtyField } from '../../utils/pieceQty';

export async function listTruckInventory(truckId: string) {
  return prisma.truckInventory.findMany({ where: { truck_id: truckId } });
}

// Flat cross-truck array, matching the shape of the frontend's ERPData.truck_inventory.
export async function listAllTruckInventory() {
  return prisma.truckInventory.findMany();
}

interface LoadItem {
  product_id: string;
  qty: BoxPieceQty;
  source: 'available_qty' | 'reserved_qty';
  pre_booking_id?: string;
}

const POOL_PIECE_FIELD = { available_qty: 'available_pieces', reserved_qty: 'reserved_pieces' } as const;

// Mirrors handleLoadStock(): moves stock from the warehouse's available or
// reserved pool onto a truck. Items tagged with pre_booking_id also stamp
// PreBookingDispatchedItem so a later delivery-confirmation doesn't deduct
// the same units from the warehouse twice.
export async function loadCargo(truckId: string, items: LoadItem[], actorId: string) {
  if (items.length === 0) throw ApiError.badRequest('Please add at least one item to dispatch.');

  return prisma.$transaction(async tx => {
    for (const item of items) {
      const inv = await tx.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
      const product = await tx.product.findUnique({ where: { id: item.product_id } });
      const pieceField = POOL_PIECE_FIELD[item.source];
      const available = inv ? readQtyField(inv, item.source, pieceField) : { boxes: 0, pieces: 0 };
      const piecesPerBox = product?.pieces_per_box ?? 1;
      if (compareQty(available, item.qty, piecesPerBox) < 0) {
        throw ApiError.conflict(`Insufficient ${item.source === 'reserved_qty' ? 'reserved' : 'available'} warehouse stock! Only ${formatQty(available)} of ${product?.name ?? 'product'} are available in that pool (Requested: ${formatQty(item.qty)}).`);
      }
    }

    const truck = await tx.truck.findUnique({ where: { id: truckId } });
    const summaries: string[] = [];

    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.product_id } });
      const piecesPerBox = product?.pieces_per_box ?? 1;
      const pieceField = POOL_PIECE_FIELD[item.source];

      const inv = await tx.warehouseInventory.findUniqueOrThrow({ where: { product_id: item.product_id } });
      const currentPool = readQtyField(inv, item.source, pieceField);
      const nextPool = subtractQty(currentPool, item.qty, piecesPerBox);
      await tx.warehouseInventory.update({ where: { product_id: item.product_id }, data: { [item.source]: nextPool.boxes, [pieceField]: nextPool.pieces } });

      const existingTruckInv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: truckId, product_id: item.product_id } } });
      if (existingTruckInv) {
        const nextTruck = addQty(readQtyField(existingTruckInv, 'quantity', 'quantity_pieces'), item.qty, piecesPerBox);
        await tx.truckInventory.update({ where: { truck_id_product_id: { truck_id: truckId, product_id: item.product_id } }, data: { quantity: nextTruck.boxes, quantity_pieces: nextTruck.pieces } });
      } else {
        await tx.truckInventory.create({ data: { truck_id: truckId, product_id: item.product_id, quantity: item.qty.boxes, quantity_pieces: item.qty.pieces } });
      }

      if (item.pre_booking_id) {
        const existingDispatch = await tx.preBookingDispatchedItem.findFirst({ where: { pre_booking_id: item.pre_booking_id, product_id: item.product_id } });
        if (existingDispatch) {
          const nextDispatched = addQty(readQtyField(existingDispatch, 'quantity', 'quantity_pieces'), item.qty, piecesPerBox);
          await tx.preBookingDispatchedItem.update({ where: { id: existingDispatch.id }, data: { quantity: nextDispatched.boxes, quantity_pieces: nextDispatched.pieces } });
        } else {
          await tx.preBookingDispatchedItem.create({ data: { pre_booking_id: item.pre_booking_id, product_id: item.product_id, quantity: item.qty.boxes, quantity_pieces: item.qty.pieces } });
        }
      }

      summaries.push(`${formatQty(item.qty)} of ${product?.name ?? 'Product'} (${item.source === 'reserved_qty' ? 'Reserved Pool' : 'Available Pool'})`);

      // Additive: feeds the unified inventory-movement ledger (see
      // inventoryMovements module) without changing any existing behavior.
      await tx.inventoryMovement.create({
        data: { from_location_type: 'Warehouse', from_location_id: null, to_location_type: 'Truck', to_location_id: truckId, product_id: item.product_id, quantity: item.qty.boxes, quantity_pieces: item.qty.pieces, actor_id: actorId },
      });
    }

    await logAudit({
      action: 'LOAD_TRUCK',
      entity_type: 'Truck',
      entity_id: truckId,
      user_id: actorId,
      details: `Warehouse -> Truck Cargo Dispatch: Transferred batch containing [${summaries.join(', ')}] to Truck ${truck?.vehicle_number ?? 'Truck'}`,
    });

    return tx.truckInventory.findMany({ where: { truck_id: truckId } });
  });
}

// Mirrors handleReturnStock(): recall a specific product from a truck back
// into the warehouse's available pool.
export async function returnStock(truckId: string, productId: string, qty: BoxPieceQty, actorId: string) {
  return prisma.$transaction(async tx => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    const piecesPerBox = product?.pieces_per_box ?? 1;

    const truckInv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: truckId, product_id: productId } } });
    if (!truckInv) throw ApiError.badRequest('This product is not loaded on this truck.');
    const currentTruck = readQtyField(truckInv, 'quantity', 'quantity_pieces');
    if (compareQty(currentTruck, qty, piecesPerBox) < 0) throw ApiError.badRequest(`Cannot return ${formatQty(qty)}. Only ${formatQty(currentTruck)} are currently loaded on this truck.`);

    const remaining = subtractQty(currentTruck, qty, piecesPerBox);
    if (isPositiveQty(remaining)) {
      await tx.truckInventory.update({ where: { truck_id_product_id: { truck_id: truckId, product_id: productId } }, data: { quantity: remaining.boxes, quantity_pieces: remaining.pieces } });
    } else {
      await tx.truckInventory.delete({ where: { truck_id_product_id: { truck_id: truckId, product_id: productId } } });
    }

    const existingWarehouse = await tx.warehouseInventory.findUnique({ where: { product_id: productId } });
    const currentWarehouse = existingWarehouse ? readQtyField(existingWarehouse, 'available_qty', 'available_pieces') : { boxes: 0, pieces: 0 };
    const nextWarehouse = addQty(currentWarehouse, qty, piecesPerBox);
    await tx.warehouseInventory.upsert({
      where: { product_id: productId },
      update: { available_qty: nextWarehouse.boxes, available_pieces: nextWarehouse.pieces },
      create: { product_id: productId, available_qty: nextWarehouse.boxes, available_pieces: nextWarehouse.pieces },
    });

    // Additive: feeds the unified inventory-movement ledger.
    await tx.inventoryMovement.create({
      data: { from_location_type: 'Truck', from_location_id: truckId, to_location_type: 'Warehouse', to_location_id: null, product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, actor_id: actorId },
    });

    const truck = await tx.truck.findUnique({ where: { id: truckId } });
    await logAudit({
      action: 'RETURN_TRUCK',
      entity_type: 'Warehouse',
      entity_id: truckId,
      user_id: actorId,
      details: `Truck -> Warehouse Return Load: Recalled ${formatQty(qty)} of unsold ${product?.name ?? 'Product'} back from Truck ${truck?.vehicle_number ?? 'Truck'}`,
    });

    return tx.truckInventory.findMany({ where: { truck_id: truckId } });
  });
}

// Mirrors handleReturnAllProducts(): recall everything currently loaded on a
// truck back into the warehouse in one action.
export async function returnAllStock(truckId: string, actorId: string) {
  return prisma.$transaction(async tx => {
    const cargo = await tx.truckInventory.findMany({ where: { truck_id: truckId } });
    if (cargo.length === 0) throw ApiError.badRequest('This truck has no cargo stock loaded currently.');

    const summaries: string[] = [];
    let totalReturnedBoxes = 0;
    let totalReturnedPieces = 0;
    for (const item of cargo) {
      const product = await tx.product.findUnique({ where: { id: item.product_id } });
      const piecesPerBox = product?.pieces_per_box ?? 1;
      const qty = readQtyField(item, 'quantity', 'quantity_pieces');

      const existingWarehouse = await tx.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
      const currentWarehouse = existingWarehouse ? readQtyField(existingWarehouse, 'available_qty', 'available_pieces') : { boxes: 0, pieces: 0 };
      const nextWarehouse = addQty(currentWarehouse, qty, piecesPerBox);
      await tx.warehouseInventory.upsert({
        where: { product_id: item.product_id },
        update: { available_qty: nextWarehouse.boxes, available_pieces: nextWarehouse.pieces },
        create: { product_id: item.product_id, available_qty: nextWarehouse.boxes, available_pieces: nextWarehouse.pieces },
      });
      summaries.push(`${formatQty(qty)} of ${product?.name ?? 'Product'}`);
      totalReturnedBoxes += qty.boxes;
      totalReturnedPieces += qty.pieces;

      // Additive: feeds the unified inventory-movement ledger.
      await tx.inventoryMovement.create({
        data: { from_location_type: 'Truck', from_location_id: truckId, to_location_type: 'Warehouse', to_location_id: null, product_id: item.product_id, quantity: qty.boxes, quantity_pieces: qty.pieces, actor_id: actorId },
      });
    }

    await tx.truckInventory.deleteMany({ where: { truck_id: truckId } });

    const truck = await tx.truck.findUnique({ where: { id: truckId } });
    await logAudit({
      action: 'RETURN_TRUCK_ALL',
      entity_type: 'Warehouse',
      entity_id: truckId,
      user_id: actorId,
      details: `Truck -> Warehouse Return Load (ALL): Recalled all cargo stock (${summaries.join(', ')}) back from Truck ${truck?.vehicle_number ?? 'Truck'}`,
    });

    return { returnedUnits: totalReturnedBoxes, returnedPieces: totalReturnedPieces, returnedSummary: summaries };
  });
}

// Mirrors handleTruckToTruckTransfer(): move cargo directly between two
// trucks without passing back through the warehouse.
export async function transferBetweenTrucks(fromTruckId: string, toTruckId: string, items: { product_id: string; qty: BoxPieceQty }[], actorId: string) {
  if (fromTruckId === toTruckId) throw ApiError.badRequest('Source and destination trucks must be different.');
  if (items.length === 0) throw ApiError.badRequest('Please add at least one item to transfer.');

  return prisma.$transaction(async tx => {
    for (const item of items) {
      const sourceInv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: fromTruckId, product_id: item.product_id } } });
      const product = await tx.product.findUnique({ where: { id: item.product_id } });
      const piecesPerBox = product?.pieces_per_box ?? 1;
      const currentSource = sourceInv ? readQtyField(sourceInv, 'quantity', 'quantity_pieces') : { boxes: 0, pieces: 0 };
      if (compareQty(currentSource, item.qty, piecesPerBox) < 0) {
        const sourceTruck = await tx.truck.findUnique({ where: { id: fromTruckId } });
        throw ApiError.conflict(`Insufficient stock on source truck! Only ${formatQty(currentSource)} of ${product?.name ?? 'Product'} exist on vehicle ${sourceTruck?.vehicle_number ?? 'Truck A'} (Requested total: ${formatQty(item.qty)}).`);
      }
    }

    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.product_id } });
      const piecesPerBox = product?.pieces_per_box ?? 1;

      const sourceInv = await tx.truckInventory.findUniqueOrThrow({ where: { truck_id_product_id: { truck_id: fromTruckId, product_id: item.product_id } } });
      const currentSource = readQtyField(sourceInv, 'quantity', 'quantity_pieces');
      const remaining = subtractQty(currentSource, item.qty, piecesPerBox);
      if (isPositiveQty(remaining)) {
        await tx.truckInventory.update({ where: { truck_id_product_id: { truck_id: fromTruckId, product_id: item.product_id } }, data: { quantity: remaining.boxes, quantity_pieces: remaining.pieces } });
      } else {
        await tx.truckInventory.delete({ where: { truck_id_product_id: { truck_id: fromTruckId, product_id: item.product_id } } });
      }

      const destInv = await tx.truckInventory.findUnique({ where: { truck_id_product_id: { truck_id: toTruckId, product_id: item.product_id } } });
      if (destInv) {
        const nextDest = addQty(readQtyField(destInv, 'quantity', 'quantity_pieces'), item.qty, piecesPerBox);
        await tx.truckInventory.update({ where: { truck_id_product_id: { truck_id: toTruckId, product_id: item.product_id } }, data: { quantity: nextDest.boxes, quantity_pieces: nextDest.pieces } });
      } else {
        await tx.truckInventory.create({ data: { truck_id: toTruckId, product_id: item.product_id, quantity: item.qty.boxes, quantity_pieces: item.qty.pieces } });
      }

      // Additive: feeds the unified inventory-movement ledger.
      await tx.inventoryMovement.create({
        data: { from_location_type: 'Truck', from_location_id: fromTruckId, to_location_type: 'Truck', to_location_id: toTruckId, product_id: item.product_id, quantity: item.qty.boxes, quantity_pieces: item.qty.pieces, actor_id: actorId },
      });
    }

    const sourceTruck = await tx.truck.findUnique({ where: { id: fromTruckId } });
    const destTruck = await tx.truck.findUnique({ where: { id: toTruckId } });
    await logAudit({
      action: 'TRUCK_TRANSFER',
      entity_type: 'Truck',
      entity_id: toTruckId,
      user_id: actorId,
      details: `Inter-Truck Cargo Swap: Transferred ${items.length} product line(s) from ${sourceTruck?.vehicle_number ?? 'Truck A'} to ${destTruck?.vehicle_number ?? 'Truck B'}`,
    });

    return { fromTruck: await tx.truckInventory.findMany({ where: { truck_id: fromTruckId } }), toTruck: await tx.truckInventory.findMany({ where: { truck_id: toTruckId } }) };
  });
}
