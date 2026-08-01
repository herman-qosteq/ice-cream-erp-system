import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LogOut, Menu, ChevronRight, Database, CalendarClock, Package } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { AppNotification } from '../../types';
import BrandLogo from '../../components/common/BrandLogo';
import AdminWarehouse from '../admin/AdminWarehouse';
import AdminSales from '../admin/AdminSales';
import { useScrollReset, useResetScrollOnChange } from '../../context/ScrollResetContext';
import { PERMISSION_REGISTRY, WAREHOUSE_CLUSTER_TAB_MAP } from '../../config/permissionsRegistry';
import { isForeignScreenGranted } from '../../utils/permissions';
import ScreenHost, { HostableScreen } from '../shared/ScreenHost';

interface WarehouseFlowProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
  showAlert: (opts: any) => void;
}

// Warehouse's registry bucket is empty (see permissionsRegistry.ts) - all 3
// of these are purely local sidebar-grouping ids, not permission keys. Each
// one's visibility is derived below from the corresponding Admin-owned
// screen(s), which are default-enabled for Warehouse and individually
// revocable per operator via Manage Permissions.
type WarehouseNavSection = 'stock' | 'prebookings' | 'orders';

const sectionMeta: Record<WarehouseNavSection, { label: string; icon: typeof Database }> = {
  stock: { label: 'Warehouse & Fleet', icon: Database },
  prebookings: { label: 'Pre-Bookings', icon: CalendarClock },
  orders: { label: 'Orders', icon: Package },
};

