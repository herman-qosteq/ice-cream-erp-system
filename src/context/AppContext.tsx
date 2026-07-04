import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ERPData, loadAllData, saveAllDataToLocalStorage, resolveActor } from '../storage';
import { AppNotification, User } from '../types';

interface PushAlert {
  id: string;
  type: string;
  message: string;
}

interface AppContextValue {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  syncQueueOffline: (action: string, payload: any) => void;
  triggerSync: () => void;
  toggleOffline: () => void;
  resetAllData: () => Promise<void>;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  pushAlert: PushAlert | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<ERPData | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [pushAlert, setPushAlert] = useState<PushAlert | null>(null);

  useEffect(() => {
    loadAllData().then(setDataState);
  }, []);

  // Check and apply any scheduled product prices once data is loaded
  useEffect(() => {
    if (!data) return;
    const todayStr = new Date().toISOString().split('T')[0];
    let hasChanges = false;

    const updatedProducts = data.products.map(p => {
      if (!p.scheduled_prices || p.scheduled_prices.length === 0) return p;

      let currentPurchase = p.purchase_price;
      let currentSelling = p.selling_price;
      let productChanged = false;

      const updatedScheduled = p.scheduled_prices.map(sp => {
        if (sp.effective_date <= todayStr && !sp.applied) {
          currentPurchase = sp.purchase_price;
          currentSelling = sp.selling_price;
          sp = { ...sp, applied: true };
          productChanged = true;
          hasChanges = true;
        }
        return sp;
      });

      if (productChanged) {
        return {
          ...p,
          purchase_price: currentPurchase,
          selling_price: currentSelling,
          scheduled_prices: updatedScheduled
        };
      }
      return p;
    });

    if (hasChanges) {
      const nextData = {
        ...data,
        products: updatedProducts,
        auditLogs: [
          {
            id: 'audit_sched_' + Date.now(),
            action: 'PRICE_UPDATE',
            entity_type: 'System',
            entity_id: 'ScheduledPrices',
            user_id: 'system',
            user_name: 'System',
            user_role: 'System',
            timestamp: new Date().toISOString(),
            details: 'Automatically activated scheduled product rates whose effective dates have reached.'
          },
          ...data.auditLogs
        ]
      };
      setDataState(nextData);
      saveAllDataToLocalStorage(nextData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  const setData = useCallback((updater: ERPData | ((prev: ERPData) => ERPData)) => {
    setDataState(prev => {
      if (!prev) return prev;
      const next = typeof updater === 'function' ? (updater as (p: ERPData) => ERPData)(prev) : updater;
      saveAllDataToLocalStorage(next);
      return next;
    });
  }, []);

  const addNotification = useCallback((type: AppNotification['type'], message: string) => {
    const newNotif: AppNotification = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type,
      message,
      is_read: false,
      created_at: new Date().toISOString()
    };

    setDataState(prev => {
      if (!prev) return prev;
      const updated = { ...prev, notifications: [newNotif, ...prev.notifications] };
      saveAllDataToLocalStorage(updated);
      return updated;
    });

    setPushAlert({ id: newNotif.id, type: type.toUpperCase().replace('_', ' '), message });
    setTimeout(() => {
      setPushAlert(prev => (prev?.id === newNotif.id ? null : prev));
    }, 4000);
  }, []);

  const syncQueueOffline = useCallback((action: string, payload: any) => {
    const queueItem = {
      id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      action,
      payload,
      timestamp: new Date().toISOString()
    };
    setDataState(prev => {
      if (!prev) return prev;
      const updated = { ...prev, syncQueue: [...prev.syncQueue, queueItem] };
      saveAllDataToLocalStorage(updated);
      return updated;
    });
  }, []);

  const triggerSync = useCallback(() => {
    setDataState(prev => {
      if (!prev) return prev;
      if (prev.isOffline || prev.syncQueue.length === 0) return prev;

      let temp = { ...prev };
      prev.syncQueue.forEach(item => {
        if (item.action === 'CREATE_ORDER') {
          const order = item.payload.order;
          const invoice = item.payload.invoice;
          temp.orders = [order, ...temp.orders];
          if (invoice) temp.invoices = [invoice, ...temp.invoices];
        } else if (item.action === 'CREATE_PREBOOKING') {
          const preBookingOrder = item.payload.preBookingOrder;
          const reservation = item.payload.reservation;
          temp.preBookingOrders = [preBookingOrder, ...temp.preBookingOrders];
          if (reservation) temp.warehouse_inventory = reservation;
        } else if (item.action === 'RECORD_PAYMENT') {
          const payment = item.payload.payment;
          temp.payments = [payment, ...temp.payments];
          temp.stores = temp.stores.map(st =>
            st.id === payment.store_id
              ? { ...st, outstanding_balance: Math.max(0, st.outstanding_balance - payment.amount) }
              : st
          );
        } else if (item.action === 'REGISTER_STORE') {
          temp.stores = [item.payload.store, ...temp.stores];
        } else if (item.action === 'REGISTER_VISIT') {
          temp.visits = [item.payload.visit, ...temp.visits];
        }
      });

      const auditMsg = `Synced ${prev.syncQueue.length} offline actions safely.`;
      const syncActor = resolveActor(prev.users, currentUser?.id || 'system');
      const finalState = {
        ...temp,
        syncQueue: [],
        auditLogs: [
          {
            id: 'audit_' + Date.now(),
            action: 'SYNC_QUEUE',
            entity_type: 'System',
            entity_id: 'SyncQueue',
            user_id: currentUser?.id || 'system',
            user_name: syncActor.name,
            user_role: syncActor.role,
            timestamp: new Date().toISOString(),
            details: auditMsg
          },
          ...temp.auditLogs
        ]
      };

      saveAllDataToLocalStorage(finalState);
      return finalState;
    });
  }, [currentUser]);

  const toggleOffline = useCallback(() => {
    setDataState(prev => {
      if (!prev) return prev;
      const nextOffline = !prev.isOffline;
      const updated = { ...prev, isOffline: nextOffline };
      AsyncStorage.setItem('erp_is_offline', nextOffline ? 'true' : 'false');
      saveAllDataToLocalStorage(updated);
      return updated;
    });
  }, []);

  useEffect(() => {
    if (data && !data.isOffline && data.syncQueue.length > 0) {
      const t = setTimeout(triggerSync, 500);
      return () => clearTimeout(t);
    }
  }, [data?.isOffline]);

  const resetAllData = useCallback(async () => {
    await AsyncStorage.clear();
    const seeded = await loadAllData();
    setDataState(seeded);
    setCurrentUser(null);
  }, []);

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-sky-50">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-slate-400 text-xs font-bold mt-3">Loading FrostyFlow ERP...</Text>
      </View>
    );
  }

  return (
    <AppContext.Provider
      value={{
        data,
        setData,
        addNotification,
        syncQueueOffline,
        triggerSync,
        toggleOffline,
        resetAllData,
        currentUser,
        setCurrentUser,
        pushAlert,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
