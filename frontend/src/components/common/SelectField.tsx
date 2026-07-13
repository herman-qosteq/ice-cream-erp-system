import React, { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList } from 'react-native';
import { ChevronDown, Check, X } from 'lucide-react-native';

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
}

export default function SelectField({ value, onValueChange, options, title, className, textClassName, disabled }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

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

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-slate-900/50 justify-end" onPress={() => setOpen(false)}>
          <Pressable className="bg-white rounded-t-3xl max-h-[70%]" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between p-4 border-b border-slate-100">
              <Text className="font-extrabold text-slate-800 text-sm">{title ?? 'Select an option'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <X size={18} color="#94a3b8" />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item, idx) => item.value + idx}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onValueChange(item.value); setOpen(false); }}
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
