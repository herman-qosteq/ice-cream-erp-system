import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Bell, AlertTriangle } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { AppNotification } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { notificationsApi } from '../../api/endpoints';
import { formatDateTime12h } from '../../utils/format';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import FilterBar from '../../components/common/FilterBar';
import EmptyState from '../../components/common/EmptyState';
import ScrollableSection from '../../components/common/ScrollableSection';
import PaginationFooter from '../../components/common/PaginationFooter';
import { useViewMode } from '../../context/ViewModeContext';
import { useResetScrollOnChange } from '../../context/ScrollResetContext';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useResponsiveTableHeight } from '../../hooks/useResponsiveTableHeight';

interface AdminNotificationsProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  onNotificationNavigate?: (n: AppNotification) => void;
}

const notifTypeLabels: Record<string, string> = {
  low_stock: 'Low Stock',
  out_of_stock: 'Out Of Stock',
  expiry: 'Expiry',
  refill: 'Refill',
  payment_due: 'Payment Due',
  payment_received: 'Payment Received',
  credit_exceeded: 'Credit Exceeded',
  new_order: 'New Order',
  order_update: 'Order Update',
  delivery: 'Delivery',
  partner_update: 'Partner Update',
  product_update: 'Catalog Update',
  user_update: 'Operator Account',
  stock_update: 'Stock Movement',
  system: 'System',
};

const notifTypeStyle: Record<string, { bg: string; color: string; icon: 'bell' | 'alert' }> = {
  low_stock: { bg: 'bg-amber-50', color: '#f59e0b', icon: 'bell' },
  out_of_stock: { bg: 'bg-amber-50', color: '#f59e0b', icon: 'bell' },
  expiry: { bg: 'bg-purple-50', color: '#a855f7', icon: 'bell' },
  refill: { bg: 'bg-pink-50', color: '#ec4899', icon: 'bell' },
  payment_due: { bg: 'bg-red-50', color: '#ef4444', icon: 'bell' },
  payment_received: { bg: 'bg-emerald-50', color: '#10b981', icon: 'bell' },
  credit_exceeded: { bg: 'bg-red-50', color: '#dc2626', icon: 'alert' },
  new_order: { bg: 'bg-blue-50', color: '#3b82f6', icon: 'bell' },
  order_update: { bg: 'bg-indigo-50', color: '#6366f1', icon: 'bell' },
  delivery: { bg: 'bg-teal-50', color: '#0d9488', icon: 'bell' },
  partner_update: { bg: 'bg-sky-50', color: '#0284c7', icon: 'bell' },
  product_update: { bg: 'bg-orange-50', color: '#ea580c', icon: 'bell' },
  user_update: { bg: 'bg-violet-50', color: '#7c3aed', icon: 'bell' },
  stock_update: { bg: 'bg-cyan-50', color: '#0891b2', icon: 'bell' },
  system: { bg: 'bg-slate-100', color: '#475569', icon: 'alert' },
};

