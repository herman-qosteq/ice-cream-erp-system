import { Prisma, AssetStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num, dateOnly } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';
import { parsePageParams, parseDateRangeParams, containsInsensitive, buildPagedResult } from '../../utils/pagination';
import { AssetInput, AssignAssetInput } from './assets.types';

function serializeAsset(a: any) {
  return {
    ...a,
    assigned_date: dateOnly(a.assigned_date) ?? undefined,
    last_service_date: dateOnly(a.last_service_date) ?? undefined,
  };
}

// Validated against AssetType.name rather than a DB foreign key (same
// denormalized-string reasoning as Store.partner_type) so an invalid/typo'd
// type can't silently attach to an asset.
async function assertValidAssetType(asset_type: string) {
  const exists = await prisma.assetType.findFirst({ where: { name: { equals: asset_type } } });
  if (!exists) throw ApiError.badRequest(`"${asset_type}" is not a recognized asset type.`);
}

// logAudit() resolves the actor name/role identically for AuditLog rows -
// duplicated here (rather than exported from lib/audit.ts) so
// AssetAssignmentHistory can snapshot the same values without making the
// shared audit helper transaction-aware for every other module's sake.
async function resolveActorSnapshot(actorId: string): Promise<{ name?: string; role?: string }> {
  if (actorId === 'system') return { name: 'System', role: 'System' };
  const user = await prisma.user.findUnique({ where: { id: actorId } });
  return {
    name: user ? user.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : actorId,
    role: user ? user.role : 'Unknown',
  };
}

export async function listAssets() {
  const assets = await prisma.asset.findMany({ orderBy: { created_at: 'desc' } });
  return assets.map(serializeAsset);
}

function buildAssetsWhere(query: Record<string, unknown>): Prisma.AssetWhereInput {
  const { from, to } = parseDateRangeParams(query);
  const and: Prisma.AssetWhereInput[] = [];
  if (from || to) and.push({ created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });

  const status = typeof query.status === 'string' && query.status !== 'All' ? query.status : '';
  if (status) and.push({ status: status as AssetStatus });

  const assetType = typeof query.asset_type === 'string' && query.asset_type !== 'All' ? query.asset_type : '';
  if (assetType) and.push({ asset_type: assetType });

  const locationType = typeof query.location_type === 'string' && query.location_type !== 'All' ? query.location_type : '';
  if (locationType) and.push({ location_type: locationType as Prisma.EnumStockLocationTypeFilter['equals'] });

  const assignedPartnerId = typeof query.assigned_partner_id === 'string' ? query.assigned_partner_id : '';
  if (assignedPartnerId) and.push({ assigned_partner_id: assignedPartnerId });

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    and.push({
      OR: [
        { code: containsInsensitive(search) },
        { name: containsInsensitive(search) },
        { serial_number: containsInsensitive(search) },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export async function listAssetsPaged(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePageParams(query);
  const where = buildAssetsWhere(query);
  const [rows, total] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: { created_at: 'desc' }, skip, take }),
    prisma.asset.count({ where }),
  ]);
  return buildPagedResult(rows.map(serializeAsset), total, page, pageSize);
}

async function assertNoDuplicateAssetCode(code: string, excludeId?: string) {
  const trimmed = code.trim();
  const existing = await prisma.asset.findFirst({ where: { code: { equals: trimmed }, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
  if (existing) throw ApiError.conflict(`An asset with code "${trimmed}" already exists.`);
}

export async function createAsset(input: AssetInput, actorId: string) {
  await assertValidAssetType(input.asset_type);
  await assertNoDuplicateAssetCode(input.code);

  const asset = await prisma.asset.create({
    data: {
      name: input.name,
      code: input.code.trim(),
      asset_type: input.asset_type,
      serial_number: input.serial_number,
      capacity: input.capacity,
      notes: input.notes,
      status: 'Warehouse',
      location_type: 'Warehouse',
      location_id: null,
    },
  });
  await logAudit({ action: 'ASSET_REGISTER', entity_type: 'Asset', entity_id: asset.id, user_id: actorId, details: `Registered new asset ${asset.code} (${asset.name})` });
  return serializeAsset(asset);
}

export async function updateAsset(id: string, input: Partial<AssetInput> & { last_service_date?: string }, actorId: string) {
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Asset not found.');

  if (input.asset_type) await assertValidAssetType(input.asset_type);
  if (input.code) await assertNoDuplicateAssetCode(input.code, id);

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      code: input.code ? input.code.trim() : existing.code,
      asset_type: input.asset_type ?? existing.asset_type,
      serial_number: input.serial_number ?? existing.serial_number,
      capacity: input.capacity ?? existing.capacity,
      notes: input.notes ?? existing.notes,
      last_service_date: input.last_service_date ? new Date(input.last_service_date) : existing.last_service_date,
    },
  });
  await logAudit({ action: 'ASSET_EDIT', entity_type: 'Asset', entity_id: id, user_id: actorId, details: `Edited asset details for ${asset.code}` });
  return serializeAsset(asset);
}

