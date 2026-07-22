import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { AppNotification } from '../../types';
import AdminWarehouse from '../admin/AdminWarehouse';
import AdminSales from '../admin/AdminSales';
import { useScrollReset, useResetScrollOnChange } from '../../context/ScrollResetContext';

interface WarehouseFlowProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
  showAlert: (opts: any) => void;
}

export default function WarehouseFlow({ data, setData, addNotification, currentUser, setCurrentUser, showAlert }: WarehouseFlowProps) {
  const [activeSection, setActiveSection] = useState<'stock' | 'prebookings' | 'orders'>('stock');
  const [pendingPreBookingTodayFilter, setPendingPreBookingTodayFilter] = useState(false);
  const { scrollRef } = useScrollReset();
  useResetScrollOnChange(activeSection);

  const handleViewTodayPreBookings = () => {
    setPendingPreBookingTodayFilter(true);
    setActiveSection('prebookings');
  };

  return (
    <View className="flex-1 bg-sky-50">
      <View className="h-14 shrink-0 bg-white/80 border-b border-white/30 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="w-8 h-8 bg-indigo-500/10 border border-indigo-500/30 rounded-xl items-center justify-center"><Text>❄️</Text></View>
          <View>
            <Text className="text-[10px] font-extrabold uppercase text-indigo-600">Depot Manager</Text>
            <Text className="text-xs font-black text-slate-800">{currentUser.name.split(' ')[0]}</Text>
          </View>
        </View>
        <Pressable onPress={() => setCurrentUser(null)} className="p-1.5 rounded-lg flex-row items-center gap-1 active:bg-rose-50">
          <Text className="text-rose-500 font-bold text-xs">Logout</Text>
          <LogOut size={16} color="#f43f5e" />
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="p-4 md:p-6 lg:p-8 w-full md:max-w-[1400px] md:self-center gap-4">
          <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
            {([
              { key: 'stock' as const, label: 'Warehouse & Fleet' },
              { key: 'prebookings' as const, label: 'Pre-Bookings' },
              { key: 'orders' as const, label: 'Orders' },
            ]).map(section => (
              <Pressable
                key={section.key}
                onPress={() => setActiveSection(section.key)}
                className={`flex-1 min-w-[30%] py-1.5 rounded-lg items-center ${activeSection === section.key ? 'bg-indigo-600' : ''}`}
              >
                <Text className={`text-[10px] font-extrabold ${activeSection === section.key ? 'text-white' : 'text-slate-500'}`}>
                  {section.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {activeSection === 'stock' ? (
            <AdminWarehouse
              data={data}
              setData={setData}
              addNotification={addNotification}
              currentUser={currentUser}
              showAlert={showAlert}
              hideAdminControls
              onViewTodayPreBookings={handleViewTodayPreBookings}
            />
          ) : activeSection === 'prebookings' ? (
            <AdminSales
              data={data}
              setData={setData}
              addNotification={addNotification}
              currentUser={currentUser}
              activeScreen="Deliveries"
              showAlert={showAlert}
              hideAdminControls
              initialPreBookingTodayFilter={pendingPreBookingTodayFilter}
              onConsumeInitialPreBookingTodayFilter={() => setPendingPreBookingTodayFilter(false)}
            />
          ) : (
            <AdminSales
              data={data}
              setData={setData}
              addNotification={addNotification}
              currentUser={currentUser}
              activeScreen="Orders"
              showAlert={showAlert}
              hideAdminControls
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
