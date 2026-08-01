import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LayoutDashboard, Truck, Store as StoreIcon, CheckCircle, LogOut, MessageCircle } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { AppNotification, NotificationEntityType } from '../../types';
import { useScrollReset, useResetScrollOnChange } from '../../context/ScrollResetContext';
import { SalespersonScreen, PERMISSION_REGISTRY } from '../../config/permissionsRegistry';
import { isScreenVisible, isForeignScreenGranted } from '../../utils/permissions';
import SalespersonSales, { SalespersonSalesForm } from './SalespersonSales';
import SalespersonCargo from './SalespersonCargo';
import SalespersonDeliveries from './SalespersonDeliveries';
import SalespersonVisits from './SalespersonVisits';
import ScreenHost, { HostableScreen } from '../shared/ScreenHost';

interface SalespersonFlowProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  syncQueueOffline: (action: string, payload: any) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
  showAlert: (opts: any) => void;
}

// Shell only: sidebar/header/bottom-tab chrome, nav-permission filtering, and
// mounting whichever of the 4 extracted screen components matches the active
// tab. All the actual screen logic lives in SalespersonSales.tsx (home +
// stores + every order/settlement/ledger form - these share state so they're
// one component, like AdminSales.tsx already does for 8 of Admin's own
// registry items), SalespersonCargo.tsx, SalespersonDeliveries.tsx, and
// SalespersonVisits.tsx.
export default function SalespersonFlow({ data, setData, addNotification, currentUser, setCurrentUser, showAlert }: SalespersonFlowProps) {
  const [activeTab, setActiveTab] = useState<SalespersonScreen>('home');
  // Lifted up from SalespersonSales.tsx so the bottom tab bar below can hide
  // itself while a full-screen form is open there, exactly as it did before
  // that file was extracted out of this one.
  const [activeForm, setActiveForm] = useState<SalespersonSalesForm>('list');
  // Handoff for the "Pre-book" button on the stores screen, which used to
  // just flip a shared `selectedStore` variable - now Deliveries is a
  // separate component, so this is a one-time prefill passed as a prop.
  const [pendingDeliveryStoreId, setPendingDeliveryStoreId] = useState<string | null>(null);
  // Set when an "Additional Access" item (a screen cross-granted from a
  // different role, see Manage Permissions) is selected - takes over the
  // canvas via ScreenHost instead of the native activeTab switch below.
  const [activeForeignScreen, setActiveForeignScreen] = useState<HostableScreen | null>(null);
  const { scrollRef } = useScrollReset();
  useResetScrollOnChange(activeForm, activeTab);

  const navTabs = [
    { tab: 'home' as const, icon: LayoutDashboard, label: 'Shift Home' },
    { tab: 'inventory' as const, icon: Truck, label: 'My Cargo' },
    { tab: 'stores' as const, icon: StoreIcon, label: 'Outlets' },
    { tab: 'deliveries' as const, icon: CheckCircle, label: 'Pre-booking' },
    { tab: 'visits' as const, icon: MessageCircle, label: 'Audits Visit' },
  ].filter(t => isScreenVisible(currentUser, t.tab, data.rolePermissions, data.userPermissions));

  const hasAnyAccess = navTabs.length > 0;

  // Screens that belong to Admin's or Warehouse's registry bucket but have
  // been individually granted to this Salesperson operator via Manage
  // Permissions - Admin's Users/Notifications are never cross-granted.
  const additionalAccessItems = (['Admin', 'Warehouse'] as const).flatMap(ownerRole =>
    PERMISSION_REGISTRY[ownerRole].flatMap(module =>
      module.items
        .filter(item => item.kind === 'screen' && item.key !== 'Users' && item.key !== 'Notifications' && isForeignScreenGranted(currentUser, ownerRole, item.key, data.rolePermissions, data.userPermissions))
        .map(item => ({ key: item.key as HostableScreen, label: item.label }))
    )
  );

  // Redirect away from a tab that just became disabled for this operator
  // (e.g. a permission change arriving live via realtime refreshData()).
  React.useEffect(() => {
    if (hasAnyAccess && !navTabs.some(t => t.tab === activeTab)) {
      setActiveTab(navTabs[0].tab);
    }
  }, [activeTab, hasAnyAccess, navTabs.map(t => t.tab).join(',')]);

  const handleSelectTab = (tab: SalespersonScreen) => {
    setActiveTab(tab);
    setActiveForm('list');
    setActiveForeignScreen(null);
  };

  const handleSelectForeignScreen = (screen: HostableScreen) => {
    setActiveForeignScreen(screen);
  };

  return (
    <View className="flex-1 bg-sky-50 md:flex-row">
      {/* PERSISTENT DESKTOP/TABLET SIDEBAR */}
      <View className="hidden md:flex md:w-64 lg:w-72 md:shrink-0 md:h-full md:bg-white/70 md:border-r md:border-white/50 md:p-4">
        <View className="flex-row items-center gap-3 pb-4 border-b border-slate-200/50 mb-4">
          <View className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center">
            <Text className="text-xs font-black text-blue-600">{currentUser.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}</Text>
          </View>
          <View>
            <Text className="text-[10px] font-extrabold uppercase text-blue-600">Route Operator</Text>
            <Text className="text-xs font-black text-slate-800">{currentUser.name.split(' ')[0]}</Text>
          </View>
        </View>
        <View className="flex-1 gap-1">
          {navTabs.map(({ tab, icon: Icon, label }) => {
            const isActive = !activeForeignScreen && activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => handleSelectTab(tab)}
                className={`w-full py-2.5 px-3 rounded-lg flex-row items-center gap-2.5 mb-1 ${isActive ? 'bg-blue-500/15 border border-blue-200/50' : ''}`}
              >
                <Icon size={16} color={isActive ? '#2563eb' : '#94a3b8'} />
                <Text className={`text-xs font-semibold ${isActive ? 'text-blue-700 font-extrabold' : 'text-slate-600'}`}>{label}</Text>
              </Pressable>
            );
          })}
          {additionalAccessItems.length > 0 && (
            <View className="mt-3 pt-3 border-t border-slate-200/50 gap-1">
              <Text className="text-[9px] uppercase font-bold tracking-widest text-slate-400 px-3 mb-1">Additional Access</Text>
              {additionalAccessItems.map(item => {
                const isActive = activeForeignScreen === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => handleSelectForeignScreen(item.key)}
                    className={`w-full py-2.5 px-3 rounded-lg flex-row items-center gap-2.5 mb-1 ${isActive ? 'bg-indigo-500/15 border border-indigo-200/50' : ''}`}
                  >
                    <Text className={`text-xs font-semibold ${isActive ? 'text-indigo-700 font-extrabold' : 'text-slate-600'}`}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
        <Pressable
          onPress={() => setCurrentUser(null)}
          className="w-full py-2.5 mt-2 bg-rose-50 rounded-xl items-center border border-rose-100 flex-row justify-center gap-2 active:bg-rose-100"
        >
          <LogOut size={14} color="#f43f5e" />
          <Text className="text-rose-600 font-bold text-xs">Log Out</Text>
        </Pressable>
      </View>

      <View className="flex-1 md:min-w-0">
        <View className="h-14 shrink-0 bg-white/80 border-b border-white/30 px-4 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center md:hidden">
              <Text className="text-xs font-black text-blue-600">{currentUser.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}</Text>
            </View>
            <View>
              <Text className="text-[10px] font-extrabold uppercase text-blue-600 md:hidden">Route Operator</Text>
              <Text className="text-xs font-black text-slate-800 md:text-base">{currentUser.name.split(' ')[0]}</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="font-extrabold text-slate-500 font-mono text-[9px] bg-white/60 border border-slate-200 px-2 py-0.5 rounded-lg uppercase">{data.trucks.find(t => t.driver_user_id === currentUser.id)?.vehicle_number || 'TRK-981'}</Text>
            <Pressable onPress={() => setCurrentUser(null)} className="p-1.5 rounded-lg active:bg-rose-50 md:hidden">
              <LogOut size={18} color="#f43f5e" />
            </Pressable>
          </View>
        </View>

        {activeForeignScreen ? (
          <ScreenHost screen={activeForeignScreen} data={data} setData={setData} addNotification={addNotification} currentUser={currentUser} showAlert={showAlert} />
        ) : !hasAnyAccess ? (
          <View className="flex-1 items-center justify-center py-20 gap-2 px-4">
            <Text className="text-slate-500 font-bold text-sm text-center">You don't currently have access to any screens.</Text>
            <Text className="text-slate-400 text-xs text-center">Contact your administrator.</Text>
          </View>
        ) : activeTab === 'home' || activeTab === 'stores' ? (
          <SalespersonSales
            data={data}
            setData={setData}
            addNotification={addNotification}
            currentUser={currentUser}
            showAlert={showAlert}
            activeScreen={activeTab === 'home' ? 'home' : 'stores'}
            activeForm={activeForm}
            setActiveForm={setActiveForm}
            onNavigateToDeliveries={(storeId) => { setPendingDeliveryStoreId(storeId); handleSelectTab('deliveries'); }}
            onRequestSalesTab={(tab) => setActiveTab(tab)}
          />
        ) : activeTab === 'inventory' ? (
          <SalespersonCargo data={data} currentUser={currentUser} />
        ) : activeTab === 'deliveries' ? (
          <SalespersonDeliveries
            data={data}
            setData={setData}
            addNotification={addNotification}
            currentUser={currentUser}
            showAlert={showAlert}
            initialStoreId={pendingDeliveryStoreId}
            onConsumeInitialStoreId={() => setPendingDeliveryStoreId(null)}
          />
        ) : activeTab === 'visits' ? (
          <SalespersonVisits data={data} />
        ) : null}

        {activeForm === 'list' && !activeForeignScreen && (
          <View className="h-16 shrink-0 bg-white/90 border-t border-white/30 flex-row items-stretch md:hidden">
            {navTabs.map(({ tab, icon: Icon, label }) => (
              <Pressable key={tab} onPress={() => handleSelectTab(tab)} className="flex-1 items-center justify-center gap-1">
                <Icon size={20} color={activeTab === tab ? '#2563eb' : '#94a3b8'} />
                <Text className={`text-[9px] font-bold ${activeTab === tab ? 'text-blue-600' : 'text-slate-400'}`}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
