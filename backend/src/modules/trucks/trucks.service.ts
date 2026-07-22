import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

export async function listTrucks() {
  return prisma.truck.findMany({ orderBy: { created_at: 'asc' } });
}

interface TruckInput {
  vehicle_number: string;
  driver_user_id: string;
  route: string;
  area: string;
}

export async function createTruck(input: TruckInput, actorId: string) {
  const truck = await prisma.truck.create({ data: { ...input, status: 'Active' } });
  await logAudit({ action: 'TRUCK_CREATE', entity_type: 'Truck', entity_id: truck.id, user_id: actorId, details: `Registered new fleet vehicle ${truck.vehicle_number}` });
  return truck;
}

export async function updateTruck(id: string, input: TruckInput, actorId: string) {
  const truck = await prisma.truck.update({ where: { id }, data: input });
  await logAudit({ action: 'TRUCK_EDIT', entity_type: 'Truck', entity_id: id, user_id: actorId, details: `Updated fleet vehicle details for ${truck.vehicle_number}` });
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

  let returnedUnits = 0;
  let returnedSummary = '';

  const updated = await prisma.$transaction(async tx => {
    if (status === 'Inactive') {
      const cargo = await tx.truckInventory.findMany({ where: { truck_id: id, quantity: { gt: 0 } } });
      if (cargo.length > 0) {
        const summaries: string[] = [];
        for (const item of cargo) {
          await tx.warehouseInventory.upsert({
            where: { product_id: item.product_id },
            update: { available_qty: { increment: item.quantity } },
            create: { product_id: item.product_id, available_qty: item.quantity },
          });
          const product = await tx.product.findUnique({ where: { id: item.product_id } });
          summaries.push(`${item.quantity} unit(s) of ${product?.name ?? 'Product'}`);
          returnedUnits += item.quantity;
        }
        await tx.truckInventory.deleteMany({ where: { truck_id: id } });
        returnedSummary = summaries.join(', ');
      }
    }
    return tx.truck.update({ where: { id }, data: { status } });
  });

  if (status === 'Inactive') {
    const details = returnedUnits > 0
      ? `Deactivated fleet vehicle ${truck.vehicle_number}. Automatically returned ${returnedUnits} unit(s) of loaded cargo (${returnedSummary}) back to warehouse stock.`
      : `Deactivated fleet vehicle ${truck.vehicle_number}.`;
    await logAudit({ action: 'TRUCK_DELETE', entity_type: 'Truck', entity_id: id, user_id: actorId, details });
  } else {
    await logAudit({ action: 'TRUCK_REACTIVATE', entity_type: 'Truck', entity_id: id, user_id: actorId, details: `Reactivated fleet vehicle ${truck.vehicle_number}` });
  }

  return { ...updated, returnedUnits, returnedSummary: returnedSummary || undefined };
}
