import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  Menu, Bell, LogOut, ChevronRight, LayoutDashboard, ShoppingBag, Database, Award, FileSpreadsheet,
} from 'lucide-react-native';
import { ERPData } from '../../storage';
import { AppNotification, NotificationEntityType } from '../../types';

import AdminDashboard from './AdminDashboard';
import AdminProducts from './AdminProducts';
import AdminWarehouse from './AdminWarehouse';
import AdminSales from './AdminSales';
import AdminUsers from './AdminUsers';
import { useScrollReset, useResetScrollOnChange } from '../../context/ScrollResetContext';
import { formatBadgeCount } from '../../utils/format';

interface AdminFlowProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
  showAlert: (opts: any) => void;
}

type AdminScreen =
  | 'Dashboard' | 'Products' | 'Pricing' | 'Suppliers' | 'Purchases'
  | 'Warehouse' | 'Trucks' | 'TruckInventory' | 'MovementAudit'
  | 'Stores' | 'Orders' | 'Deliveries' | 'Invoices' | 'Payments' | 'QRCodePayment' | 'Credit' | 'Refill' | 'Inactive'
  | 'Users' | 'Notifications';

// Which top-level screen owns each notification entity type - tapping a
// notification switches here first, then the mounted screen below picks the
// specific record up via pendingNotificationTarget once it's on-screen.
const notificationEntityScreen: Record<NotificationEntityType, AdminScreen> = {
  order: 'Orders',
  prebooking: 'Deliveries',
  purchase: 'Purchases',
  store: 'Stores',
  supplier: 'Suppliers',
  product: 'Products',
  user: 'Users',
  truck: 'TruckInventory',
};

const screenTitles: Record<string, string> = {
  Dashboard: 'Executive Panel',
  Products: 'Ice Cream Catalog',
  Pricing: 'Price & Cost Manager',
  Warehouse: 'Cold-Chain Warehouse',
  Trucks: 'Truck Fleet Load & Transfers',
  TruckInventory: 'Truck Inventory & Returns',
  MovementAudit: 'Logistics Movement Audit Trail',
  Stores: 'Partner Outlets',
  Orders: 'Order Logistics',
  Deliveries: 'Pre-Booking Orders',
  Payments: 'Settlements & UPI',
  Credit: 'Credit & Outstanding Balances',
  Refill: 'Smart Refill Reminders',
  Inactive: 'Inactive Partners',
  Users: 'Operator Management',
};

