import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { DateFilterMode, getDateFilterRange } from '../utils/dateFilter';

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

interface BaseFetchParams {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface OffsetFetchParams extends BaseFetchParams {
  page: number;
  pageSize: number;
}

export interface CursorFetchParams extends BaseFetchParams {
  cursor?: string;
  limit: number;
}

type UsePaginatedListOptions<T, F extends Record<string, any>> = {
  // Must match the backend's broadcast resource string exactly (see
  // frontend/src/realtime.ts) - a mismatch here means this list silently
  // never refreshes on a relevant write.
  resource: string;
  pageSize?: number;
  filters: F;
  search?: string;
  dateFilterMode?: DateFilterMode;
  customDateFrom?: string;
  customDateTo?: string;
  // Several screens in this app are one giant component with tab-switching
  // via conditional rendering rather than separately-mounted screens (e.g.
  // AdminWarehouse, AdminSales) - every tab's hooks run regardless of which
  // tab is visible. Defaults to true; pass `activeTab === 'thisTab'` so an
  // inactive tab's paginated list doesn't fetch (or refetch on realtime
  // events) while the user isn't looking at it.
  enabled?: boolean;
} & (
  | { mode: 'offset'; fetcher: (params: OffsetFetchParams & F) => Promise<PagedResult<T>> }
  | { mode: 'cursor'; fetcher: (params: CursorFetchParams & F) => Promise<CursorResult<T>> }
);

interface UsePaginatedListResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
  loadMore: () => void;
  goToPage: (n: number) => void;
  refetch: () => void;
}

// Shared data-fetching hook for every paginated large-list screen (Movement
// Logs, Orders, Payments, Prebookings, Purchases, Notifications). Each
// screen keeps its own filter/search useState + JSX exactly as before; this
// hook just owns turning (filters, search, date range, page/cursor) into a
// server request and holding the result. Reuses the existing DateFilterMode
// concept from utils/dateFilter.ts unchanged - the backend never sees
// 'today'/'week'/etc, only the resolved ISO bounds.
export function usePaginatedList<T, F extends Record<string, any>>(options: UsePaginatedListOptions<T, F>): UsePaginatedListResult<T> {
  const { subscribeToResource } = useAppContext();
  const { resource, pageSize = 25, filters, search, dateFilterMode, customDateFrom, customDateTo, mode, fetcher, enabled = true } = options;

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input so every keystroke doesn't fire a request.
  const [debouncedSearch, setDebouncedSearch] = useState(search ?? '');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search ?? ''), 300);
    return () => clearTimeout(t);
  }, [search]);

  const dateRange = dateFilterMode ? getDateFilterRange(dateFilterMode, customDateFrom ?? '', customDateTo ?? '') : null;
  const dateFrom = dateRange?.start.toISOString();
  const dateTo = dateRange?.end.toISOString();

  const filtersKey = JSON.stringify(filters ?? {});

  // Any filter/search/date change starts over: offset mode jumps back to
  // page 1, cursor mode drops whatever was already loaded and re-fetches
  // from the top.
  useEffect(() => {
    setPage(1);
    setCursor(undefined);
    setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, debouncedSearch, dateFilterMode, customDateFrom, customDateTo]);

  // Guards against a slow, now-superseded request overwriting a newer one's
  // result (e.g. typing quickly into search).
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(async (targetCursor: string | undefined, targetPage: number, append: boolean) => {
    const myRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'offset') {
        const result = await fetcher({
          ...filters, page: targetPage, pageSize, search: debouncedSearch || undefined, dateFrom, dateTo,
        } as OffsetFetchParams & F);
        if (myRequestId !== requestIdRef.current) return;
        setItems(result.data);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } else {
        const result = await fetcher({
          ...filters, cursor: targetCursor, limit: pageSize, search: debouncedSearch || undefined, dateFrom, dateTo,
        } as CursorFetchParams & F);
        if (myRequestId !== requestIdRef.current) return;
        setItems(prev => (append ? [...prev, ...result.data] : result.data));
        setCursor(result.nextCursor ?? undefined);
        setHasMore(!!result.nextCursor);
      }
    } catch (e: any) {
      if (myRequestId !== requestIdRef.current) return;
      setError(e?.message ?? 'Unable to load data.');
    } finally {
      if (myRequestId === requestIdRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fetcher, filtersKey, pageSize, debouncedSearch, dateFrom, dateTo]);

  useEffect(() => {
    if (!enabled) return;
    fetchPage(undefined, page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filtersKey, debouncedSearch, dateFilterMode, customDateFrom, customDateTo, mode === 'offset' ? page : null]);

  // On a realtime event for this resource: offset mode re-runs the current
  // page as-is; cursor mode resets to the freshest first page rather than
  // trying to re-fetch every already-loaded page (simplest correct behavior
  // for an append-only feed, where the newest entries are what matters).
  const refetch = useCallback(() => {
    if (mode === 'offset') fetchPage(undefined, page, false);
    else fetchPage(undefined, 1, false);
  }, [fetchPage, mode, page]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeToResource(resource, refetch);
  }, [enabled, resource, subscribeToResource, refetch]);

  const loadMore = useCallback(() => {
    if (mode !== 'cursor' || loading || !hasMore) return;
    fetchPage(cursor, 1, true);
  }, [mode, loading, hasMore, cursor, fetchPage]);

  const goToPage = useCallback((n: number) => {
    if (mode !== 'offset') return;
    setPage(Math.max(1, n));
  }, [mode]);

  return { data: items, loading, error, page, totalPages, total, hasMore, loadMore, goToPage, refetch };
}
