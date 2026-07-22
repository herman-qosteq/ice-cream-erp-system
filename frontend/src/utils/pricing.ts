import { Product, StorePricing, RolePermission } from '../types';

export type PricingMode = 'wholesale' | 'retail';

// Admin-toggleable, app-wide (not role-scoped) feature flag: off by default,
// hiding the entire Retail/Selling price tier everywhere (pricing forms,
// order/pre-booking pricing-mode toggles, product cards, reports) until an
// Admin turns it on from Role Permissions. Reuses the RolePermission table
// with a fixed 'Admin' role as the row owner purely for storage - readers
// ignore the role and just check the feature key.
export const RETAIL_PRICING_FEATURE = 'retail_pricing_enabled';

export function isRetailPricingEnabled(rolePermissions: RolePermission[]): boolean {
  return rolePermissions.some(rp => rp.feature === RETAIL_PRICING_FEATURE && rp.enabled);
}

export function priceFromDiscount(mrp: number, discountPct: number): number {
  return Math.max(0, mrp * (1 - discountPct / 100));
}

// Reverse of priceFromDiscount(): recovers the discount % that produces a
// given price at the current MRP, so the % and price inputs (Purchase,
// Wholesale, Retail/Selling) can stay two-way synced - editing either one
// updates the other. Clamped to [0, 100] and rounded to 2dp to match the
// *_discount_pct columns' Decimal(5,2) precision.
export function discountFromPrice(mrp: number, price: number): number {
  if (mrp <= 0) return 0;
  const pct = (1 - price / mrp) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)) * 100) / 100;
}

export function findStorePricingOverride(storePricing: StorePricing[], storeId: string, productId: string): StorePricing | undefined {
  return storePricing.find(sp => sp.store_id === storeId && sp.product_id === productId);
}

// Resolves the discount % that actually applies for a given store+product+
// pricing-mode: the store's own override for that side if one is set,
// otherwise the product's catalog rate. Overrides are resolved per-field
// (not per-row) because either side of a StorePricing row can be left
// unset - e.g. a store might have a custom wholesale rate but still track
// the catalog's retail rate live.
export function getEffectiveDiscountPct(product: Product, mode: PricingMode, override: StorePricing | undefined | null): number {
  const catalogPct = mode === 'wholesale' ? product.wholesale_discount_pct : product.retail_discount_pct;
  const overridePct = override ? (mode === 'wholesale' ? override.wholesale_discount_pct : override.retail_discount_pct) : undefined;
  return overridePct ?? catalogPct;
}

export function getEffectivePrice(product: Product, mode: PricingMode, override: StorePricing | undefined | null): number {
  return priceFromDiscount(product.mrp, getEffectiveDiscountPct(product, mode, override));
}

// Convenience wrapper for call sites that only have the full storePricing
// list and a storeId on hand (the common case in order/pre-booking forms).
export function getEffectiveProductPrice(product: Product, mode: PricingMode, storeId: string | undefined, storePricing: StorePricing[]): number {
  const override = storeId ? findStorePricingOverride(storePricing, storeId, product.id) : undefined;
  return getEffectivePrice(product, mode, override);
}
