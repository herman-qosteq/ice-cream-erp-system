import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, Platform, useWindowDimensions } from 'react-native';
import {
  Search, X, ChevronDown, ChevronRight, ToggleRight, ToggleLeft, RotateCcw, ShieldCheck,
} from 'lucide-react-native';
import { User, RolePermission, UserPermission } from '../../types';
import { PermissionRole } from '../../config/permissionsRegistry';
import { getAllPermissionModules, getRoleDefault, namespacedPermissionKey } from '../../utils/permissions';
import ConfirmModal from '../common/ConfirmModal';

interface ManagePermissionsModalProps {
  visible: boolean;
  onClose: () => void;
  targetUser: User | null;
  currentUser: User;
  rolePermissions: RolePermission[];
  userPermissions: UserPermission[]; // expected pre-filtered to targetUser.id by the caller
  onSave: (permissions: { feature: string; enabled: boolean }[]) => Promise<void>;
  onReset: () => Promise<void>;
}

// See SelectField.tsx/DateField.tsx - RNW's own text/Modal layering makes a
// mobile-style bottom sheet look wrong in a large desktop window, so Windows
// alone gets a centered fixed-width dialog there. This modal needs more room
// than those (search + grouped checklists + action row), hence the wider/
// taller sizing. Same breakpoint as ViewModeContext.tsx's DESKTOP_BREAKPOINT
// (matches Tailwind's `md:`) - a web session narrower than this is someone on
// a phone/tablet browser, who still wants the mobile-style bottom sheet; only
// a browser window wide enough to actually have room gets upgraded.
const DESKTOP_WEB_BREAKPOINT = 768;

// Every role/module/item combo, flattened once for iteration. Every item is
// always shown regardless of the target operator's own role - the operator's
// role only decides what's checked by default (see getRoleDefault). Module
// expand/collapse keys are namespaced by role since module ids like
// "partners-sales"/"feature-flags" repeat across more than one role's bucket
// in permissionsRegistry.ts.
const ALL_ROLE_MODULES = getAllPermissionModules();

