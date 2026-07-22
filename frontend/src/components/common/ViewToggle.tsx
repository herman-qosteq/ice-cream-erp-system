import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { Table, LayoutGrid } from 'lucide-react-native';
import { useViewMode } from '../../context/ViewModeContext';

// Placed at the top of every data list in the app so the Table/Card
// preference is always reachable from wherever the user is - the preference
// itself is global (see ViewModeContext), so flipping it here changes every
// other list in the app too, not just the one this control sits on.
export default function ViewToggle() {
  const { viewMode, setViewMode } = useViewMode();

  return (
    <View className="flex-row bg-slate-100 p-1 rounded-lg self-start">
      <Pressable onPress={() => setViewMode('table')} className={`flex-row items-center gap-1 px-2.5 py-1 rounded-md ${viewMode === 'table' ? 'bg-indigo-600' : ''}`}>
        <Table size={12} color={viewMode === 'table' ? '#ffffff' : '#64748b'} />
        <Text className={`text-[9px] font-extrabold ${viewMode === 'table' ? 'text-white' : 'text-slate-500'}`}>Table</Text>
      </Pressable>
      <Pressable onPress={() => setViewMode('card')} className={`flex-row items-center gap-1 px-2.5 py-1 rounded-md ${viewMode === 'card' ? 'bg-indigo-600' : ''}`}>
        <LayoutGrid size={12} color={viewMode === 'card' ? '#ffffff' : '#64748b'} />
        <Text className={`text-[9px] font-extrabold ${viewMode === 'card' ? 'text-white' : 'text-slate-500'}`}>Cards</Text>
      </Pressable>
    </View>
  );
}
