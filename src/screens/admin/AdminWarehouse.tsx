import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import { Shield, AlertTriangle, RefreshCw, ClipboardList, Trash2, Truck as TruckIcon, RotateCcw, X } from 'lucide-react-native';
import { ERPData, logAudit, resolveActor } from '../../storage';
import { Product, AppNotification } from '../../types';
import SelectField from '../../components/common/SelectField';
import ConfirmModal from '../../components/common/ConfirmModal';

interface AdminWarehouseProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  currentUser: any;
  activeScreen?: string;
  setActiveScreen?: (screen: any) => void;
  showAlert: (opts: any) => void;
  hideAdminControls?: boolean;
}

export default function AdminWarehouse({ data, setData, addNotification, currentUser, activeScreen, setActiveScreen, showAlert, hideAdminControls = false }: AdminWarehouseProps) {
  const [activeTab, setActiveTab] = useState<'warehouse' | 'trucks' | 'transfers' | 'audits'>('warehouse');

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
  const [dispatchItems, setDispatchItems] = useState<{ product_id: string; qty: number; source: 'available_qty' | 'reserved_qty' }[]>([
    { product_id: data.products[0]?.id || '', qty: 50, source: 'available_qty' }
  ]);

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

  const handleClearWarehouseStock = () => {
    const updatedInventory = data.warehouse_inventory.map(inv => ({ ...inv, available_qty: 0, reserved_qty: 0, damaged_qty: 0, expired_qty: 0 }));
    let tempState = { ...data, warehouse_inventory: updatedInventory };
    tempState = logAudit(tempState, 'STOCK_RESET_ZERO', 'Warehouse', 'all', currentUser?.id || 'admin', 'Manually cleared all warehouse inventory levels to zero');
    setData(tempState);
    addNotification('stock_update', 'Warehouse stock was manually cleared: available, reserved, damaged, and expired quantities were all reset to zero for every product.');
    setConfirmResetType('none');
    setShowResetModal(false);
  };

  const handleFactoryResetAllData = () => {
    const clearedInventory = data.products.map(p => ({ product_id: p.id, available_qty: 0, reserved_qty: 0, damaged_qty: 0, expired_qty: 0 }));
    const resetActor = resolveActor(data.users, currentUser?.id || 'admin');
    const emptyState: ERPData = {
      ...data, warehouse_inventory: clearedInventory, truck_inventory: [], orders: [], invoices: [], payments: [],
      purchases: [], visits: [], preBookingOrders: [], syncQueue: [], stores: [], suppliers: [], notifications: [],
      auditLogs: [{
        id: 'audit_reset_' + Date.now(), action: 'FACTORY_RESET', entity_type: 'System', entity_id: 'all',
        user_id: currentUser?.id || 'admin', user_name: resetActor.name, user_role: resetActor.role, timestamp: new Date().toISOString(),
        details: 'Performed factory reset. All databases cleared for a completely new, empty setup.'
      }]
    };
    setData(emptyState);
    addNotification('system', 'Factory reset performed: all orders, invoices, payments, stores, and suppliers were permanently wiped. This cannot be undone.');
    setConfirmResetType('none');
    setShowResetModal(false);
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

  const handleSavePurchase = () => {
    if (!purchaseForm.invoice_number) {
      showAlert('Supplier invoice number is required.');
      return;
    }
    const newPurchase = { id: 'pur_' + Date.now(), supplier_id: purchaseForm.supplier_id, invoice_number: purchaseForm.invoice_number, date: purchaseForm.date, items: purchaseForm.items };
    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      const match = purchaseForm.items.find(item => item.product_id === inv.product_id);
      return match ? { ...inv, available_qty: inv.available_qty + Number(match.quantity) } : inv;
    });
    let tempState = { ...data, purchases: [newPurchase, ...data.purchases], warehouse_inventory: updatedWarehouse };
    const suppName = data.suppliers.find(s => s.id === purchaseForm.supplier_id)?.name || 'Supplier';
    tempState = logAudit(tempState, 'STOCK_RECEIVE', 'Warehouse', newPurchase.id, currentUser?.id || 'admin', `Received inward cargo of ${purchaseForm.items.reduce((s, i) => s + Number(i.quantity), 0)} items from ${suppName}`);
    setData(tempState);
    addNotification('stock_update', `Stock inward received from ${suppName}: warehouse quantities updated.`);
    setWarehouseForm('list');
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
    if (dispatchItems.length <= 1) return;
    setDispatchItems(dispatchItems.filter((_, i) => i !== index));
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

  const handleStockAdjustment = () => {
    const targetProdId = adjustForm.product_id;
    const targetProdName = data.products.find(p => p.id === targetProdId)?.name || 'Product';
    const isSubtract = adjustForm.direction === 'subtract';
    const finalAdjustText = isSubtract ? `-${adjustForm.qty}` : `+${adjustForm.qty}`;

    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      if (inv.product_id === targetProdId) {
        const rawQty = Number(adjustForm.qty);
        const adjustVal = isSubtract ? -rawQty : rawQty;
        let updatedVal = { ...inv };
        if (adjustForm.type === 'available_qty') updatedVal.available_qty = Math.max(0, updatedVal.available_qty + adjustVal);
        else if (adjustForm.type === 'reserved_qty') updatedVal.reserved_qty = Math.max(0, (updatedVal.reserved_qty || 0) + adjustVal);
        else if (adjustForm.type === 'damaged_qty') updatedVal.damaged_qty = Math.max(0, (updatedVal.damaged_qty || 0) + adjustVal);
        else if (adjustForm.type === 'expired_qty') updatedVal.expired_qty = Math.max(0, (updatedVal.expired_qty || 0) + adjustVal);
        return updatedVal;
      }
      return inv;
    });

    let tempState = { ...data, warehouse_inventory: updatedWarehouse };
    const details = `Stock Adjustment for ${targetProdName}: Changed ${adjustForm.type.replace('_', ' ')} by quantity ${finalAdjustText}. Reason: ${adjustForm.reason}`;
    tempState = logAudit(tempState, 'STOCK_ADJUST', 'Warehouse', targetProdId, currentUser?.id || 'admin', details);
    setData(tempState);
    showAlert('Warehouse stock adjusted and audit logs recorded.');
  };

  const handleLoadStock = () => {
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
      const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === item.product_id);
      const prodName = data.products.find(p => p.id === item.product_id)?.name || 'Product';
      const available = warehouseInv ? (item.source === 'reserved_qty' ? warehouseInv.reserved_qty : warehouseInv.available_qty) : 0;
      if (q > available) {
        showAlert(`Insufficient ${item.source === 'reserved_qty' ? 'reserved' : 'available'} warehouse stock! Only ${available} units of ${prodName} are available in that pool (Requested: ${q}).`);
        return;
      }
    }

    const truckNum = data.trucks.find(t => t.id === dispatchTruckId)?.vehicle_number || 'Truck';
    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      const matchedDispatches = dispatchItems.filter(item => item.product_id === inv.product_id);
      if (matchedDispatches.length > 0) {
        let updatedInv = { ...inv };
        for (const item of matchedDispatches) {
          if (item.source === 'reserved_qty') updatedInv.reserved_qty = Math.max(0, updatedInv.reserved_qty - item.qty);
          else updatedInv.available_qty = Math.max(0, updatedInv.available_qty - item.qty);
        }
        return updatedInv;
      }
      return inv;
    });

    let updatedTruckInventory = [...data.truck_inventory];
    for (const item of dispatchItems) {
      const matchIdx = updatedTruckInventory.findIndex(ti => ti.truck_id === dispatchTruckId && ti.product_id === item.product_id);
      if (matchIdx >= 0) updatedTruckInventory[matchIdx] = { ...updatedTruckInventory[matchIdx], quantity: updatedTruckInventory[matchIdx].quantity + item.qty };
      else updatedTruckInventory.push({ truck_id: dispatchTruckId, product_id: item.product_id, quantity: item.qty });
    }

    let tempState = { ...data, warehouse_inventory: updatedWarehouse, truck_inventory: updatedTruckInventory };
    const itemSummaries = dispatchItems.map(item => {
      const prodName = data.products.find(p => p.id === item.product_id)?.name || 'Product';
      return `${item.qty} units of ${prodName} (${item.source === 'reserved_qty' ? 'Reserved Pool' : 'Available Pool'})`;
    }).join(', ');
    const details = `Warehouse -> Truck Cargo Dispatch: Transferred batch containing [${itemSummaries}] to Truck ${truckNum}`;
    tempState = logAudit(tempState, 'LOAD_TRUCK', 'Truck', dispatchTruckId, currentUser?.id || 'admin', details);

    setData(tempState);
    addNotification('delivery', `Truck Batch Loaded: Loaded ${dispatchItems.length} product(s) onto vehicle ${truckNum}`);
    showAlert('Stock batch loaded successfully to truck inventory.');
    setDispatchItems([{ product_id: data.products[0]?.id || '', qty: 50, source: 'available_qty' }]);
  };

  const handleReturnStock = (truckId: string, productId: string, qty: number) => {
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
      const stateClone = JSON.parse(JSON.stringify(data)) as ERPData;
      const truckInv = stateClone.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === productId);
      if (!truckInv) throw new Error('This product is not loaded on this truck.');
      const currentQty = Number(truckInv.quantity);
      if (returnQty > currentQty) throw new Error(`Cannot return ${returnQty} units. Only ${currentQty} units are currently loaded on this truck.`);

      stateClone.truck_inventory = stateClone.truck_inventory.map(ti => {
        if (ti.truck_id === truckId && ti.product_id === productId) return { ...ti, quantity: Math.max(0, currentQty - returnQty) };
        return ti;
      }).filter(ti => Number(ti.quantity) > 0);

      let found = false;
      stateClone.warehouse_inventory = stateClone.warehouse_inventory.map(inv => {
        if (inv.product_id === productId) { found = true; return { ...inv, available_qty: Number(inv.available_qty) + returnQty }; }
        return inv;
      });
      if (!found) stateClone.warehouse_inventory.push({ product_id: productId, available_qty: returnQty, reserved_qty: 0, damaged_qty: 0, expired_qty: 0 });

      const prodName = stateClone.products.find(p => p.id === productId)?.name || 'Product';
      const truckNum = stateClone.trucks.find(t => t.id === truckId)?.vehicle_number || 'Truck';
      const details = `Truck -> Warehouse Return Load: Recalled ${returnQty} units of unsold ${prodName} back from Truck ${truckNum}`;
      let finalState = logAudit(stateClone, 'RETURN_TRUCK', 'Warehouse', truckId, currentUser?.id || 'admin', details);

      setData(finalState);
      addNotification('delivery', `Stock returned: recalled ${returnQty} units of ${prodName} from ${truckNum}`);
      showAlert('Stock successfully returned to warehouse.');
    } catch (error: any) {
      showAlert(`Transaction failed: ${error.message}. All changes rolled back.`);
    }
  };

  const handleReturnAllProducts = (truckId: string) => {
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
      const stateClone = JSON.parse(JSON.stringify(data)) as ERPData;
      let returnedCount = 0;
      let detailsList: string[] = [];

      for (const cargo of truckCargo) {
        const qty = Number(cargo.quantity);
        if (isNaN(qty) || qty <= 0) continue;
        let found = false;
        stateClone.warehouse_inventory = stateClone.warehouse_inventory.map(inv => {
          if (inv.product_id === cargo.product_id) { found = true; return { ...inv, available_qty: Number(inv.available_qty) + qty }; }
          return inv;
        });
        if (!found) stateClone.warehouse_inventory.push({ product_id: cargo.product_id, available_qty: qty, reserved_qty: 0, damaged_qty: 0, expired_qty: 0 });
        const prodName = stateClone.products.find(p => p.id === cargo.product_id)?.name || 'Product';
        detailsList.push(`${qty} units of ${prodName}`);
        returnedCount += qty;
      }

      stateClone.truck_inventory = stateClone.truck_inventory.filter(ti => ti.truck_id !== truckId);
      const truckNum = stateClone.trucks.find(t => t.id === truckId)?.vehicle_number || 'Truck';
      const details = `Truck -> Warehouse Return Load (ALL): Recalled all cargo stock (${detailsList.join(', ')}) back from Truck ${truckNum}`;
      let finalState = logAudit(stateClone, 'RETURN_TRUCK_ALL', 'Warehouse', truckId, currentUser?.id || 'admin', details);

      setData(finalState);
      addNotification('delivery', `Stock returned: recalled ALL (${returnedCount} units) products from Truck ${truckNum}`);
      showAlert(`Successfully returned all ${returnedCount} units back to the warehouse.`);
    } catch (error: any) {
      showAlert(`Transaction failed: ${error.message}. All changes rolled back.`);
    }
  };

  const handleTruckToTruckTransfer = () => {
    if (swapFromTruckId === swapToTruckId) {
      showAlert('Source and destination trucks must be different.');
      return;
    }
    if (swapItems.length === 0) {
      showAlert('Please add at least one item to transfer.');
      return;
    }

    const productQtyMap = new Map<string, number>();
    for (const item of swapItems) {
      const q = Number(item.qty);
      if (isNaN(q) || q <= 0) {
        showAlert('All transfer quantities must be greater than zero.');
        return;
      }
      productQtyMap.set(item.product_id, (productQtyMap.get(item.product_id) || 0) + q);
    }

    const sourceNum = data.trucks.find(t => t.id === swapFromTruckId)?.vehicle_number || 'Truck A';
    const destNum = data.trucks.find(t => t.id === swapToTruckId)?.vehicle_number || 'Truck B';

    for (const [product_id, transferQty] of productQtyMap.entries()) {
      const sourceInv = data.truck_inventory.find(ti => ti.truck_id === swapFromTruckId && ti.product_id === product_id);
      const prodName = data.products.find(p => p.id === product_id)?.name || 'Product';
      if (!sourceInv || sourceInv.quantity < transferQty) {
        showAlert(`Insufficient stock on source truck! Only ${sourceInv?.quantity || 0} units of ${prodName} exist on vehicle ${sourceNum} (Requested total: ${transferQty}).`);
        return;
      }
    }

    let updatedTruckInv = [...data.truck_inventory];
    for (const [product_id, transferQty] of productQtyMap.entries()) {
      updatedTruckInv = updatedTruckInv.map(ti => {
        if (ti.truck_id === swapFromTruckId && ti.product_id === product_id) return { ...ti, quantity: ti.quantity - transferQty };
        return ti;
      }).filter(ti => ti.quantity > 0);

      const matchIdx = updatedTruckInv.findIndex(ti => ti.truck_id === swapToTruckId && ti.product_id === product_id);
      if (matchIdx >= 0) updatedTruckInv[matchIdx] = { ...updatedTruckInv[matchIdx], quantity: updatedTruckInv[matchIdx].quantity + transferQty };
      else updatedTruckInv.push({ truck_id: swapToTruckId, product_id, quantity: transferQty });
    }

    let tempState = { ...data, truck_inventory: updatedTruckInv };
    const itemSummaries = Array.from(productQtyMap.entries()).map(([product_id, qty]) => {
      const prodName = data.products.find(p => p.id === product_id)?.name || 'Product';
      return `${qty} units of ${prodName}`;
    }).join(', ');
    const details = `Vehicle Inter-Transfer: Moved batch containing [${itemSummaries}] from Truck ${sourceNum} to Truck ${destNum}`;
    tempState = logAudit(tempState, 'TRANSFER_TRUCK', 'Truck', swapFromTruckId, currentUser?.id || 'admin', details);

    setData(tempState);
    addNotification('delivery', `Inter-truck stock batch transfer: Moved ${swapItems.length} product(s) from ${sourceNum} to ${destNum}`);
    showAlert('Inter-truck batch transfer successful!');
    setSwapItems([{ product_id: data.products[0]?.id || '', qty: 10 }]);
  };

  const productOptions = data.products.map(p => ({ label: p.name, value: p.id }));
  const truckOptions = data.trucks.map(t => ({ label: `${t.vehicle_number} (${t.area})`, value: t.id }));
  const supplierOptions = data.suppliers.map(s => ({ label: s.name, value: s.id }));
  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800";

  if (warehouseForm === 'receive_stock') {
    return (
      <View className="gap-4">
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-4">
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

          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-bold text-slate-600 uppercase tracking-wider text-[10px]">Cargos Manifest</Text>
              <Pressable onPress={handleAddPurchaseItem}><Text className="text-rose-500 font-extrabold text-[10px]">+ Add Another Product</Text></Pressable>
            </View>

            {purchaseForm.items.map((item, index) => (
              <View key={index} className="bg-white border border-slate-200 p-3 rounded-xl gap-3 relative">
                {purchaseForm.items.length > 1 && (
                  <Pressable onPress={() => handleRemovePurchaseItem(index)} className="absolute top-2.5 right-2.5 z-10">
                    <Text className="text-slate-400 font-extrabold text-[11px]">Remove</Text>
                  </Pressable>
                )}
                <View>
                  <Text className="font-bold text-slate-400 text-[9px] mb-1">Ice Cream Item</Text>
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
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="font-bold text-slate-400 text-[9px] mb-1">Inward Qty</Text>
                    <TextInput
                      keyboardType="number-pad"
                      value={String(item.quantity)}
                      onChangeText={v => { const newItems = [...purchaseForm.items]; newItems[index].quantity = Number(v) || 0; setPurchaseForm({ ...purchaseForm, items: newItems }); }}
                      className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-slate-400 text-[9px] mb-1">Price (Rs)</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      value={String(item.purchase_price)}
                      onChangeText={v => { const newItems = [...purchaseForm.items]; newItems[index].purchase_price = Number(v) || 0; setPurchaseForm({ ...purchaseForm, items: newItems }); }}
                      className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center"
                    />
                  </View>
                </View>
                <View className="flex-row gap-2 pt-1 border-t border-slate-100">
                  <View className="flex-1">
                    <Text className="font-bold text-slate-400 text-[9px] mb-1">Mfg Date</Text>
                    <TextInput value={item.mfg_date || ''} onChangeText={v => { const newItems = [...purchaseForm.items]; newItems[index].mfg_date = v; setPurchaseForm({ ...purchaseForm, items: newItems }); }} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-slate-400 text-[9px] mb-1">Expiry Date</Text>
                    <TextInput value={item.expiry_date || ''} onChangeText={v => { const newItems = [...purchaseForm.items]; newItems[index].expiry_date = v; setPurchaseForm({ ...purchaseForm, items: newItems }); }} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs" />
                  </View>
                </View>
              </View>
            ))}
          </View>

          <Pressable onPress={handleSavePurchase} className="w-full py-2.5 bg-emerald-500 rounded-xl items-center active:bg-emerald-600">
            <Text className="text-white font-bold text-xs">Confirm Stock Inward Receive</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
        {(['warehouse', 'trucks', 'transfers', 'audits'] as const).map(t => (
          <Pressable key={t} onPress={() => setActiveTab(t)} className={`flex-1 min-w-[45%] py-1.5 rounded-lg items-center ${activeTab === t ? 'bg-white' : ''}`}>
            <Text className={`text-[10px] font-extrabold capitalize ${activeTab === t ? 'text-slate-800' : 'text-slate-500'}`}>
              {t === 'transfers' ? 'Load & Transfer' : t === 'audits' ? 'Movement Logs' : t}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'warehouse' ? (
        <View className="gap-4">
          <View className="flex-row items-center justify-between bg-slate-100 p-2.5 rounded-xl border border-slate-200">
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
            <View className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex-row items-center justify-between">
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
              <View className="bg-red-50 px-3 py-2 rounded-xl border border-red-100 flex-row items-center gap-2">
                <AlertTriangle size={16} color="#ef4444" />
                <Text className="font-bold text-red-700 text-xs flex-1">Ice cream flavors are currently empty in our silos.</Text>
              </View>
            )}
            {data.warehouse_inventory.some(i => i.available_qty > 0 && i.available_qty <= 100) && (
              <View className="bg-amber-50 px-3 py-2 rounded-xl border border-amber-100 flex-row items-center gap-2">
                <Shield size={16} color="#f59e0b" />
                <Text className="font-bold text-amber-700 text-xs flex-1">Ice cream quantities are below healthy safety levels.</Text>
              </View>
            )}
          </View>

          <View className="bg-white rounded-2xl border border-slate-200 p-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-bold text-slate-800 text-xs">Warehouse Silos Stock Levels</Text>
              <Text className="text-[10px] text-slate-400">Total flavors: {data.products.length}</Text>
            </View>
            <View className="gap-2">
              {data.warehouse_inventory.map(inv => {
                const prodName = data.products.find(p => p.id === inv.product_id)?.name || 'Unknown';
                const isOOS = inv.available_qty === 0;
                const isLow = inv.available_qty > 0 && inv.available_qty <= 100;
                return (
                  <View key={inv.product_id} className={`p-3 rounded-xl border ${isOOS ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                    <View className="flex-row justify-between items-start">
                      <View>
                        <Text className="font-bold text-slate-800 text-[11px]">{prodName}</Text>
                        <Text className="text-[9px] text-slate-400 uppercase font-mono">{inv.product_id}</Text>
                      </View>
                      <View className="flex-row gap-1">
                        {isOOS && <Text className="text-[8px] bg-red-100 text-red-700 px-1 rounded font-extrabold uppercase">OOS</Text>}
                        {isLow && <Text className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded font-extrabold uppercase">Low</Text>}
                      </View>
                    </View>
                    <View className="flex-row gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                      <View className="flex-1 bg-white p-1.5 rounded-lg border border-slate-100 items-center">
                        <Text className="text-[8px] text-slate-400 font-bold uppercase">Avail</Text>
                        <Text className={`text-[11px] font-black ${isOOS ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-800'}`}>{inv.available_qty}</Text>
                      </View>
                      <View className="flex-1 bg-white p-1.5 rounded-lg border border-slate-100 items-center">
                        <Text className="text-[8px] text-slate-400 font-bold uppercase">Res</Text>
                        <Text className="text-slate-600 text-[11px] font-black">{inv.reserved_qty}</Text>
                      </View>
                      <View className="flex-1 bg-white p-1.5 rounded-lg border border-slate-100 items-center">
                        <Text className="text-[8px] text-slate-400 font-bold uppercase">Dmg</Text>
                        <Text className="text-red-500 text-[11px] font-black">{inv.damaged_qty}</Text>
                      </View>
                      <View className="flex-1 bg-white p-1.5 rounded-lg border border-slate-100 items-center">
                        <Text className="text-[8px] text-slate-400 font-bold uppercase">Exp</Text>
                        <Text className="text-purple-500 text-[11px] font-black">{inv.expired_qty}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
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
              <View className="gap-2">
                {data.truck_inventory.filter(ti => ti.truck_id === activeTruckId).map(ti => {
                  const prod = data.products.find(p => p.id === ti.product_id);
                  if (!prod) return null;
                  const currentInputVal = returnQuantities[ti.product_id] !== undefined ? returnQuantities[ti.product_id] : '1';

                  return (
                    <View key={ti.product_id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 gap-2">
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
          <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
            <View className="border-b border-slate-100 pb-2">
              <Text className="font-bold text-slate-800 text-xs">Load Cargo Stock: Warehouse to Truck</Text>
              <Text className="text-[10px] text-slate-400 font-medium">Select a vehicle and add multiple products to load them simultaneously.</Text>
            </View>

            <View>
              <Text className="font-extrabold text-slate-500 mb-1 text-xs">Target Dispatch Truck</Text>
              <SelectField value={dispatchTruckId} onValueChange={setDispatchTruckId} options={truckOptions} title="Select Truck" className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
            </View>

            <View className="gap-3">
              <Text className="font-extrabold text-slate-500 text-xs">Products to Dispatch</Text>
              {dispatchItems.map((item, index) => {
                const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === item.product_id);
                const maxAllowedStock = warehouseInv ? (item.source === 'reserved_qty' ? warehouseInv.reserved_qty : warehouseInv.available_qty) : 0;
                const isEmpty = maxAllowedStock <= 0;
                return (
                  <View key={index} className="gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <SelectField
                      value={item.product_id}
                      onValueChange={v => updateDispatchItem(index, 'product_id', v)}
                      options={data.products.map(p => {
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
                      <Pressable onPress={() => removeDispatchItem(index)} disabled={dispatchItems.length <= 1} className="p-2 active:bg-rose-50 rounded-lg">
                        <Trash2 size={16} color={dispatchItems.length <= 1 ? '#cbd5e1' : '#f43f5e'} />
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

            <Pressable onPress={handleLoadStock} className="w-full py-2 bg-rose-500 rounded-lg items-center active:bg-rose-600">
              <Text className="text-white font-bold text-xs">Dispatch Cargo Load to Vehicle</Text>
            </Pressable>
          </View>

          <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
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
      ) : (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-bold text-slate-800 text-xs">Inventory Logistics Audit Trail</Text>
            <Text className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold uppercase">SECURED</Text>
          </View>
          <View className="gap-2">
            {data.auditLogs.map(l => {
              const actor = l.user_name && l.user_role ? { name: l.user_name, role: l.user_role } : resolveActor(data.users, l.user_id);
              return (
              <View key={l.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex-row items-start gap-2">
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
