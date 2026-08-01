import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import {
  Plus, Edit, ArrowLeft, PackageCheck, PackageX, Wrench, RotateCcw, AlertTriangle, History, X, Settings, ShoppingCart,
} from 'lucide-react-native';
import { ERPData } from '../../storage';
import { Asset, AssetAssignmentHistory, AppNotification, NotificationEntityType, AssetType } from '../../types';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import FilterBar, { FILTER_PILL_CLASS, FILTER_PILL_TEXT_CLASS } from '../../components/common/FilterBar';
import DateRangeFilterField from '../../components/common/DateRangeFilterField';
import PaginationFooter from '../../components/common/PaginationFooter';
import SelectField from '../../components/common/SelectField';
import ConfirmModal from '../../components/common/ConfirmModal';
import ViewToggle from '../../components/common/ViewToggle';
import EmptyState from '../../components/common/EmptyState';
import ScrollableSection from '../../components/common/ScrollableSection';
import { useAppContext } from '../../context/AppContext';
import { useViewMode } from '../../context/ViewModeContext';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useResponsiveTableHeight } from '../../hooks/useResponsiveTableHeight';
import { DateFilterMode } from '../../utils/dateFilter';
import { assetsApi, assetTypesApi } from '../../api/endpoints';
import { formatDateTime12h } from '../../utils/format';

interface AdminAssetsProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  showAlert: (opts: any) => void;
  pendingNotificationTarget?: { entityType: NotificationEntityType; entityId: string } | null;
  onConsumePendingNotificationTarget?: () => void;
  // Lets "Create Order" on an assigned asset's detail view hand off to the
  // Orders screen with that asset's partner pre-selected, without this
  // screen needing to know anything about how Orders/Sales navigation works.
  onCreateOrderForPartner?: (storeId: string) => void;
}

const inputClass = 'w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Warehouse: { bg: 'bg-slate-100', text: 'text-slate-600' },
  Assigned: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  Maintenance: { bg: 'bg-amber-100', text: 'text-amber-700' },
  Returned: { bg: 'bg-blue-100', text: 'text-blue-700' },
  Lost: { bg: 'bg-rose-100', text: 'text-rose-700' },
  Inactive: { bg: 'bg-slate-200', text: 'text-slate-500' },
};

const emptyAssetForm = { name: '', code: '', asset_type: '', serial_number: '', capacity: '', notes: '' };