// System Alert Hub - split out of what used to be a combined Users +
// Notifications component (see AdminUsers.tsx for the full reasoning: the
// old shared tab bar wasn't itself permission-gated, so this split also
// closes a real Manage Permissions enforcement gap between the 'Users' and
// 'Notifications' registry items).
export default function AdminNotifications({ data, setData, onNotificationNavigate }: AdminNotificationsProps) {
  const { notifyResourceChanged } = useAppContext();
  const { viewMode } = useViewMode();
  const [notificationSearch, setNotificationSearch] = useState('');
  useResetScrollOnChange(notificationSearch);

  const notifications = usePaginatedList<AppNotification, {}>({
    resource: 'notifications',
    mode: 'offset',
    pageSize: 25,
    filters: {},
    search: notificationSearch,
    fetcher: params => notificationsApi.listPaged(params),
  });
  const notificationsTableHeight = useResponsiveTableHeight(335, { max: 900 });

  const handleMarkAsRead = async (notifId: string) => {
    setData(prev => ({ ...prev, notifications: prev.notifications.map(n => (n.id === notifId ? { ...n, is_read: true } : n)) }));
    notificationsApi.markRead(notifId).then(() => notifyResourceChanged('notifications')).catch(() => {});
  };

  const handleNotificationPress = (n: AppNotification) => {
    handleMarkAsRead(n.id);
    onNotificationNavigate?.(n);
  };

  const handleClearAllNotifications = async () => {
    setData(prev => ({ ...prev, notifications: [] }));
    notificationsApi.clearAll().then(() => notifyResourceChanged('notifications')).catch(() => {});
  };

  return (
    <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
      <View className="flex-row justify-between items-center border-b border-slate-100 pb-2">
        <Text className="font-bold text-slate-800 text-xs">Central Alert Notifications Center</Text>
        {notifications.total > 0 && (
          <Pressable onPress={handleClearAllNotifications}>
            <Text className="text-red-500 font-bold text-xs">Clear All Logs</Text>
          </Pressable>
        )}
      </View>

      <FilterBar searchValue={notificationSearch} onSearchChange={setNotificationSearch} searchPlaceholder="Search alert message..." />

      <ScrollableSection height={notificationsTableHeight}>
      {notifications.loading && notifications.data.length === 0 ? (
        <View className="flex-1 items-center justify-center"><Text className="text-center text-slate-400 italic text-xs">Loading notifications...</Text></View>
      ) : notifications.error ? (
        <View className="flex-1 items-center justify-center"><Text className="text-center text-red-500 italic text-xs">{notifications.error}</Text></View>
      ) : viewMode === 'table' ? (
        <DataTable
          data={notifications.data}
          keyExtractor={n => n.id}
          onRowPress={handleNotificationPress}
          emptyText="Notification center is quiet. Alerts show up here."
          columns={[
            {
              key: 'type', label: 'Type', width: 130,
              render: n => (
                <View className="flex-row items-center gap-1.5">
                  {!n.is_read && <View className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />}
                  <Text className={`font-bold text-[9px] uppercase tracking-wider ${n.is_read ? 'text-slate-500' : 'text-slate-800'}`} numberOfLines={1}>
                    {notifTypeLabels[n.type] || n.type}
                  </Text>
                </View>
              ),
            },
            {
              key: 'message', label: 'Message', width: 320,
              render: n => <Text className={`font-semibold text-[11px] ${n.is_read ? 'text-slate-500' : 'text-slate-800'}`} numberOfLines={2}>{n.message}</Text>,
            },
            { key: 'time', label: 'Time', width: 130, grow: false, render: n => <Text className="text-[9px] text-slate-400">{formatDateTime12h(n.created_at)}</Text> },
            {
              key: 'nav', label: '', width: 60, grow: false, align: 'center',
              render: n => (n.entity_type && n.entity_id ? <Text className="text-indigo-500 font-extrabold text-[9px]">View →</Text> : null),
            },
          ] as DataTableColumn<AppNotification>[]}
        />
      ) : (
        <View className={`gap-2 md:flex-row md:flex-wrap ${notifications.data.length === 0 ? 'flex-1' : ''}`}>
          {notifications.data.map(n => (
            <Pressable
              key={n.id}
              onPress={() => handleNotificationPress(n)}
              className={`w-full lg:w-[48%] xl:w-[32%] p-3 rounded-2xl border flex-row gap-3 ${n.is_read ? 'bg-slate-50 border-slate-200' : 'bg-white border-rose-200'}`}
            >
              <View className={`p-2 rounded-xl h-fit ${(notifTypeStyle[n.type] || notifTypeStyle.new_order).bg}`}>
                {(notifTypeStyle[n.type] || notifTypeStyle.new_order).icon === 'alert'
                  ? <AlertTriangle size={16} color={(notifTypeStyle[n.type] || notifTypeStyle.new_order).color} />
                  : <Bell size={16} color={(notifTypeStyle[n.type] || notifTypeStyle.new_order).color} />}
              </View>
              <View className="flex-1">
                <View className="flex-row justify-between items-center gap-2">
                  <View className="flex-row items-center gap-1.5 flex-shrink">
                    {!n.is_read && <View className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />}
                    <Text
                      className={`font-bold text-[9px] uppercase tracking-wider ${n.is_read ? 'text-slate-500' : 'text-slate-800'}`}
                      numberOfLines={1}
                    >
                      {notifTypeLabels[n.type] || n.type}
                    </Text>
                  </View>
                  <Text className="text-[8px] text-slate-400 flex-shrink-0">{formatDateTime12h(n.created_at)}</Text>
                </View>
                <Text className={`mt-1 font-semibold leading-relaxed text-[11px] ${n.is_read ? 'text-slate-500' : 'text-slate-800'}`}>{n.message}</Text>
                {!!n.entity_type && !!n.entity_id && (
                  <Text className="mt-1 text-indigo-500 font-extrabold text-[9px]">View →</Text>
                )}
              </View>
            </Pressable>
          ))}

          {notifications.data.length === 0 && (
            <EmptyState message="Notification center is quiet. Alerts show up here." />
          )}
        </View>
      )}
      </ScrollableSection>
      <PaginationFooter mode="offset" page={notifications.page} totalPages={notifications.totalPages} total={notifications.total} loading={notifications.loading} onPageChange={notifications.goToPage} />
    </View>
  );
}
