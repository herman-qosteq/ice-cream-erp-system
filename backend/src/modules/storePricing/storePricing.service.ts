import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { numOrUndefined } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';

function serialize(row: { id: string; store_id: string; product_id: string; wholesale_discount_pct: any; retail_discount_pct: any }) {
  return {
    id: row.id,
    store_id: row.store_id,
    product_id: row.product_id,
    wholesale_discount_pct: numOrUndefined(row.wholesale_discount_pct),
    retail_discount_pct: numOrUndefined(row.retail_discount_pct),
  };
}

export async function listStorePricing() {
  const rows = await prisma.storePricing.findMany();
  return rows.map(serialize);
}

interface UpsertInput {
  store_id: string;
  product_id: string;
  wholesale_discount_pct: number | null;
  retail_discount_pct: number | null;
}

// A row with both sides null means "no override for either rate" - i.e.
// nothing left to track - so it's deleted instead of stored empty. Either
// field left null (not zero) keeps that side following the catalog's live
// rate rather than freezing today's value.
export async function upsertStorePricing(input: UpsertInput, actorId: string) {
  const store = await prisma.store.findUnique({ where: { id: input.store_id } });
  if (!store) throw ApiError.notFound('Store not found.');
  const product = await prisma.product.findUnique({ where: { id: input.product_id } });
  if (!product) throw ApiError.notFound('Product not found.');

  if (input.wholesale_discount_pct === null && input.retail_discount_pct === null) {
    await prisma.storePricing.deleteMany({ where: { store_id: input.store_id, product_id: input.product_id } });
    await logAudit({ action: 'STORE_PRICING_RESET', entity_type: 'Store', entity_id: input.store_id, user_id: actorId, details: `Reset ${product.name} back to catalog pricing for ${store.name}` });
    return null;
  }

  const row = await prisma.storePricing.upsert({
    where: { store_id_product_id: { store_id: input.store_id, product_id: input.product_id } },
    update: { wholesale_discount_pct: input.wholesale_discount_pct, retail_discount_pct: input.retail_discount_pct },
    create: {
      store_id: input.store_id,
      product_id: input.product_id,
      wholesale_discount_pct: input.wholesale_discount_pct,
      retail_discount_pct: input.retail_discount_pct,
    },
  });

  await logAudit({ action: 'STORE_PRICING_SET', entity_type: 'Store', entity_id: input.store_id, user_id: actorId, details: `Set custom pricing for ${product.name} at ${store.name}` });
  return serialize(row);
}

// Copies a source store's entire custom-pricing list onto one or more
// target stores, for partner outlets that all negotiate the same rates -
// avoids re-entering every product's discount by hand for each one. This
// REPLACES each target's existing overrides (not a merge): the target ends
// up an exact copy of the source's list, including products the target
// previously had no override for at all and dropping any override the
// target had that the source doesn't share.
export async function cloneStorePricing(input: { source_store_id: string; target_store_ids: string[] }, actorId: string) {
  const sourceStore = await prisma.store.findUnique({ where: { id: input.source_store_id } });
  if (!sourceStore) throw ApiError.notFound('Source store not found.');

  const targetIds = [...new Set(input.target_store_ids)].filter(id => id !== input.source_store_id);
  if (targetIds.length === 0) throw ApiError.badRequest('Select at least one destination store other than the source store.');

  const targetStores = await prisma.store.findMany({ where: { id: { in: targetIds } } });
  if (targetStores.length !== targetIds.length) throw ApiError.notFound('One or more destination stores were not found.');

  const sourceRows = await prisma.storePricing.findMany({ where: { store_id: input.source_store_id } });
  if (sourceRows.length === 0) throw ApiError.badRequest(`${sourceStore.name} has no custom pricing set yet - nothing to clone.`);

  await prisma.$transaction(async tx => {
    for (const targetId of targetIds) {
      await tx.storePricing.deleteMany({ where: { store_id: targetId } });
      await tx.storePricing.createMany({
        data: sourceRows.map(r => ({
          store_id: targetId,
          product_id: r.product_id,
          wholesale_discount_pct: r.wholesale_discount_pct,
          retail_discount_pct: r.retail_discount_pct,
        })),
      });
    }
  });

  const targetNames = targetStores.map(s => s.name).join(', ');
  await logAudit({
    action: 'STORE_PRICING_CLONE', entity_type: 'Store', entity_id: input.source_store_id, user_id: actorId,
    details: `Cloned ${sourceStore.name}'s custom pricing (${sourceRows.length} product(s)) to: ${targetNames}.`,
  });

  return listStorePricing();
}

export async function removeStorePricing(id: string, actorId: string) {
  const row = await prisma.storePricing.findUnique({ where: { id }, include: { store: true, product: true } });
  if (!row) throw ApiError.notFound('Custom pricing entry not found.');

  await prisma.storePricing.delete({ where: { id } });
  await logAudit({ action: 'STORE_PRICING_RESET', entity_type: 'Store', entity_id: row.store_id, user_id: actorId, details: `Reset ${row.product.name} back to catalog pricing for ${row.store.name}` });
  return { id };
}
