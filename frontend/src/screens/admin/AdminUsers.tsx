import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import { Shield, Key, ToggleLeft, ToggleRight, Edit, RotateCcw, UserCog } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { User, AppNotification, NotificationEntityType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usersApi, settingsApi } from '../../api/endpoints';
import ViewToggle from '../../components/common/ViewToggle';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import { useViewMode } from '../../context/ViewModeContext';
import { useResetScrollOnChange } from '../../context/ScrollResetContext';
import ManagePermissionsModal from '../../components/permissions/ManagePermissionsModal';

interface AdminUsersProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  showAlert: (opts: any) => void;
  pendingNotificationTarget?: { entityType: NotificationEntityType; entityId: string } | null;
  onConsumePendingNotificationTarget?: () => void;
}

// Operator Accounts - split out of what used to be a combined Users +
// Notifications component (AdminUsers previously bundled "System Alert Hub"
// behind an internal tab bar). Each is now its own standalone screen/page,
// mounted independently by AdminFlow.tsx per its own registry-granted
// screen key ('Users' here, 'Notifications' in AdminNotifications.tsx) -
// see permissionsRegistry.ts. This also closes a real permission gap: the
// old shared tab bar was never itself permission-gated, so an Admin operator
// granted only 'Notifications' (and explicitly denied 'Users' via Manage
// Permissions) could still reach the Operator Accounts tab from within that
// same mounted component. With two separate components, AdminFlow only ever
// mounts the one the operator was actually granted.
export default function AdminUsers({ data, setData, addNotification, currentUser, showAlert, pendingNotificationTarget, onConsumePendingNotificationTarget }: AdminUsersProps) {
  const { refreshData } = useAppContext();
  const { viewMode } = useViewMode();
  const [activeForm, setActiveForm] = useState<'list' | 'add_user' | 'edit_user'>('list');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  // Shown inline inside the Reset Password Modal rather than via the shared
  // showAlert - that alert renders outside any Modal's portal, so it'd stay
  // hidden behind this still-open Modal (which needs to stay open for the
  // user to retry) until manually closed.
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [permissionsUserId, setPermissionsUserId] = useState<string | null>(null);
  const [userListTab, setUserListTab] = useState<'active' | 'inactive'>('active');
  useResetScrollOnChange(activeForm, userListTab);

  useEffect(() => {
    if (!pendingNotificationTarget || pendingNotificationTarget.entityType !== 'user') return;
    const user = data.users.find(u => u.id === pendingNotificationTarget.entityId);
    if (user) handleOpenEditUser(user);
    onConsumePendingNotificationTarget?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotificationTarget]);

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
        const created = await usersApi.create({ name: userForm.name, phone: userForm.phone, role: userForm.role, password_hash: userForm.password_hash });
        await refreshData();
        addNotification('user_update', `New operator account created: ${userForm.name} (${userForm.role}).`, 'user', created.id);
        showAlert(`User ${userForm.name} registered successfully! Password: ${userForm.password_hash}`);
      } else {
        await usersApi.update(selectedUser!.id, { name: userForm.name, phone: userForm.phone, role: userForm.role, status: userForm.status });
        if (userForm.password_hash.trim()) {
          await usersApi.resetPassword(selectedUser!.id, userForm.password_hash.trim());
        }
        await refreshData();
        addNotification('user_update', `Operator account details updated for ${userForm.name}.`, 'user', selectedUser!.id);
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
      addNotification('user_update', `${u.name}'s account was ${updated.status === 'Active' ? 'reactivated' : 'disabled'}.`, 'user', u.id);
      showAlert(`Representative ${u.name} status updated to: ${updated.status}`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to update status.');
    }
  };

  const handleOpenResetPassword = (userId: string) => {
    setResetPasswordUserId(userId);
    setResetPasswordValue('');
    setResetPasswordError(null);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordUserId) return;
    if (resetPasswordValue.trim() === '') {
      setResetPasswordError('Password cannot be empty.');
      return;
    }
    const targetUser = data.users.find(user => user.id === resetPasswordUserId);
    try {
      await usersApi.resetPassword(resetPasswordUserId, resetPasswordValue);
      await refreshData();
      addNotification('user_update', `Password was reset for ${targetUser?.name || 'an operator account'}.`, 'user', resetPasswordUserId);
      showAlert('Representative password updated successfully.');
      setResetPasswordUserId(null);
    } catch (e: any) {
      setResetPasswordError(e.message ?? 'Unable to reset password.');
    }
  };

  const handleOpenManagePermissions = (userId: string) => setPermissionsUserId(userId);

  const handleSavePermissions = async (permissions: { feature: string; enabled: boolean }[]) => {
    if (!permissionsUserId) return;
    const target = data.users.find(u => u.id === permissionsUserId);
    try {
      await settingsApi.setUserPermissions(permissionsUserId, permissions);
      await refreshData();
      addNotification('user_update', `Permission overrides updated for ${target?.name ?? 'an operator'}.`, 'user', permissionsUserId);
      showAlert('Permissions updated successfully.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to update permissions.');
    }
  };

  const handleResetPermissions = async () => {
    if (!permissionsUserId) return;
    const target = data.users.find(u => u.id === permissionsUserId);
    try {
      await settingsApi.resetUserPermissions(permissionsUserId);
      await refreshData();
      addNotification('user_update', `Permission overrides reset to role default for ${target?.name ?? 'an operator'}.`, 'user', permissionsUserId);
      showAlert('Permissions reset to role default.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to reset permissions.');
    }
  };

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800";

  return (
    <View className="gap-4">
      {activeForm === 'add_user' || activeForm === 'edit_user' ? (
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

          <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
            <Pressable onPress={() => setUserListTab('active')} className={`py-1.5 px-3 rounded-lg items-center justify-center ${userListTab === 'active' ? 'bg-indigo-600' : ''}`}>
              <Text className={`text-[10px] font-extrabold ${userListTab === 'active' ? 'text-white' : 'text-slate-500'}`}>Active Staff</Text>
            </Pressable>
            <Pressable onPress={() => setUserListTab('inactive')} className={`py-1.5 px-3 rounded-lg items-center justify-center flex-row gap-1.5 ${userListTab === 'inactive' ? 'bg-indigo-600' : ''}`}>
              <RotateCcw size={13} color={userListTab === 'inactive' ? '#ffffff' : '#64748b'} />
              <Text className={`text-[10px] font-extrabold ${userListTab === 'inactive' ? 'text-white' : 'text-slate-500'}`}>Disabled Staff</Text>
              {data.users.filter(u => u.status === 'Inactive').length > 0 && (
                <View className="bg-red-500 rounded-full px-1.5 py-0.5">
                  <Text className="text-white font-extrabold text-[8px]">{data.users.filter(u => u.status === 'Inactive').length}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <ViewToggle />

          {(() => {
            const filteredUsers = data.users.filter(u => userListTab === 'inactive' ? u.status === 'Inactive' : u.status === 'Active');
            const emptyText = userListTab === 'inactive' ? 'No disabled staff accounts. Anything you disable will show up here.' : 'No active staff accounts found.';

            if (viewMode === 'table') {
              return (
                <DataTable
                  data={filteredUsers}
                  keyExtractor={u => u.id}
                  emptyText={emptyText}
                  columns={[
                    {
                      key: 'name', label: 'Name', width: 180,
                      render: u => (
                        <View className="flex-row items-center gap-1.5">
                          <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{u.name}</Text>
                          {u.status === 'Inactive' && <Text className="text-[8px] font-black px-1 rounded-full bg-red-50 text-red-600">Inactive</Text>}
                        </View>
                      ),
                    },
                    { key: 'role', label: 'Role', width: 110, render: u => <Text className="text-[10px] text-slate-600">{u.role}</Text> },
                    { key: 'phone', label: 'Phone / Username', width: 140, render: u => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{u.phone}</Text> },
                    {
                      key: 'actions', label: 'Actions', width: 145, grow: false,
                      render: u => (
                        <View className="flex-row items-center gap-1.5">
                          <Pressable onPress={() => handleOpenEditUser(u)} className="p-1.5 bg-blue-50 border border-blue-100 rounded-lg active:bg-blue-100">
                            <Edit size={13} color="#2563eb" />
                          </Pressable>
                          <Pressable onPress={() => handleOpenResetPassword(u.id)} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100">
                            <Key size={13} color="#64748b" />
                          </Pressable>
                          <Pressable onPress={() => handleOpenManagePermissions(u.id)} className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-lg active:bg-indigo-100">
                            <UserCog size={13} color="#4f46e5" />
                          </Pressable>
                          <Pressable
                            onPress={() => handleToggleUserStatus(u)}
                            className={`p-1.5 rounded-lg border ${u.status === 'Active' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}
                          >
                            {u.status === 'Active' ? <ToggleRight size={14} color="#059669" /> : <ToggleLeft size={14} color="#ef4444" />}
                          </Pressable>
                        </View>
                      ),
                    },
                  ] as DataTableColumn<User>[]}
                />
              );
            }

            return (
              <View className={`gap-2.5 md:flex-row md:flex-wrap ${filteredUsers.length === 0 ? 'flex-1' : ''}`}>
                {filteredUsers.map(u => {
                  const isInactive = u.status === 'Inactive';
                  return (
                    <View key={u.id} className={`w-full lg:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between ${isInactive ? 'opacity-60' : ''}`}>
                      <View className="flex-row items-center gap-2.5 flex-1">
                        <View className="p-2 bg-rose-50 rounded-xl">
                          <Shield size={16} color="#f43f5e" />
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="font-bold text-slate-800 text-xs">{u.name}</Text>
                            {isInactive && <Text className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Inactive</Text>}
                          </View>
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
                        <Pressable onPress={() => handleOpenManagePermissions(u.id)} className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-lg active:bg-indigo-100">
                          <UserCog size={14} color="#4f46e5" />
                        </Pressable>
                        <Pressable
                          onPress={() => handleToggleUserStatus(u)}
                          className={`p-1.5 rounded-lg border ${u.status === 'Active' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}
                        >
                          {u.status === 'Active' ? <ToggleRight size={16} color="#059669" /> : <ToggleLeft size={16} color="#ef4444" />}
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <EmptyState message={emptyText} />
                )}
              </View>
            );
          })()}

          <Modal visible={!!resetPasswordUserId} transparent animationType="fade" onRequestClose={() => { setResetPasswordUserId(null); setResetPasswordError(null); }}>
            <View className="flex-1 bg-slate-900/50 items-center justify-center p-6">
              <View className="bg-white w-full max-w-sm rounded-2xl p-5 gap-3">
                <Text className="font-extrabold text-slate-800 text-sm">Reset Representative Password</Text>
                <TextInput
                  value={resetPasswordValue}
                  onChangeText={(text) => { setResetPasswordValue(text); setResetPasswordError(null); }}
                  placeholder="Enter new password"
                  placeholderTextColor="#94a3b8"
                  className={inputClass}
                  autoFocus
                />
                {resetPasswordError && (
                  <Text className="text-rose-600 font-bold text-[10px]">{resetPasswordError}</Text>
                )}
                <View className="flex-row gap-2">
                  <Pressable onPress={() => { setResetPasswordUserId(null); setResetPasswordError(null); }} className="flex-1 py-2 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                    <Text className="text-slate-700 font-bold text-xs">Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleConfirmResetPassword} className="flex-1 py-2 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
                    <Text className="text-white font-bold text-xs">Confirm Reset</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <ManagePermissionsModal
            visible={!!permissionsUserId}
            onClose={() => setPermissionsUserId(null)}
            targetUser={data.users.find(u => u.id === permissionsUserId) ?? null}
            currentUser={currentUser}
            rolePermissions={data.rolePermissions}
            userPermissions={data.userPermissions.filter(up => up.user_id === permissionsUserId)}
            onSave={handleSavePermissions}
            onReset={handleResetPermissions}
          />
        </View>
      )}
    </View>
  );
}
