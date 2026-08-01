import React, { useState } from 'react';
import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react-native';

// See SelectField.tsx - same mobile-bottom-sheet-looks-wrong-on-desktop fix,
// Windows only.
const isWindows = Platform.OS === 'windows';

interface DateFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  title?: string;
  placeholder?: string;
  className?: string;
  textClassName?: string;
  disabled?: boolean;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatISO = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

const parseISO = (value: string): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
};

const formatDisplay = (value: string) => {
  const parsed = parseISO(value);
  if (!parsed) return '';
  return `${MONTH_LABELS[parsed.month].slice(0, 3)} ${parsed.day}, ${parsed.year}`;
};

export default function DateField({ value, onValueChange, title, placeholder, className, textClassName, disabled }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const parsedValue = parseISO(value);
  const [viewYear, setViewYear] = useState(parsedValue?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedValue?.month ?? today.getMonth());

  const openPicker = () => {
    if (disabled) return;
    const parsed = parseISO(value);
    setViewYear(parsed?.year ?? today.getFullYear());
    setViewMonth(parsed?.month ?? today.getMonth());
    setOpen(true);
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleSelectDay = (day: number) => {
    onValueChange(formatISO(viewYear, viewMonth, day));
    setOpen(false);
  };

  const handleSelectToday = () => {
    onValueChange(formatISO(today.getFullYear(), today.getMonth(), today.getDate()));
    setOpen(false);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const displayText = formatDisplay(value);

  return (
    <>
      <Pressable
        onPress={openPicker}
        className={className ?? 'w-full bg-slate-50 border border-slate-200 rounded-lg p-2 flex-row items-center justify-between'}
        disabled={disabled}
      >
        <Text className={textClassName ?? 'text-xs text-slate-800 flex-1'} numberOfLines={1}>
          {displayText || placeholder || 'Select date'}
        </Text>
        <Calendar size={14} color="#94a3b8" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className={`flex-1 bg-slate-900/50 ${isWindows ? 'items-center justify-center' : 'justify-end'}`} onPress={() => setOpen(false)}>
          <Pressable className={isWindows ? 'bg-white rounded-2xl w-[360px]' : 'bg-white rounded-t-3xl'} onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between p-4 border-b border-slate-100">
              <Text className="font-extrabold text-slate-800 text-sm">{title ?? 'Select a date'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <X size={18} color="#94a3b8" />
              </Pressable>
            </View>

            <View className="p-4 gap-3">
              <View className="flex-row items-center justify-between">
                <Pressable onPress={goPrevMonth} className="p-2 rounded-lg active:bg-slate-100" hitSlop={8}>
                  <ChevronLeft size={18} color="#334155" />
                </Pressable>
                <Text className="font-bold text-slate-800 text-sm">{MONTH_LABELS[viewMonth]} {viewYear}</Text>
                <Pressable onPress={goNextMonth} className="p-2 rounded-lg active:bg-slate-100" hitSlop={8}>
                  <ChevronRight size={18} color="#334155" />
                </Pressable>
              </View>

              <View className="flex-row">
                {WEEKDAY_LABELS.map(w => (
                  <View key={w} className="flex-1 items-center py-1">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase">{w}</Text>
                  </View>
                ))}
              </View>

              {weeks.map((week, wIdx) => (
                <View key={wIdx} className="flex-row">
                  {week.map((day, dIdx) => {
                    const isSelected = day !== null && parsedValue?.year === viewYear && parsedValue?.month === viewMonth && parsedValue?.day === day;
                    const isToday = day !== null && today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
                    return (
                      <View key={dIdx} className="flex-1 items-center py-0.5">
                        {day === null ? (
                          <View className="w-9 h-9" />
                        ) : (
                          <Pressable
                            onPress={() => handleSelectDay(day)}
                            className={`w-9 h-9 rounded-full items-center justify-center ${isSelected ? 'bg-blue-600' : isToday ? 'border border-blue-400' : ''}`}
                          >
                            <Text className={`text-xs font-semibold ${isSelected ? 'text-white' : isToday ? 'text-blue-600' : 'text-slate-700'}`}>{day}</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}

              <Pressable onPress={handleSelectToday} className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                <Text className="text-slate-700 font-bold text-xs">Today</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
