import React from 'react';
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

type PaginationFooterProps =
  | { mode: 'offset'; page: number; totalPages: number; total: number; loading: boolean; onPageChange: (page: number) => void }
  | { mode: 'cursor'; hasMore: boolean; loading: boolean; onLoadMore: () => void; loadedCount: number };

// Windows a long page range down to a handful of number buttons plus '...'
// gaps, always keeping the first/last page and a run of pages around the
// current one visible - the standard "1 ... 4 5 6 ... 24" pattern.
function buildPageWindow(current: number, total: number, maxButtons: number): (number | 'ellipsis')[] {
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const desiredMiddleCount = Math.max(1, maxButtons - 2); // excludes the always-shown first/last
  let start = Math.max(2, current - Math.floor(desiredMiddleCount / 2));
  let end = Math.min(total - 1, start + desiredMiddleCount - 1);
  start = Math.max(2, end - desiredMiddleCount + 1);

  const window: (number | 'ellipsis')[] = [1];
  if (start > 2) window.push('ellipsis');
  for (let p = start; p <= end; p++) window.push(p);
  if (end < total - 1) window.push('ellipsis');
  window.push(total);
  return window;
}

// Sibling to <DataTable>/card grids, not baked into them - pagination is a
// data-fetching concern, not a rendering one, so DataTable stays exactly the
// same component it always was (handed a small, already-paged array either
// way) and this just renders whichever footer the current usePaginatedList
// mode calls for.
export default function PaginationFooter(props: PaginationFooterProps) {
  const { width } = useWindowDimensions();

  if (props.mode === 'cursor') {
    const { hasMore, loading, onLoadMore, loadedCount } = props;
    if (!hasMore && loadedCount === 0) return null;
    return (
      <View className="items-center py-3 gap-1.5">
        {hasMore ? (
          <Pressable
            onPress={onLoadMore}
            disabled={loading}
            className={`flex-row items-center gap-1.5 py-2 px-4 rounded-xl border ${loading ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 active:bg-slate-50'}`}
          >
            {loading && <ActivityIndicator size="small" color="#6366f1" />}
            <Text className="text-slate-600 font-bold text-[11px]">{loading ? 'Loading...' : 'Load More'}</Text>
          </Pressable>
        ) : (
          <Text className="text-slate-400 text-[10px] font-medium italic">No more records.</Text>
        )}
      </View>
    );
  }

  const { page, totalPages, total, loading, onPageChange } = props;
  if (total === 0) return null;

  // Fewer number buttons on narrow screens so the row wraps at most once
  // instead of spilling into a wall of tiny buttons.
  const maxButtons = width < 400 ? 3 : width < 640 ? 5 : 7;
  const pageWindow = buildPageWindow(page, totalPages, maxButtons);
  const goTo = (p: number) => { if (p !== page && p >= 1 && p <= totalPages && !loading) onPageChange(p); };

  return (
    <View className="gap-2 py-2 px-1 border-t border-slate-100">
      <Text className="text-slate-400 text-[10px] font-bold text-center sm:text-left">
        Page {page} of {totalPages} · {total.toLocaleString('en-IN')} total
      </Text>
      <View className="flex-row flex-wrap items-center justify-center gap-1">
        <Pressable
          onPress={() => goTo(page - 1)}
          disabled={page <= 1 || loading}
          className={`flex-row items-center gap-1 py-1.5 px-2.5 rounded-lg border ${page <= 1 || loading ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 active:bg-slate-50'}`}
        >
          <ChevronLeft size={13} color={page <= 1 || loading ? '#cbd5e1' : '#475569'} />
          <Text className={`text-[11px] font-bold ${page <= 1 || loading ? 'text-slate-300' : 'text-slate-600'}`}>Previous</Text>
        </Pressable>

        {pageWindow.map((p, idx) =>
          p === 'ellipsis' ? (
            <Text key={`e${idx}`} className="text-slate-300 text-[11px] font-bold px-1">…</Text>
          ) : (
            <Pressable
              key={p}
              onPress={() => goTo(p)}
              disabled={loading}
              className={`min-w-[28px] items-center py-1.5 px-2 rounded-lg border ${p === page ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200 active:bg-slate-50'}`}
            >
              <Text className={`text-[11px] font-bold ${p === page ? 'text-white' : 'text-slate-600'}`}>{p}</Text>
            </Pressable>
          )
        )}

        <Pressable
          onPress={() => goTo(page + 1)}
          disabled={page >= totalPages || loading}
          className={`flex-row items-center gap-1 py-1.5 px-2.5 rounded-lg border ${page >= totalPages || loading ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 active:bg-slate-50'}`}
        >
          <Text className={`text-[11px] font-bold ${page >= totalPages || loading ? 'text-slate-300' : 'text-slate-600'}`}>Next</Text>
          <ChevronRight size={13} color={page >= totalPages || loading ? '#cbd5e1' : '#475569'} />
        </Pressable>
      </View>
    </View>
  );
}