async function recordHistory(
  tx: Prisma.TransactionClient,
  params: { asset_id: string; event_type: Parameters<typeof prisma.assetAssignmentHistory.create>[0]['data']['event_type']; partner_id?: string | null; from_status?: AssetStatus | null; to_status: AssetStatus; actor: { name?: string; role?: string }; actor_id: string; notes?: string },
) {
  await tx.assetAssignmentHistory.create({
    data: {
      asset_id: params.asset_id,
      event_type: params.event_type,
      partner_id: params.partner_id ?? null,
      from_status: params.from_status ?? null,
      to_status: params.to_status,
      actor_id: params.actor_id,
      actor_name: params.actor.name,
      actor_role: params.actor.role,
      notes: params.notes,
    },
  });
}

export async function assignAsset(input: AssignAssetInput & { asset_id: string }, actorId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: input.asset_id } });
  if (!asset) throw ApiError.notFound('Asset not found.');
  if (!(['Warehouse', 'Returned', 'Maintenance'] as AssetStatus[]).includes(asset.status)) {
    throw ApiError.conflict(`Cannot assign asset ${asset.code}: it is currently ${asset.status} and must be Warehouse/Returned/Maintenance first.`);
  }
  const partner = await prisma.store.findUnique({ where: { id: input.partner_id } });
  if (!partner) throw ApiError.notFound('Partner not found.');

  const actor = await resolveActorSnapshot(actorId);
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.asset.update({
      where: { id: input.asset_id },
      data: {
        status: 'Assigned',
        location_type: 'Partner',
        location_id: input.partner_id,
        assigned_partner_id: input.partner_id,
        assigned_date: new Date(),
      },
    });
    await recordHistory(tx, { asset_id: input.asset_id, event_type: 'Assigned', partner_id: input.partner_id, from_status: asset.status, to_status: 'Assigned', actor, actor_id: actorId, notes: input.notes });
    return result;
  });

  await logAudit({ action: 'ASSET_ASSIGN', entity_type: 'Asset', entity_id: input.asset_id, user_id: actorId, details: `Assigned asset ${asset.code} to partner ${partner.name}` });
  return serializeAsset(updated);
}

export async function returnAsset(input: { asset_id: string; notes?: string }, actorId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: input.asset_id } });
  if (!asset) throw ApiError.notFound('Asset not found.');
  if (asset.status !== 'Assigned') throw ApiError.conflict(`Cannot return asset ${asset.code}: it is not currently assigned.`);

  const partner = asset.assigned_partner_id ? await prisma.store.findUnique({ where: { id: asset.assigned_partner_id } }) : null;
  const actor = await resolveActorSnapshot(actorId);
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.asset.update({
      where: { id: input.asset_id },
      data: { status: 'Returned', location_type: 'Warehouse', location_id: null, assigned_partner_id: null },
    });
    await recordHistory(tx, { asset_id: input.asset_id, event_type: 'Returned', partner_id: asset.assigned_partner_id, from_status: 'Assigned', to_status: 'Returned', actor, actor_id: actorId, notes: input.notes });
    return result;
  });

  await logAudit({ action: 'ASSET_RETURN', entity_type: 'Asset', entity_id: input.asset_id, user_id: actorId, details: `Returned asset ${asset.code} from partner ${partner?.name ?? 'partner'} to the warehouse` });
  return serializeAsset(updated);
}

export async function setMaintenance(assetId: string, actorId: string, notes?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('Asset not found.');
  if ((['Lost', 'Inactive', 'Maintenance'] as AssetStatus[]).includes(asset.status)) {
    throw ApiError.conflict(`Cannot send asset ${asset.code} to maintenance from its current status (${asset.status}).`);
  }

  const actor = await resolveActorSnapshot(actorId);
  const updated = await prisma.$transaction(async tx => {
    // assignAsset() treats Maintenance as one of the valid "available to
    // (re)assign" source statuses (same as Warehouse/Returned) - so the old
    // assigned_partner_id/location must be cleared here exactly like
    // returnAsset() does, otherwise the asset keeps showing as still
    // assigned to its previous partner (in the list's "Assigned Partner"
    // column and the detail view) while simultaneously being offered back
    // up for a fresh assignment.
    const result = await tx.asset.update({
      where: { id: assetId },
      data: { status: 'Maintenance', location_type: 'Warehouse', location_id: null, assigned_partner_id: null },
    });
    await recordHistory(tx, { asset_id: assetId, event_type: 'MaintenanceStart', partner_id: asset.assigned_partner_id, from_status: asset.status, to_status: 'Maintenance', actor, actor_id: actorId, notes });
    return result;
  });

  await logAudit({ action: 'ASSET_MAINTENANCE_START', entity_type: 'Asset', entity_id: assetId, user_id: actorId, details: `Sent asset ${asset.code} to maintenance` });
  return serializeAsset(updated);
}

