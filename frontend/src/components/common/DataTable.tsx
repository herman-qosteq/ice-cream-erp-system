import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import EmptyState from './EmptyState';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  // False for compact fixed-content columns (status badges, action icons) so
  // they stay pinned to their base width instead of stretching on wide
  // screens - leftover space concentrates on the columns that actually hold
  // variable-length text instead of being smeared evenly across every column.
  grow?: boolean;
  render: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  emptyText?: string;
  onRowPress?: (item: T) => void;
}

// Generic record table used everywhere the app previously only had a card
// grid. Each column carries a base pixel width AND a proportional flexGrow
// (weighted by that same width, unless `grow: false`) with flexShrink locked
// to 0. That combination is what makes the table behave correctly at both
// ends: on a wide screen, `contentContainerStyle={{ flexGrow: 1 }}` on the
// ScrollView plus flexGrow on each column lets the growable ones stretch to
// fill the leftover space proportionally instead of leaving a dead gap after
// the last column (the bug this fixed), while `grow: false` columns (status
// badges, action icons) stay pinned to their base width so extra space goes
// to the columns that actually hold variable-length content. On a narrow
// phone, flexShrink: 0 stops any column from being squeezed below its base
// width, so the row's natural width exceeds the viewport and the ScrollView
// scrolls horizontally instead of crushing the text.
export default function DataTable<T>({ columns, data, keyExtractor, emptyText, onRowPress }: DataTableProps<T>) {
  if (data.length === 0) {
    return <EmptyState message={emptyText || 'No records found.'} />;
  }

  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const cellStyle = (width: number, grow?: boolean) => ({ width, flexGrow: grow === false ? 0 : width, flexShrink: 0 });

  return (
    <View className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* horizontal-only: react-native-web's ScrollView otherwise also
          enables vertical overflow by default, which silently creates a
          second, independent vertical scroll region nested inside whatever
          vertical scroll container this table is already placed in - the
          exact "double scrolling" bug this line prevents. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ overflowY: 'visible' } as any}
      >
        <View style={{ minWidth: totalWidth, flexGrow: 1 }}>
          <View className="flex-row bg-slate-50 border-b border-slate-200">
            {columns.map(col => (
              <View key={col.key} style={cellStyle(col.width, col.grow)} className="px-2.5 py-2 justify-center">
                {/* numberOfLines=1 keeps every header a single line no matter
                    how long its label is - an unclamped header wrapping to 2-3
                    lines grows the whole header row and throws off vertical
                    alignment with the (single-line) data rows below it. A
                    label that's genuinely too long for its column's width
                    should be shortened at the call site instead of relying on
                    wrapping. */}
                <Text numberOfLines={1} className={`text-[9px] font-bold text-slate-400 uppercase ${alignClass(col.align)}`}>{col.label}</Text>
              </View>
            ))}
          </View>
          {data.map((item, idx) => (
            <Pressable
              key={keyExtractor(item, idx)}
              onPress={() => onRowPress?.(item)}
              className={`flex-row items-center border-b border-slate-100 last:border-b-0 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'} ${onRowPress ? 'active:bg-slate-100' : ''}`}
            >
              {columns.map(col => (
                <View key={col.key} style={cellStyle(col.width, col.grow)} className="px-2.5 py-2 justify-center">
                  {col.render(item)}
                </View>
              ))}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
