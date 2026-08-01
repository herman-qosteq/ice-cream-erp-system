import React, { useState } from 'react';
import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { Calendar, ChevronDown, Check, X, ChevronLeft } from 'lucide-react-native';
import DateField from './DateField';
import { DateFilterMode } from '../../utils/dateFilter';

// See SelectField.tsx - same mobile-bottom-sheet-looks-wrong-on-desktop fix,
// Windows only.
const isWindows = Platform.OS === 'windows';

interface DateRangeFilterFieldProps {
  mode: DateFilterMode;
  onModeChange: (mode: DateFilterMode) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  title?: string;
  className?: string;
  textClassName?: string;
}

const PRESETS: { label: string; value: Exclude<DateFilterMode, 'custom'> }[] = [
  // Temporarily disabled - re-enable by uncommenting when needed again.
  // { label: 'All Dates', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatShort(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return `${MONTH_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function labelFor(mode: DateFilterMode, customFrom: string, customTo: string): string {
  if (mode !== 'custom') return PRESETS.find(p => p.value === mode)?.label ?? 'All Dates';
  const from = formatShort(customFrom);
  const to = formatShort(customTo);
  return from && to ? `${from} - ${to}` : 'Custom Range';
}

// One compact pill (matching SelectField's visual language exactly) whose
// sheet does double duty: pick a preset, or step into an inline custom
// range picker - all inside the same sheet, so a custom range never needs
// its own separate row on the page the way it used to.
export default function DateRangeFilterField({ mode, onModeChange, customFrom, customTo, onCustomFromChange, onCustomToChange, title, className, textClassName }: DateRangeFilterFieldProps) {
  const [open, setOpen] = useState(false);
  const [showCustomStep, setShowCustomStep] = useState(false);

  const openPicker = () => {
    setShowCustomStep(mode === 'custom');
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setShowCustomStep(false);
  };

  const selectPreset = (value: Exclude<DateFilterMode, 'custom'>) => {
    onModeChange(value);
    close();
  };

  const applyCustomRange = () => {
    onModeChange('custom');
    close();
  };

  return (
    <>
      <Pressable
        onPress={openPicker}
        className={className ?? 'bg-white border border-slate-200 rounded-lg py-2 px-2.5 flex-row items-center gap-1'}
      >
        <Calendar size={12} color="#94a3b8" />
        <Text className={textClassName ?? 'text-[11px] font-semibold text-slate-700'} numberOfLines={1}>
          {labelFor(mode, customFrom, customTo)}
        </Text>
        <ChevronDown size={12} color="#94a3b8" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable className={`flex-1 bg-slate-900/50 ${isWindows ? 'items-center justify-center' : 'justify-end'}`} onPress={close}>
          <Pressable className={isWindows ? 'bg-white rounded-2xl w-[360px]' : 'bg-white rounded-t-3xl'} onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between p-4 border-b border-slate-100">
              <View className="flex-row items-center gap-2">
                {showCustomStep && (
                  <Pressable onPress={() => setShowCustomStep(false)} hitSlop={8}>
                    <ChevronLeft size={18} color="#94a3b8" />
                  </Pressable>
                )}
                <Text className="font-extrabold text-slate-800 text-sm">{showCustomStep ? 'Custom Range' : (title ?? 'Date Range')}</Text>
              </View>
              <Pressable onPress={close} hitSlop={8}>
                <X size={18} color="#94a3b8" />
              </Pressable>
            </View>

            {showCustomStep ? (
              <View className="p-4 gap-3">
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="text-[9px] font-bold text-slate-400 uppercase mb-1">From</Text>
                    <DateField value={customFrom} onValueChange={onCustomFromChange} title="Select Start Date" className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex-row items-center justify-between" textClassName="text-xs text-slate-700 flex-1" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[9px] font-bold text-slate-400 uppercase mb-1">To</Text>
                    <DateField value={customTo} onValueChange={onCustomToChange} title="Select End Date" className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex-row items-center justify-between" textClassName="text-xs text-slate-700 flex-1" />
                  </View>
                </View>
                <Pressable onPress={applyCustomRange} disabled={!customFrom || !customTo} className={`w-full py-2.5 rounded-xl items-center ${customFrom && customTo ? 'bg-blue-600 active:bg-blue-700' : 'bg-slate-200'}`}>
                  <Text className={`font-bold text-xs ${customFrom && customTo ? 'text-white' : 'text-slate-400'}`}>Apply Range</Text>
                </Pressable>
              </View>
            ) : (
              <View className="pb-2">
                {PRESETS.map(p => (
                  <Pressable key={p.value} onPress={() => selectPreset(p.value)} className="flex-row items-center justify-between px-4 py-3 border-b border-slate-50">
                    <Text className="text-slate-700 text-xs flex-1 pr-2">{p.label}</Text>
                    {mode === p.value && <Check size={16} color="#2563eb" />}
                  </Pressable>
                ))}
                <Pressable onPress={() => setShowCustomStep(true)} className="flex-row items-center justify-between px-4 py-3">
                  <Text className="text-slate-700 text-xs flex-1 pr-2">Custom Range</Text>
                  {mode === 'custom' && <Check size={16} color="#2563eb" />}
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
