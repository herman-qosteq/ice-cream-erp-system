import React from 'react';
import { View, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import ViewToggle from './ViewToggle';

interface FilterBarProps {
  // Only required when hideSearch isn't set.
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  // Compact filter pills (SelectField / DateRangeFilterField, styled via
  // FILTER_PILL_CLASS/FILTER_PILL_TEXT_CLASS below) rendered between the
  // search box and the view toggle.
  children?: React.ReactNode;
  hideViewToggle?: boolean;
  hideSearch?: boolean;
}

// One consistent toolbar for every list page: search (flexible width) +
// filter pills + Table/Cards toggle, all in a single row that only wraps
// once the viewport is too narrow to fit everything - never a stack of
// separate rows the way each screen used to hand-roll its own.
export default function FilterBar({ searchValue, onSearchChange, searchPlaceholder = 'Search...', children, hideViewToggle, hideSearch }: FilterBarProps) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {!hideSearch && (
        <View className="relative flex-1 min-w-[160px] justify-center">
          <View className="absolute left-2.5 z-10"><Search size={13} color="#94a3b8" /></View>
          <TextInput
            value={searchValue ?? ''}
            onChangeText={onSearchChange}
            placeholder={searchPlaceholder}
            placeholderTextColor="#94a3b8"
            className="w-full bg-white border border-slate-200 pl-8 pr-3 py-2 text-[11px] rounded-lg"
          />
        </View>
      )}
      {children}
      {!hideViewToggle && <ViewToggle />}
    </View>
  );
}

// Shared compact pill styling so every SelectField used as a filter (status,
// type, payment, etc.) looks identical wherever it appears - pass these as
// SelectField's className/textClassName instead of its bulkier form-field
// default styling.
export const FILTER_PILL_CLASS = 'bg-white border border-slate-200 rounded-lg py-2 px-2.5 flex-row items-center gap-1';
export const FILTER_PILL_TEXT_CLASS = 'text-[11px] font-semibold text-slate-700';
