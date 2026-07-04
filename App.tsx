import './global.css';
import React, { useState } from 'react';
import { View, Text, Pressable, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, X, Bell } from 'lucide-react-native';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { AppAlertProvider, useAppAlert } from './src/context/AppAlertContext';
import RoleSelectScreen from './src/screens/RoleSelectScreen';
import AdminFlow from './src/screens/admin/AdminFlow';
import SalespersonFlow from './src/screens/salesperson/SalespersonFlow';
import WarehouseFlow from './src/screens/warehouse/WarehouseFlow';
import { User } from './src/types';

function AppRouter() {
  const { data, setData, addNotification, syncQueueOffline, currentUser, setCurrentUser, pushAlert } = useAppContext();
  const { showAlert } = useAppAlert();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingLogoutCallback, setPendingLogoutCallback] = useState<(() => void) | null>(null);

  const handleCustomSetCurrentUser = (user: User | null) => {
    if (user === null && currentUser) {
      setPendingLogoutCallback(() => () => setCurrentUser(null));
      setShowLogoutConfirm(true);
    } else {
      setCurrentUser(user);
    }
  };

  const handleConfirmLogout = () => {
    if (pendingLogoutCallback) {
      pendingLogoutCallback();
      setPendingLogoutCallback(null);
    }
    setShowLogoutConfirm(false);
  };

  const handleCancelLogout = () => {
    setPendingLogoutCallback(null);
    setShowLogoutConfirm(false);
  };

  return (
    <View className="flex-1 bg-sky-50 relative">
      {!currentUser ? (
        <RoleSelectScreen data={data} setCurrentUser={handleCustomSetCurrentUser} />
      ) : currentUser.role === 'Admin' ? (
        <AdminFlow
          data={data}
          setData={setData}
          addNotification={addNotification}
          currentUser={currentUser}
          setCurrentUser={handleCustomSetCurrentUser}
          showAlert={showAlert}
        />
      ) : currentUser.role === 'Salesperson' ? (
        <SalespersonFlow
          data={data}
          setData={setData}
          addNotification={addNotification}
          syncQueueOffline={syncQueueOffline}
          currentUser={currentUser}
          setCurrentUser={handleCustomSetCurrentUser}
          showAlert={showAlert}
        />
      ) : (
        <WarehouseFlow
          data={data}
          setData={setData}
          addNotification={addNotification}
          currentUser={currentUser}
          setCurrentUser={handleCustomSetCurrentUser}
          showAlert={showAlert}
        />
      )}

      {/* IN-APP PUSH ALERT BANNER */}
      {pushAlert && (
        <View className="absolute top-2 left-3 right-3 bg-white border border-rose-500/30 shadow-2xl rounded-2xl p-3 z-50 flex-row items-start gap-2.5">
          <View className="p-1.5 bg-rose-500/10 rounded-lg mt-0.5">
            <Bell size={16} color="#f43f5e" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold text-rose-500 tracking-wider uppercase">{pushAlert.type}</Text>
              <Text className="text-[9px] text-slate-400 font-semibold">Just Now</Text>
            </View>
            <Text className="text-xs text-slate-700 mt-0.5 leading-relaxed font-semibold">{pushAlert.message}</Text>
          </View>
        </View>
      )}

      {showLogoutConfirm && (
        <View className="absolute inset-0 bg-slate-900/60 items-center justify-center p-4 z-[9999]">
          <View className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
            <Pressable
              onPress={handleCancelLogout}
              className="absolute top-4 right-4 p-1 rounded-full z-10"
              hitSlop={8}
            >
              <X size={16} color="#94a3b8" />
            </Pressable>

            <View className="items-center mt-2">
              <View className="w-14 h-14 bg-rose-50 border border-rose-100 rounded-full items-center justify-center mb-4">
                <LogOut size={24} color="#f43f5e" />
              </View>

              <Text className="text-base font-black text-slate-800 tracking-tight">Exit ERP Session?</Text>
              <Text className="text-xs text-slate-500 font-semibold mt-1.5 text-center leading-relaxed max-w-[240px]">
                Are you sure you want to log out of your{' '}
                <Text className="font-bold text-slate-700">{currentUser?.role}</Text> account? Unsaved online sync
                operations will be preserved.
              </Text>

              <View className="w-full mt-6 gap-2">
                <Pressable
                  onPress={handleConfirmLogout}
                  className="w-full py-2.5 bg-rose-500 rounded-xl items-center active:bg-rose-600"
                >
                  <Text className="text-white font-black text-xs">Yes, Secure Logout</Text>
                </Pressable>
                <Pressable
                  onPress={handleCancelLogout}
                  className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200"
                >
                  <Text className="text-slate-700 font-extrabold text-xs">Cancel, Stay Signed In</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-sky-50" edges={['top', 'bottom']}>
          <StatusBar barStyle="dark-content" />
          <AppProvider>
            <AppAlertProvider>
              <AppRouter />
            </AppAlertProvider>
          </AppProvider>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
