import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';
import { addQty, formatQty, readQtyField } from '../../utils/pieceQty';

export async function listTrucks() {
  return prisma.truck.findMany({ orderBy: { created_at: 'asc' } });
}

interface CreateTruckInput {
  vehicle_number: string;
  driver_user_id: string;
  route: string;
  area: string;
}

interface UpdateTruckInput {
  vehicle_number: string;
  // null when Edit Truck unassigns the driver (see updateTruckSchema in
  // trucks.controller.ts) - not possible on create, only on update.
  driver_user_id: string | null;
  route: string;
  area: string;
}

export async function createTruck(input: CreateTruckInput, actorId: string) {
  const truck = await prisma.truck.create({ data: { ...input, status: 'Active' } });
  await logAudit({ action: 'TRUCK_CREATE', entity_type: 'Truck', entity_id: truck.id, user_id: actorId, details: `Registered new fleet vehicle ${truck.vehicle_number}` });
  return truck;
}

export async function updateTruck(id: string, input: UpdateTruckInput, actorId: string) {
  const truck = await prisma.truck.update({ where: { id }, data: input });
  const driverNote = input.driver_user_id === null ? ' Driver unassigned.' : '';
  await logAudit({ action: 'TRUCK_EDIT', entity_type: 'Truck', entity_id: id, user_id: actorId, details: `Updated fleet vehicle details for ${truck.vehicle_number}.${driverNote}` });
  return truck;
}

// Deactivating a truck that still has cargo loaded no longer blocks the
// action - it automatically returns everything back to warehouse available
// stock first (same effect as dispatch.service.ts's returnAllStock, done
// inline here so the return and the status change land in one transaction),
// then proceeds. The caller gets back how much (if anything) was returned so
// it can show an accurate confirmation instead of a generic one.
export async function setStatus(id: string, status: 'Active' | 'Inactive', actorId: string) {
  const truck = await prisma.truck.findUnique({ where: { id } });
  if (!truck) throw ApiError.notFound('Truck not found');

  let returnedBoxes = 0;
  let returnedPieces = 0;
  let returnedSummary = '';

  const updated = await prisma.$transaction(async tx => {
    if (status === 'Inactive') {
      const cargo = await tx.truckInventory.findMany({ where: { truck_id: id, OR: [{ quantity: { gt: 0 } }, { quantity_pieces: { gt: 0 } }] } });
      if (cargo.length > 0) {
        const summaries: string[] = [];
        for (const item of cargo) {
          const product = await tx.product.findUnique({ where: { id: item.product_id } });
          const piecesPerBox = product?.pieces_per_box ?? 1;
          const cargoQty = readQtyField(item, 'quantity', 'quantity_pieces');
          const existingWarehouse = await tx.warehouseInventory.findUnique({ where: { product_id: item.product_id } });
          const currentWarehouse = existingWarehouse ? readQtyField(existingWarehouse, 'available_qty', 'available_pieces') : { boxes: 0, pieces: 0 };
          const nextWarehouse = addQty(currentWarehouse, cargoQty, piecesPerBox);
          await tx.warehouseInventory.upsert({
            where: { product_id: item.product_id },
            update: { available_qty: nextWarehouse.boxes, available_pieces: nextWarehouse.pieces },
            create: { product_id: item.product_id, available_qty: nextWarehouse.boxes, available_pieces: nextWarehouse.pieces },
          });
          summaries.push(`${formatQty(cargoQty)} of ${product?.name ?? 'Product'}`);
          returnedBoxes += cargoQty.boxes;
          returnedPieces += cargoQty.pieces;
        }
        await tx.truckInventory.deleteMany({ where: { truck_id: id } });
        returnedSummary = summaries.join(', ');
      }
    }
    // Deactivating also clears the driver assignment - a decommissioned
    // truck shouldn't keep showing as "assigned" to a driver who's now free
    // to be put on another vehicle. Reactivating does NOT restore it (the
    // previous driver may no longer be free/relevant by then); the driver
    // dropdown on Edit Truck just comes up empty and has to be re-picked
    // before the next save, same as any other required field.
    return tx.truck.update({ where: { id }, data: { status, ...(status === 'Inactive' ? { driver_user_id: null } : {}) } });
  });

  if (status === 'Inactive') {
    const details = returnedSummary
      ? `Deactivated fleet vehicle ${truck.vehicle_number}. Automatically returned loaded cargo (${returnedSummary}) back to warehouse stock and unassigned its driver.`
      : `Deactivated fleet vehicle ${truck.vehicle_number} and unassigned its driver.`;
    await logAudit({ action: 'TRUCK_DELETE', entity_type: 'Truck', entity_id: id, user_id: actorId, details });
  } else {
    await logAudit({ action: 'TRUCK_REACTIVATE', entity_type: 'Truck', entity_id: id, user_id: actorId, details: `Reactivated fleet vehicle ${truck.vehicle_number}` });
  }

  return { ...updated, returnedUnits: returnedBoxes, returnedPieces, returnedSummary: returnedSummary || undefined };
}
