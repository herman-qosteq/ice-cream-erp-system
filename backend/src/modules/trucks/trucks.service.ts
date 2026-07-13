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

export async function setStatus(id: string, status: 'Active' | 'Inactive', actorId: string) {
  const truck = await prisma.truck.findUnique({ where: { id } });
  if (!truck) throw ApiError.notFound('Truck not found');

  if (status === 'Inactive') {
    const cargoQty = await prisma.truckInventory.aggregate({ where: { truck_id: id, quantity: { gt: 0 } }, _count: true });
    if (cargoQty._count > 0) {
      throw ApiError.conflict(`Cannot remove "${truck.vehicle_number}": this vehicle still has cargo loaded. Return or transfer all stock first.`);
    }
  }

  const updated = await prisma.truck.update({ where: { id }, data: { status } });
  if (status === 'Inactive') {
    await logAudit({ action: 'TRUCK_DELETE', entity_type: 'Truck', entity_id: id, user_id: actorId, details: `Deactivated fleet vehicle ${truck.vehicle_number}` });
  } else {
    await logAudit({ action: 'TRUCK_REACTIVATE', entity_type: 'Truck', entity_id: id, user_id: actorId, details: `Reactivated fleet vehicle ${truck.vehicle_number}` });
  }
  return updated;
}
