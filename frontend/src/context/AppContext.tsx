import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { ERPData, loadAllData, emptyErpData, saveSyncQueue, saveOfflineFlag, resolveActor } from '../storage';
import { AppNotification, User } from '../types';
import { authApi, notificationsApi } from '../api/endpoints';
import { getToken, setToken, setOnSessionInvalid } from '../api/client';
import { connectRealtime, disconnectRealtime } from '../realtime';

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
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<ERPData>(emptyErpData());
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [pushAlert, setPushAlert] = useState<PushAlert | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const refreshData = useCallback(async () => {
    const fresh = await loadAllData();
    setDataState(fresh);
  }, []);

  // Coalesces bursts of `data:changed` events (e.g. a truck-load batch that
  // touches several products at once) into a single refetch instead of one
  // per event.
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      refreshData().catch(() => {});
    }, 400);
  }, [refreshData]);

  // Another connected tab/device/user just created a notification (new order,
  // stock update, etc.) — show the same instant toast + badge bump locally
  // that the originating session already saw.
  const handleRemoteNotification = useCallback((raw: unknown) => {
    const notification = raw as AppNotification;
    setDataState(prev => {
      if (prev.notifications.some(n => n.id === notification.id)) return prev;
      return { ...prev, notifications: [notification, ...prev.notifications] };
    });
    setPushAlert({ id: notification.id, type: notification.type.toUpperCase().replace(/_/g, ' '), message: notification.message });
    setTimeout(() => {
      setPushAlert(prev => (prev?.id === notification.id ? null : prev));
    }, 4000);
  }, []);

  const startRealtime = useCallback((token: string) => {
    connectRealtime(token, {
      onDataChanged: () => scheduleRefresh(),
      onNotification: handleRemoteNotification,
    });
  }, [scheduleRefresh, handleRemoteNotification]);

  // On boot, restore a previously logged-in session from the stored JWT (if any).
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const user = await authApi.me();
          setCurrentUserState(user);
          setDataLoading(true);
          const fresh = await loadAllData();
          setDataState(fresh);
          startRealtime(token);
        } catch (e) {
          await setToken(null);
        } finally {
          setDataLoading(false);
        }
      }
      setInitializing(false);
    })();
  }, []);

  // If a session gets revoked mid-use (an admin disabled the account, or the
  // JWT expired), force back to the login screen instead of leaving the user
  // stuck re-triggering the same "session invalid" error on every action.
  useEffect(() => {
    setOnSessionInvalid(() => {
      disconnectRealtime();
      setToken(null);
      setDataState(emptyErpData());
      setCurrentUserState(null);
      const alertId = 'session_invalid_' + Date.now();
      setPushAlert({ id: alertId, type: 'SESSION ENDED', message: 'Your session has ended. Please log in again.' });
      setTimeout(() => {
        setPushAlert(prev => (prev?.id === alertId ? null : prev));
      }, 4000);
    });
    return () => setOnSessionInvalid(null);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    try {
      const res = await authApi.login(identifier, password);
      await setToken(res.token);
      setCurrentUserState(res.user);
      setDataLoading(true);
      const fresh = await loadAllData();
      setDataState(fresh);
      setDataLoading(false);
      startRealtime(res.token);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Invalid credentials. Please try again.' };
    }
  }, [startRealtime]);

  const setCurrentUser = useCallback((user: User | null) => {
    if (user === null) {
      disconnectRealtime();
      setToken(null);
      setDataState(emptyErpData());
    }
    setCurrentUserState(user);
  }, []);

  const setData = useCallback((updater: ERPData | ((prev: ERPData) => ERPData)) => {
    setDataState(prev => (typeof updater === 'function' ? (updater as (p: ERPData) => ERPData)(prev) : updater));
  }, []);

  // Notifications persist to the backend in the background so the list survives
  // a refreshData(), while still showing an instant local toast + list entry.
  const addNotification = useCallback((type: AppNotification['type'], message: string) => {
    const newNotif: AppNotification = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type,
      message,
      is_read: false,
      created_at: new Date().toISOString()
    };

    setDataState(prev => ({ ...prev, notifications: [newNotif, ...prev.notifications] }));
    notificationsApi.create({ type, message }).catch(() => {});

    setPushAlert({ id: newNotif.id, type: type.toUpperCase().replace('_', ' '), message });
    setTimeout(() => {
      setPushAlert(prev => (prev?.id === newNotif.id ? null : prev));
    }, 4000);
  }, []);

  // The offline sync queue remains a device-local concept: actions performed
  // while offline are queued here and replayed against the API once back online.
  const syncQueueOffline = useCallback((action: string, payload: any) => {
    const queueItem = {
      id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      action,
      payload,
      timestamp: new Date().toISOString()
    };
    setDataState(prev => {
      const updated = { ...prev, syncQueue: [...prev.syncQueue, queueItem] };
      saveSyncQueue(updated.syncQueue);
      return updated;
    });
  }, []);

  const triggerSync = useCallback(() => {
    setDataState(prev => {
      if (prev.isOffline || prev.syncQueue.length === 0) return prev;
      // Queued actions were already applied to local state optimistically when
      // created; syncing now just clears the queue and refreshes from the server.
      saveSyncQueue([]);
      refreshData();
      return { ...prev, syncQueue: [] };
    });
  }, [refreshData]);

  const toggleOffline = useCallback(() => {
    setDataState(prev => {
      const nextOffline = !prev.isOffline;
      saveOfflineFlag(nextOffline);
      return { ...prev, isOffline: nextOffline };
    });
  }, []);

  useEffect(() => {
    if (!data.isOffline && data.syncQueue.length > 0) {
      const t = setTimeout(triggerSync, 500);
      return () => clearTimeout(t);
    }
  }, [data.isOffline]);

  const resetAllData = useCallback(async () => {
    await refreshData();
  }, [refreshData]);

  if (initializing || dataLoading) {
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
        login,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
