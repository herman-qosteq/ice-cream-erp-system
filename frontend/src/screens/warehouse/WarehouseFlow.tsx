import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { AppNotification } from '../../types';
import AdminWarehouse from '../admin/AdminWarehouse';

interface WarehouseFlowProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
  showAlert: (opts: any) => void;
}

export default function WarehouseFlow({ data, setData, addNotification, currentUser, setCurrentUser, showAlert }: WarehouseFlowProps) {
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

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="p-4 md:p-6 lg:p-8 w-full md:max-w-[1400px] md:self-center">
          <AdminWarehouse
            data={data}
            setData={setData}
            addNotification={addNotification}
            currentUser={currentUser}
            showAlert={showAlert}
            hideAdminControls
          />
        </View>
      </ScrollView>
    </View>
  );
}
