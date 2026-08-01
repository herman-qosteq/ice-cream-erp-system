import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { ERPData } from '../../storage';
import ViewToggle from '../../components/common/ViewToggle';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import FilterBar from '../../components/common/FilterBar';
import { useViewMode } from '../../context/ViewModeContext';
import { readQtyField, isPositiveQty, formatQty } from '../../utils/qty';

interface SalespersonCargoProps {
  data: ERPData;
  currentUser: any;
}

// Extracted verbatim from SalespersonFlow.tsx's former 'inventory' tab - fully
// self-contained (no shared state with any other Salesperson screen), so
// this is a straight relocation with zero behavior change.
export default function SalespersonCargo({ data, currentUser }: SalespersonCargoProps) {
  const { viewMode } = useViewMode();
  const [availSearch, setAvailSearch] = useState('');

  const assignedTruck = data.trucks.find(t => t.driver_user_id === currentUser.id);
  const truckId = assignedTruck?.id || 't1';

  const cargoList = data.products
    .filter(p => p.status === 'Active')
    .filter(p => p.name.toLowerCase().includes(availSearch.toLowerCase()))
    .map(p => {
      const truckQty = readQtyField(data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === p.id), 'quantity', 'quantity_pieces');
      const whInv = data.warehouse_inventory.find(wh => wh.product_id === p.id);
      const whQty = readQtyField(whInv, 'available_qty', 'available_pieces');
      return { ...p, truckQty, whQty };
    })
    .sort((a, b) => { const aHas = isPositiveQty(a.truckQty) ? 1 : 0; const bHas = isPositiveQty(b.truckQty) ? 1 : 0; if (aHas !== bHas) return bHas - aHas; return a.name.localeCompare(b.name); });

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
    <View className="w-full lg:max-w-[1400px] gap-4">
      <FilterBar searchValue={availSearch} onSearchChange={setAvailSearch} searchPlaceholder="Search truck stock..." hideViewToggle />
      <View className="bg-white/70 border border-white/50 p-3 rounded-2xl">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="font-bold text-slate-800 text-xs">My Dispatched Cargo Quantities</Text>
        </View>
        <ViewToggle />
        {viewMode === 'table' ? (
          <View className="mt-3">
            <DataTable
              data={cargoList}
              keyExtractor={p => p.id}
              emptyText="No products match your cargo search."
              columns={[
                { key: 'name', label: 'Product', width: 180, render: p => <Text className={`font-bold text-[11px] ${!isPositiveQty(p.truckQty) ? 'text-slate-500' : 'text-slate-800'}`} numberOfLines={1}>{p.name}</Text> },
                { key: 'brand', label: 'Brand', width: 120, render: p => <Text className="text-[10px] text-slate-500" numberOfLines={1}>{p.brand}</Text> },
                { key: 'truck', label: 'Truck Qty', width: 110, align: 'right' as const, render: p => <Text className={`font-black text-right px-1.5 py-0.5 rounded text-[10px] ${!isPositiveQty(p.truckQty) ? 'text-slate-400 bg-slate-200' : 'text-pink-700 bg-pink-100'}`}>{formatQty(p.truckQty)}</Text> },
                { key: 'warehouse', label: 'Warehouse Qty', width: 130, align: 'right' as const, render: p => <Text className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-right">{formatQty(p.whQty)}</Text> },
              ] as DataTableColumn<typeof cargoList[number]>[]}
            />
          </View>
        ) : (
          <View className={`gap-2 md:flex-row md:flex-wrap mt-3 ${cargoList.length === 0 ? 'flex-1' : ''}`}>
            {cargoList.length === 0 ? (
              <EmptyState message="No products match your cargo search." />
            ) : cargoList.map(p => {
              const isNotLoaded = !isPositiveQty(p.truckQty);
              return (
                <View key={p.id} className={`w-full md:w-[48%] xl:w-[32%] p-2.5 rounded-xl border flex-row items-center justify-between ${isNotLoaded ? 'bg-slate-100 border-slate-200' : 'bg-white/80 border-white/60'}`}>
                  <View className="flex-1">
                    <Text className={`font-bold text-xs ${isNotLoaded ? 'text-slate-500' : 'text-slate-800'}`}>{p.name}</Text>
                    <Text className="text-[10px] text-slate-400">{p.brand}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View className="items-center"><Text className="text-[9px] text-slate-400 font-bold">Truck</Text><Text className={`font-black px-1.5 py-0.5 rounded text-[10px] ${isNotLoaded ? 'text-slate-400 bg-slate-200' : 'text-pink-700 bg-pink-100'}`}>{formatQty(p.truckQty)}</Text></View>
                    <View className="items-center"><Text className="text-[9px] text-slate-400 font-bold">Silo</Text><Text className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{formatQty(p.whQty)}</Text></View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
    </ScrollView>
  );
}
