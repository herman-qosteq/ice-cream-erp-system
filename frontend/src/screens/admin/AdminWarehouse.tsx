import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import { Shield, AlertTriangle, RefreshCw, ClipboardList, Trash2, Truck as TruckIcon, RotateCcw, X, Edit, Plus } from 'lucide-react-native';
import { ERPData, resolveActor } from '../../storage';
import { Product, AppNotification, Truck } from '../../types';
import SelectField from '../../components/common/SelectField';
import DateField from '../../components/common/DateField';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useAppContext } from '../../context/AppContext';
import { trucksApi, purchasesApi, warehouseApi, dispatchApi, systemApi } from '../../api/endpoints';

interface AdminWarehouseProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  currentUser: any;
  activeScreen?: string;
  setActiveScreen?: (screen: any) => void;
  showAlert: (opts: any) => void;
  hideAdminControls?: boolean;
  onViewTodayPreBookings?: () => void;
}

export default function AdminWarehouse({ data, setData, addNotification, currentUser, activeScreen, setActiveScreen, showAlert, hideAdminControls = false, onViewTodayPreBookings }: AdminWarehouseProps) {
  const { refreshData } = useAppContext();
  const [activeTab, setActiveTab] = useState<'warehouse' | 'trucks' | 'transfers' | 'audits'>('warehouse');

  const todayIso = new Date().toISOString().split('T')[0];
  const todaysPreBookingsCount = (data.preBookingOrders || []).filter(
    pb => pb.scheduled_delivery_date === todayIso && pb.status === 'Booked'
  ).length;

  useEffect(() => {
    if (activeScreen === 'Warehouse') setActiveTab('warehouse');
    else if (activeScreen === 'Trucks') setActiveTab('transfers');
    else if (activeScreen === 'TruckInventory') setActiveTab('trucks');
    else if (activeScreen === 'MovementAudit') setActiveTab('audits');
  }, [activeScreen]);

  const [selectedTruckId, setSelectedTruckId] = useState<string>(data.trucks[0]?.id || '');
  const activeTruckId = selectedTruckId || data.trucks[0]?.id || '';

  const [adjustForm, setAdjustForm] = useState({
    product_id: data.products[0]?.id || '',
    qty: 10,
    type: 'available_qty' as 'available_qty' | 'reserved_qty' | 'damaged_qty' | 'expired_qty',
    direction: 'add' as 'add' | 'subtract',
    reason: 'Routine manual stock check correction'
  });

  const [dispatchTruckId, setDispatchTruckId] = useState<string>(data.trucks[0]?.id || '');
  const [dispatchItems, setDispatchItems] = useState<{ product_id: string; qty: number; source: 'available_qty' | 'reserved_qty'; preBookingId?: string }[]>([]);
  const [showDispatchPreBookings, setShowDispatchPreBookings] = useState(false);

  const [swapFromTruckId, setSwapFromTruckId] = useState<string>(data.trucks[0]?.id || '');
  const [swapToTruckId, setSwapToTruckId] = useState<string>(data.trucks[1]?.id || '');
  const [swapItems, setSwapItems] = useState<{ product_id: string; qty: number }[]>([
    { product_id: data.products[0]?.id || '', qty: 10 }
  ]);

  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [showReturnAllConfirm, setShowReturnAllConfirm] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmResetType, setConfirmResetType] = useState<'none' | 'clear_stock' | 'factory_reset'>('none');
  const [showNoSupplierWarning, setShowNoSupplierWarning] = useState(false);

  const [truckFormMode, setTruckFormMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [truckForm, setTruckForm] = useState({ vehicle_number: '', driver_user_id: '', route: '', area: '' });
  const [deleteTruckConfirmId, setDeleteTruckConfirmId] = useState<string | null>(null);

  const driverOptions = data.users.filter(u => u.role === 'Salesperson' && u.status === 'Active').map(u => ({ label: u.name, value: u.id }));
  const truckFormDriverOptions = driverOptions.some(o => o.value === truckForm.driver_user_id)
    ? driverOptions
    : [...driverOptions, ...data.users.filter(u => u.id === truckForm.driver_user_id).map(u => ({ label: `${u.name} (Inactive)`, value: u.id }))];

  const handleOpenAddTruck = () => {
    setTruckForm({ vehicle_number: '', driver_user_id: data.users.find(u => u.role === 'Salesperson')?.id || '', route: '', area: '' });
    setEditingTruckId(null);
    setTruckFormMode('add');
  };

  const handleOpenEditTruck = (t: Truck) => {
    setTruckForm({ vehicle_number: t.vehicle_number, driver_user_id: t.driver_user_id, route: t.route, area: t.area });
    setEditingTruckId(t.id);
    setTruckFormMode('edit');
  };

  const handleSaveTruck = async () => {
    if (!truckForm.vehicle_number.trim() || !truckForm.area.trim()) {
      showAlert('Vehicle number and area are required.');
      return;
    }

    try {
      if (truckFormMode === 'add') {
        await trucksApi.create(truckForm);
        await refreshData();
        addNotification('stock_update', `New delivery truck added to fleet: ${truckForm.vehicle_number}.`);
        showAlert(`Truck ${truckForm.vehicle_number} added to the fleet successfully!`);
      } else if (truckFormMode === 'edit' && editingTruckId) {
        await trucksApi.update(editingTruckId, truckForm);
        await refreshData();
        addNotification('stock_update', `Truck ${truckForm.vehicle_number} details were updated.`);
        showAlert(`Truck ${truckForm.vehicle_number} updated successfully!`);
      }
      setTruckFormMode('list');
      setEditingTruckId(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save truck.');
    }
  };

  const handleConfirmDeleteTruck = async () => {
    const truckId = deleteTruckConfirmId;
    const truck = data.trucks.find(t => t.id === truckId);
    if (!truck || !truckId) { setDeleteTruckConfirmId(null); return; }

    try {
      await trucksApi.setStatus(truckId, 'Inactive');
      await refreshData();
      addNotification('stock_update', `Truck ${truck.vehicle_number} was removed from the active fleet.`);

      const remainingActive = data.trucks.filter(t => t.status === 'Active' && t.id !== truckId);
      if (selectedTruckId === truck.id) setSelectedTruckId(remainingActive[0]?.id || '');
      if (dispatchTruckId === truck.id) setDispatchTruckId(remainingActive[0]?.id || '');
      if (swapFromTruckId === truck.id) setSwapFromTruckId(remainingActive[0]?.id || '');
      if (swapToTruckId === truck.id) setSwapToTruckId(remainingActive[1]?.id || remainingActive[0]?.id || '');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to remove truck.');
    } finally {
      setDeleteTruckConfirmId(null);
    }
  };

  const handleReactivateTruck = async (truckId: string) => {
    const truck = data.trucks.find(t => t.id === truckId);
    if (!truck) return;
    try {
      await trucksApi.setStatus(truckId, 'Active');
      await refreshData();
      addNotification('stock_update', `Truck ${truck.vehicle_number} was reactivated into the fleet.`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to reactivate truck.');
    }
  };

  const handleClearWarehouseStock = async () => {
    try {
      await systemApi.clearWarehouseStock();
      await refreshData();
      addNotification('stock_update', 'Warehouse stock was manually cleared: available, reserved, damaged, and expired quantities were all reset to zero for every product.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to clear warehouse stock.');
    } finally {
      setConfirmResetType('none');
      setShowResetModal(false);
    }
  };

  const handleFactoryResetAllData = async () => {
    try {
      await systemApi.factoryReset();
      await refreshData();
      addNotification('system', 'Factory reset performed: all orders, invoices, payments, stores, and suppliers were permanently wiped. This cannot be undone.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to perform factory reset.');
    } finally {
      setConfirmResetType('none');
      setShowResetModal(false);
    }
  };

  const [warehouseForm, setWarehouseForm] = useState<'list' | 'receive_stock'>('list');
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', invoice_number: '', date: '2026-06-27',
    items: [{ product_id: data.products[0]?.id || '', quantity: 100, purchase_price: data.products[0]?.purchase_price || 1.0, mfg_date: '2026-06-27', expiry_date: '2026-12-24' }]
  });

  const handleOpenReceiveStock = () => {
    if (data.suppliers.length === 0) {
      setShowNoSupplierWarning(true);
      return;
    }
    setPurchaseForm({
      supplier_id: data.suppliers[0].id,
      invoice_number: 'SUP-INV-' + Math.floor(Math.random() * 9000 + 1000),
      date: '2026-06-27',
      items: [{ product_id: data.products[0]?.id || '', quantity: 100, purchase_price: data.products[0]?.purchase_price || 1.0, mfg_date: '2026-06-27', expiry_date: '2026-12-24' }]
    });
    setWarehouseForm('receive_stock');
  };

  const handleSavePurchase = async () => {
    if (!purchaseForm.invoice_number) {
      showAlert('Supplier invoice number is required.');
      return;
    }
    const suppName = data.suppliers.find(s => s.id === purchaseForm.supplier_id)?.name || 'Supplier';
    try {
      await purchasesApi.create(purchaseForm);
      await refreshData();
      addNotification('stock_update', `Stock inward received from ${suppName}: warehouse quantities updated.`);
      setWarehouseForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to receive stock.');
    }
  };

  const handleAddPurchaseItem = () => {
    setPurchaseForm({
      ...purchaseForm,
      items: [...purchaseForm.items, { product_id: data.products[0]?.id || '', quantity: 100, purchase_price: data.products[0]?.purchase_price || 1.0, mfg_date: '2026-06-27', expiry_date: '2026-12-24' }]
    });
  };

  const handleRemovePurchaseItem = (index: number) => {
    if (purchaseForm.items.length <= 1) return;
    setPurchaseForm({ ...purchaseForm, items: purchaseForm.items.filter((_, i) => i !== index) });
  };

  useEffect(() => {
    if (swapFromTruckId === swapToTruckId) {
      const otherTruck = data.trucks.find(t => t.id !== swapFromTruckId);
      if (otherTruck) setSwapToTruckId(otherTruck.id);
    }
  }, [swapFromTruckId, swapToTruckId, data.trucks]);

  useEffect(() => {
    const sourceCargo = data.truck_inventory.filter(ti => ti.truck_id === swapFromTruckId && ti.quantity > 0);
    if (sourceCargo.length > 0) {
      setSwapItems([{ product_id: sourceCargo[0].product_id, qty: Math.min(sourceCargo[0].quantity, 10) }]);
    } else {
      setSwapItems([]);
    }
  }, [swapFromTruckId, data.truck_inventory]);

  const updateDispatchItem = (index: number, field: 'product_id' | 'qty' | 'source', value: any) => {
    const updated = [...dispatchItems];
    if (field === 'product_id') {
      const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === value);
      const availableQty = warehouseInv ? (updated[index].source === 'reserved_qty' ? warehouseInv.reserved_qty : warehouseInv.available_qty) : 0;
      const currentQty = updated[index].qty;
      const nextQty = availableQty === 0 ? 0 : Math.min(availableQty, Math.max(1, currentQty));
      updated[index] = { ...updated[index], product_id: value, qty: nextQty };
    } else if (field === 'qty') {
      const prodId = updated[index].product_id;
      const prodName = data.products.find(p => p.id === prodId)?.name || 'This product';
      const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === prodId);
      const availableQty = warehouseInv ? (updated[index].source === 'reserved_qty' ? warehouseInv.reserved_qty : warehouseInv.available_qty) : 0;
      const maxAllowed = Math.max(0, availableQty);
      const requested = Number(value) || 0;
      if (requested > maxAllowed) {
        showAlert(maxAllowed === 0
          ? `${prodName} has none available in that pool right now.`
          : `Limit exceeded! Only ${maxAllowed} units of ${prodName} are available in that pool.`);
      }
      const nextQty = Math.min(maxAllowed, Math.max(availableQty > 0 ? 1 : 0, requested));
      updated[index] = { ...updated[index], qty: nextQty };
    } else if (field === 'source') {
      const prodId = updated[index].product_id;
      const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === prodId);
      const availableQty = warehouseInv ? (value === 'reserved_qty' ? warehouseInv.reserved_qty : warehouseInv.available_qty) : 0;
      const nextQty = availableQty === 0 ? 0 : Math.min(availableQty, 10);
      updated[index] = { ...updated[index], source: value, qty: nextQty };
    }
    setDispatchItems(updated);
  };

  const addDispatchItem = () => {
    const selectedIds = dispatchItems.map(item => item.product_id);
    const unusedProduct = data.products.find(p => !selectedIds.includes(p.id));
    const nextId = unusedProduct ? unusedProduct.id : (data.products[0]?.id || '');
    const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === nextId);
    const availableQty = warehouseInv ? warehouseInv.available_qty : 0;
    const initialQty = availableQty === 0 ? 0 : Math.min(availableQty, 10);
    setDispatchItems([...dispatchItems, { product_id: nextId, qty: initialQty, source: 'available_qty' }]);
  };

  const removeDispatchItem = (index: number) => {
    setDispatchItems(dispatchItems.filter((_, i) => i !== index));
  };

  const handleAddPreBookingItemToDispatch = (productId: string, qty: number, preBookingId: string) => {
    setDispatchItems(prev => {
      const existingIdx = prev.findIndex(item => item.product_id === productId && item.preBookingId === preBookingId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], qty: updated[existingIdx].qty + qty };
        return updated;
      }
      return [...prev, { product_id: productId, qty, source: 'reserved_qty' as const, preBookingId }];
    });
    showAlert({ type: 'success', message: `Added ${qty} unit(s) of ${data.products.find(p => p.id === productId)?.name || 'product'} to the dispatch queue from the reserved pool.` });
  };

  const handleAddAllPreBookingItemsToDispatch = (items: { product_id: string; quantity: number }[], preBookingId: string) => {
    setDispatchItems(prev => {
      let updated = [...prev];
      items.forEach(item => {
        const existingIdx = updated.findIndex(di => di.product_id === item.product_id && di.preBookingId === preBookingId);
        if (existingIdx >= 0) {
          updated[existingIdx] = { ...updated[existingIdx], qty: updated[existingIdx].qty + item.quantity };
        } else {
          updated.push({ product_id: item.product_id, qty: item.quantity, source: 'reserved_qty' as const, preBookingId });
        }
      });
      return updated;
    });
    showAlert({ type: 'success', message: 'Added all pre-booked items to the dispatch queue from the reserved pool.' });
  };

  const updateSwapItem = (index: number, field: 'product_id' | 'qty', value: any) => {
    const updated = [...swapItems];
    if (field === 'product_id') {
      const sourceInv = data.truck_inventory.find(ti => ti.truck_id === swapFromTruckId && ti.product_id === value);
      const available = sourceInv ? sourceInv.quantity : 0;
      const currentQty = updated[index].qty;
      const nextQty = available === 0 ? 0 : Math.min(available, Math.max(1, currentQty));
      updated[index] = { ...updated[index], product_id: value, qty: nextQty };
    } else {
      const prodId = updated[index].product_id;
      const prodName = data.products.find(p => p.id === prodId)?.name || 'This product';
      const sourceInv = data.truck_inventory.find(ti => ti.truck_id === swapFromTruckId && ti.product_id === prodId);
      const available = sourceInv ? sourceInv.quantity : 0;
      const maxAllowed = Math.max(0, available);
      const requested = Number(value) || 0;
      if (requested > maxAllowed) {
        showAlert(`Limit exceeded! Only ${maxAllowed} units of ${prodName} are loaded on the source truck.`);
      }
      const nextQty = Math.min(maxAllowed, Math.max(available > 0 ? 1 : 0, requested));
      updated[index] = { ...updated[index], qty: nextQty };
    }
    setSwapItems(updated);
  };

  const addSwapItem = () => {
    const selectedIds = swapItems.map(item => item.product_id);
    const unusedCargo = data.truck_inventory.find(ti => ti.truck_id === swapFromTruckId && ti.quantity > 0 && !selectedIds.includes(ti.product_id));
    if (!unusedCargo) return;
    setSwapItems([...swapItems, { product_id: unusedCargo.product_id, qty: Math.min(unusedCargo.quantity, 10) }]);
  };

  const removeSwapItem = (index: number) => {
    if (swapItems.length <= 1) return;
    setSwapItems(swapItems.filter((_, i) => i !== index));
  };

  const handleStockAdjustment = async () => {
    try {
      await warehouseApi.adjust({
        product_id: adjustForm.product_id,
        type: adjustForm.type,
        direction: adjustForm.direction,
        qty: Number(adjustForm.qty),
        reason: adjustForm.reason,
      });
      await refreshData();
      showAlert('Warehouse stock adjusted and audit logs recorded.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to adjust stock.');
    }
  };

  const handleLoadStock = async () => {
    if (dispatchItems.length === 0) {
      showAlert('Please add at least one item to dispatch.');
      return;
    }
    for (const item of dispatchItems) {
      const q = Number(item.qty);
      if (isNaN(q) || q <= 0) {
        showAlert('All dispatch quantities must be greater than zero.');
        return;
      }
    }

    const truckNum = data.trucks.find(t => t.id === dispatchTruckId)?.vehicle_number || 'Truck';
    try {
      await dispatchApi.load({
        truck_id: dispatchTruckId,
        items: dispatchItems.map(item => ({ product_id: item.product_id, qty: Number(item.qty), source: item.source, pre_booking_id: item.preBookingId })),
      });
      await refreshData();
      addNotification('delivery', `Truck Batch Loaded: Loaded ${dispatchItems.length} product(s) onto vehicle ${truckNum}`);
      showAlert('Stock batch loaded successfully to truck inventory.');
      setDispatchItems([]);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to load stock onto truck.');
    }
  };

  const handleReturnStock = async (truckId: string, productId: string, qty: number) => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'Warehouse') {
      showAlert('Unauthorized: Only Admin or Warehouse operators can return stock to the warehouse.');
      return;
    }
    const returnQty = Number(qty);
    if (isNaN(returnQty) || returnQty <= 0) {
      showAlert('Please enter a valid return quantity.');
      return;
    }

    try {
      const prodName = data.products.find(p => p.id === productId)?.name || 'Product';
      const truckNum = data.trucks.find(t => t.id === truckId)?.vehicle_number || 'Truck';
      await dispatchApi.returnStock(truckId, productId, returnQty);
      await refreshData();
      addNotification('delivery', `Stock returned: recalled ${returnQty} units of ${prodName} from ${truckNum}`);
      showAlert('Stock successfully returned to warehouse.');
    } catch (error: any) {
      showAlert(`Transaction failed: ${error.message}. All changes rolled back.`);
    }
  };

  const handleReturnAllProducts = async (truckId: string) => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'Warehouse') {
      showAlert('Unauthorized: Only Admin or Warehouse operators can return stock to the warehouse.');
      return;
    }
    const truckCargo = data.truck_inventory.filter(ti => ti.truck_id === truckId);
    if (truckCargo.length === 0) {
      showAlert('This truck has no cargo stock loaded currently.');
      return;
    }

    try {
      const returnedCount = truckCargo.reduce((sum, c) => sum + Number(c.quantity), 0);
      const truckNum = data.trucks.find(t => t.id === truckId)?.vehicle_number || 'Truck';
      await dispatchApi.returnAll(truckId);
      await refreshData();
      addNotification('delivery', `Stock returned: recalled ALL (${returnedCount} units) products from Truck ${truckNum}`);
      showAlert(`Successfully returned all ${returnedCount} units back to the warehouse.`);
    } catch (error: any) {
      showAlert(`Transaction failed: ${error.message}. All changes rolled back.`);
    }
  };

  const handleTruckToTruckTransfer = async () => {
    if (swapFromTruckId === swapToTruckId) {
      showAlert('Source and destination trucks must be different.');
      return;
    }
    if (swapItems.length === 0) {
      showAlert('Please add at least one item to transfer.');
      return;
    }

    for (const item of swapItems) {
      const q = Number(item.qty);
      if (isNaN(q) || q <= 0) {
        showAlert('All transfer quantities must be greater than zero.');
        return;
      }
    }

    const sourceNum = data.trucks.find(t => t.id === swapFromTruckId)?.vehicle_number || 'Truck A';
    const destNum = data.trucks.find(t => t.id === swapToTruckId)?.vehicle_number || 'Truck B';

    try {
      await dispatchApi.transfer({
        from_truck_id: swapFromTruckId,
        to_truck_id: swapToTruckId,
        items: swapItems.map(item => ({ product_id: item.product_id, qty: Number(item.qty) })),
      });
      await refreshData();
      addNotification('delivery', `Inter-truck stock batch transfer: Moved ${swapItems.length} product(s) from ${sourceNum} to ${destNum}`);
      showAlert('Inter-truck batch transfer successful!');
      setSwapItems([{ product_id: data.products[0]?.id || '', qty: 10 }]);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to transfer stock between trucks.');
    }
  };

  const productOptions = data.products.filter(p => p.status === 'Active').map(p => ({ label: p.name, value: p.id }));
  const truckOptions = data.trucks.filter(t => t.status === 'Active').map(t => ({ label: `${t.vehicle_number} (${t.area})`, value: t.id }));
  const supplierOptions = data.suppliers.filter(s => s.status === 'Active').map(s => ({ label: s.name, value: s.id }));
  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800";

  if (warehouseForm === 'receive_stock') {
    return (
      <View className="gap-3">
        <View className="bg-white p-3 lg:p-4 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-6xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Receiving Stock (Supplier Inward)</Text>
            <Pressable onPress={() => setWarehouseForm('list')}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Text className="font-bold text-slate-500 mb-1 text-xs">Select Supplier</Text>
              <SelectField value={purchaseForm.supplier_id} onValueChange={v => setPurchaseForm({ ...purchaseForm, supplier_id: v })} options={supplierOptions} title="Select Supplier" className={inputClass + ' flex-row items-center justify-between'} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-slate-500 mb-1 text-xs">Supplier Invoice #</Text>
              <TextInput value={purchaseForm.invoice_number} onChangeText={v => setPurchaseForm({ ...purchaseForm, invoice_number: v })} className={inputClass} />
            </View>
          </View>

          <View className="border border-slate-100 rounded-xl p-2.5 bg-slate-50 gap-2">
            <View className="flex-row items-center justify-between px-0.5">
              <Text className="font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                Cargo Manifest ({purchaseForm.items.length} item{purchaseForm.items.length === 1 ? '' : 's'})
              </Text>
              <Pressable onPress={handleAddPurchaseItem} className="flex-row items-center gap-1">
                <Plus size={12} color="#e11d48" />
                <Text className="text-rose-500 font-extrabold text-[10px]">Add Product</Text>
              </Pressable>
            </View>

            <View className="hidden lg:flex lg:flex-row lg:items-center gap-2 px-2">
              <Text className="lg:flex-[2] font-bold text-slate-400 text-[9px] uppercase">Ice Cream Item</Text>
              <Text className="lg:flex-1 font-bold text-slate-400 text-[9px] uppercase text-center">Qty</Text>
              <Text className="lg:flex-1 font-bold text-slate-400 text-[9px] uppercase text-center">Price (Rs)</Text>
              <Text className="lg:flex-1 font-bold text-slate-400 text-[9px] uppercase text-center">Mfg Date</Text>
              <Text className="lg:flex-1 font-bold text-slate-400 text-[9px] uppercase text-center">Expiry Date</Text>
              <View className="w-6" />
            </View>

            <View className="gap-2">
              {purchaseForm.items.map((item, index) => (
                <View key={index} className="bg-white border border-slate-200 p-2.5 lg:py-2 lg:px-2.5 rounded-xl gap-2 lg:flex-row lg:items-center relative">
                  <View className="w-full lg:flex-[2]">
                    <Text className="font-bold text-slate-400 text-[9px] mb-1 lg:hidden">Ice Cream Item</Text>
                    <SelectField
                      value={item.product_id}
                      onValueChange={v => {
                        const newItems = [...purchaseForm.items];
                        newItems[index] = { ...newItems[index], product_id: v, purchase_price: data.products.find(p => p.id === v)?.purchase_price || 1.0 };
                        setPurchaseForm({ ...purchaseForm, items: newItems });
                      }}
                      options={productOptions}
                      title="Select Product"
                      className="bg-slate-50 border border-slate-200 rounded p-1.5 flex-row items-center justify-between"
                    />
                  </View>
                  <View className="flex-row gap-2 lg:flex-1">
                    <View className="flex-1">
                      <Text className="font-bold text-slate-400 text-[9px] mb-1 lg:hidden">Inward Qty</Text>
                      <TextInput
                        keyboardType="number-pad"
                        value={String(item.quantity)}
                        onChangeText={v => { const newItems = [...purchaseForm.items]; newItems[index].quantity = Number(v) || 0; setPurchaseForm({ ...purchaseForm, items: newItems }); }}
                        className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-slate-400 text-[9px] mb-1 lg:hidden">Price (Rs)</Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        value={String(item.purchase_price)}
                        onChangeText={v => { const newItems = [...purchaseForm.items]; newItems[index].purchase_price = Number(v) || 0; setPurchaseForm({ ...purchaseForm, items: newItems }); }}
                        className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-2 pt-1 border-t border-slate-100 lg:border-t-0 lg:pt-0 lg:flex-1">
                    <View className="flex-1">
                      <Text className="font-bold text-slate-400 text-[9px] mb-1 lg:hidden">Mfg Date</Text>
                      <DateField value={item.mfg_date || ''} onValueChange={v => { const newItems = [...purchaseForm.items]; newItems[index].mfg_date = v; setPurchaseForm({ ...purchaseForm, items: newItems }); }} title="Select Manufacturing Date" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 flex-row items-center justify-between" textClassName="text-[11px] text-slate-800 flex-1" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-slate-400 text-[9px] mb-1 lg:hidden">Expiry Date</Text>
                      <DateField value={item.expiry_date || ''} onValueChange={v => { const newItems = [...purchaseForm.items]; newItems[index].expiry_date = v; setPurchaseForm({ ...purchaseForm, items: newItems }); }} title="Select Expiry Date" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 flex-row items-center justify-between" textClassName="text-[11px] text-slate-800 flex-1" />
                    </View>
                  </View>
                  {purchaseForm.items.length > 1 && (
                    <Pressable onPress={() => handleRemovePurchaseItem(index)} hitSlop={8} className="absolute top-2 right-2 lg:static lg:ml-1 lg:w-6 lg:items-center">
                      <Trash2 size={14} color="#94a3b8" />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </View>

          <Pressable onPress={handleSavePurchase} className="w-full py-2.5 bg-emerald-500 rounded-xl items-center active:bg-emerald-600">
            <Text className="text-white font-bold text-xs">Confirm Stock Inward Receive</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
        {(['warehouse', 'transfers', 'trucks', 'audits'] as const).map(t => (
          <Pressable key={t} onPress={() => setActiveTab(t)} className={`flex-1 min-w-[45%] py-1 rounded-lg items-center ${activeTab === t ? 'bg-white' : ''}`}>
            <Text className={`text-[10px] font-extrabold capitalize ${activeTab === t ? 'text-slate-800' : 'text-slate-500'}`}>
              {t === 'transfers' ? 'Load & Transfer' : t === 'audits' ? 'Movement Logs' : t}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'warehouse' ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between bg-slate-100 p-2 rounded-xl border border-slate-200">
            <Text className="text-[10px] font-bold text-slate-600 flex-1 mr-2">{hideAdminControls ? 'Log new cold supply chain deliveries:' : 'Manage cold supply chain partners:'}</Text>
            <View className="flex-row gap-1.5">
              {!hideAdminControls && (
                <Pressable onPress={() => setActiveScreen?.('Suppliers')} className="py-1 px-2.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                  <Text className="text-rose-600 text-[9px] font-extrabold">Manage Partners</Text>
                </Pressable>
              )}
              <Pressable onPress={handleOpenReceiveStock} className="py-1 px-2.5 bg-blue-50 border border-blue-100 rounded-lg active:bg-blue-100">
                <Text className="text-blue-600 text-[9px] font-extrabold">+ Receive Stock</Text>
              </Pressable>
            </View>
          </View>

          {!hideAdminControls && (
            <View className="bg-amber-50 p-2 rounded-xl border border-amber-200 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <RefreshCw size={14} color="#92400e" />
                <Text className="text-[10px] font-bold text-amber-800">[TEMPORARY DEV ACTION]</Text>
              </View>
              <Pressable onPress={() => setShowResetModal(true)} className="py-1 px-3 bg-amber-600 rounded-lg active:bg-amber-700">
                <Text className="text-white text-[9px] font-extrabold">Reset / Clear All Values</Text>
              </Pressable>
            </View>
          )}

          <View className="gap-1.5">
            {data.warehouse_inventory.some(i => i.available_qty === 0) && (
              <View className="bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 flex-row items-center gap-2">
                <AlertTriangle size={16} color="#ef4444" />
                <Text className="font-bold text-red-700 text-xs flex-1">Ice cream flavors are currently empty in our silos.</Text>
              </View>
            )}
            {data.warehouse_inventory.some(i => i.available_qty > 0 && i.available_qty <= 100) && (
              <View className="bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100 flex-row items-center gap-2">
                <Shield size={16} color="#f59e0b" />
                <Text className="font-bold text-amber-700 text-xs flex-1">Ice cream quantities are below healthy safety levels.</Text>
              </View>
            )}
          </View>

          <View className="bg-white rounded-2xl border border-slate-200 p-2.5">
            <View className="flex-row items-center justify-between mb-1.5 px-0.5">
              <Text className="font-bold text-slate-800 text-xs">Warehouse Silos Stock Levels</Text>
              <Text className="text-[10px] text-slate-400">Total flavors: {data.products.length}</Text>
            </View>

            <View className="hidden lg:flex lg:flex-row lg:items-center gap-2 px-2 pb-1">
              <Text className="lg:flex-[2.5] font-bold text-slate-400 text-[9px] uppercase">Product</Text>
              <View className="lg:flex-[4] flex-row gap-2">
                <Text className="flex-1 text-center font-bold text-slate-400 text-[9px] uppercase">Avail</Text>
                <Text className="flex-1 text-center font-bold text-slate-400 text-[9px] uppercase">Reserved</Text>
                <Text className="flex-1 text-center font-bold text-slate-400 text-[9px] uppercase">Damaged</Text>
                <Text className="flex-1 text-center font-bold text-slate-400 text-[9px] uppercase">Expired</Text>
              </View>
              <Text className="lg:w-14 text-center font-bold text-slate-400 text-[9px] uppercase">Status</Text>
            </View>

            <View className="gap-1.5">
              {data.warehouse_inventory.map(inv => {
                const prodName = data.products.find(p => p.id === inv.product_id)?.name || 'Unknown';
                const isOOS = inv.available_qty === 0;
                const isLow = inv.available_qty > 0 && inv.available_qty <= 100;
                return (
                  <View key={inv.product_id} className={`w-full rounded-lg border px-2.5 py-1.5 gap-1.5 lg:gap-2 lg:flex-row lg:items-center ${isOOS ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                    <View className="lg:flex-[2.5] flex-row items-center justify-between lg:justify-start gap-2">
                      <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px] flex-shrink">{prodName}</Text>
                      <View className="flex-row gap-1 lg:hidden">
                        {isOOS && <Text className="text-[8px] bg-red-100 text-red-700 px-1 rounded font-extrabold uppercase">OOS</Text>}
                        {isLow && <Text className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded font-extrabold uppercase">Low</Text>}
                      </View>
                    </View>
                    <View className="lg:flex-[4] flex-row gap-1.5">
                      <View className="flex-1 items-center">
                        <Text className="text-[7px] text-slate-400 font-bold uppercase lg:hidden">Avail</Text>
                        <Text className={`text-[11px] font-black ${isOOS ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-800'}`}>{inv.available_qty}</Text>
                      </View>
                      <View className="flex-1 items-center">
                        <Text className="text-[7px] text-slate-400 font-bold uppercase lg:hidden">Res</Text>
                        <Text className="text-slate-600 text-[11px] font-black">{inv.reserved_qty}</Text>
                      </View>
                      <View className="flex-1 items-center">
                        <Text className="text-[7px] text-slate-400 font-bold uppercase lg:hidden">Dmg</Text>
                        <Text className="text-red-500 text-[11px] font-black">{inv.damaged_qty}</Text>
                      </View>
                      <View className="flex-1 items-center">
                        <Text className="text-[7px] text-slate-400 font-bold uppercase lg:hidden">Exp</Text>
                        <Text className="text-purple-500 text-[11px] font-black">{inv.expired_qty}</Text>
                      </View>
                    </View>
                    <View className="hidden lg:flex lg:w-14 items-center">
                      {isOOS && <Text className="text-[8px] bg-red-100 text-red-700 px-1 rounded font-extrabold uppercase">OOS</Text>}
                      {isLow && <Text className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded font-extrabold uppercase">Low</Text>}
                      {!isOOS && !isLow && <Text className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded font-extrabold uppercase">OK</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View className="bg-white p-3 lg:p-4 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
            <Text className="font-bold text-slate-800 text-xs">Manual Warehouse Correction Panel</Text>
            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Product</Text>
              <SelectField value={adjustForm.product_id} onValueChange={v => setAdjustForm({ ...adjustForm, product_id: v })} options={productOptions} title="Select Product" className={inputClass + ' flex-row items-center justify-between'} />
            </View>
            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Action Type</Text>
              <SelectField
                value={adjustForm.type}
                onValueChange={v => setAdjustForm({ ...adjustForm, type: v as any })}
                options={[
                  { label: 'Adjust Available Qty (+/-)', value: 'available_qty' },
                  { label: 'Adjust Reserved Qty (+/-)', value: 'reserved_qty' },
                  { label: 'Adjust Damaged Qty (+/-)', value: 'damaged_qty' },
                  { label: 'Adjust Expired Qty (+/-)', value: 'expired_qty' },
                ]}
                title="Select Action"
                className={inputClass + ' flex-row items-center justify-between'}
              />
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Quantity</Text>
                <TextInput keyboardType="number-pad" value={String(adjustForm.qty)} onChangeText={v => setAdjustForm({ ...adjustForm, qty: Number(v) || 0 })} className={inputClass + ' text-center font-bold'} />
              </View>
              <View className="flex-1 justify-end">
                <View className="flex-row gap-1">
                  <Pressable onPress={() => setAdjustForm({ ...adjustForm, direction: 'add' })} className={`flex-1 py-2.5 rounded-lg items-center ${adjustForm.direction !== 'subtract' ? 'bg-emerald-500' : 'bg-slate-100'}`}>
                    <Text className={`text-[10px] font-extrabold ${adjustForm.direction !== 'subtract' ? 'text-white' : 'text-slate-500'}`}>Add (+)</Text>
                  </Pressable>
                  <Pressable onPress={() => setAdjustForm({ ...adjustForm, direction: 'subtract' })} className={`flex-1 py-2.5 rounded-lg items-center ${adjustForm.direction === 'subtract' ? 'bg-rose-500' : 'bg-slate-100'}`}>
                    <Text className={`text-[10px] font-extrabold ${adjustForm.direction === 'subtract' ? 'text-white' : 'text-slate-500'}`}>Sub (-)</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Reason / Adjust explanation</Text>
              <TextInput value={adjustForm.reason} onChangeText={v => setAdjustForm({ ...adjustForm, reason: v })} placeholder="Audit description details..." placeholderTextColor="#94a3b8" className={inputClass} />
            </View>
            <Pressable onPress={handleStockAdjustment} className="w-full py-2 bg-indigo-500 rounded-lg items-center active:bg-indigo-600">
              <Text className="text-white font-bold text-xs">Apply Warehouse Correction Log</Text>
            </Pressable>
          </View>
        </View>
      ) : activeTab === 'trucks' ? (
        <View className="gap-4">
          <View className="bg-white p-3 rounded-2xl border border-slate-200 gap-2">
            <Text className="font-bold text-slate-700 text-xs">Select Active Delivery Fleet Truck:</Text>
            <SelectField
              value={activeTruckId}
              onValueChange={v => { setSelectedTruckId(v); setReturnQuantities({}); }}
              options={truckOptions}
              title="Select Truck"
              className="bg-slate-100 border border-slate-200 rounded p-2 flex-row items-center justify-between"
            />
          </View>

          <View className="bg-white p-4 rounded-2xl border border-slate-200">
            <View className="flex-row items-center justify-between gap-3 mb-4 border-b border-slate-100 pb-2">
              <View className="flex-row items-center gap-1.5">
                <TruckIcon size={16} color="#f43f5e" />
                <Text className="font-bold text-slate-800 text-xs">Current Inventory on Selected Truck</Text>
              </View>
              {data.truck_inventory.filter(ti => ti.truck_id === activeTruckId).length > 0 && (
                <Pressable onPress={() => setShowReturnAllConfirm(true)} className="py-1 px-3 bg-rose-500 rounded-lg active:bg-rose-600">
                  <Text className="text-white font-extrabold text-[10px]">Return All</Text>
                </Pressable>
              )}
            </View>

            {data.truck_inventory.filter(ti => ti.truck_id === activeTruckId).length === 0 ? (
              <Text className="py-6 text-center text-slate-400 italic text-xs">This truck has no cargo stock loaded currently.</Text>
            ) : (
              <View className="gap-2 md:flex-row md:flex-wrap">
                {data.truck_inventory.filter(ti => ti.truck_id === activeTruckId).map(ti => {
                  const prod = data.products.find(p => p.id === ti.product_id);
                  if (!prod) return null;
                  const currentInputVal = returnQuantities[ti.product_id] !== undefined ? returnQuantities[ti.product_id] : '1';

                  return (
                    <View key={ti.product_id} className="w-full md:w-[48%] p-2.5 rounded-xl bg-slate-50 border border-slate-100 gap-2">
                      <View className="flex-row items-center justify-between">
                        <View>
                          <Text className="font-bold text-slate-800 text-xs">{prod.name}</Text>
                          <Text className="text-[9px] text-slate-400 uppercase font-mono">{ti.product_id}</Text>
                        </View>
                        <Text className="font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded text-[10px]">{ti.quantity} units loaded</Text>
                      </View>
                      <View className="flex-row items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200">
                        <Pressable
                          onPress={() => { const currNum = Number(currentInputVal) || 1; setReturnQuantities(prev => ({ ...prev, [ti.product_id]: String(Math.max(1, currNum - 1)) })); }}
                          className="w-7 h-7 bg-slate-100 rounded items-center justify-center active:bg-slate-200"
                        >
                          <Text className="font-black text-slate-700 text-xs">-</Text>
                        </Pressable>
                        <TextInput
                          keyboardType="number-pad"
                          value={currentInputVal}
                          onChangeText={v => {
                            const num = Number(v);
                            if (v === '') setReturnQuantities(prev => ({ ...prev, [ti.product_id]: '' }));
                            else if (!isNaN(num)) {
                              if (num > ti.quantity) showAlert(`Only ${ti.quantity} units of ${prod.name} are loaded on this truck.`);
                              setReturnQuantities(prev => ({ ...prev, [ti.product_id]: String(Math.max(1, Math.min(ti.quantity, num))) }));
                            }
                          }}
                          className="w-12 bg-white border border-slate-200 rounded p-1 text-center font-bold text-[11px]"
                        />
                        <Pressable
                          onPress={() => { const currNum = Number(currentInputVal) || 1; setReturnQuantities(prev => ({ ...prev, [ti.product_id]: String(Math.min(ti.quantity, currNum + 1)) })); }}
                          className="w-7 h-7 bg-slate-100 rounded items-center justify-center active:bg-slate-200"
                        >
                          <Text className="font-black text-slate-700 text-xs">+</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            const val = Number(currentInputVal);
                            if (!isNaN(val) && val > 0 && val <= ti.quantity) {
                              handleReturnStock(activeTruckId, ti.product_id, val);
                              setReturnQuantities(prev => { const next = { ...prev }; delete next[ti.product_id]; return next; });
                            } else {
                              showAlert(`Please enter a quantity between 1 and ${ti.quantity}`);
                            }
                          }}
                          className="flex-1 py-1.5 px-2 bg-indigo-500 rounded-md items-center active:bg-indigo-600"
                        >
                          <Text className="text-white text-[9px] font-extrabold">Return Qty</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => { handleReturnStock(activeTruckId, ti.product_id, Number(ti.quantity)); setReturnQuantities(prev => { const next = { ...prev }; delete next[ti.product_id]; return next; }); }}
                          className="py-1.5 px-2 bg-slate-200 rounded-md items-center active:bg-slate-300"
                        >
                          <Text className="text-slate-600 text-[9px] font-extrabold">All</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      ) : activeTab === 'transfers' ? (
        <View className="gap-4">
          {todaysPreBookingsCount > 0 && (
            <Pressable
              onPress={() => onViewTodayPreBookings?.()}
              className="bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100 flex-row items-center gap-2 active:bg-indigo-100"
            >
              <ClipboardList size={16} color="#4f46e5" />
              <Text className="font-bold text-indigo-700 text-xs flex-1">Today's Pre-Booking Orders awaiting truck load-out</Text>
              <View className="bg-indigo-600 rounded-full min-w-[20px] h-5 items-center justify-center px-1.5">
                <Text className="text-white text-[10px] font-extrabold">{todaysPreBookingsCount}</Text>
              </View>
            </Pressable>
          )}

          <View className={`bg-white p-4 rounded-2xl border border-slate-200 gap-3 ${truckFormMode !== 'list' ? 'w-full lg:max-w-2xl lg:self-center lg:p-6' : ''}`}>
            {truckFormMode === 'list' ? (
              <>
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                  <View>
                    <Text className="font-bold text-slate-800 text-xs">Truck Fleet Roster</Text>
                    <Text className="text-[10px] text-slate-400 font-medium">Add, edit, or remove delivery vehicles.</Text>
                  </View>
                  <Pressable onPress={handleOpenAddTruck} className="flex-row items-center gap-1 py-1.5 px-2.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                    <Plus size={14} color="#e11d48" />
                    <Text className="text-rose-600 text-[10px] font-extrabold">Add Truck</Text>
                  </Pressable>
                </View>

                <View className="gap-2 md:flex-row md:flex-wrap">
                  {data.trucks.map(t => {
                    const driver = data.users.find(u => u.id === t.driver_user_id);
                    const isInactive = t.status === 'Inactive';
                    return (
                      <View key={t.id} className={`w-full md:w-[48%] xl:w-[32%] flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 ${isInactive ? 'opacity-60' : ''}`}>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="font-bold text-slate-800 text-xs">{t.vehicle_number}</Text>
                            {isInactive && <Text className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Inactive</Text>}
                          </View>
                          <Text className="text-[10px] text-slate-400 mt-0.5">Driver: {driver?.name || 'Unassigned'} - {t.area}</Text>
                          <Text className="text-[9px] text-slate-400">{t.route}</Text>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <Pressable onPress={() => handleOpenEditTruck(t)} className="p-1.5 bg-blue-50 border border-blue-100 rounded-lg active:bg-blue-100">
                            <Edit size={14} color="#2563eb" />
                          </Pressable>
                          {isInactive ? (
                            <Pressable onPress={() => handleReactivateTruck(t.id)} className="p-1.5 bg-emerald-50 border border-emerald-100 rounded-lg active:bg-emerald-100">
                              <RotateCcw size={14} color="#059669" />
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => setDeleteTruckConfirmId(t.id)} className="p-1.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                              <Trash2 size={14} color="#e11d48" />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {data.trucks.length === 0 && (
                    <Text className="w-full text-[10px] text-slate-400 italic py-2 text-center">No trucks registered yet — tap "Add Truck" to register your first vehicle.</Text>
                  )}
                </View>
              </>
            ) : (
              <>
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                  <Text className="font-bold text-slate-800 text-xs">{truckFormMode === 'add' ? 'Register New Truck' : 'Edit Truck Details'}</Text>
                  <Pressable onPress={() => { setTruckFormMode('list'); setEditingTruckId(null); }}>
                    <Text className="text-slate-400 text-xs">Cancel</Text>
                  </Pressable>
                </View>

                <View>
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Vehicle Number</Text>
                  <TextInput value={truckForm.vehicle_number} onChangeText={v => setTruckForm({ ...truckForm, vehicle_number: v })} placeholder="e.g. MH12 AB 4521" placeholderTextColor="#94a3b8" className={inputClass} />
                </View>

                <View>
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Assigned Driver</Text>
                  <SelectField
                    value={truckForm.driver_user_id}
                    onValueChange={v => setTruckForm({ ...truckForm, driver_user_id: v })}
                    options={truckFormDriverOptions}
                    title="Select Driver"
                    className={inputClass + ' flex-row items-center justify-between'}
                  />
                  {driverOptions.length === 0 && (
                    <Text className="text-[10px] text-amber-600 mt-1">No salesperson accounts available to assign as driver.</Text>
                  )}
                </View>

                <View>
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Route</Text>
                  <TextInput value={truckForm.route} onChangeText={v => setTruckForm({ ...truckForm, route: v })} placeholder="e.g. Route A - Deccan & Kothrud" placeholderTextColor="#94a3b8" className={inputClass} />
                </View>

                <View>
                  <Text className="font-bold text-slate-500 mb-1 text-xs">Area</Text>
                  <TextInput value={truckForm.area} onChangeText={v => setTruckForm({ ...truckForm, area: v })} placeholder="e.g. Deccan Gymkhana / Kothrud" placeholderTextColor="#94a3b8" className={inputClass} />
                </View>

                <Pressable onPress={handleSaveTruck} className="w-full py-2 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
                  <Text className="text-white font-bold text-[11px]">{truckFormMode === 'add' ? 'Confirm Add Truck' : 'Save Truck Changes'}</Text>
                </Pressable>
              </>
            )}
          </View>

          {truckFormMode === 'list' && (
          <View className="gap-4 xl:flex-row xl:items-start">
          <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3 xl:flex-1">
            <View className="border-b border-slate-100 pb-2">
              <Text className="font-bold text-slate-800 text-xs">Load Cargo Stock: Warehouse to Truck</Text>
              <Text className="text-[10px] text-slate-400 font-medium">Select a vehicle and add multiple products to load them simultaneously.</Text>
            </View>

            <View>
              <Text className="font-extrabold text-slate-500 mb-1 text-xs">Target Dispatch Truck</Text>
              <SelectField value={dispatchTruckId} onValueChange={setDispatchTruckId} options={truckOptions} title="Select Truck" className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
            </View>

            {(() => {
              const dispatchDriverId = data.trucks.find(t => t.id === dispatchTruckId)?.driver_user_id;
              const allPendingPreBookings = (data.preBookingOrders || []).filter(pb => pb.status === 'Booked');
              if (allPendingPreBookings.length === 0) return null;
              const pendingPreBookings = [...allPendingPreBookings].sort((a, b) => {
                const aMatch = a.salesperson_id === dispatchDriverId ? 0 : 1;
                const bMatch = b.salesperson_id === dispatchDriverId ? 0 : 1;
                return aMatch - bMatch;
              });
              const totalUnits = pendingPreBookings.reduce((sum, pb) => sum + pb.items.reduce((s, i) => s + i.quantity, 0), 0);
              return (
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 gap-2">
                  <Pressable onPress={() => setShowDispatchPreBookings(!showDispatchPreBookings)} className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2 flex-1">
                      <ClipboardList size={16} color="#b45309" />
                      <Text className="text-[11px] font-bold text-amber-800 flex-1">
                        {pendingPreBookings.length} pre-booked order(s) ({totalUnits} units) still reserved and waiting to be loaded onto a truck - don't forget to dispatch this cargo!
                      </Text>
                    </View>
                    <Text className="text-[10px] font-bold text-amber-700 underline">{showDispatchPreBookings ? 'Hide' : 'View Details'}</Text>
                  </Pressable>

                  {showDispatchPreBookings && (
                    <View className="gap-2 pt-1 border-t border-amber-200">
                      {pendingPreBookings.map(pb => {
                        const store = data.stores.find(s => s.id === pb.store_id);
                        const bookedBy = resolveActor(data.users, pb.salesperson_id);
                        const isForSelectedTruck = pb.salesperson_id === dispatchDriverId;
                        return (
                          <View key={pb.id} className={`bg-white rounded-lg p-2.5 border gap-1.5 ${isForSelectedTruck ? 'border-amber-300' : 'border-amber-100'}`}>
                            <View className="flex-row items-center justify-between">
                              <Text className="font-bold text-slate-800 text-[11px]">{store?.name || 'Unknown Store'}</Text>
                              <Text className="text-[9px] text-slate-400">Scheduled: {pb.scheduled_delivery_date}</Text>
                            </View>
                            <View className="flex-row items-center gap-1.5 flex-wrap">
                              <Text className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Booked by: {bookedBy.name} ({bookedBy.role})</Text>
                              {isForSelectedTruck && (
                                <Text className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Matches selected truck's driver</Text>
                              )}
                            </View>
                            {pb.items.map((item, idx) => {
                              const product = data.products.find(p => p.id === item.product_id);
                              const alreadyAdded = dispatchItems.some(di => di.product_id === item.product_id && di.preBookingId === pb.id);
                              return (
                                <View key={idx} className="flex-row items-center justify-between bg-slate-50 rounded-lg px-2 py-1">
                                  <Text className="text-[10px] text-slate-600 flex-1">{product?.name || item.product_id} x {item.quantity}</Text>
                                  <Pressable
                                    onPress={() => !alreadyAdded && handleAddPreBookingItemToDispatch(item.product_id, item.quantity, pb.id)}
                                    disabled={alreadyAdded}
                                    className={`py-0.5 px-2 rounded border ${alreadyAdded ? 'bg-slate-100 border-slate-200' : 'bg-indigo-50 border-indigo-200 active:bg-indigo-100'}`}
                                  >
                                    <Text className={`text-[9px] font-extrabold ${alreadyAdded ? 'text-slate-400' : 'text-indigo-700'}`}>{alreadyAdded ? 'Added ✓' : '+ Add to Truck'}</Text>
                                  </Pressable>
                                </View>
                              );
                            })}
                            {(() => {
                              const allAdded = pb.items.every(item => dispatchItems.some(di => di.product_id === item.product_id && di.preBookingId === pb.id));
                              return (
                                <Pressable
                                  onPress={() => !allAdded && handleAddAllPreBookingItemsToDispatch(pb.items, pb.id)}
                                  disabled={allAdded}
                                  className={`mt-1 py-1.5 rounded-lg items-center ${allAdded ? 'bg-slate-200' : 'bg-amber-600 active:bg-amber-700'}`}
                                >
                                  <Text className={`text-[10px] font-bold ${allAdded ? 'text-slate-500' : 'text-white'}`}>{allAdded ? 'All Items Added ✓' : '+ Add All Items For This Order'}</Text>
                                </Pressable>
                              );
                            })()}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}

            <View className="gap-3">
              <Text className="font-extrabold text-slate-500 text-xs">Products to Dispatch</Text>
              {dispatchItems.length === 0 && (
                <View className="py-6 items-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <Text className="text-slate-400 text-[11px] font-semibold">No products added yet.</Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">Tap "+ Add Another Product" below, or add pre-booked items from the reminder above.</Text>
                </View>
              )}
              {dispatchItems.map((item, index) => {
                const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === item.product_id);
                const maxAllowedStock = warehouseInv ? (item.source === 'reserved_qty' ? warehouseInv.reserved_qty : warehouseInv.available_qty) : 0;
                const isEmpty = maxAllowedStock <= 0;
                return (
                  <View key={index} className="gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <SelectField
                      value={item.product_id}
                      onValueChange={v => updateDispatchItem(index, 'product_id', v)}
                      options={data.products.filter(p => p.status === 'Active' || p.id === item.product_id).map(p => {
                        const pInv = data.warehouse_inventory.find(inv => inv.product_id === p.id);
                        const pQty = pInv ? (item.source === 'reserved_qty' ? pInv.reserved_qty : pInv.available_qty) : 0;
                        return { label: `${p.name} (${pQty === 0 ? 'Out of stock' : pQty + ' in pool'})`, value: p.id };
                      })}
                      title="Select Product"
                      className={`bg-white border rounded-lg p-1.5 flex-row items-center justify-between ${isEmpty ? 'border-rose-300' : 'border-slate-200'}`}
                    />
                    <View className="flex-row items-center gap-1.5">
                      <View className="flex-1">
                        <SelectField
                          value={item.source}
                          onValueChange={v => updateDispatchItem(index, 'source', v)}
                          options={[
                            { label: `Available Pool (${warehouseInv?.available_qty || 0})`, value: 'available_qty' },
                            { label: `Reserved Pool (${warehouseInv?.reserved_qty || 0})`, value: 'reserved_qty' },
                          ]}
                          title="Select Pool"
                          className="bg-white border border-slate-200 rounded-lg p-1.5 flex-row items-center justify-between"
                        />
                      </View>
                      <TextInput
                        keyboardType="number-pad"
                        value={String(item.qty)}
                        onChangeText={v => updateDispatchItem(index, 'qty', v)}
                        className={`w-16 bg-white border rounded-lg p-1.5 text-xs text-center font-extrabold ${isEmpty ? 'border-rose-300 text-rose-600' : 'border-slate-200 text-slate-800'}`}
                      />
                      <Pressable onPress={() => removeDispatchItem(index)} className="p-2 active:bg-rose-50 rounded-lg">
                        <Trash2 size={16} color="#f43f5e" />
                      </Pressable>
                    </View>
                    {isEmpty ? (
                      <View className="flex-row items-center gap-1 px-1.5 py-1 bg-rose-50 rounded-md border border-rose-100 self-start">
                        <AlertTriangle size={12} color="#e11d48" />
                        <Text className="text-[10px] text-rose-600 font-extrabold">Selected pool is empty for this product!</Text>
                      </View>
                    ) : (
                      <Text className="text-[10px] text-slate-400 font-bold px-1">Available in Selected Pool: <Text className="text-slate-600">{maxAllowedStock}</Text></Text>
                    )}
                  </View>
                );
              })}
            </View>

            <View className="flex-row justify-between items-center pt-2">
              <Pressable onPress={addDispatchItem} disabled={dispatchItems.length >= data.products.length} className="py-1 px-3 bg-slate-100 rounded-lg active:bg-slate-200">
                <Text className="text-slate-700 font-extrabold text-[10px]">+ Add Another Product</Text>
              </Pressable>
              <Text className="text-[10px] font-bold text-slate-400">{dispatchItems.length} item(s) in queue</Text>
            </View>

            <Pressable onPress={handleLoadStock} disabled={dispatchItems.length === 0} className={`w-full py-2 rounded-lg items-center ${dispatchItems.length === 0 ? 'bg-rose-200' : 'bg-rose-500 active:bg-rose-600'}`}>
              <Text className="text-white font-bold text-xs">Dispatch Cargo Load to Vehicle</Text>
            </Pressable>
          </View>

          <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3 xl:flex-1">
            <View className="border-b border-slate-100 pb-2">
              <Text className="font-bold text-slate-800 text-xs">Inter-Truck Stock Transfer</Text>
              <Text className="text-[10px] text-slate-400 font-medium">Select source and destination vehicles to transfer multiple products directly.</Text>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-extrabold text-slate-500 mb-1 text-xs">From Source Truck</Text>
                <SelectField value={swapFromTruckId} onValueChange={setSwapFromTruckId} options={truckOptions} title="From Truck" className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold text-slate-500 mb-1 text-xs">To Destination Truck</Text>
                <SelectField value={swapToTruckId} onValueChange={setSwapToTruckId} options={truckOptions} title="To Truck" className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
              </View>
            </View>

            <View className="gap-3">
              <Text className="font-extrabold text-slate-500 text-xs">Products to Swap/Transfer</Text>
              {swapItems.length === 0 ? (
                <View className="p-4 rounded-xl border border-dashed border-amber-200 bg-amber-50 items-center gap-1">
                  <Text className="font-extrabold text-xs text-amber-700">No Cargo Available on Source Truck</Text>
                  <Text className="text-[10px] text-amber-600 font-medium text-center">Selected source truck has no products in its current inventory to transfer.</Text>
                </View>
              ) : (
                swapItems.map((item, index) => {
                  const sourceInv = data.truck_inventory.find(ti => ti.truck_id === swapFromTruckId && ti.product_id === item.product_id);
                  const availableOnSource = sourceInv ? sourceInv.quantity : 0;
                  const isEmpty = availableOnSource <= 0;
                  const availableItems = data.truck_inventory.filter(ti => ti.truck_id === swapFromTruckId && ti.quantity > 0);
                  return (
                    <View key={index} className="gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <SelectField
                        value={item.product_id}
                        onValueChange={v => updateSwapItem(index, 'product_id', v)}
                        options={availableItems.map(ti => {
                          const p = data.products.find(pp => pp.id === ti.product_id);
                          return { label: `${p?.name || 'Product'} (${ti.quantity} loaded)`, value: ti.product_id };
                        })}
                        title="Select Product"
                        className={`bg-white border rounded-lg p-1.5 flex-row items-center justify-between ${isEmpty ? 'border-rose-300' : 'border-slate-200'}`}
                      />
                      <View className="flex-row items-center gap-2">
                        <TextInput
                          keyboardType="number-pad"
                          value={String(item.qty)}
                          onChangeText={v => updateSwapItem(index, 'qty', v)}
                          className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-extrabold text-slate-800"
                        />
                        <Pressable onPress={() => removeSwapItem(index)} disabled={swapItems.length <= 1} className="p-2 active:bg-rose-50 rounded-lg">
                          <Trash2 size={16} color={swapItems.length <= 1 ? '#cbd5e1' : '#f43f5e'} />
                        </Pressable>
                      </View>
                      <Text className="text-[10px] text-slate-400 font-bold px-1">Loaded on Source Truck: <Text className="text-slate-600">{availableOnSource}</Text></Text>
                    </View>
                  );
                })
              )}
            </View>

            <View className="flex-row justify-between items-center pt-2">
              <Pressable
                onPress={addSwapItem}
                disabled={swapItems.length === 0 || swapItems.length >= data.truck_inventory.filter(ti => ti.truck_id === swapFromTruckId && ti.quantity > 0).length}
                className="py-1 px-3 bg-slate-100 rounded-lg active:bg-slate-200"
              >
                <Text className="text-slate-700 font-extrabold text-[10px]">+ Add Another Product</Text>
              </Pressable>
              <Text className="text-[10px] font-bold text-slate-400">{swapItems.length} item(s) in queue</Text>
            </View>

            <Pressable onPress={handleTruckToTruckTransfer} disabled={swapItems.length === 0} className={`w-full py-2 rounded-lg items-center ${swapItems.length === 0 ? 'bg-indigo-300' : 'bg-indigo-500 active:bg-indigo-600'}`}>
              <Text className="text-white font-bold text-xs">Confirm Inter-Truck Cargo Swap</Text>
            </Pressable>
          </View>
          </View>
          )}
        </View>
      ) : (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-bold text-slate-800 text-xs">Inventory Logistics Audit Trail</Text>
            <Text className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold uppercase">SECURED</Text>
          </View>
          <View className="gap-2 md:flex-row md:flex-wrap">
            {data.auditLogs.map(l => {
              const actor = l.user_name && l.user_role ? { name: l.user_name, role: l.user_role } : resolveActor(data.users, l.user_id);
              return (
              <View key={l.id} className="w-full md:w-[48%] xl:w-[32%] p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex-row items-start gap-2">
                <View className="p-1 bg-indigo-50 rounded mt-0.5">
                  <ClipboardList size={14} color="#6366f1" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-1">
                    <Text className="font-bold text-indigo-600 uppercase text-[9px]">{l.action}</Text>
                    <Text className="text-[8px] text-slate-400">{new Date(l.timestamp).toLocaleTimeString()}</Text>
                  </View>
                  <Text className="text-slate-700 mt-1 font-medium leading-relaxed text-[10px]">{l.details}</Text>
                  <Text className="text-[8px] text-slate-400 mt-0.5 uppercase">By: {actor.role} - {actor.name}</Text>
                </View>
              </View>
              );
            })}
          </View>
        </View>
      )}

      <ConfirmModal
        visible={showReturnAllConfirm}
        onClose={() => setShowReturnAllConfirm(false)}
        icon={RotateCcw}
        title="Return All Products?"
        message="Are you sure you want to return ALL loaded products from this delivery truck back to the warehouse inventory? This cannot be undone."
        confirmLabel="Yes, Return All Stock"
        onConfirm={() => { handleReturnAllProducts(activeTruckId); setShowReturnAllConfirm(false); }}
      />

      <ConfirmModal
        visible={showNoSupplierWarning}
        onClose={() => setShowNoSupplierWarning(false)}
        icon={TruckIcon}
        title="No Registered Suppliers"
        message="You cannot receive new stock because there are no suppliers registered in the system. Please register a supply chain partner with name, contact, and address details first."
        confirmLabel="+ Register Supplier Now"
        onConfirm={() => { setShowNoSupplierWarning(false); setActiveScreen?.('Suppliers'); }}
      />

      <ConfirmModal
        visible={!!deleteTruckConfirmId}
        onClose={() => setDeleteTruckConfirmId(null)}
        icon={Trash2}
        iconBg="bg-rose-50"
        iconColor="#e11d48"
        title="Remove Truck?"
        message={`Are you sure you want to remove "${data.trucks.find(t => t.id === deleteTruckConfirmId)?.vehicle_number || 'this truck'}" from the active fleet? It will be hidden from dispatch/transfer selection but its history is preserved and it can be reactivated later.`}
        confirmLabel="Yes, Remove Truck"
        confirmColor="bg-rose-600"
        onConfirm={handleConfirmDeleteTruck}
      />

      <Modal transparent visible={showResetModal} animationType="fade" onRequestClose={() => { setShowResetModal(false); setConfirmResetType('none'); }}>
        <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
          <View className="bg-white w-full max-w-md rounded-3xl p-6 relative">
            <Pressable onPress={() => { setShowResetModal(false); setConfirmResetType('none'); }} className="absolute top-4 right-4 p-1 z-10" hitSlop={8}>
              <X size={16} color="#94a3b8" />
            </Pressable>

            {confirmResetType === 'none' ? (
              <View className="items-center mt-2">
                <View className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-full items-center justify-center mb-4">
                  <AlertTriangle size={24} color="#d97706" />
                </View>
                <Text className="text-base font-black text-slate-800 tracking-tight text-center">Temporary Developer Reset</Text>
                <Text className="text-slate-500 font-semibold mt-2 text-center leading-relaxed text-xs">
                  Choose an action to clear values and start with a fresh blank setup. This action requires confirmation.
                </Text>

                <View className="w-full gap-3.5 mt-5">
                  <Pressable onPress={() => setConfirmResetType('clear_stock')} className="w-full p-3 rounded-2xl bg-amber-50 border border-amber-200 active:bg-amber-100">
                    <Text className="font-extrabold text-amber-800 text-[11px] uppercase">Empty Warehouse Stock to Zero</Text>
                    <Text className="text-[10px] text-amber-600 font-medium mt-1 leading-normal">
                      This sets available, reserved, damaged, and expired stock of all ice cream flavors to 0.
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmResetType('factory_reset')} className="w-full p-3 rounded-2xl bg-rose-50 border border-rose-200 active:bg-rose-100">
                    <Text className="font-extrabold text-rose-800 text-[11px] uppercase">Full System Database Reset</Text>
                    <Text className="text-[10px] text-rose-600 font-medium mt-1 leading-normal">
                      This wipes all orders, dispatches, invoices, payments, registered stores, registered suppliers, and resets all stock levels to 0.
                    </Text>
                  </Pressable>
                </View>

                <Pressable onPress={() => setShowResetModal(false)} className="w-full mt-4 py-2 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                  <Text className="text-slate-700 font-extrabold text-xs">Cancel and Keep Data</Text>
                </Pressable>
              </View>
            ) : confirmResetType === 'clear_stock' ? (
              <View className="items-center mt-2">
                <View className="w-14 h-14 bg-amber-500 rounded-full items-center justify-center mb-4">
                  <AlertTriangle size={24} color="#fff" />
                </View>
                <Text className="text-base font-black text-amber-800 tracking-tight text-center">Double Confirmation Required</Text>
                <Text className="text-slate-500 font-semibold mt-2 text-center leading-relaxed text-xs">
                  Are you sure you want to empty all warehouse stock quantities to zero? This clears available, reserved, damaged, and expired quantities for every product, and will flag every product as out of stock.
                </Text>
                <View className="w-full gap-2 mt-5">
                  <Pressable onPress={handleClearWarehouseStock} className="w-full py-2.5 bg-amber-500 rounded-xl items-center active:bg-amber-600">
                    <Text className="text-white font-black text-xs">Yes, Set All Stock to Zero</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmResetType('none')} className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                    <Text className="text-slate-700 font-black text-xs">No, Go Back</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="items-center mt-2">
                <View className="w-14 h-14 bg-rose-600 rounded-full items-center justify-center mb-4">
                  <AlertTriangle size={24} color="#fff" />
                </View>
                <Text className="text-base font-black text-rose-800 tracking-tight text-center">CRITICAL: SYSTEM FACTORY RESET</Text>
                <Text className="text-slate-600 font-bold mt-2 text-center leading-relaxed text-xs">
                  This action is irreversible. All transactions, invoices, customer shops, supplier registries, and histories will be permanently wiped.
                </Text>
                <View className="w-full gap-2 mt-5">
                  <Pressable onPress={handleFactoryResetAllData} className="w-full py-2.5 bg-rose-600 rounded-xl items-center active:bg-rose-700">
                    <Text className="text-white font-black text-xs">Yes, Wipe and Start Fresh</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmResetType('none')} className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                    <Text className="text-slate-700 font-black text-xs">No, Go Back</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