export async function endMaintenance(assetId: string, actorId: string, notes?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('Asset not found.');
  if (asset.status !== 'Maintenance') throw ApiError.conflict(`Asset ${asset.code} is not currently under maintenance.`);

  const actor = await resolveActorSnapshot(actorId);
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.asset.update({
      where: { id: assetId },
      // assigned_partner_id is cleared defensively too (setMaintenance
      // already clears it on the way in) so any asset that reached
      // Maintenance before that fix self-heals the moment it completes.
      data: { status: 'Warehouse', location_type: 'Warehouse', location_id: null, assigned_partner_id: null, last_service_date: new Date() },
    });
    await recordHistory(tx, { asset_id: assetId, event_type: 'MaintenanceEnd', partner_id: asset.assigned_partner_id, from_status: 'Maintenance', to_status: 'Warehouse', actor, actor_id: actorId, notes });
    return result;
  });

  await logAudit({ action: 'ASSET_MAINTENANCE_END', entity_type: 'Asset', entity_id: assetId, user_id: actorId, details: `Completed maintenance for asset ${asset.code}, returned to warehouse` });
  return serializeAsset(updated);
}

export async function markLost(assetId: string, actorId: string, notes?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('Asset not found.');
  if ((['Lost', 'Inactive'] as AssetStatus[]).includes(asset.status)) {
    throw ApiError.conflict(`Asset ${asset.code} is already ${asset.status}.`);
  }

  const actor = await resolveActorSnapshot(actorId);
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.asset.update({ where: { id: assetId }, data: { status: 'Lost' } });
    await recordHistory(tx, { asset_id: assetId, event_type: 'MarkedLost', partner_id: asset.assigned_partner_id, from_status: asset.status, to_status: 'Lost', actor, actor_id: actorId, notes });
    return result;
  });

  await logAudit({ action: 'ASSET_MARK_LOST', entity_type: 'Asset', entity_id: assetId, user_id: actorId, details: `Marked asset ${asset.code} as lost` });
  return serializeAsset(updated);
}

export async function reactivateAsset(assetId: string, actorId: string, notes?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('Asset not found.');
  if (!(['Lost', 'Inactive'] as AssetStatus[]).includes(asset.status)) {
    throw ApiError.conflict(`Asset ${asset.code} is not Lost or Inactive.`);
  }

  const actor = await resolveActorSnapshot(actorId);
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.asset.update({
      where: { id: assetId },
      data: { status: 'Warehouse', location_type: 'Warehouse', location_id: null, assigned_partner_id: null },
    });
    await recordHistory(tx, { asset_id: assetId, event_type: 'Reactivated', partner_id: null, from_status: asset.status, to_status: 'Warehouse', actor, actor_id: actorId, notes });
    return result;
  });

  await logAudit({ action: 'ASSET_REACTIVATE', entity_type: 'Asset', entity_id: assetId, user_id: actorId, details: `Reactivated asset ${asset.code} back into the warehouse pool` });
  return serializeAsset(updated);
}

export async function deactivateAsset(assetId: string, actorId: string, notes?: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('Asset not found.');
  if (asset.status === 'Inactive') throw ApiError.conflict(`Asset ${asset.code} is already Inactive.`);

  const actor = await resolveActorSnapshot(actorId);
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.asset.update({ where: { id: assetId }, data: { status: 'Inactive' } });
    await recordHistory(tx, { asset_id: assetId, event_type: 'Deactivated', partner_id: asset.assigned_partner_id, from_status: asset.status, to_status: 'Inactive', actor, actor_id: actorId, notes });
    return result;
  });

  await logAudit({ action: 'ASSET_DEACTIVATE', entity_type: 'Asset', entity_id: assetId, user_id: actorId, details: `Deactivated asset ${asset.code}` });
  return serializeAsset(updated);
}

export async function listAssetHistory(assetId: string) {
  return prisma.assetAssignmentHistory.findMany({ where: { asset_id: assetId }, orderBy: { date: 'desc' } });
}

export async function listAssetInventory(assetId: string) {
  return prisma.assetInventory.findMany({ where: { asset_id: assetId } });
}

// Cheap aggregate for the Dashboard's "Freezer Box Stock" inventory tile -
// total ice cream units currently tracked across every asset, without the
// frontend needing to fetch and sum every asset's own inventory rows.
export async function getInventorySummary() {
  const agg = await prisma.assetInventory.aggregate({ _sum: { quantity: true } });
  return { totalUnits: agg._sum.quantity ?? 0 };
}

// Cross-asset variants of listAssetInventory/listAssetHistory, for the
// Freezer Box Inventory Report and Asset Assignment History Report - those
// need every asset's rows at once, not one asset at a time.
export async function listAllAssetInventory() {
  return prisma.assetInventory.findMany();
}

export async function listAllAssetHistory() {
  return prisma.assetAssignmentHistory.findMany({ orderBy: { date: 'desc' } });
}
