import React, { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, TextInput, Platform } from 'react-native';
import { ChevronDown, Check, X, Search } from 'lucide-react-native';

// The mobile bottom-sheet treatment below (full-screen scrim + panel pinned
// to the bottom edge, sized as a % of screen height) reads fine on a phone
// but looks wrong in a large desktop window on Windows - so Windows alone
// gets a centered, fixed-size dialog instead. Mobile/web are untouched.
const isWindows = Platform.OS === 'windows';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  title?: string;
  className?: string;
  textClassName?: string;
  disabled?: boolean;
  searchable?: boolean;
}

// Search only pays for itself once there are enough options to scroll
// through - a 2-3 option toggle doesn't need a search box. Callers can still
// force it on/off explicitly via the `searchable` prop when this default
// isn't right for a particular list.
const SEARCH_THRESHOLD = 6;

export default function SelectField({ value, onValueChange, options, title, className, textClassName, disabled, searchable }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.value === value);
  const isSearchable = searchable ?? options.length > SEARCH_THRESHOLD;
  const visibleOptions = isSearchable && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const close = () => { setOpen(false); setQuery(''); };

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        className={className ?? 'w-full bg-slate-50 border border-slate-200 rounded-lg p-2 flex-row items-center justify-between'}
        disabled={disabled}
      >
        <Text className={textClassName ?? 'text-xs text-slate-800 flex-1'} numberOfLines={1}>
          {selected?.label ?? 'Select...'}
        </Text>
        <ChevronDown size={14} color="#94a3b8" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable className={`flex-1 bg-slate-900/50 ${isWindows ? 'items-center justify-center' : 'justify-end'}`} onPress={close}>
          <Pressable
            className={isWindows ? 'bg-white rounded-2xl w-[420px]' : `bg-white rounded-t-3xl ${isSearchable ? 'h-[70%]' : 'max-h-[70%]'}`}
            style={isWindows ? { maxHeight: 500 } : undefined}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between p-4 border-b border-slate-100">
              <Text className="font-extrabold text-slate-800 text-sm">{title ?? 'Select an option'}</Text>
              <Pressable onPress={close} hitSlop={8}>
                <X size={18} color="#94a3b8" />
              </Pressable>
            </View>
            {isSearchable && (
              <View className="flex-row items-center gap-2 mx-4 mt-3 mb-1 px-3 bg-slate-50 border border-slate-200 rounded-xl">
                <Search size={14} color="#94a3b8" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search..."
                  placeholderTextColor="#94a3b8"
                  autoFocus
                  className="flex-1 text-xs text-slate-800 py-2.5"
                  style={{ outlineStyle: 'none' } as any}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <X size={14} color="#94a3b8" />
                  </Pressable>
                )}
              </View>
            )}
            {isSearchable && visibleOptions.length === 0 && (
              <Text className="text-center text-slate-400 text-xs py-6">No matches found.</Text>
            )}
            <FlatList
              data={visibleOptions}
              className={isSearchable ? 'flex-1' : undefined}
              keyExtractor={(item, idx) => item.value + idx}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onValueChange(item.value); close(); }}
                  className="flex-row items-center justify-between px-4 py-3 border-b border-slate-50"
                >
                  <Text className="text-slate-700 text-xs flex-1 pr-2">{item.label}</Text>
                  {item.value === value && <Check size={16} color="#2563eb" />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