export default function ManagePermissionsModal({
  visible, onClose, targetUser, currentUser, rolePermissions, userPermissions, onSave, onReset,
}: ManagePermissionsModalProps) {
  const { width } = useWindowDimensions();
  const isDesktopLayout = Platform.OS === 'windows' || (Platform.OS === 'web' && width >= DESKTOP_WEB_BREAKPOINT);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedModuleKeys, setExpandedModuleKeys] = useState<string[]>([]);
  // Keyed by the fully-namespaced "OwnerRole:key". null = inherit role
  // default; true/false = this operator's explicit override.
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, boolean | null>>({});
  const [initialSnapshot, setInitialSnapshot] = useState<Record<string, boolean | null>>({});
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const targetRole = (targetUser?.role ?? 'Admin') as PermissionRole;

  // Seed pending state from this operator's existing overrides whenever the
  // modal opens for a (possibly different) target - Cancel/close simply
  // discards this local state without ever touching the server.
  useEffect(() => {
    if (!visible || !targetUser) return;
    const initial: Record<string, boolean | null> = {};
    const allModuleKeys: string[] = [];
    for (const { role: ownerRole, modules } of ALL_ROLE_MODULES) {
      for (const module of modules) {
        allModuleKeys.push(`${ownerRole}:${module.id}`);
        for (const item of module.items) {
          const ns = namespacedPermissionKey(ownerRole, item.key);
          const override = userPermissions.find(up => up.feature === ns);
          initial[ns] = override ? override.enabled : null;
        }
      }
    }
    setPendingOverrides(initial);
    setInitialSnapshot(initial);
    setSearchQuery('');
    setExpandedModuleKeys(allModuleKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, targetUser?.id]);

  if (!targetUser) return null;

  const query = searchQuery.trim().toLowerCase();
  const visibleRoleSections = ALL_ROLE_MODULES
    .map(({ role: ownerRole, modules }) => ({
      role: ownerRole,
      modules: modules
        .map(module => ({
          ...module,
          items: query
            ? module.items.filter(i => i.label.toLowerCase().includes(query) || i.description?.toLowerCase().includes(query))
            : module.items,
        }))
        .filter(module => module.items.length > 0),
    }))
    .filter(section => section.modules.length > 0);

  const isSelfLockoutRow = (ownerRole: PermissionRole, itemKey: string) =>
    targetUser.id === currentUser.id && ownerRole === 'Admin' && itemKey === 'Users';

  const toggleModule = (moduleKey: string) => {
    setExpandedModuleKeys(prev => (prev.includes(moduleKey) ? prev.filter(x => x !== moduleKey) : [...prev, moduleKey]));
  };

  const effectiveValue = (ownerRole: PermissionRole, itemKey: string) => {
    const ns = namespacedPermissionKey(ownerRole, itemKey);
    return pendingOverrides[ns] ?? getRoleDefault(ownerRole, targetRole, itemKey, rolePermissions);
  };

  const toggleItem = (ownerRole: PermissionRole, itemKey: string) => {
    if (isSelfLockoutRow(ownerRole, itemKey)) return;
    const ns = namespacedPermissionKey(ownerRole, itemKey);
    setPendingOverrides(prev => ({ ...prev, [ns]: !effectiveValue(ownerRole, itemKey) }));
  };

  const handleSelectAll = () => {
    setPendingOverrides(prev => {
      const next = { ...prev };
      visibleRoleSections.forEach(({ role: ownerRole, modules }) =>
        modules.forEach(m => m.items.forEach(i => {
          if (!isSelfLockoutRow(ownerRole, i.key)) next[namespacedPermissionKey(ownerRole, i.key)] = true;
        }))
      );
      return next;
    });
  };

  const handleClearAll = () => {
    setPendingOverrides(prev => {
      const next = { ...prev };
      visibleRoleSections.forEach(({ role: ownerRole, modules }) =>
        modules.forEach(m => m.items.forEach(i => {
          if (!isSelfLockoutRow(ownerRole, i.key)) next[namespacedPermissionKey(ownerRole, i.key)] = false;
        }))
      );
      return next;
    });
  };

  const handleResetToDefault = () => {
    const allNull: Record<string, boolean | null> = {};
    ALL_ROLE_MODULES.forEach(({ role: ownerRole, modules }) =>
      modules.forEach(m => m.items.forEach(i => { allNull[namespacedPermissionKey(ownerRole, i.key)] = null; }))
    );
    setPendingOverrides(allNull);
  };

  const changedKeys = Object.keys(pendingOverrides).filter(k => pendingOverrides[k] !== initialSnapshot[k]);
  const isDirty = changedKeys.length > 0;
  const isFullReset = Object.values(pendingOverrides).every(v => v === null);

  const handleSaveConfirmed = async () => {
    setSaving(true);
    try {
      if (isFullReset) {
        await onReset();
      } else {
        const payload = Object.entries(pendingOverrides)
          .filter((entry): entry is [string, boolean] => entry[1] !== null)
          .map(([feature, enabled]) => ({ feature, enabled }));
        await onSave(payload);
      }
      setConfirmVisible(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable className={`flex-1 bg-slate-900/50 ${isDesktopLayout ? 'items-center justify-center p-6' : 'justify-end'}`} onPress={onClose}>
          <Pressable
            className={isDesktopLayout ? 'bg-white rounded-2xl w-[680px]' : 'bg-white rounded-t-3xl h-[85%]'}
            style={isDesktopLayout ? { maxHeight: 680 } : undefined}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-slate-100">
              <View className="flex-row items-center gap-2 flex-1">
                <View className="w-8 h-8 bg-blue-500/10 rounded-full items-center justify-center">
                  <ShieldCheck size={16} color="#2563eb" />
                </View>
                <View className="flex-1">
                  <Text className="font-extrabold text-slate-800 text-sm" numberOfLines={1}>Manage Permissions</Text>
                  <Text className="text-[10px] text-slate-400" numberOfLines={1}>{targetUser.name} · {targetUser.role}</Text>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={18} color="#94a3b8" />
              </Pressable>
            </View>

            {/* Search */}
            <View className="flex-row items-center gap-2 mx-4 mt-3 mb-1 px-3 bg-slate-50 border border-slate-200 rounded-xl">
              <Search size={14} color="#94a3b8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search every screen and feature..."
                placeholderTextColor="#94a3b8"
                className="flex-1 text-xs text-slate-800 py-2.5"
                style={{ outlineStyle: 'none' } as any}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <X size={14} color="#94a3b8" />
                </Pressable>
              )}
            </View>

            {/* Bulk actions */}
            <View className="flex-row flex-wrap gap-1.5 mx-4 mt-2 mb-1">
              <Pressable onPress={handleSelectAll} className="py-1.5 px-3 bg-slate-100 rounded-lg active:bg-slate-200">
                <Text className="text-[10px] font-bold text-slate-600">Select All</Text>
              </Pressable>
              <Pressable onPress={handleClearAll} className="py-1.5 px-3 bg-slate-100 rounded-lg active:bg-slate-200">
                <Text className="text-[10px] font-bold text-slate-600">Clear All</Text>
              </Pressable>
              <Pressable onPress={handleResetToDefault} className="py-1.5 px-3 bg-amber-50 border border-amber-100 rounded-lg flex-row items-center gap-1 active:bg-amber-100">
                <RotateCcw size={11} color="#b45309" />
                <Text className="text-[10px] font-bold text-amber-700">Reset to Role Default</Text>
              </Pressable>
            </View>

            {/* Role sections -> modules -> items */}
            <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
              {visibleRoleSections.length === 0 && (
                <Text className="text-center text-slate-400 text-xs py-8">No matches found.</Text>
              )}
              {visibleRoleSections.map(({ role: ownerRole, modules }) => (
                <View key={ownerRole} className="mb-3">
                  <View className="flex-row items-center gap-1.5 mb-1.5">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">{ownerRole}</Text>
                    {ownerRole === targetRole && (
                      <Text className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase">This Operator's Role</Text>
                    )}
                  </View>
                  {modules.map(module => {
                    const moduleKey = `${ownerRole}:${module.id}`;
                    const isExpanded = expandedModuleKeys.includes(moduleKey) || query.length > 0;
                    return (
                      <View key={moduleKey} className="mb-2 border border-slate-100 rounded-2xl overflow-hidden">
                        <Pressable
                          onPress={() => toggleModule(moduleKey)}
                          className="flex-row items-center justify-between p-3 bg-slate-50"
                        >
                          <Text className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{module.title}</Text>
                          {isExpanded ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                        </Pressable>
                        {isExpanded && (
                          <View className="p-2 gap-1.5">
                            {module.items.map(item => {
                              const enabled = effectiveValue(ownerRole, item.key);
                              const roleDefault = getRoleDefault(ownerRole, targetRole, item.key, rolePermissions);
                              const isGrantedExtra = enabled && !roleDefault;
                              const locked = isSelfLockoutRow(ownerRole, item.key);
                              const rowStyle = !enabled
                                ? 'bg-slate-50 border-slate-200'
                                : isGrantedExtra
                                  ? 'bg-indigo-50 border-indigo-200'
                                  : 'bg-emerald-50 border-emerald-100';
                              return (
                                <Pressable
                                  key={item.key}
                                  onPress={() => toggleItem(ownerRole, item.key)}
                                  disabled={locked}
                                  className={`flex-row items-center justify-between p-2.5 rounded-xl border ${rowStyle} ${locked ? 'opacity-60' : ''}`}
                                >
                                  <View className="flex-1 pr-2">
                                    <Text className="text-slate-800 font-bold text-xs">{item.label}</Text>
                                    {item.description && (
                                      <Text className="text-[10px] text-slate-400 mt-0.5">{item.description}</Text>
                                    )}
                                    <Text className="text-[9px] text-slate-400 mt-0.5">
                                      {ownerRole === targetRole
                                        ? `Role default: ${roleDefault ? 'On' : 'Off'}`
                                        : roleDefault
                                          ? `Role default: On (native to ${targetRole})`
                                          : `Not part of ${targetRole}'s default access`}
                                      {locked ? ' · Cannot remove your own access' : ''}
                                    </Text>
                                  </View>
                                  <View className="items-end gap-0.5">
                                    <View className="flex-row items-center gap-1.5">
                                      <Text className={`text-[9px] font-extrabold uppercase ${!enabled ? 'text-slate-400' : isGrantedExtra ? 'text-indigo-600' : 'text-emerald-600'}`}>
                                        {!enabled ? 'Disabled' : isGrantedExtra ? 'Granted' : 'Enabled'}
                                      </Text>
                                      {enabled ? <ToggleRight size={18} color={isGrantedExtra ? '#4f46e5' : '#059669'} /> : <ToggleLeft size={18} color="#94a3b8" />}
                                    </View>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            {/* Footer */}
            <View className="flex-row gap-2 p-4 border-t border-slate-100">
              <Pressable onPress={onClose} className="flex-1 py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                <Text className="text-slate-700 font-extrabold text-xs">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmVisible(true)}
                disabled={!isDirty}
                className={`flex-1 py-2.5 rounded-xl items-center ${isDirty ? 'bg-blue-600 active:bg-blue-700' : 'bg-slate-200'}`}
              >
                <Text className={`font-black text-xs ${isDirty ? 'text-white' : 'text-slate-400'}`}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
        icon={ShieldCheck}
        iconBg="bg-blue-50"
        iconColor="#2563eb"
        title="Update Permissions?"
        message={
          isFullReset
            ? `This resets ${targetUser.name} back to the default ${targetUser.role} access.`
            : `You are about to change ${changedKeys.length} permission${changedKeys.length === 1 ? '' : 's'} for ${targetUser.name}.`
        }
        confirmLabel={saving ? 'Saving...' : 'Confirm & Save'}
        confirmColor="bg-blue-600"
        onConfirm={handleSaveConfirmed}
      />
    </>
  );
}
