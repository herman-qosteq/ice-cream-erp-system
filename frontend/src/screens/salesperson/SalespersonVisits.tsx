import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { ERPData } from '../../storage';
import ViewToggle from '../../components/common/ViewToggle';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import { useViewMode } from '../../context/ViewModeContext';

interface SalespersonVisitsProps {
  data: ERPData;
}

// Extracted verbatim from SalespersonFlow.tsx's former 'visits' tab - a
// read-only history viewer. Recording a new visit has always only been
// reachable from the 'stores' screen (see SalespersonSales.tsx's "Log
// Visit" button) - that's not a new restriction introduced by this split,
// it matches the original app's behavior exactly.
export default function SalespersonVisits({ data }: SalespersonVisitsProps) {
  const { viewMode } = useViewMode();

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
    <View className="w-full lg:max-w-[1400px] gap-2.5">
      <Text className="font-bold text-slate-600 text-xs uppercase">Site Visits Logging History</Text>
      <ViewToggle />
      {viewMode === 'table' ? (
        <DataTable
          data={data.visits}
          keyExtractor={(v: any) => v.id}
          emptyText="No visit audits logged yet for this shift."
          columns={[
            { key: 'store', label: 'Store', width: 160, render: (v: any) => <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{data.stores.find(s => s.id === v.store_id)?.name || '-'}</Text> },
            { key: 'date', label: 'Visit Date', width: 100, grow: false, render: (v: any) => <Text className="text-[10px] text-slate-500">{new Date(v.date).toLocaleDateString()}</Text> },
            { key: 'notes', label: 'Notes', width: 260, render: (v: any) => <Text className="text-slate-600 italic text-[11px]" numberOfLines={2}>"{v.notes}"</Text> },
            { key: 'follow_up', label: 'Follow-up', width: 100, grow: false, render: (v: any) => v.follow_up_date ? <Text className="text-[9px] text-pink-600 font-extrabold uppercase">{v.follow_up_date}</Text> : <Text className="text-[10px] text-slate-300">-</Text> },
          ] as DataTableColumn<any>[]}
        />
      ) : (
        <View className={`gap-2.5 md:flex-row md:flex-wrap ${data.visits.length === 0 ? 'flex-1' : ''}`}>
          {data.visits.map((v: any) => {
            const store = data.stores.find(s => s.id === v.store_id);
            return (
              <View key={v.id} className="w-full md:w-[48%] xl:w-[32%] bg-white/70 border border-white/50 p-3 rounded-2xl border-l-4 border-l-pink-400">
                <View className="flex-row items-center justify-between mb-1.5"><Text className="font-bold text-slate-800 text-xs">{store?.name}</Text><Text className="text-[9px] text-slate-400">{new Date(v.date).toLocaleDateString()}</Text></View>
                <Text className="text-slate-600 italic text-xs">"{v.notes}"</Text>
                {v.follow_up_date && <Text className="text-[9px] text-pink-600 font-extrabold mt-1.5 uppercase">Follow-up: {v.follow_up_date}</Text>}
              </View>
            );
          })}
          {data.visits.length === 0 && <EmptyState message="No visit audits logged yet for this shift." />}
        </View>
      )}
    </View>
    </ScrollView>
  );
}
