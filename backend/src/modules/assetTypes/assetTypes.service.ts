import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

export async function listAssetTypes() {
  const types = await prisma.assetType.findMany({ orderBy: { name: 'asc' } });
  if (types.length > 0) return types;

  // Defensive bootstrap for a real deployment that never ran `prisma db
  // seed` - mirrors the seed.ts list so the dropdown is never empty.
  const defaults = ['Freezer Box', 'Refrigerator', 'Deep Freezer', 'Ice Cream Cart'];
  await prisma.assetType.createMany({ data: defaults.map(name => ({ name })), skipDuplicates: true });
  return prisma.assetType.findMany({ orderBy: { name: 'asc' } });
}

export async function createAssetType(name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Please enter an asset type name.');
  const existing = await prisma.assetType.findFirst({ where: { name: { equals: trimmed } } });
  if (existing) throw ApiError.conflict(`An asset type named "${trimmed}" already exists.`);

  const assetType = await prisma.assetType.create({ data: { name: trimmed } });
  await logAudit({ action: 'ASSET_TYPE_CREATE', entity_type: 'AssetType', entity_id: assetType.id, user_id: actorId, details: `Added asset type ${trimmed}` });
  return assetType;
}

export async function renameAssetType(id: string, name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw ApiError.badRequest('Asset type name cannot be empty.');

  const assetType = await prisma.assetType.findUnique({ where: { id } });
  if (!assetType) throw ApiError.notFound('Asset type not found.');

  const existing = await prisma.assetType.findFirst({ where: { name: { equals: trimmed }, NOT: { id } } });
  if (existing) throw ApiError.conflict(`An asset type named "${trimmed}" already exists.`);

  // Asset.asset_type is matched by name (not a foreign key), so every asset
  // currently using the old name is renamed along with it.
  await prisma.$transaction([
    prisma.asset.updateMany({ where: { asset_type: assetType.name }, data: { asset_type: trimmed } }),
    prisma.assetType.update({ where: { id }, data: { name: trimmed } }),
  ]);

  await logAudit({ action: 'ASSET_TYPE_EDIT', entity_type: 'AssetType', entity_id: id, user_id: actorId, details: `Renamed asset type "${assetType.name}" to "${trimmed}"` });
  return { ...assetType, name: trimmed };
}

export async function deleteAssetType(id: string, actorId: string) {
  const assetType = await prisma.assetType.findUnique({ where: { id } });
  if (!assetType) throw ApiError.notFound('Asset type not found.');

  const assetsUsingType = await prisma.asset.count({ where: { asset_type: assetType.name } });
  if (assetsUsingType > 0) {
    throw ApiError.conflict(`Cannot delete "${assetType.name}": ${assetsUsingType} asset(s) still use this type. Reassign those assets to a different type first.`);
  }

  await prisma.assetType.delete({ where: { id } });
  await logAudit({ action: 'ASSET_TYPE_DELETE', entity_type: 'AssetType', entity_id: id, user_id: actorId, details: `Deleted asset type ${assetType.name}` });
  return { id };
}
