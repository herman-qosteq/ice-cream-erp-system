import { Prisma } from '@prisma/client';

// Prisma.Decimal -> plain JS number, so REST responses carry ordinary
// numbers exactly like the frontend's local (AsyncStorage) data always did.
export function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

export function numOrUndefined(value: Prisma.Decimal | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : value.toNumber();
}

// DateTime -> 'YYYY-MM-DD', matching the plain date strings the frontend
// stores for fields like last_purchase_date / next_refill_date / expiry_date.
export function dateOnly(value: Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.toISOString().split('T')[0];
}