export default function AdminAssets({ data, setData, addNotification, currentUser, showAlert, pendingNotificationTarget, onConsumePendingNotificationTarget, onCreateOrderForPartner }: AdminAssetsProps) {
  const { refreshData } = useAppContext();
  const { viewMode } = useViewMode();
  const [activeForm, setActiveForm] = useState<'list' | 'create' | 'edit' | 'detail' | 'assign' | 'manage_types'>('list');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'history'>('overview');
  const [history, setHistory] = useState<AssetAssignmentHistory[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [assetTypeFilter, setAssetTypeFilter] = useState('All');
  const [locationTypeFilter, setLocationTypeFilter] = useState('All');
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const [assetForm, setAssetForm] = useState(emptyAssetForm);
  const [manageTypesReturnTo, setManageTypesReturnTo] = useState<'list' | 'create' | 'edit'>('list');
  const [assignPartnerId, setAssignPartnerId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ kind: 'return' | 'maintenanceStart' | 'maintenanceEnd' | 'markLost' | 'reactivate' | 'deactivate' } | null>(null);

  const [newTypeName, setNewTypeName] = useState('');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');

  const assets = usePaginatedList<Asset, { status?: string; asset_type?: string; location_type?: string }>({
    resource: 'assets',
    mode: 'offset',
    pageSize: 25,
    enabled: activeForm === 'list',
    filters: {
      status: statusFilter !== 'All' ? statusFilter : undefined,
      asset_type: assetTypeFilter !== 'All' ? assetTypeFilter : undefined,
      location_type: locationTypeFilter !== 'All' ? locationTypeFilter : undefined,
    },
    search,
    dateFilterMode,
    customDateFrom,
    customDateTo,
    fetcher: params => assetsApi.listPaged(params),
  });
  // Same responsive approach (and default 320-640 clamp) as the Movement
  // Logs tab's auditTableHeight in AdminWarehouse.tsx, since this screen is
  // always mounted as one of that component's tabs and shares its tab-bar/
  // page chrome - but the 330px estimate itself doesn't carry over as-is:
  // Audit's header row is a title + a tiny "SECURED" badge, while this one's
  // is a title + two full buttons ("Manage Types"/"Register Asset", each
  // px-3 py-2 with an icon), which sit taller than a badge and push the
  // table further down before it even starts. Sized off the Orders tab's
  // ordersTableHeight(350) instead - the closest existing title+button(s)
  // header in this codebase - with a bit more added for the second, larger
  // (py-2 vs Orders' py-1.5) button. Without this, the fixed-height
  // ScrollableSection below doesn't leave enough room and the outer page
  // scrolls too, instead of only the table's own bounded region.
  const assetsTableHeight = useResponsiveTableHeight(360);

  // Notification-tap navigation: open the tapped asset's detail view directly.
  useEffect(() => {
    if (pendingNotificationTarget?.entityType === 'asset') {
      const found = assets.data.find(a => a.id === pendingNotificationTarget.entityId);
      if (found) {
        openDetail(found);
        onConsumePendingNotificationTarget?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotificationTarget, assets.data]);

  const assetTypeOptions = [{ label: 'All Types', value: 'All' }, ...data.assetTypes.map(t => ({ label: t.name, value: t.name }))];
  const statusOptions = [
    { label: 'All Statuses', value: 'All' },
    ...(['Warehouse', 'Assigned', 'Maintenance', 'Returned', 'Lost', 'Inactive'] as const).map(s => ({ label: s, value: s })),
  ];
  const locationTypeOptions = [
    { label: 'All Locations', value: 'All' },
    { label: 'Warehouse', value: 'Warehouse' },
    { label: 'Truck', value: 'Truck' },
    { label: 'Partner', value: 'Partner' },
  ];

  function resolveLocationLabel(asset: Asset): string {
    if (asset.location_type === 'Warehouse') return 'Warehouse';
    if (asset.location_type === 'Truck') return data.trucks.find(t => t.id === asset.location_id)?.vehicle_number ?? 'Truck';
    if (asset.location_type === 'Partner') return data.stores.find(s => s.id === asset.location_id)?.name ?? 'Partner';
    return asset.location_type;
  }

  function resolvePartnerName(partnerId?: string | null): string {
    if (!partnerId) return '-';
    return data.stores.find(s => s.id === partnerId)?.name ?? partnerId;
  }

  const openList = () => { setActiveForm('list'); setSelectedAsset(null); };

  const openCreate = () => {
    setAssetForm({ ...emptyAssetForm, asset_type: data.assetTypes[0]?.name ?? '' });
    setActiveForm('create');
  };

  const openEdit = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssetForm({ name: asset.name, code: asset.code, asset_type: asset.asset_type, serial_number: asset.serial_number ?? '', capacity: asset.capacity ?? '', notes: asset.notes ?? '' });
    setActiveForm('edit');
  };

  const openDetail = async (asset: Asset) => {
    setSelectedAsset(asset);
    setDetailTab('overview');
    setActiveForm('detail');
    try {
      setHistory(await assetsApi.history(asset.id));
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to load asset details.');
    }
  };

  const handleSaveAsset = async () => {
    if (!assetForm.name.trim() || !assetForm.code.trim() || !assetForm.asset_type) {
      showAlert('Name, code and asset type are required.');
      return;
    }
    try {
      if (activeForm === 'edit' && selectedAsset) {
        await assetsApi.update(selectedAsset.id, assetForm);
        showAlert('Asset updated successfully.');
      } else {
        const created = await assetsApi.create(assetForm);
        addNotification('stock_update', `Registered new asset ${created.code} (${created.name})`, 'asset', created.id);
        showAlert('Asset registered successfully.');
      }
      assets.refetch();
      openList();
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save asset.');
    }
  };

  const openAssign = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssignPartnerId(data.stores.find(s => s.status === 'Active')?.id ?? '');
    setAssignNotes('');
    setActiveForm('assign');
  };

  const handleConfirmAssign = async () => {
    if (!selectedAsset || !assignPartnerId) {
      showAlert('Please select a partner to assign this asset to.');
      return;
    }
    try {
      const updated = await assetsApi.assign(selectedAsset.id, { partner_id: assignPartnerId, notes: assignNotes || undefined });
      addNotification('partner_update', `Assigned asset ${updated.code} to ${resolvePartnerName(assignPartnerId)}`, 'asset', updated.id);
      showAlert('Asset assigned successfully.');
      assets.refetch();
      openDetail(updated);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to assign asset.');
    }
  };

  const runTransition = async (kind: NonNullable<typeof confirmAction>['kind']) => {
    if (!selectedAsset) return;
    try {
      let updated: Asset;
      if (kind === 'return') updated = await assetsApi.return(selectedAsset.id);
      else if (kind === 'maintenanceStart') updated = await assetsApi.maintenanceStart(selectedAsset.id);
      else if (kind === 'maintenanceEnd') updated = await assetsApi.maintenanceEnd(selectedAsset.id);
      else if (kind === 'markLost') updated = await assetsApi.markLost(selectedAsset.id);
      else if (kind === 'reactivate') updated = await assetsApi.reactivate(selectedAsset.id);
      else updated = await assetsApi.deactivate(selectedAsset.id);

      addNotification('partner_update', `Asset ${updated.code} status changed to ${updated.status}`, 'asset', updated.id);
      showAlert(`Asset ${updated.code} is now ${updated.status}.`);
      assets.refetch();
      setSelectedAsset(updated);
      setConfirmAction(null);
      // Every transition here writes a new AssetAssignmentHistory row - the
      // History tab must re-fetch it now, otherwise it keeps showing
      // whatever was loaded when the detail view first opened until the
      // admin leaves and re-enters the page.
      setHistory(await assetsApi.history(updated.id));
    } catch (e: any) {
      setConfirmAction(null);
      showAlert(e.message ?? 'Unable to update asset status.');
    }
  };

  const handleAddAssetType = async () => {
    if (!newTypeName.trim()) return;
    try {
      await assetTypesApi.create(newTypeName.trim());
      await refreshData();
      setNewTypeName('');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to add asset type.');
    }
  };

  const handleSaveEditType = async () => {
    if (!editingTypeId || !editingTypeName.trim()) return;
    try {
      await assetTypesApi.rename(editingTypeId, editingTypeName.trim());
      await refreshData();
      setEditingTypeId(null);
      setEditingTypeName('');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to rename asset type.');
    }
  };

  const handleDeleteType = async (id: string) => {
    try {
      await assetTypesApi.remove(id);
      await refreshData();
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to delete asset type.');
    }
  };

  const columns: DataTableColumn<Asset>[] = [
    { key: 'code', label: 'Code', width: 100, render: a => <Text className="font-extrabold text-slate-800 text-[11px]" numberOfLines={1}>{a.code}</Text> },
    { key: 'name', label: 'Name', width: 160, render: a => <Text className="text-[11px] text-slate-700" numberOfLines={1}>{a.name}</Text> },
    { key: 'type', label: 'Type', width: 130, render: a => <Text className="text-[10px] text-slate-500" numberOfLines={1}>{a.asset_type}</Text> },
    {
      key: 'status', label: 'Status', width: 100, grow: false,
      render: a => (
        <View className={`px-2 py-0.5 rounded-full self-start ${STATUS_COLORS[a.status]?.bg ?? 'bg-slate-100'}`}>
          <Text className={`text-[9px] font-extrabold ${STATUS_COLORS[a.status]?.text ?? 'text-slate-600'}`}>{a.status}</Text>
        </View>
      ),
    },
    { key: 'location', label: 'Location', width: 140, render: a => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{resolveLocationLabel(a)}</Text> },
    { key: 'partner', label: 'Assigned Partner', width: 160, render: a => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{resolvePartnerName(a.assigned_partner_id)}</Text> },
    {
      key: 'actions', label: 'Actions', width: 140, grow: false,
      render: a => (
        <View className="flex-row items-center gap-1.5">
          <Pressable onPress={() => openDetail(a)} className="bg-blue-500/10 px-2 py-1 rounded-lg">
            <Text className="text-[10px] font-bold text-blue-700">View</Text>
          </Pressable>
          {a.status === 'Assigned' && a.assigned_partner_id && (
            <Pressable onPress={() => onCreateOrderForPartner?.(a.assigned_partner_id!)} className="flex-row items-center gap-1 bg-emerald-600 px-2 py-1 rounded-lg">
              <ShoppingCart size={11} color="#fff" /><Text className="text-[10px] font-bold text-white">Order</Text>
            </Pressable>
          )}
        </View>
      ),
    },
  ];

  if (activeForm === 'create' || activeForm === 'edit') {
    return (
      <View className="gap-4">
        <Pressable onPress={openList} className="flex-row items-center gap-1.5">
          <ArrowLeft size={14} color="#64748b" />
          <Text className="text-xs font-bold text-slate-500">Back to Assets</Text>
        </Pressable>
        <View className="bg-white rounded-2xl p-4 border border-slate-200 gap-3">
          <Text className="text-sm font-black text-slate-800">{activeForm === 'edit' ? 'Edit Asset' : 'Register New Asset'}</Text>

          <View>
            <Text className="text-[10px] font-bold text-slate-500 mb-1">Asset Name</Text>
            <TextInput value={assetForm.name} onChangeText={v => setAssetForm({ ...assetForm, name: v })} placeholder="e.g. Freezer Box #14" placeholderTextColor="#94a3b8" className={inputClass} />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 mb-1">Asset Code</Text>
            <TextInput value={assetForm.code} onChangeText={v => setAssetForm({ ...assetForm, code: v })} placeholder="e.g. FB-014" placeholderTextColor="#94a3b8" className={inputClass} />
          </View>
          <View>
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-[10px] font-bold text-slate-500">Asset Type</Text>
              <Pressable onPress={() => { setManageTypesReturnTo(activeForm as 'create' | 'edit'); setActiveForm('manage_types'); }}>
                <Text className="text-[10px] font-bold text-blue-600">Manage Types</Text>
              </Pressable>
            </View>
            <SelectField
              value={assetForm.asset_type}
              onValueChange={v => setAssetForm({ ...assetForm, asset_type: v })}
              options={data.assetTypes.map(t => ({ label: t.name, value: t.name }))}
              title="Select Asset Type"
            />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 mb-1">Serial Number</Text>
            <TextInput value={assetForm.serial_number} onChangeText={v => setAssetForm({ ...assetForm, serial_number: v })} placeholderTextColor="#94a3b8" className={inputClass} />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 mb-1">Capacity</Text>
            <TextInput value={assetForm.capacity} onChangeText={v => setAssetForm({ ...assetForm, capacity: v })} placeholder="e.g. 165 Litres" placeholderTextColor="#94a3b8" className={inputClass} />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 mb-1">Notes</Text>
            <TextInput value={assetForm.notes} onChangeText={v => setAssetForm({ ...assetForm, notes: v })} multiline className={inputClass} style={{ minHeight: 60, textAlignVertical: 'top' }} />
          </View>

          <Pressable onPress={handleSaveAsset} className="w-full py-2.5 bg-blue-600 rounded-xl items-center mt-2">
            <Text className="text-white font-black text-xs">{activeForm === 'edit' ? 'Save Changes' : 'Register Asset'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (activeForm === 'manage_types') {
    return (
      <View className="gap-4">
        <Pressable onPress={() => setActiveForm(manageTypesReturnTo)} className="flex-row items-center gap-1.5">
          <ArrowLeft size={14} color="#64748b" />
          <Text className="text-xs font-bold text-slate-500">{manageTypesReturnTo === 'list' ? 'Back to Assets' : 'Back to Asset Form'}</Text>
        </Pressable>
        {renderManageTypesInline()}
      </View>
    );
  }

  function renderManageTypesInline() {
    return (
      <View className="bg-white rounded-2xl p-4 border border-slate-200 gap-3">
        <Text className="text-sm font-black text-slate-800">Manage Asset Types</Text>
        <View className="flex-row gap-2">
          <TextInput value={newTypeName} onChangeText={setNewTypeName} placeholder="New asset type name" placeholderTextColor="#94a3b8" className={inputClass + ' flex-1'} />
          <Pressable onPress={handleAddAssetType} className="bg-blue-600 px-3 rounded-lg items-center justify-center">
            <Plus size={16} color="#fff" />
          </Pressable>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] font-bold text-slate-400 uppercase">{data.assetTypes.length} Asset Type{data.assetTypes.length === 1 ? '' : 's'}</Text>
          <ViewToggle />
        </View>

        {viewMode === 'table' ? (
          <DataTable
            data={data.assetTypes}
            keyExtractor={t => t.id}
            emptyText="No asset types yet."
            columns={[
              {
                key: 'name', label: 'Asset Type', width: 220,
                render: (t: AssetType) => editingTypeId === t.id ? (
                  <TextInput value={editingTypeName} onChangeText={setEditingTypeName} autoFocus className="bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800" />
                ) : (
                  <Text className="font-bold text-slate-800 text-xs" numberOfLines={1}>{t.name}</Text>
                ),
              },
              {
                key: 'actions', label: 'Actions', width: 100, grow: false,
                render: (t: AssetType) => editingTypeId === t.id ? (
                  <View className="flex-row gap-1.5">
                    <Pressable onPress={handleSaveEditType} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100"><Text className="text-[10px] font-bold text-emerald-600">Save</Text></Pressable>
                  </View>
                ) : (
                  <View className="flex-row gap-1.5">
                    <Pressable onPress={() => { setEditingTypeId(t.id); setEditingTypeName(t.name); }} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><Edit size={14} color="#475569" /></Pressable>
                    <Pressable onPress={() => handleDeleteType(t.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100"><Text className="text-[10px] font-bold text-rose-500">Delete</Text></Pressable>
                  </View>
                ),
              },
            ] as DataTableColumn<AssetType>[]}
          />
        ) : (
          <View className={`gap-2 md:flex-row md:flex-wrap ${data.assetTypes.length === 0 ? 'flex-1' : ''}`}>
            {data.assetTypes.map(t => (
              <View key={t.id} className="w-full md:w-[48%] xl:w-[32%] flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                {editingTypeId === t.id ? (
                  <TextInput value={editingTypeName} onChangeText={setEditingTypeName} autoFocus className="flex-1 bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800" />
                ) : (
                  <Text className="text-xs text-slate-700 flex-1 font-bold">{t.name}</Text>
                )}
                {editingTypeId === t.id ? (
                  <Pressable onPress={handleSaveEditType} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100">
                    <Text className="text-[10px] font-bold text-emerald-600">Save</Text>
                  </Pressable>
                ) : (
                  <View className="flex-row gap-2">
                    <Pressable onPress={() => { setEditingTypeId(t.id); setEditingTypeName(t.name); }} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                      <Edit size={12} color="#64748b" />
                    </Pressable>
                    <Pressable onPress={() => handleDeleteType(t.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100">
                      <Text className="text-[10px] font-bold text-rose-500">Delete</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
            {data.assetTypes.length === 0 && <EmptyState message="No asset types yet. Add one above." />}
          </View>
        )}
      </View>
    );
  }

  if (activeForm === 'assign' && selectedAsset) {
    return (
      <View className="gap-4">
        <Pressable onPress={() => openDetail(selectedAsset)} className="flex-row items-center gap-1.5">
          <ArrowLeft size={14} color="#64748b" />
          <Text className="text-xs font-bold text-slate-500">Back</Text>
        </Pressable>
        <View className="bg-white rounded-2xl p-4 border border-slate-200 gap-3">
          <Text className="text-sm font-black text-slate-800">Assign {selectedAsset.code} to a Partner</Text>
          <SelectField
            value={assignPartnerId}
            onValueChange={setAssignPartnerId}
            options={data.stores.filter(s => s.status === 'Active').map(s => ({ label: `${s.name} (${s.partner_type})`, value: s.id }))}
            title="Select Partner"
          />
          <TextInput value={assignNotes} onChangeText={setAssignNotes} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" className={inputClass} />
          <Pressable onPress={handleConfirmAssign} className="w-full py-2.5 bg-emerald-600 rounded-xl items-center mt-2">
            <Text className="text-white font-black text-xs">Confirm Assignment</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (activeForm === 'detail' && selectedAsset) {
    const canAssign = ['Warehouse', 'Returned', 'Maintenance'].includes(selectedAsset.status);
    const canReturn = selectedAsset.status === 'Assigned';
    const canMaintenanceStart = !['Lost', 'Inactive', 'Maintenance'].includes(selectedAsset.status);
    const canMaintenanceEnd = selectedAsset.status === 'Maintenance';
    const canMarkLost = !['Lost', 'Inactive'].includes(selectedAsset.status);
    const canReactivate = ['Lost', 'Inactive'].includes(selectedAsset.status);
    const canDeactivate = selectedAsset.status !== 'Inactive';

    return (
      <View className="gap-4">
        <Pressable onPress={openList} className="flex-row items-center gap-1.5">
          <ArrowLeft size={14} color="#64748b" />
          <Text className="text-xs font-bold text-slate-500">Back to Assets</Text>
        </Pressable>

        <View className="bg-white rounded-2xl p-4 border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-black text-slate-800">{selectedAsset.name}</Text>
              <Text className="text-[10px] text-slate-400">{selectedAsset.code} - {selectedAsset.asset_type}</Text>
            </View>
            <View className="flex-row gap-2">
              <View className={`px-2 py-1 rounded-full ${STATUS_COLORS[selectedAsset.status]?.bg ?? 'bg-slate-100'}`}>
                <Text className={`text-[10px] font-extrabold ${STATUS_COLORS[selectedAsset.status]?.text ?? 'text-slate-600'}`}>{selectedAsset.status}</Text>
              </View>
              <Pressable onPress={() => openEdit(selectedAsset)} className="p-1.5 bg-slate-100 rounded-lg">
                <Edit size={14} color="#64748b" />
              </Pressable>
            </View>
          </View>

          <View className="flex-row bg-slate-100 p-1 rounded-xl gap-1">
            {(['overview', 'history'] as const).map(tab => (
              <Pressable key={tab} onPress={() => setDetailTab(tab)} className={`flex-1 py-1.5 rounded-lg items-center ${detailTab === tab ? 'bg-blue-600' : ''}`}>
                <Text className={`text-[10px] font-extrabold capitalize ${detailTab === tab ? 'text-white' : 'text-slate-500'}`}>{tab}</Text>
              </Pressable>
            ))}
          </View>

          {detailTab === 'overview' && (
            <View className="gap-2">
              <View className="flex-row justify-between"><Text className="text-[10px] text-slate-400">Location</Text><Text className="text-xs font-bold text-slate-700">{resolveLocationLabel(selectedAsset)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-[10px] text-slate-400">Assigned Partner</Text><Text className="text-xs font-bold text-slate-700">{resolvePartnerName(selectedAsset.assigned_partner_id)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-[10px] text-slate-400">Assigned Date</Text><Text className="text-xs text-slate-700">{selectedAsset.assigned_date || '-'}</Text></View>
              <View className="flex-row justify-between"><Text className="text-[10px] text-slate-400">Last Service</Text><Text className="text-xs text-slate-700">{selectedAsset.last_service_date || '-'}</Text></View>
              <View className="flex-row justify-between"><Text className="text-[10px] text-slate-400">Serial Number</Text><Text className="text-xs text-slate-700">{selectedAsset.serial_number || '-'}</Text></View>
              <View className="flex-row justify-between"><Text className="text-[10px] text-slate-400">Capacity</Text><Text className="text-xs text-slate-700">{selectedAsset.capacity || '-'}</Text></View>
              {selectedAsset.notes ? <Text className="text-xs text-slate-500 italic mt-1">"{selectedAsset.notes}"</Text> : null}

              <View className="flex-row flex-wrap gap-2 mt-3">
                {canAssign && (
                  <Pressable onPress={() => openAssign(selectedAsset)} className="flex-row items-center gap-1.5 bg-emerald-500/10 px-3 py-2 rounded-xl">
                    <PackageCheck size={14} color="#059669" /><Text className="text-[10px] font-bold text-emerald-700">Assign to Partner</Text>
                  </Pressable>
                )}
                {canReturn && (
                  <Pressable onPress={() => setConfirmAction({ kind: 'return' })} className="flex-row items-center gap-1.5 bg-blue-500/10 px-3 py-2 rounded-xl">
                    <PackageX size={14} color="#2563eb" /><Text className="text-[10px] font-bold text-blue-700">Return to Warehouse</Text>
                  </Pressable>
                )}
                {canMaintenanceStart && (
                  <Pressable onPress={() => setConfirmAction({ kind: 'maintenanceStart' })} className="flex-row items-center gap-1.5 bg-amber-500/10 px-3 py-2 rounded-xl">
                    <Wrench size={14} color="#b45309" /><Text className="text-[10px] font-bold text-amber-700">Send to Maintenance</Text>
                  </Pressable>
                )}
                {canMaintenanceEnd && (
                  <Pressable onPress={() => setConfirmAction({ kind: 'maintenanceEnd' })} className="flex-row items-center gap-1.5 bg-emerald-500/10 px-3 py-2 rounded-xl">
                    <RotateCcw size={14} color="#059669" /><Text className="text-[10px] font-bold text-emerald-700">Complete Maintenance</Text>
                  </Pressable>
                )}
                {canMarkLost && (
                  <Pressable onPress={() => setConfirmAction({ kind: 'markLost' })} className="flex-row items-center gap-1.5 bg-rose-500/10 px-3 py-2 rounded-xl">
                    <AlertTriangle size={14} color="#e11d48" /><Text className="text-[10px] font-bold text-rose-700">Mark Lost</Text>
                  </Pressable>
                )}
                {canReactivate && (
                  <Pressable onPress={() => setConfirmAction({ kind: 'reactivate' })} className="flex-row items-center gap-1.5 bg-emerald-500/10 px-3 py-2 rounded-xl">
                    <RotateCcw size={14} color="#059669" /><Text className="text-[10px] font-bold text-emerald-700">Reactivate</Text>
                  </Pressable>
                )}
                {canDeactivate && (
                  <Pressable onPress={() => setConfirmAction({ kind: 'deactivate' })} className="flex-row items-center gap-1.5 bg-slate-200 px-3 py-2 rounded-xl">
                    <X size={14} color="#475569" /><Text className="text-[10px] font-bold text-slate-600">Deactivate</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {detailTab === 'history' && (
            <View className="gap-2">
              {history.length === 0 && <Text className="text-xs text-slate-400 text-center py-4">No history recorded yet.</Text>}
              {history.map(h => (
                <View key={h.id} className="bg-slate-50 rounded-lg p-2.5 gap-0.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] font-extrabold text-slate-800">{h.event_type}</Text>
                    <Text className="text-[9px] text-slate-400">{formatDateTime12h(h.date)}</Text>
                  </View>
                  <Text className="text-[10px] text-slate-500">{h.from_status ?? '-'} &rarr; {h.to_status}{h.partner_id ? ` - ${resolvePartnerName(h.partner_id)}` : ''}</Text>
                  <Text className="text-[10px] text-slate-400">By {h.actor_name ?? 'Unknown'} ({h.actor_role ?? '-'})</Text>
                  {h.notes ? <Text className="text-[10px] text-slate-500 italic">"{h.notes}"</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>

        <ConfirmModal
          visible={!!confirmAction}
          onClose={() => setConfirmAction(null)}
          icon={AlertTriangle}
          title="Confirm Action"
          message="Are you sure you want to perform this action on this asset?"
          confirmLabel="Confirm"
          onConfirm={() => confirmAction && runTransition(confirmAction.kind)}
        />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
        <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
          <Text className="font-bold text-slate-800 text-xs">Assets & Freezer Boxes</Text>
          <View className="flex-row items-center gap-2">
            <Pressable onPress={() => { setManageTypesReturnTo('list'); setActiveForm('manage_types'); }} className="flex-row items-center gap-1.5 bg-indigo-600 px-3 py-2 rounded-xl">
              <Settings size={14} color="#fff" /><Text className="text-white font-bold text-[11px]">Manage Types</Text>
            </Pressable>
            <Pressable onPress={openCreate} className="flex-row items-center gap-1.5 bg-blue-600 px-3 py-2 rounded-xl">
              <Plus size={14} color="#fff" /><Text className="text-white font-bold text-[11px]">Register Asset</Text>
            </Pressable>
          </View>
        </View>

        <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by code, name, or serial number...">
          <SelectField value={statusFilter} onValueChange={setStatusFilter} options={statusOptions} title="Status" className={FILTER_PILL_CLASS} textClassName={FILTER_PILL_TEXT_CLASS} />
          <SelectField value={assetTypeFilter} onValueChange={setAssetTypeFilter} options={assetTypeOptions} title="Asset Type" className={FILTER_PILL_CLASS} textClassName={FILTER_PILL_TEXT_CLASS} />
          <SelectField value={locationTypeFilter} onValueChange={setLocationTypeFilter} options={locationTypeOptions} title="Location" className={FILTER_PILL_CLASS} textClassName={FILTER_PILL_TEXT_CLASS} />
          <DateRangeFilterField
            mode={dateFilterMode} onModeChange={setDateFilterMode}
            customFrom={customDateFrom} customTo={customDateTo}
            onCustomFromChange={setCustomDateFrom} onCustomToChange={setCustomDateTo}
            title="Registered Date" className={FILTER_PILL_CLASS} textClassName={FILTER_PILL_TEXT_CLASS}
          />
        </FilterBar>

        <ScrollableSection height={assetsTableHeight}>
        {assets.loading && assets.data.length === 0 ? (
          <View className="flex-1 items-center justify-center"><Text className="text-center text-slate-400 italic text-xs">Loading assets...</Text></View>
        ) : assets.error ? (
          <View className="flex-1 items-center justify-center"><Text className="text-center text-red-500 italic text-xs">{assets.error}</Text></View>
        ) : viewMode === 'table' ? (
          <DataTable columns={columns} data={assets.data} keyExtractor={a => a.id} emptyText="No assets registered yet." onRowPress={openDetail} />
        ) : (
          <View className={`gap-2.5 md:flex-row md:flex-wrap ${assets.data.length === 0 ? 'flex-1' : ''}`}>
            {assets.data.length === 0 ? (
              <EmptyState message="No assets registered yet." />
            ) : (
              assets.data.map(a => (
                <Pressable key={a.id} onPress={() => openDetail(a)} className="w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="font-extrabold text-slate-800 text-xs" numberOfLines={1}>{a.name}</Text>
                      <Text className="text-[9px] text-slate-400 uppercase font-mono mt-0.5">{a.code} - {a.asset_type}</Text>
                    </View>
                    <View className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[a.status]?.bg ?? 'bg-slate-100'}`}>
                      <Text className={`text-[9px] font-extrabold ${STATUS_COLORS[a.status]?.text ?? 'text-slate-600'}`}>{a.status}</Text>
                    </View>
                  </View>
                  <View className="flex-row justify-between mt-3 pt-2 border-t border-slate-50">
                    <View><Text className="text-slate-400 text-[9px]">Location</Text><Text className="font-bold text-[10px] text-slate-700" numberOfLines={1}>{resolveLocationLabel(a)}</Text></View>
                    <View className="items-end"><Text className="text-slate-400 text-[9px]">Assigned Partner</Text><Text className="font-bold text-[10px] text-slate-700" numberOfLines={1}>{resolvePartnerName(a.assigned_partner_id)}</Text></View>
                  </View>
                  {a.status === 'Assigned' && a.assigned_partner_id && (
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); onCreateOrderForPartner?.(a.assigned_partner_id!); }}
                      className="flex-row items-center justify-center gap-1.5 bg-emerald-600 px-3 py-1.5 rounded-lg mt-2.5"
                    >
                      <ShoppingCart size={12} color="#fff" /><Text className="text-[10px] font-bold text-white">Order</Text>
                    </Pressable>
                  )}
                </Pressable>
              ))
            )}
          </View>
        )}
        </ScrollableSection>
        <PaginationFooter mode="offset" page={assets.page} totalPages={assets.totalPages} total={assets.total} loading={assets.loading} onPageChange={assets.goToPage} />
      </View>
    </View>
  );
}
