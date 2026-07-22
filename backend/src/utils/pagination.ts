// Shared pagination/envelope mechanics for list endpoints, reused across
// every paginated resource. Each resource's own filter/search WHERE-clause
// stays in that resource's own service file (buildXWhere) - the shapes differ
// too much per resource for a generic cross-resource query builder to pay
// off, but the page-math and search/date-range primitives below are
// identical everywhere.

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CursorResult<T> {
  data: T[];
  nextCursor: string | null;
}

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface CursorParams {
  cursor?: string;
  take: number;
}

// True only when the caller actually asked for a page (i.e. is using the new
// paginated shape) - lets a route keep returning today's bare array when no
// pagination params are present at all, for every pre-existing caller.
// `limit` (not just `cursor`) counts: a cursor-mode list's very first page
// request has no cursor yet, only a limit, and must still be recognized as
// paginated rather than silently falling through to the unbounded array.
export function isPaginationRequested(query: Record<string, unknown>): boolean {
  return query.page !== undefined || query.pageSize !== undefined || query.cursor !== undefined || query.limit !== undefined;
}

export function parsePageParams(query: Record<string, unknown>, opts: { defaultPageSize?: number; maxPageSize?: number } = {}): PageParams {
  const defaultPageSize = opts.defaultPageSize ?? 25;
  const maxPageSize = opts.maxPageSize ?? 100;
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Math.floor(Number(query.pageSize)) || defaultPageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function parseCursorParams(query: Record<string, unknown>, opts: { defaultLimit?: number; maxLimit?: number } = {}): CursorParams {
  const defaultLimit = opts.defaultLimit ?? 25;
  const maxLimit = opts.maxLimit ?? 100;
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query.limit)) || defaultLimit));
  const cursor = typeof query.cursor === 'string' && query.cursor ? query.cursor : undefined;
  return { cursor, take: limit };
}

export function parseDateRangeParams(query: Record<string, unknown>): { from?: Date; to?: Date } {
  const from = typeof query.dateFrom === 'string' && query.dateFrom ? new Date(query.dateFrom) : undefined;
  const to = typeof query.dateTo === 'string' && query.dateTo ? new Date(query.dateTo) : undefined;
  return {
    from: from && !isNaN(from.getTime()) ? from : undefined,
    to: to && !isNaN(to.getTime()) ? to : undefined,
  };
}

// MySQL's default collation is case-insensitive (_ci), so a plain `contains`
// is already case-insensitive - no `mode: 'insensitive'` needed (that's a
// Postgres-only Prisma option and would error against this MySQL datasource).
export function containsInsensitive(term: string): { contains: string } {
  return { contains: term };
}

export function buildPagedResult<T>(data: T[], total: number, page: number, pageSize: number): PagedResult<T> {
  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// Pass in exactly `take + 1` rows (fetched with `take: take + 1` in the
// query) - slices back down to `take` and reports whether there was really
// one more page beyond it.
export function buildCursorResult<T extends { id: string }>(rowsFetchedAsTakePlusOne: T[], take: number): CursorResult<T> {
  const hasMore = rowsFetchedAsTakePlusOne.length > take;
  const data = hasMore ? rowsFetchedAsTakePlusOne.slice(0, take) : rowsFetchedAsTakePlusOne;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  return { data, nextCursor };
}
