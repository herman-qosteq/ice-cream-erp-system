import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { num, dateOnly } from '../../utils/serialize';
import { ApiError } from '../../utils/ApiError';

const productInclude = { category: true, scheduled_prices: true } satisfies Prisma.ProductInclude;
type ProductWithCategory = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

// Percentage-based pricing: MRP is the single stored price, and
// purchase/wholesale/selling prices are always derived from it plus their
// discount % rather than being independently stored. Rounded to cents so the
// derived prices behave exactly like the fixed prices they replaced.
function priceFromDiscount(mrp: number, discountPct: number): number {
  return parseFloat((mrp * (1 - discountPct / 100)).toFixed(2));
}

// Maps the normalized DB row back to the exact shape src/types.ts's Product
// expects: `category` is the category NAME (a plain string), not an id -
// the frontend never sees that this is backed by a real foreign key now.
function serializeProduct(p: ProductWithCategory) {
  const mrp = num(p.mrp);
  const purchase_discount_pct = num(p.purchase_discount_pct);
  const wholesale_discount_pct = num(p.wholesale_discount_pct);
  const retail_discount_pct = num(p.retail_discount_pct);
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    category: p.category.name,
    brand: p.brand,
    description: p.description,
    image_url: p.image_url ?? '',
    mrp,
    purchase_discount_pct,
    wholesale_discount_pct,
    retail_discount_pct,
    purchase_price: priceFromDiscount(mrp, purchase_discount_pct),
    wholesale_price: priceFromDiscount(mrp, wholesale_discount_pct),
    selling_price: priceFromDiscount(mrp, retail_discount_pct),
    tax_pct: num(p.tax_pct),
    status: p.status,
    unit_value: num(p.unit_value),
    unit_type: p.unit_type,
    expiry_date: dateOnly(p.expiry_date),
    scheduled_prices: p.scheduled_prices.map(sp => ({
      id: sp.id,
      purchase_price: num(sp.purchase_price),
      selling_price: num(sp.selling_price),
      effective_date: dateOnly(sp.effective_date),
      applied: sp.applied,
    })),
  };
}

async function resolveCategoryId(categoryName: string): Promise<string> {
  const category = await prisma.category.findFirst({ where: { name: categoryName } });
  if (!category) throw ApiError.badRequest(`Unknown category: ${categoryName}`);
  return category.id;
}

export async function listProducts() {
  const products = await prisma.product.findMany({ include: productInclude, orderBy: { created_at: 'desc' } });
  return products.map(serializeProduct);
}

interface ProductInput {
  name: string;
  code: string;
  category: string;
  brand: string;
  description: string;
  image_url: string;
  mrp: number;
  purchase_discount_pct: number;
  wholesale_discount_pct: number;
  retail_discount_pct: number;
  tax_pct: number;
  status: 'Active' | 'Inactive';
  unit_value: number;
  unit_type: 'ml' | 'L' | 'g' | 'kg' | 'pcs';
}

export async function createProduct(input: ProductInput, actorId: string) {
  const category_id = await resolveCategoryId(input.category);
  const { category, ...rest } = input;

  const existing = await prisma.product.findFirst({ where: { name: { equals: input.name.trim() } } });
  if (existing) throw ApiError.conflict(`A product named "${input.name.trim()}" already exists.`);

  const product = await prisma.$transaction(async tx => {
    const created = await tx.product.create({ data: { ...rest, category_id } });
    await tx.warehouseInventory.create({ data: { product_id: created.id } });
    return created;
  });

  await logAudit({ action: 'PRODUCT_CREATE', entity_type: 'Product', entity_id: product.id, user_id: actorId, details: `Created product ${product.name}` });
  return serializeProduct(await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude }));
}

export async function updateProduct(id: string, input: ProductInput, actorId: string) {
  const category_id = await resolveCategoryId(input.category);
  const { category, ...rest } = input;

  const existing = await prisma.product.findFirst({ where: { name: { equals: input.name.trim() }, NOT: { id } } });
  if (existing) throw ApiError.conflict(`A product named "${input.name.trim()}" already exists.`);

  const product = await prisma.product.update({ where: { id }, data: { ...rest, category_id }, include: productInclude });
  await logAudit({ action: 'PRODUCT_EDIT', entity_type: 'Product', entity_id: id, user_id: actorId, details: `Modified product details for ${product.name}` });
  return serializeProduct(product);
}

export async function updatePrice(id: string, pricing: { mrp: number; purchase_discount_pct: number; wholesale_discount_pct: number; retail_discount_pct: number }, actorId: string) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Product not found');

  const product = await prisma.product.update({ where: { id }, data: pricing, include: productInclude });
  const oldPurchase = priceFromDiscount(num(existing.mrp), num(existing.purchase_discount_pct));
  const oldWholesale = priceFromDiscount(num(existing.mrp), num(existing.wholesale_discount_pct));
  const oldSelling = priceFromDiscount(num(existing.mrp), num(existing.retail_discount_pct));
  const newPurchase = priceFromDiscount(pricing.mrp, pricing.purchase_discount_pct);
  const newWholesale = priceFromDiscount(pricing.mrp, pricing.wholesale_discount_pct);
  const newSelling = priceFromDiscount(pricing.mrp, pricing.retail_discount_pct);
  const details = `Immediate Price Update: MRP changed from Rs${existing.mrp} to Rs${pricing.mrp}. Purchase Price changed from Rs${oldPurchase} to Rs${newPurchase}, Wholesale Price from Rs${oldWholesale} to Rs${newWholesale}, Selling Price from Rs${oldSelling} to Rs${newSelling}`;
  await logAudit({ action: 'PRICE_UPDATE', entity_type: 'Product', entity_id: id, user_id: actorId, details });
  return serializeProduct(product);
}

export async function setStatus(id: string, status: 'Active' | 'Inactive', actorId: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw ApiError.notFound('Product not found');

  if (status === 'Inactive') {
    const wh = await prisma.warehouseInventory.findUnique({ where: { product_id: id } });
    const warehouseUnits = wh ? wh.available_qty + wh.reserved_qty + wh.damaged_qty + wh.expired_qty : 0;
    const truckUnits = await prisma.truckInventory.aggregate({ where: { product_id: id }, _sum: { quantity: true } });
    const truckQty = truckUnits._sum.quantity ?? 0;
    if (warehouseUnits + truckQty > 0) {
      throw ApiError.conflict(`Cannot remove ${product.name}: it still has ${warehouseUnits} unit(s) in the warehouse and ${truckQty} unit(s) on trucks. Clear or transfer that stock first so it isn't lost from your inventory reports.`);
    }
  }

  const updated = await prisma.product.update({ where: { id }, data: { status }, include: productInclude });
  const action = status === 'Inactive' ? 'PRODUCT_DELETE' : 'PRODUCT_REACTIVATE';
  const details = status === 'Inactive' ? `Deactivated product ${product.name} from the catalog.` : `Reactivated product ${product.name}`;
  await logAudit({ action, entity_type: 'Product', entity_id: id, user_id: actorId, details });
  return serializeProduct(updated);
}