export default function WarehouseFlow({ data, setData, addNotification, currentUser, setCurrentUser, showAlert }: WarehouseFlowProps) {
  const [activeSection, setActiveSection] = useState<WarehouseNavSection>('stock');
  const [pendingPreBookingTodayFilter, setPendingPreBookingTodayFilter] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Set when an "Additional Access" item (a screen cross-granted from a
  // different role, see Manage Permissions) is selected - takes over the
  // canvas via ScreenHost instead of the native activeSection switch below.
  const [activeForeignScreen, setActiveForeignScreen] = useState<HostableScreen | null>(null);
  const { scrollRef } = useScrollReset();
  useResetScrollOnChange(activeSection);

  const handleViewTodayPreBookings = () => {
    setPendingPreBookingTodayFilter(true);
    setActiveSection('prebookings');
    setActiveForeignScreen(null);
  };

  // Which of AdminWarehouse.tsx's 5 tabs this operator actually has - the
  // first 4 (Warehouse/Trucks/TruckInventory/MovementAudit) are
  // default-enabled for native Warehouse (see defaultForRoles in
  // permissionsRegistry.ts), individually revocable per operator via Manage
  // Permissions the same way a cross-role grant would be. Assets has no
  // defaultForRoles, so it only shows up here once explicitly granted.
  const allowedWarehouseTabs = WAREHOUSE_CLUSTER_TAB_MAP
    .filter(({ screen }) => isForeignScreenGranted(currentUser, 'Admin', screen, data.rolePermissions, data.userPermissions))
    .map(({ tab }) => tab);
  const hasWarehouseFleetAccess = allowedWarehouseTabs.length > 0;

  // Orders/Deliveries are likewise default-enabled for Warehouse via Admin's
  // own registry items rather than a separate Warehouse-owned key - see the
  // 'Orders'/'Deliveries' items' defaultForRoles in permissionsRegistry.ts.
  const hasOrdersAccess = isForeignScreenGranted(currentUser, 'Admin', 'Orders', data.rolePermissions, data.userPermissions);
  const hasDeliveriesAccess = isForeignScreenGranted(currentUser, 'Admin', 'Deliveries', data.rolePermissions, data.userPermissions);

  const sections = [
    ...(hasWarehouseFleetAccess ? [{ key: 'stock' as const }] : []),
    ...(hasDeliveriesAccess ? [{ key: 'prebookings' as const }] : []),
    ...(hasOrdersAccess ? [{ key: 'orders' as const }] : []),
  ];

  const hasAnyAccess = sections.length > 0;

  // Screens that belong to Admin's or Salesperson's registry bucket but have
  // been individually granted to this Warehouse operator via Manage
  // Permissions - Admin's Users/Notifications are never cross-granted, and
  // Admin's Warehouse/Trucks/TruckInventory/MovementAudit/Assets/Orders/
  // Deliveries are excluded here too since they're handled natively above
  // (as the "Warehouse & Fleet"/Pre-Bookings/Orders sections), not as an
  // additional/foreign screen. Assets stays out of "Warehouse & Fleet" by
  // default though (see hasWarehouseFleetAccess/allowedWarehouseTabs above
  // and its registry item in permissionsRegistry.ts) - an operator only
  // actually sees that tab once an Admin explicitly grants it.
  const NATIVE_WAREHOUSE_ADMIN_KEYS: string[] = [...WAREHOUSE_CLUSTER_TAB_MAP.map(t => t.screen), 'Orders', 'Deliveries'];
  const additionalAccessItems = (['Admin', 'Salesperson'] as const).flatMap(ownerRole =>
    PERMISSION_REGISTRY[ownerRole].flatMap(module =>
      module.items
        .filter(item =>
          item.kind === 'screen' &&
          item.key !== 'Users' && item.key !== 'Notifications' &&
          !(ownerRole === 'Admin' && NATIVE_WAREHOUSE_ADMIN_KEYS.includes(item.key)) &&
          isForeignScreenGranted(currentUser, ownerRole, item.key, data.rolePermissions, data.userPermissions)
        )
        .map(item => ({ key: item.key as HostableScreen, label: item.label }))
    )
  );

  const handleSelectSection = (key: WarehouseNavSection) => {
    setActiveSection(key);
    setActiveForeignScreen(null);
    setIsDrawerOpen(false);
  };

  const handleSelectForeignScreen = (key: HostableScreen) => {
    setActiveForeignScreen(key);
    setIsDrawerOpen(false);
  };

  // Redirect away from a section that just became disabled for this
  // operator (e.g. a permission change arriving live via realtime
  // refreshData()).
  React.useEffect(() => {
    if (hasAnyAccess && !sections.some(s => s.key === activeSection)) {
      setActiveSection(sections[0].key);
    }
  }, [activeSection, hasAnyAccess, sections.map(s => s.key).join(',')]);

  const activeTitle = activeForeignScreen
    ? additionalAccessItems.find(i => i.key === activeForeignScreen)?.label ?? activeForeignScreen
    : sectionMeta[activeSection].label;

  const renderNavItems = (onSelectSection: (key: WarehouseNavSection) => void, onSelectForeign: (key: HostableScreen) => void) => (
    <>
      <View className="mb-4 gap-1">
        <View className="flex-row items-center gap-1.5 px-2 mb-1.5">
          <Text className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Navigation</Text>
        </View>
        {sections.map(({ key }) => {
          const { label, icon: Icon } = sectionMeta[key];
          const isActive = !activeForeignScreen && activeSection === key;
          return (
            <Pressable
              key={key}
              onPress={() => onSelectSection(key)}
              className={`w-full py-2.5 px-3 rounded-lg flex-row items-center gap-2.5 mb-1 ${isActive ? 'bg-blue-500/15 border border-blue-200/50' : ''}`}
            >
              <Icon size={16} color={isActive ? '#2563eb' : '#94a3b8'} />
              <Text className={`text-xs font-semibold flex-1 ${isActive ? 'text-blue-700 font-extrabold' : 'text-slate-600'}`}>{label}</Text>
              <ChevronRight size={14} color="#cbd5e1" />
            </Pressable>
          );
        })}
      </View>

      {additionalAccessItems.length > 0 && (
        <View className="mb-4 gap-1">
          <View className="flex-row items-center gap-1.5 px-2 mb-1.5">
            <Text className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Additional Access</Text>
          </View>
          {additionalAccessItems.map(item => {
            const isActive = activeForeignScreen === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => onSelectForeign(item.key)}
                className={`w-full py-2.5 px-3 rounded-lg flex-row items-center justify-between mb-1 ${isActive ? 'bg-blue-500/15 border border-blue-200/50' : ''}`}
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-blue-700 font-extrabold' : 'text-slate-600'}`}>{item.label}</Text>
                <ChevronRight size={14} color="#cbd5e1" />
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );

  return (
    <View className="flex-1 bg-sky-50 relative md:flex-row">
      {/* PERSISTENT DESKTOP/TABLET SIDEBAR */}
      <View className="hidden md:flex md:w-64 lg:w-72 md:shrink-0 md:h-full md:bg-white/70 md:border-r md:border-white/50 md:p-4">
        <View className="flex-row items-center gap-3 pb-4 border-b border-slate-200/50 mb-4">
          <View className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center">
            <BrandLogo className="text-xl" size={28} />
          </View>
          <View>
            <Text className="font-extrabold text-sm tracking-tight text-slate-800">{currentUser?.name}</Text>
            <Text className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Depot Manager</Text>
          </View>
        </View>
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {renderNavItems(handleSelectSection, handleSelectForeignScreen)}
        </ScrollView>
        <Pressable
          onPress={() => setCurrentUser(null)}
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
              <Text className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 md:hidden">Depot Manager</Text>
              <Text className="text-xs font-bold text-slate-800 leading-tight md:text-base">{activeTitle}</Text>
            </View>
          </View>
          <Pressable onPress={() => setCurrentUser(null)} className="p-2 rounded-xl active:bg-rose-50 md:hidden">
            <LogOut size={18} color="#f43f5e" />
          </Pressable>
        </View>

        {/* CORE SCREEN CANVAS */}
        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="p-4 md:p-4 lg:p-4 w-full md:max-w-[1400px] md:self-center gap-4">
            {activeForeignScreen ? (
              <ScreenHost screen={activeForeignScreen} data={data} setData={setData} addNotification={addNotification} currentUser={currentUser} showAlert={showAlert} />
            ) : !hasAnyAccess ? (
              <View className="items-center justify-center py-20 gap-2">
                <Text className="text-slate-500 font-bold text-sm text-center">You don't currently have access to any screens.</Text>
                <Text className="text-slate-400 text-xs text-center">Contact your administrator.</Text>
              </View>
            ) : activeSection === 'stock' ? (
              <AdminWarehouse
                data={data}
                setData={setData}
                addNotification={addNotification}
                currentUser={currentUser}
                showAlert={showAlert}
                hideAdminControls
                allowedTabs={allowedWarehouseTabs}
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

      {/* DRAWER OVERLAY (mobile only) */}
      {isDrawerOpen && (
        <View className="absolute inset-0 bg-black/30 z-50 flex-row md:hidden">
          <View className="w-[280px] h-full bg-white border-r border-white/50 p-4 justify-between">
            <View className="flex-1">
              <View className="flex-row items-center gap-3 pb-4 border-b border-slate-200/50 mb-6">
                <View className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center">
                  <BrandLogo className="text-xl" size={28} />
                </View>
                <View>
                  <Text className="font-extrabold text-sm tracking-tight text-slate-800">{currentUser?.name}</Text>
                  <Text className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Depot Manager</Text>
                </View>
              </View>

              <ScrollView className="flex-1">
                {renderNavItems(handleSelectSection, handleSelectForeignScreen)}
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