export default function AdminFlow({ data, setData, addNotification, currentUser, setCurrentUser, showAlert }: AdminFlowProps) {
  const [activeScreen, setActiveScreen] = useState<AdminScreen>('Dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingPreBookingTodayFilter, setPendingPreBookingTodayFilter] = useState(false);
  // Set when a notification is tapped and consumed by whichever screen below
  // owns that entity type, so the target record's own detail view opens
  // without every other screen needing to know about notifications at all.
  const [pendingNotificationTarget, setPendingNotificationTarget] = useState<{ entityType: NotificationEntityType; entityId: string } | null>(null);
  const { scrollRef } = useScrollReset();
  useResetScrollOnChange(activeScreen);

  const unreadNotifsCount = data.notifications.filter(n => !n.is_read).length;

  const handleScreenSelect = (screen: AdminScreen) => {
    setActiveScreen(screen);
    setIsDrawerOpen(false);
  };

  const handleViewTodayPreBookings = () => {
    setPendingPreBookingTodayFilter(true);
    handleScreenSelect('Deliveries');
  };

  // Lower-level primitive behind notification-tap navigation: "open entity X
  // on whichever screen owns it." Reused directly by any row-click-to-detail
  // UI (e.g. Movement Logs rows) that already has a raw entityType/entityId
  // pair rather than a full AppNotification.
  const navigateToEntity = (entityType: NotificationEntityType, entityId: string) => {
    setPendingNotificationTarget({ entityType, entityId });
    handleScreenSelect(notificationEntityScreen[entityType]);
  };

  const handleNotificationNavigate = (n: AppNotification) => {
    if (!n.entity_type || !n.entity_id) return;
    navigateToEntity(n.entity_type, n.entity_id);
  };

  const handleLogOut = () => {
    setCurrentUser(null);
  };

  const renderNavGroups = (onSelect: (screen: AdminScreen) => void) => (
    <>
      {drawerGroups.map((group, gIdx) => (
        <View key={gIdx} className="mb-4 gap-1">
          <View className="flex-row items-center gap-1.5 px-2 mb-1.5">
            {group.icon}
            <Text className="text-[9px] uppercase font-bold tracking-widest text-slate-400">{group.title}</Text>
          </View>
          {group.items.map((item, iIdx) => {
            const isActive = activeScreen === item.screen;
            return (
              <Pressable
                key={iIdx}
                onPress={() => onSelect(item.screen)}
                className={`w-full py-2 px-3 rounded-lg flex-row items-center justify-between mb-1 ${
                  isActive ? 'bg-blue-500/15 border border-blue-200/50' : ''
                }`}
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-blue-700 font-extrabold' : 'text-slate-600'}`}>
                  {item.label}
                </Text>
                <ChevronRight size={14} color="#cbd5e1" />
              </Pressable>
            );
          })}
        </View>
      ))}
    </>
  );

  const drawerGroups = [
    {
      title: 'Business & Reporting',
      icon: <LayoutDashboard size={14} color="#6366f1" />,
      items: [
        { label: 'Executive Dashboard', screen: 'Dashboard' as AdminScreen },
        { label: 'System Alert Hub', screen: 'Notifications' as AdminScreen },
      ],
    },
    {
      title: 'Cargo & Catalog',
      icon: <Award size={14} color="#f43f5e" />,
      items: [{ label: 'Ice Cream Catalog', screen: 'Products' as AdminScreen }],
    },
    {
      title: 'Warehouse & Fleet',
      icon: <Database size={14} color="#3b82f6" />,
      items: [
        { label: 'Warehouse Inventory', screen: 'Warehouse' as AdminScreen },
        { label: 'Truck Fleet Load', screen: 'Trucks' as AdminScreen },
        { label: 'Trucks', screen: 'TruckInventory' as AdminScreen },
        { label: 'Logistics Audit Trail', screen: 'MovementAudit' as AdminScreen },
      ],
    },
    {
      title: 'Partners & Sales',
      icon: <ShoppingBag size={14} color="#10b981" />,
      items: [
        { label: 'Partner Stores', screen: 'Stores' as AdminScreen },
        { label: 'Supply Partners', screen: 'Suppliers' as AdminScreen },
        { label: 'Order Dispatches', screen: 'Orders' as AdminScreen },
        { label: 'Pre-Booking', screen: 'Deliveries' as AdminScreen },
        { label: 'Payments & UPI QR', screen: 'Payments' as AdminScreen },
        { label: 'Credit', screen: 'Credit' as AdminScreen },
        { label: 'Refill', screen: 'Refill' as AdminScreen },
        { label: 'Inactive Partners', screen: 'Inactive' as AdminScreen },
      ],
    },
    {
      title: 'System & Security',
      icon: <FileSpreadsheet size={14} color="#a855f7" />,
      items: [{ label: 'Operator Accounts', screen: 'Users' as AdminScreen }],
    },
  ];

  return (
    <View className="flex-1 bg-sky-50 relative md:flex-row">
      {/* PERSISTENT DESKTOP/TABLET SIDEBAR */}
      <View className="hidden md:flex md:w-64 lg:w-72 md:shrink-0 md:h-full md:bg-white/70 md:border-r md:border-white/50 md:p-4">
        <View className="flex-row items-center gap-3 pb-4 border-b border-slate-200/50 mb-4">
          <View className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center">
            <Text className="text-xl">🍦</Text>
          </View>
          <View>
            <Text className="font-extrabold text-sm tracking-tight text-slate-800">{currentUser?.name}</Text>
            <Text className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Administrator</Text>
          </View>
        </View>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {renderNavGroups(handleScreenSelect)}
        </ScrollView>
        <Pressable
          onPress={handleLogOut}
          className="w-full py-2.5 mt-2 bg-rose-50 rounded-xl items-center border border-rose-100 flex-row justify-center gap-2 active:bg-rose-100"
        >
          <LogOut size={14} color="#f43f5e" />
          <Text className="text-rose-600 font-bold text-xs">Log Out</Text>
        </Pressable>
      </View>

      <View className="flex-1 md:min-w-0">
        {/* APP HEADER */}
        <View className="h-14 shrink-0 bg-white/80 border-b border-white/30 px-4 flex-row items-center justify-between z-30">
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => setIsDrawerOpen(true)} className="p-1.5 rounded-lg active:bg-slate-100 md:hidden">
              <Menu size={20} color="#334155" />
            </Pressable>
            <View className="flex-col">
              <Text className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 md:hidden">FrostyFlow ERP</Text>
              <Text className="text-xs font-bold text-slate-800 leading-tight md:text-base">
                {screenTitles[activeScreen] ?? activeScreen}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable onPress={() => setActiveScreen('Notifications')} className="p-2 rounded-xl relative active:bg-slate-100">
              <Bell size={18} color="#334155" />
              {unreadNotifsCount > 0 && (
                <View className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-rose-500 rounded-full items-center justify-center">
                  <Text className="text-white font-extrabold text-[8px]">{formatBadgeCount(unreadNotifsCount)}</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={handleLogOut} className="p-2 rounded-xl active:bg-rose-50 md:hidden">
              <LogOut size={18} color="#334155" />
            </Pressable>
          </View>
        </View>

        {/* CORE SCREEN CANVAS */}
        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="p-4 md:p-4 lg:p-4 w-full md:max-w-[1400px] md:self-center gap-4">
            {activeScreen === 'Dashboard' && (
              <AdminDashboard data={data} setActiveScreen={(scr) => handleScreenSelect(scr as any)} showAlert={showAlert} />
            )}
            {(activeScreen === 'Products' || activeScreen === 'Pricing') && (
              <AdminProducts
                data={data}
                setData={setData}
                addNotification={addNotification}
                currentUser={currentUser}
                activeScreen={activeScreen}
                showAlert={showAlert}
                pendingNotificationTarget={pendingNotificationTarget}
                onConsumePendingNotificationTarget={() => setPendingNotificationTarget(null)}
              />
            )}
            {(activeScreen === 'Warehouse' || activeScreen === 'Trucks' || activeScreen === 'TruckInventory' || activeScreen === 'MovementAudit') && (
              <AdminWarehouse
                data={data}
                setData={setData}
                addNotification={addNotification}
                currentUser={currentUser}
                activeScreen={activeScreen}
                setActiveScreen={(scr) => handleScreenSelect(scr as any)}
                showAlert={showAlert}
                onViewTodayPreBookings={handleViewTodayPreBookings}
                pendingNotificationTarget={pendingNotificationTarget}
                onConsumePendingNotificationTarget={() => setPendingNotificationTarget(null)}
                onNavigateToEntity={navigateToEntity}
              />
            )}
            {(activeScreen === 'Stores' || activeScreen === 'Suppliers' || activeScreen === 'Purchases' || activeScreen === 'Orders' || activeScreen === 'Deliveries' || activeScreen === 'Invoices' || activeScreen === 'Payments' || activeScreen === 'QRCodePayment' || activeScreen === 'Credit' || activeScreen === 'Refill' || activeScreen === 'Inactive') && (
              <AdminSales
                data={data}
                setData={setData}
                addNotification={addNotification}
                currentUser={currentUser}
                activeScreen={activeScreen}
                showAlert={showAlert}
                initialPreBookingTodayFilter={pendingPreBookingTodayFilter}
                onConsumeInitialPreBookingTodayFilter={() => setPendingPreBookingTodayFilter(false)}
                pendingNotificationTarget={pendingNotificationTarget}
                onConsumePendingNotificationTarget={() => setPendingNotificationTarget(null)}
              />
            )}
            {(activeScreen === 'Users' || activeScreen === 'Notifications') && (
              <AdminUsers
                data={data}
                setData={setData}
                addNotification={addNotification}
                currentUser={currentUser}
                activeScreen={activeScreen}
                showAlert={showAlert}
                pendingNotificationTarget={pendingNotificationTarget}
                onConsumePendingNotificationTarget={() => setPendingNotificationTarget(null)}
                onNotificationNavigate={handleNotificationNavigate}
              />
            )}
          </View>
        </ScrollView>

        {/* BOTTOM TAB BAR (mobile only) */}
        <View className="h-16 shrink-0 bg-white/90 border-t border-white/30 flex-row items-stretch z-30 md:hidden">
          {[
            { screen: 'Dashboard' as AdminScreen, icon: LayoutDashboard, label: 'Stats' },
            { screen: 'Products' as AdminScreen, icon: Award, label: 'Catalog' },
            { screen: 'Warehouse' as AdminScreen, icon: Database, label: 'Stock', group: ['Warehouse', 'Trucks', 'TruckInventory', 'MovementAudit'] },
            { screen: 'Stores' as AdminScreen, icon: ShoppingBag, label: 'Partners', group: ['Stores', 'Suppliers', 'Purchases', 'Orders', 'Deliveries', 'Invoices', 'Payments', 'QRCodePayment', 'Credit', 'Refill', 'Inactive'] },
            { screen: 'Users' as AdminScreen, icon: LayoutDashboard, label: 'Accounts' },
          ].map((tab, idx) => {
            const isActive = tab.group ? tab.group.includes(activeScreen) : activeScreen === tab.screen;
            const Icon = tab.icon;
            return (
              <Pressable
                key={idx}
                onPress={() => handleScreenSelect(tab.screen)}
                className="flex-1 items-center justify-center gap-1"
              >
                <Icon size={20} color={isActive ? '#2563eb' : '#94a3b8'} />
                <Text className={`text-[9px] font-bold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* DRAWER OVERLAY (mobile only) */}
      {isDrawerOpen && (
        <View className="absolute inset-0 bg-black/30 z-50 flex-row md:hidden">
          <View className="w-[280px] h-full bg-white border-r border-white/50 p-4 justify-between">
            <View className="flex-1">
              <View className="flex-row items-center gap-3 pb-4 border-b border-slate-200/50 mb-6">
                <View className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center">
                  <Text className="text-xl">🍦</Text>
                </View>
                <View>
                  <Text className="font-extrabold text-sm tracking-tight text-slate-800">{currentUser?.name}</Text>
                  <Text className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Administrator</Text>
                </View>
              </View>

              <ScrollView className="flex-1">
                {renderNavGroups(handleScreenSelect)}
              </ScrollView>
            </View>

            <Pressable
              onPress={() => setIsDrawerOpen(false)}
              className="w-full py-2 bg-slate-100 rounded-xl items-center border border-slate-200"
            >
              <Text className="text-slate-700 font-bold text-xs">Close Navigation Panel</Text>
            </Pressable>
          </View>

          <Pressable className="flex-1" onPress={() => setIsDrawerOpen(false)} />
        </View>
      )}
    </View>
  );
}
