import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import { Shield, Key, ToggleLeft, ToggleRight, Bell, Edit, AlertTriangle } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { User, AppNotification } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usersApi, notificationsApi } from '../../api/endpoints';

interface AdminUsersProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  currentUser: any;
  activeScreen?: string;
  showAlert: (opts: any) => void;
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

export default function AdminUsers({ data, setData, addNotification, currentUser, activeScreen, showAlert }: AdminUsersProps) {
  const { refreshData } = useAppContext();
  const [activeTab, setActiveTab] = useState<'users' | 'notifications'>(activeScreen === 'Notifications' ? 'notifications' : 'users');
  const [activeForm, setActiveForm] = useState<'list' | 'add_user' | 'edit_user'>('list');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  useEffect(() => {
    if (activeScreen === 'Notifications') setActiveTab('notifications');
    else if (activeScreen === 'Users') setActiveTab('users');
  }, [activeScreen]);

  const [userForm, setUserForm] = useState({
    name: '', phone: '', role: 'Salesperson' as User['role'], password_hash: '', status: 'Active' as User['status']
  });

  const handleOpenAddUser = () => {
    setUserForm({ name: '', phone: '', role: 'Salesperson', password_hash: '123456', status: 'Active' });
    setActiveForm('add_user');
  };

  const handleOpenEditUser = (u: User) => {
    setSelectedUser(u);
    // Password hashes aren't retrievable once bcrypt-hashed server-side; leave blank
    // (unchanged) unless the admin explicitly types a new one to reset it.
    setUserForm({ name: u.name, phone: u.phone, role: u.role, password_hash: '', status: u.status });
    setActiveForm('edit_user');
  };

  const handleSaveUser = async () => {
    if (!userForm.name || !userForm.phone) {
      showAlert('User Name and Phone/Username are required.');
      return;
    }

    const isNew = activeForm === 'add_user';

    try {
      if (isNew) {
        await usersApi.create({ name: userForm.name, phone: userForm.phone, role: userForm.role, password_hash: userForm.password_hash });
        await refreshData();
        addNotification('user_update', `New operator account created: ${userForm.name} (${userForm.role}).`);
        showAlert(`User ${userForm.name} registered successfully! Password: ${userForm.password_hash}`);
      } else {
        await usersApi.update(selectedUser!.id, { name: userForm.name, phone: userForm.phone, role: userForm.role, status: userForm.status });
        if (userForm.password_hash.trim()) {
          await usersApi.resetPassword(selectedUser!.id, userForm.password_hash.trim());
        }
        await refreshData();
        addNotification('user_update', `Operator account details updated for ${userForm.name}.`);
        showAlert(`User details for ${userForm.name} updated successfully!`);
      }
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save user.');
    }
  };

  const handleToggleUserStatus = async (u: User) => {
    if (u.id === currentUser?.id) {
      showAlert('You cannot disable your own active administrator account!');
      return;
    }
    try {
      const updated = await usersApi.toggleStatus(u.id);
      await refreshData();
      addNotification('user_update', `${u.name}'s account was ${updated.status === 'Active' ? 'reactivated' : 'disabled'}.`);
      showAlert(`Representative ${u.name} status updated to: ${updated.status}`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to update status.');
    }
  };

  const handleOpenResetPassword = (userId: string) => {
    setResetPasswordUserId(userId);
    setResetPasswordValue('');
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordUserId) return;
    if (resetPasswordValue.trim() === '') {
      showAlert('Password cannot be empty.');
      return;
    }
    const targetUser = data.users.find(user => user.id === resetPasswordUserId);
    try {
      await usersApi.resetPassword(resetPasswordUserId, resetPasswordValue);
      await refreshData();
      addNotification('user_update', `Password was reset for ${targetUser?.name || 'an operator account'}.`);
      showAlert('Representative password updated successfully.');
      setResetPasswordUserId(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to reset password.');
    }
  };

  const handleMarkAsRead = async (notifId: string) => {
    setData(prev => ({ ...prev, notifications: prev.notifications.map(n => (n.id === notifId ? { ...n, is_read: true } : n)) }));
    notificationsApi.markRead(notifId).catch(() => {});
  };

  const handleClearAllNotifications = async () => {
    setData(prev => ({ ...prev, notifications: [] }));
    notificationsApi.clearAll().catch(() => {});
  };

  const unreadCount = data.notifications.filter(n => !n.is_read).length;
  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800";

  return (
    <View className="gap-4">
      <View className="flex-row bg-slate-100 p-1 rounded-xl h-10 items-center">
        <Pressable onPress={() => { setActiveTab('users'); setActiveForm('list'); }} className={`flex-1 h-8 rounded-lg items-center justify-center ${activeTab === 'users' ? 'bg-white' : ''}`}>
          <Text className={`text-[10px] font-extrabold ${activeTab === 'users' ? 'text-slate-800' : 'text-slate-500'}`}>User Representatives</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('notifications')} className={`flex-1 h-8 rounded-lg items-center justify-center flex-row gap-1.5 ${activeTab === 'notifications' ? 'bg-white' : ''}`}>
          <Bell size={14} color={activeTab === 'notifications' ? '#1e293b' : '#64748b'} />
          <Text className={`text-[10px] font-extrabold ${activeTab === 'notifications' ? 'text-slate-800' : 'text-slate-500'}`}>Notification Hub</Text>
          {unreadCount > 0 && (
            <View className="bg-red-500 rounded-full px-1.5 py-0.5">
              <Text className="text-white font-extrabold text-[8px]">{unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {activeTab === 'users' ? (
        activeForm === 'add_user' || activeForm === 'edit_user' ? (
          <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-2xl lg:self-center">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <Text className="font-extrabold text-slate-800 text-sm">
                {activeForm === 'add_user' ? 'Register Representative User' : 'Modify Operator Details'}
              </Text>
              <Pressable onPress={() => setActiveForm('list')}>
                <Text className="text-slate-400 text-xs">Cancel</Text>
              </Pressable>
            </View>

            <View className="gap-3">
              <View>
                <Text className="font-bold text-slate-500 mb-1 text-xs">Full Name</Text>
                <TextInput value={userForm.name} onChangeText={v => setUserForm({ ...userForm, name: v })} placeholder="e.g. Anil Kumar" placeholderTextColor="#94a3b8" className={inputClass} />
              </View>

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Phone / Username</Text>
                  <TextInput value={userForm.phone} onChangeText={v => setUserForm({ ...userForm, phone: v })} placeholder="e.g. driver3 or name" placeholderTextColor="#94a3b8" className={inputClass} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Password</Text>
                  <TextInput value={userForm.password_hash} onChangeText={v => setUserForm({ ...userForm, password_hash: v })} placeholder="e.g. 123456" placeholderTextColor="#94a3b8" className={inputClass} />
                </View>
              </View>

              <View>
                <Text className="font-bold text-slate-500 mb-1 text-xs">System Role</Text>
                <View className="flex-row gap-1.5">
                  {(['Admin', 'Salesperson', 'Warehouse'] as const).map(role => (
                    <Pressable key={role} onPress={() => setUserForm({ ...userForm, role })} className={`flex-1 py-2 rounded-lg items-center ${userForm.role === role ? 'bg-indigo-600' : 'bg-slate-50 border border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold ${userForm.role === role ? 'text-white' : 'text-slate-600'}`}>{role}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text className="font-bold text-slate-500 mb-1 text-xs">Operator Status</Text>
                <View className="flex-row gap-1.5">
                  {(['Active', 'Inactive'] as const).map(st => (
                    <Pressable key={st} onPress={() => setUserForm({ ...userForm, status: st })} className={`flex-1 py-2 rounded-lg items-center ${userForm.status === st ? 'bg-slate-800' : 'bg-slate-50 border border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold ${userForm.status === st ? 'text-white' : 'text-slate-600'}`}>{st}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable onPress={handleSaveUser} className="w-full py-2.5 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
              <Text className="text-white font-bold text-xs">
                {activeForm === 'add_user' ? 'Confirm Representative Registration' : 'Save Operator Changes'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-3">
            <View className="flex-row justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <Text className="font-bold text-slate-500 text-[11px] flex-1 mr-2">Add/manage staff logins:</Text>
              <Pressable onPress={handleOpenAddUser} className="py-1 px-2.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                <Text className="text-rose-600 font-extrabold text-[9px]">+ Register Operator</Text>
              </Pressable>
            </View>

            <View className="gap-2.5 md:flex-row md:flex-wrap">
              {data.users.map(u => (
                <View key={u.id} className="w-full lg:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2.5 flex-1">
                    <View className="p-2 bg-rose-50 rounded-xl">
                      <Shield size={16} color="#f43f5e" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-slate-800 text-xs">{u.name}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">Role: {u.role} - U: {u.phone} - P: ••••••••</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-1.5">
                    <Pressable onPress={() => handleOpenEditUser(u)} className="p-1.5 bg-blue-50 border border-blue-100 rounded-lg active:bg-blue-100">
                      <Edit size={14} color="#2563eb" />
                    </Pressable>
                    <Pressable onPress={() => handleOpenResetPassword(u.id)} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100">
                      <Key size={14} color="#64748b" />
                    </Pressable>
                    <Pressable
                      onPress={() => handleToggleUserStatus(u)}
                      className={`p-1.5 rounded-lg border ${u.status === 'Active' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}
                    >
                      {u.status === 'Active' ? <ToggleRight size={16} color="#059669" /> : <ToggleLeft size={16} color="#ef4444" />}
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <Modal visible={!!resetPasswordUserId} transparent animationType="fade" onRequestClose={() => setResetPasswordUserId(null)}>
              <View className="flex-1 bg-slate-900/50 items-center justify-center p-6">
                <View className="bg-white w-full max-w-sm rounded-2xl p-5 gap-3">
                  <Text className="font-extrabold text-slate-800 text-sm">Reset Representative Password</Text>
                  <TextInput
                    value={resetPasswordValue}
                    onChangeText={setResetPasswordValue}
                    placeholder="Enter new password"
                    placeholderTextColor="#94a3b8"
                    className={inputClass}
                    autoFocus
                  />
                  <View className="flex-row gap-2">
                    <Pressable onPress={() => setResetPasswordUserId(null)} className="flex-1 py-2 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                      <Text className="text-slate-700 font-bold text-xs">Cancel</Text>
                    </Pressable>
                    <Pressable onPress={handleConfirmResetPassword} className="flex-1 py-2 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
                      <Text className="text-white font-bold text-xs">Confirm Reset</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          </View>
        )
      ) : (
        <View className="gap-3">
          <View className="flex-row justify-between items-center h-8">
            <Text className="font-bold text-slate-700 text-xs">Central Alert Notifications Center</Text>
            {data.notifications.length > 0 && (
              <Pressable onPress={handleClearAllNotifications}>
                <Text className="text-red-500 font-bold text-xs">Clear All Logs</Text>
              </Pressable>
            )}
          </View>

          <View className="gap-2 md:flex-row md:flex-wrap">
            {data.notifications.map(n => (
              <Pressable
                key={n.id}
                onPress={() => handleMarkAsRead(n.id)}
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
                    <Text className="text-[8px] text-slate-400 flex-shrink-0">{new Date(n.created_at).toLocaleTimeString()}</Text>
                  </View>
                  <Text className={`mt-1 font-semibold leading-relaxed text-[11px] ${n.is_read ? 'text-slate-500' : 'text-slate-800'}`}>{n.message}</Text>
                </View>
              </Pressable>
            ))}

            {data.notifications.length === 0 && (
              <View className="py-8 items-center bg-white rounded-2xl border border-slate-200">
                <Text className="text-slate-400 italic text-xs">Notification center is quiet. Alerts show up here.</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
