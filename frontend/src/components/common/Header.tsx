import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Menu, Bell, LogOut } from 'lucide-react-native';

type HeaderProps = {
  title: string;
  currentUser: any;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  unreadNotifsCount: number;
  handleLogOut: () => void;
  offline: boolean;
};

export default function Header({
  currentUser,
  setIsDrawerOpen,
  unreadNotifsCount,
  handleLogOut,
  offline,
}: HeaderProps) {
  return (
    <View className="h-14 shrink-0 bg-white/80 border-b border-white/30 px-4 flex-row items-center justify-between z-30">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => setIsDrawerOpen(true)}
          className="p-1.5 rounded-lg active:bg-slate-100"
        >
          <Menu size={20} color="#334155" />
        </Pressable>
        <View className="flex-col">
          <Text className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">
            FrostyFlow ERP
          </Text>
          <Text className="text-xs font-bold text-slate-800 leading-tight">
            {currentUser?.name?.split(' ')[0]}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="font-extrabold text-slate-500 text-[9px] bg-white/60 border border-slate-200 px-2 py-0.5 rounded-lg uppercase">
          {offline ? 'Offline' : 'Online'}
        </Text>
        <View className="p-2 rounded-xl relative">
          <Bell size={18} color="#334155" />
          {unreadNotifsCount > 0 && (
            <View className="absolute top-1 right-1 w-4 h-4 bg-rose-500 rounded-full items-center justify-center">
              <Text className="text-white font-extrabold text-[8px]">{unreadNotifsCount}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={handleLogOut} className="p-2 rounded-xl active:bg-rose-50">
          <LogOut size={18} color="#334155" />
        </Pressable>
      </View>
    </View>
  );
}
