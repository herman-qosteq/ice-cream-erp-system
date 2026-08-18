import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, Modal } from 'react-native';
import { Search, ShoppingCart, Download, Eye, Edit, AlertTriangle, X } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { Store, Product, PreBookingOrder, PreBookingItem, AppNotification, NotificationEntityType, BoxPieceQty } from '../../types';
import SelectField from '../../components/common/SelectField';
import DateField from '../../components/common/DateField';
import ConfirmModal from '../../components/common/ConfirmModal';
import BoxPieceInput from '../../components/common/BoxPieceInput';
import { formatQty, isPositiveQty, compareQty, readQtyField, addQty, subtractQty, toTotalPieces, formatUnitRate } from '../../utils/qty';
import ViewToggle from '../../components/common/ViewToggle';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import { exportHtmlReport, openWebPreviewWindow } from '../../utils/reportExport';
import { buildPreBookingBillPdf } from '../../utils/orderInvoicePdf';
import { useAppContext } from '../../context/AppContext';
import { useViewMode } from '../../context/ViewModeContext';
import { preBookingsApi } from '../../api/endpoints';
import { getEffectiveProductPrice } from '../../utils/pricing';
import { isGstToggleEnabled, isRetailPricingEnabled } from '../../utils/permissions';
import { computeInvoiceTotals, formatWholeRupees, formatCurrency } from '../../utils/billing';

interface SalespersonDeliveriesProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  showAlert: (opts: any) => void;
  // Prefills the store picker when arriving from SalespersonSales's "Pre-book"
  // button (was previously a shared `selectedStore` variable across tabs -
  // now just a one-time prefill convenience, since the store picker below
  // already lets you choose any store regardless).
  initialStoreId?: string | null;
  onConsumeInitialStoreId?: () => void;
}

const inputClass = "w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800";

// Extracted from SalespersonFlow.tsx's former 'deliveries' tab. Self-contained
// aside from the `initialStoreId` prefill convenience above.
export default function SalespersonDeliveries({ data, setData, addNotification, currentUser, showAlert, initialStoreId, onConsumeInitialStoreId }: SalespersonDeliveriesProps) {
  const { refreshData, syncQueueOffline } = useAppContext();
  const { viewMode } = useViewMode();


  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [preBookingView, setPreBookingView] = useState<'create' | 'confirm' | 'list'>('create');
  const [expandedPreBookings, setExpandedPreBookings] = useState<string[]>([]);
  const [preBookingConfirmAction, setPreBookingConfirmAction] = useState<{ bookingId: string; action: 'deliver' | 'cancel' } | null>(null);
  const [preBookingSettleAmount, setPreBookingSettleAmount] = useState(0);
  const [preBookingSettleMethod, setPreBookingSettleMethod] = useState<'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'>('UPI');
  const [bookingItems, setBookingItems] = useState<{ [productId: string]: BoxPieceQty }>({});
  const [bookingItemOrder, setBookingItemOrder] = useState<string[]>([]);
  const [preBookingForm, setPreBookingForm] = useState({
    scheduled_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    notes: ''
  });
  const [pendingPreBooking, setPendingPreBooking] = useState<{ items: PreBookingItem[]; storeId: string; storeName: string; scheduledDate: string; notes?: string; grandTotal: number; roundOff: number } | null>(null);
  const [preBookingPricingMode, setPreBookingPricingMode] = useState<'wholesale' | 'retail'>('wholesale');
  const [preBookingGstMode, setPreBookingGstMode] = useState<'with_gst' | 'without_gst'>('with_gst');
  const [preBookingProductSearch, setPreBookingProductSearch] = useState('');
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialStoreId) {
      const store = data.stores.find(s => s.id === initialStoreId);
      if (store) setSelectedStore(store);
      onConsumeInitialStoreId?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStoreId]);

  const canToggleGst = isGstToggleEnabled(currentUser, data.rolePermissions, data.userPermissions);
  const retailEnabled = isRetailPricingEnabled(currentUser, data.rolePermissions, data.userPermissions);
  const effectivePreBookingPricingMode = retailEnabled ? preBookingPricingMode : 'wholesale';

  const paymentMethodOptions = ['UPI', 'Cash', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Credit'].map(m => ({ label: m === 'UPI' ? 'UPI Payment QR' : m === 'Cash' ? 'Cash Handover' : m === 'Credit' ? 'Pay on Credit (Outstanding)' : m, value: m }));

  const pendingPreBookings = data.preBookingOrders.filter(order => order.status === 'Booked').sort((a, b) => b.created_at.localeCompare(a.created_at));

  const togglePreBookingExpand = (bookingId: string) => {
    setExpandedPreBookings(prev => (prev.includes(bookingId) ? prev.filter(id => id !== bookingId) : [...prev, bookingId]));
  };

  const handleDownloadPreBookingPdf = async (booking: PreBookingOrder) => {
    const store = data.stores.find(s => s.id === booking.store_id);
    if (!store) { showAlert('Unable to find the partner store for this pre-booking.'); return; }
    const previewWindow = openWebPreviewWindow();
    const { html, fileName } = buildPreBookingBillPdf(booking, store, data.products, data.qrCodeSettings);
    await exportHtmlReport(html, fileName, showAlert, previewWindow);
  };

  const updateBookingItemOrder = (productId: string, qty: BoxPieceQty) => {
    setBookingItemOrder(prev => {
      if (isPositiveQty(qty)) return prev.includes(productId) ? prev : [...prev, productId];
      return prev.includes(productId) ? prev.filter(id => id !== productId) : prev;
    });
  };

  const getEffectiveAvailableForBooking = (productId: string): BoxPieceQty => {
    const liveAvailable = readQtyField(data.warehouse_inventory.find(inv => inv.product_id === productId), 'available_qty', 'available_pieces');
    if (!editingBookingId) return liveAvailable;
    const existingBooking = data.preBookingOrders.find(b => b.id === editingBookingId);
    const existingItem = existingBooking?.items.find(i => i.product_id === productId);
    if (!existingItem) return liveAvailable;
    const piecesPerBox = data.products.find(p => p.id === productId)?.pieces_per_box ?? 1;
    return addQty(liveAvailable, { boxes: existingItem.quantity, pieces: existingItem.quantity_pieces }, piecesPerBox);
  };

  const handleSetPreBookingQty = (productId: string, requested: BoxPieceQty) => {
    const piecesPerBox = data.products.find(p => p.id === productId)?.pieces_per_box ?? 1;
    const currentWarehouseStock = getEffectiveAvailableForBooking(productId);
    if (compareQty(requested, currentWarehouseStock, piecesPerBox) > 0) {
      const productName = data.products.find(p => p.id === productId)?.name || productId;
      showAlert(!isPositiveQty(currentWarehouseStock)
        ? `${productName} is out of stock in the warehouse. It cannot be added to this pre-booking.`
        : `Only ${formatQty(currentWarehouseStock)} of ${productName} are available in the warehouse right now.`);
    }
    const nextQty = compareQty(requested, currentWarehouseStock, piecesPerBox) > 0 ? currentWarehouseStock : requested;
    setBookingItems({ ...bookingItems, [productId]: nextQty });
    updateBookingItemOrder(productId, nextQty);
  };

  const buildPreBookingItems = () => {
    return bookingItemOrder
      .map(productId => {
        const qty = bookingItems[productId] ?? { boxes: 0, pieces: 0 };
        if (!isPositiveQty(qty)) return null;
        const product = data.products.find(item => item.id === productId);
        if (!product) return null;
        const unit_price = getEffectiveProductPrice(product, effectivePreBookingPricingMode, selectedStore?.id, data.storePricing);
        const tax_pct = canToggleGst && preBookingGstMode === 'without_gst' ? 0 : product.tax_pct;
        return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, pieces_per_box: product.pieces_per_box, unit_price, tax_pct };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  };

  const reserveWarehouseStock = (items: { product_id: string; quantity: number; quantity_pieces: number }[], warehouseInventory = data.warehouse_inventory) => {
    return warehouseInventory.map(inv => {
      const match = items.find(item => item.product_id === inv.product_id);
      if (!match) return inv;
      const piecesPerBox = data.products.find(p => p.id === inv.product_id)?.pieces_per_box ?? 1;
      const need = { boxes: match.quantity, pieces: match.quantity_pieces };
      const nextAvail = subtractQty({ boxes: inv.available_qty, pieces: inv.available_pieces }, need, piecesPerBox);
      const nextReserved = addQty({ boxes: inv.reserved_qty, pieces: inv.reserved_pieces }, need, piecesPerBox);
      return { ...inv, available_qty: nextAvail.boxes, available_pieces: nextAvail.pieces, reserved_qty: nextReserved.boxes, reserved_pieces: nextReserved.pieces };
    });
  };

  const restoreReservedWarehouseStock = (items: { product_id: string; quantity: number; quantity_pieces: number }[], warehouseInventory = data.warehouse_inventory) => {
    return warehouseInventory.map(inv => {
      const match = items.find(item => item.product_id === inv.product_id);
      if (!match) return inv;
      const piecesPerBox = data.products.find(p => p.id === inv.product_id)?.pieces_per_box ?? 1;
      const need = { boxes: match.quantity, pieces: match.quantity_pieces };
      const nextAvail = addQty({ boxes: inv.available_qty, pieces: inv.available_pieces }, need, piecesPerBox);
      const nextReserved = subtractQty({ boxes: inv.reserved_qty, pieces: inv.reserved_pieces }, need, piecesPerBox);
      return { ...inv, available_qty: nextAvail.boxes, available_pieces: nextAvail.pieces, reserved_qty: nextReserved.boxes, reserved_pieces: nextReserved.pieces };
    });
  };

  const resetPreBookingForm = () => {
    setBookingItems({});
    setBookingItemOrder([]);
    setPendingPreBooking(null);
    setPreBookingForm({ scheduled_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], notes: '' });
    setPreBookingPricingMode('wholesale');
    setPreBookingGstMode('with_gst');
    setPreBookingProductSearch('');
    setEditingBookingId(null);
    setSelectedStore(null);
  };

  const handleOpenEditPreBooking = (booking: PreBookingOrder) => {
    const store = data.stores.find(s => s.id === booking.store_id) || null;
    setSelectedStore(store);
    setPreBookingForm({ scheduled_delivery_date: booking.scheduled_delivery_date, notes: booking.notes || '' });
    const items: { [productId: string]: BoxPieceQty } = {};
    booking.items.forEach(item => { items[item.product_id] = { boxes: item.quantity, pieces: item.quantity_pieces }; });
    setBookingItems(items);
    setBookingItemOrder(booking.items.map(item => item.product_id));
    const firstItem = booking.items[0];
    const firstProduct = firstItem ? data.products.find(p => p.id === firstItem.product_id) : null;
    const firstWholesaleRate = firstProduct ? getEffectiveProductPrice(firstProduct, 'wholesale', booking.store_id, data.storePricing) : 0;
    setPreBookingPricingMode(firstProduct && firstItem.unit_price === firstWholesaleRate ? 'wholesale' : 'retail');
    setPreBookingGstMode(firstItem && firstItem.tax_pct <= 0 ? 'without_gst' : 'with_gst');
    setEditingBookingId(booking.id);
    setPreBookingView('create');
  };

  const handleSavePreBookingOrder = () => {
    if (!selectedStore) {
      showAlert('Please select a store for the pre-booking order.');
      return;
    }
    const bookingItemsList = buildPreBookingItems();
    if (bookingItemsList.length === 0) {
      showAlert('Please add at least one product to pre-book.');
      return;
    }
    const { grand_total: grandTotal, round_off: roundOff } = computeInvoiceTotals(bookingItemsList);
    setPendingPreBooking({
      items: bookingItemsList, storeId: selectedStore.id, storeName: selectedStore.name,
      scheduledDate: preBookingForm.scheduled_delivery_date, notes: preBookingForm.notes.trim() || undefined, grandTotal, roundOff,
    });
    setPreBookingView('confirm');
  };

  const handleBackFromPreBookingConfirmation = () => {
    setPendingPreBooking(null);
    setPreBookingView('create');
  };

  const handleConfirmPreBookingOrder = async () => {
    if (!selectedStore || !pendingPreBooking) return;
    const { items: bookingItemsList, storeId, storeName, scheduledDate, notes } = pendingPreBooking;

    if (editingBookingId) {
      const existingBooking = data.preBookingOrders.find(b => b.id === editingBookingId);
      if (!existingBooking) {
        showAlert('This pre-booking no longer exists.');
        resetPreBookingForm();
        setPreBookingView('list');
        return;
      }

      if (data.isOffline) {
        const releasedWarehouse = restoreReservedWarehouseStock(existingBooking.items);
        const updatedWarehouse = reserveWarehouseStock(bookingItemsList, releasedWarehouse);
        const updatedBooking: PreBookingOrder = {
          ...existingBooking, store_id: storeId, scheduled_delivery_date: scheduledDate,
          items: bookingItemsList, notes
        };
        const updatedPreBookings = data.preBookingOrders.map(b => (b.id === editingBookingId ? updatedBooking : b));
        syncQueueOffline('UPDATE_PREBOOKING', { preBookingOrder: updatedBooking, reservation: updatedWarehouse });
        setData({ ...data, warehouse_inventory: updatedWarehouse, preBookingOrders: updatedPreBookings });
        showAlert('Network Offline: pre-booking updated and stock reservation adjusted locally.');
        resetPreBookingForm();
        setPreBookingView('list');
        return;
      }

      try {
        await preBookingsApi.update(editingBookingId, {
          store_id: storeId, scheduled_delivery_date: scheduledDate,
          items: bookingItemsList, notes,
        });
        await refreshData();
        addNotification('order_update', `Pre-booking updated for ${storeName}.`, 'prebooking', editingBookingId);
        showAlert('Pre-booking updated successfully.');
        resetPreBookingForm();
        setPreBookingView('list');
      } catch (e: any) {
        showAlert(e.message ?? 'Unable to update pre-booking.');
      }
      return;
    }

    if (data.isOffline) {
      const updatedWarehouse = reserveWarehouseStock(bookingItemsList);
      const newBooking: PreBookingOrder = {
        id: `pb_${Date.now()}`, store_id: storeId, salesperson_id: currentUser.id, created_at: new Date().toISOString(),
        scheduled_delivery_date: scheduledDate, status: 'Booked', items: bookingItemsList, notes
      };
      syncQueueOffline('CREATE_PREBOOKING', { preBookingOrder: newBooking, reservation: updatedWarehouse });
      setData({ ...data, warehouse_inventory: updatedWarehouse, preBookingOrders: [newBooking, ...data.preBookingOrders] });
      showAlert('Network Offline: pre-booking saved and stock reserved locally.');
      resetPreBookingForm();
      setPreBookingView('list');
      return;
    }

    try {
      const created = await preBookingsApi.create({
        store_id: storeId, salesperson_id: currentUser.id, scheduled_delivery_date: scheduledDate,
        items: bookingItemsList, notes,
      });
      await refreshData();
      addNotification('new_order', `Pre-booking saved for ${storeName} and stock reserved in warehouse.`, 'prebooking', created.id);
      showAlert('Pre-booking saved successfully.');
      resetPreBookingForm();
      setPreBookingView('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save pre-booking.');
    }
  };

  const executeDeliverPreBookingOrder = async (preBookingOrderId: string) => {
    try {
      const result = await preBookingsApi.deliver(preBookingOrderId, { method: preBookingSettleMethod, amount: preBookingSettleAmount });
      await refreshData();
      addNotification('delivery', `Pre-booking order ${preBookingOrderId} completed. Payment status: ${result.payment_status}.`, 'prebooking', preBookingOrderId);
      showAlert(`Pre-booking delivery completed. Payment status: ${result.payment_status}.`);
      setPreBookingConfirmAction(null);
    } catch (e: any) {
      setPreBookingConfirmAction(null);
      showAlert(e.message ?? 'Unable to deliver pre-booking.');
    }
  };

  const handleDeliverPreBookingOrder = (preBookingOrderId: string) => {
    const booking = data.preBookingOrders.find(item => item.id === preBookingOrderId);
    const grandTotal = booking ? computeInvoiceTotals(booking.items).grand_total : 0;
    setPreBookingSettleAmount(grandTotal);
    setPreBookingSettleMethod('UPI');
    setPreBookingConfirmAction({ bookingId: preBookingOrderId, action: 'deliver' });
  };

  const executeCancelPreBookingOrder = async (preBookingOrderId: string) => {
    try {
      await preBookingsApi.cancel(preBookingOrderId);
      await refreshData();
      addNotification('partner_update', `Pre-booking order ${preBookingOrderId} cancelled.`, 'prebooking', preBookingOrderId);
      showAlert('Pre-booking cancelled and warehouse stock released.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to cancel pre-booking.');
    }
  };

  const handleCancelPreBookingOrder = (preBookingOrderId: string) => setPreBookingConfirmAction({ bookingId: preBookingOrderId, action: 'cancel' });

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
    <View className="w-full lg:max-w-[1400px] gap-4">
      <View className="flex-row bg-white/80 border border-white/60 rounded-2xl p-1">
        <Pressable onPress={() => { if (editingBookingId) resetPreBookingForm(); setPreBookingView('create'); }} className={`flex-1 py-2 rounded-xl items-center ${preBookingView === 'create' ? 'bg-emerald-600' : ''}`}>
          <Text className={`text-[11px] font-extrabold ${preBookingView === 'create' ? 'text-white' : 'text-slate-500'}`}>+ New Booking</Text>
        </Pressable>
        <Pressable onPress={() => setPreBookingView('list')} className={`flex-1 py-2 rounded-xl items-center flex-row justify-center gap-1.5 ${preBookingView === 'list' ? 'bg-blue-600' : ''}`}>
          <Text className={`text-[11px] font-extrabold ${preBookingView === 'list' ? 'text-white' : 'text-slate-500'}`}>My Bookings</Text>
          {pendingPreBookings.length > 0 && <Text className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${preBookingView === 'list' ? 'bg-white/30 text-white' : 'bg-blue-100 text-blue-700'}`}>{pendingPreBookings.length}</Text>}
        </Pressable>
      </View>

      {preBookingView === 'create' && (() => {
        const getReservedQty = (productId: string): BoxPieceQty => readQtyField(data.warehouse_inventory.find(inv => inv.product_id === productId), 'reserved_qty', 'reserved_pieces');

        const renderQtyStepper = (product: Product) => (
          <BoxPieceInput
            value={bookingItems[product.id] ?? { boxes: 0, pieces: 0 }}
            onChange={q => handleSetPreBookingQty(product.id, q)}
            piecesPerBox={product.pieces_per_box}
            compact
          />
        );

        const filteredBookingProducts = data.products
          .filter(product => product.status === 'Active' && isPositiveQty(getEffectiveAvailableForBooking(product.id)) && product.name.toLowerCase().includes(preBookingProductSearch.trim().toLowerCase()));

        return (
          <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-4xl lg:self-center">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <Text className="font-extrabold text-slate-800 text-sm">{editingBookingId ? `Edit Pre-booking ${editingBookingId.toUpperCase()}` : 'Create Pre-booking Order'}</Text>
              <Pressable onPress={() => { resetPreBookingForm(); setPreBookingView('list'); }}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
            </View>

            <View>
              <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Select Partner Store</Text>
              <SelectField
                value={selectedStore?.id || ''}
                onValueChange={v => setSelectedStore(data.stores.find(store => store.id === v) || null)}
                options={data.stores.filter(store => store.status === 'Active' || store.id === selectedStore?.id).map(store => ({ label: store.name, value: store.id }))}
                title="Select Store"
                searchable
                className={inputClass + ' rounded-xl flex-row items-center justify-between'}
              />
            </View>
            <View>
              <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Scheduled Delivery Date</Text>
              <DateField value={preBookingForm.scheduled_delivery_date} onValueChange={v => setPreBookingForm({ ...preBookingForm, scheduled_delivery_date: v })} title="Select Delivery Date" className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
            </View>
            <View>
              <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Notes (Optional)</Text>
              <TextInput
                value={preBookingForm.notes}
                onChangeText={v => setPreBookingForm({ ...preBookingForm, notes: v })}
                multiline
                numberOfLines={2}
                placeholder="e.g. Reserve for birthday order, deliver Friday evening."
                placeholderTextColor="#94a3b8"
                className={inputClass + ' rounded-xl'}
                style={{ minHeight: 60, textAlignVertical: 'top' }}
              />
            </View>

            <View className="gap-2 sm:flex-row sm:flex-wrap">
              {retailEnabled && (
                <View className="sm:flex-1 flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
                  <Text className="text-[9px] font-bold text-slate-500 uppercase">Pricing Mode</Text>
                  <View className="flex-row bg-white p-0.5 rounded-lg border border-slate-200">
                    <Pressable onPress={() => setPreBookingPricingMode('wholesale')} className={`px-2 py-1 rounded-md ${preBookingPricingMode === 'wholesale' ? 'bg-indigo-600' : ''}`}>
                      <Text className={`text-[10px] font-bold ${preBookingPricingMode === 'wholesale' ? 'text-white' : 'text-slate-500'}`}>Wholesale</Text>
                    </Pressable>
                    <Pressable onPress={() => setPreBookingPricingMode('retail')} className={`px-2 py-1 rounded-md ${preBookingPricingMode === 'retail' ? 'bg-indigo-600' : ''}`}>
                      <Text className={`text-[10px] font-bold ${preBookingPricingMode === 'retail' ? 'text-white' : 'text-slate-500'}`}>Selling</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {canToggleGst && (
                <View className="sm:flex-1 flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
                  <Text className="text-[9px] font-bold text-slate-500 uppercase">GST</Text>
                  <View className="flex-row bg-white p-0.5 rounded-lg border border-slate-200">
                    <Pressable onPress={() => setPreBookingGstMode('with_gst')} className={`px-2 py-1 rounded-md ${preBookingGstMode === 'with_gst' ? 'bg-indigo-600' : ''}`}>
                      <Text className={`text-[10px] font-bold ${preBookingGstMode === 'with_gst' ? 'text-white' : 'text-slate-500'}`}>With GST</Text>
                    </Pressable>
                    <Pressable onPress={() => setPreBookingGstMode('without_gst')} className={`px-2 py-1 rounded-md ${preBookingGstMode === 'without_gst' ? 'bg-indigo-600' : ''}`}>
                      <Text className={`text-[10px] font-bold ${preBookingGstMode === 'without_gst' ? 'text-white' : 'text-slate-500'}`}>No GST</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
              <View className="flex-row items-center justify-between flex-wrap gap-2">
                <Text className="font-bold text-slate-500 text-[10px] uppercase">Select Products & Pre-book Quantities:</Text>
                <ViewToggle />
              </View>
              <View className="flex-row items-center gap-2 bg-white border border-slate-200 rounded-xl px-3">
                <Search size={14} color="#94a3b8" />
                <TextInput
                  value={preBookingProductSearch}
                  onChangeText={setPreBookingProductSearch}
                  placeholder="Search products..."
                  placeholderTextColor="#94a3b8"
                  className="flex-1 text-xs text-slate-800 py-2"
                  style={{ outlineStyle: 'none' } as any}
                />
                {preBookingProductSearch.length > 0 && (
                  <Pressable onPress={() => setPreBookingProductSearch('')} hitSlop={8}>
                    <X size={14} color="#94a3b8" />
                  </Pressable>
                )}
              </View>

              {filteredBookingProducts.length === 0 ? (
                <Text className="text-[10px] text-slate-400 italic py-2 text-center">{preBookingProductSearch.trim() ? 'No products match your search.' : 'No products currently have warehouse stock available to pre-book.'}</Text>
              ) : viewMode === 'table' ? (
                <DataTable
                  data={filteredBookingProducts}
                  keyExtractor={p => p.id}
                  emptyText="No products currently have warehouse stock available to pre-book."
                  columns={[
                    { key: 'product', label: 'Product', width: 170, render: p => <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{p.name}</Text> },
                    { key: 'price', label: 'Rate', width: 130, render: p => <Text className="text-slate-600 text-[11px] font-bold">{formatCurrency(getEffectiveProductPrice(p, effectivePreBookingPricingMode, selectedStore?.id, data.storePricing))}</Text> },
                    { key: 'stock', label: 'WH Stock', width: 100, align: 'center', grow: false, render: p => <Text className="text-center text-[11px] font-black text-slate-800">{formatQty(getEffectiveAvailableForBooking(p.id))}</Text> },
                    { key: 'qty', label: 'Quantity', width: 140, grow: false, render: renderQtyStepper },
                  ] as DataTableColumn<Product>[]}
                />
              ) : (
                <View className="gap-2 md:flex-row md:flex-wrap">
                  {filteredBookingProducts.map(product => {
                    const availableQty = getEffectiveAvailableForBooking(product.id);
                    const reservedQty = getReservedQty(product.id);
                    return (
                      <View key={product.id} className="w-full md:w-[48%] flex-row items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-2">
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-[11px]">{product.name}</Text>
                          <Text className="text-slate-400 text-[9px]">{formatCurrency(getEffectiveProductPrice(product, effectivePreBookingPricingMode, selectedStore?.id, data.storePricing))} - WH: {formatQty(availableQty)} avail{isPositiveQty(reservedQty) ? ` - ${formatQty(reservedQty)} reserved` : ''}</Text>
                        </View>
                        {renderQtyStepper(product)}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View className="bg-slate-100 p-2.5 rounded-xl flex-row justify-between items-center">
              <Text className="font-bold text-slate-500 text-xs">Estimated Total Value{preBookingGstMode === 'with_gst' ? ' (Incl. GST)' : ''}:</Text>
              <Text className="font-black text-slate-800 text-sm">{formatWholeRupees(computeInvoiceTotals(buildPreBookingItems()).grand_total)}</Text>
            </View>

            <Pressable onPress={handleSavePreBookingOrder} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
              <Text className="text-white font-bold text-xs">{editingBookingId ? 'Update Pre-booking & Adjust Reservation' : 'Save Pre-booking & Reserve Stock'}</Text>
            </Pressable>
          </View>
        );
      })()}

      {preBookingView === 'confirm' && pendingPreBooking && (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">Pre-Booking Confirmation</Text>
              <Text className="text-[10px] text-slate-400">Review the full details before reserving stock</Text>
            </View>
            <Pressable onPress={handleBackFromPreBookingConfirmation}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
          </View>

          <View className="gap-1.5">
            <View className="flex-row justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <Text className="text-slate-400 font-bold uppercase text-[9px]">Partner Store</Text>
              <Text className="font-extrabold text-slate-800 text-xs">{pendingPreBooking.storeName}</Text>
            </View>
            <View className="flex-row justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <Text className="text-slate-400 font-bold uppercase text-[9px]">Scheduled Delivery Date</Text>
              <Text className="font-extrabold text-slate-800 text-xs">{new Date(pendingPreBooking.scheduledDate).toLocaleDateString()}</Text>
            </View>
            {!!pendingPreBooking.notes && (
              <View className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <Text className="text-slate-400 font-bold uppercase text-[9px] mb-0.5">Notes</Text>
                <Text className="text-slate-700 text-xs">{pendingPreBooking.notes}</Text>
              </View>
            )}
          </View>

          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-1.5">
            <Text className="font-bold text-slate-500 text-[10px] uppercase mb-0.5">Selected Products & Quantities</Text>
            {pendingPreBooking.items.map(item => {
              const p = data.products.find(prod => prod.id === item.product_id);
              const amount = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, p?.pieces_per_box ?? 1) * item.unit_price;
              return (
                <View key={item.product_id} className="flex-row justify-between items-center border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                  <View className="flex-1 pr-2">
                    <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{p?.name || 'Unknown'}</Text>
                    <Text className="text-slate-400 text-[9px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}{item.tax_pct > 0 ? ` (+${item.tax_pct}% GST)` : ''}</Text>
                  </View>
                  <Text className="font-bold text-slate-700 text-[11px]">{formatCurrency(amount)}</Text>
                </View>
              );
            })}
          </View>

          <View className="bg-slate-100 p-3 rounded-xl gap-1">
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-500 font-semibold text-[10px] uppercase">Total (Before Round Off)</Text>
              <Text className="font-bold text-slate-600 text-xs">{formatCurrency(pendingPreBooking.grandTotal - pendingPreBooking.roundOff)}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-500 font-semibold text-[10px] uppercase">Round Off</Text>
              <Text className="font-bold text-slate-600 text-xs">{pendingPreBooking.roundOff > 0 ? '+' : ''}{formatCurrency(pendingPreBooking.roundOff)}</Text>
            </View>
            <View className="flex-row justify-between items-center pt-1 border-t border-slate-200">
              <Text className="font-extrabold text-slate-700 text-xs uppercase">Estimated Value</Text>
              <Text className="font-black text-indigo-600 text-sm">{formatCurrency(pendingPreBooking.grandTotal)}</Text>
            </View>
          </View>

          <Pressable onPress={handleConfirmPreBookingOrder} className="w-full py-2.5 bg-emerald-600 rounded-xl items-center active:bg-emerald-700">
            <Text className="text-white font-bold text-xs uppercase">{editingBookingId ? 'Confirm Update' : 'Confirm Pre-Booking'}</Text>
          </Pressable>
        </View>
      )}

      {preBookingView === 'list' && (
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-extrabold text-slate-700 text-xs uppercase">Saved Pre-bookings</Text>
            <Text className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">{pendingPreBookings.length} Saved</Text>
          </View>

          <ViewToggle />

          {viewMode === 'table' ? (
            <DataTable
              data={pendingPreBookings}
              keyExtractor={booking => booking.id}
              emptyText="No pre-bookings saved yet."
              columns={[
                { key: 'id', label: 'Booking ID', width: 110, render: booking => <Text className="font-extrabold text-slate-800 text-[11px]" numberOfLines={1}>{booking.id.toUpperCase()}</Text> },
                { key: 'store', label: 'Store', width: 160, render: booking => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{data.stores.find(s => s.id === booking.store_id)?.name || '-'}</Text> },
                { key: 'scheduled', label: 'Scheduled Date', width: 110, grow: false, render: booking => <Text className="text-[10px] text-slate-600">{booking.scheduled_delivery_date}</Text> },
                { key: 'total', label: 'Total', width: 90, align: 'right' as const, render: booking => <Text className="font-black text-indigo-600 text-[11px] text-right">{formatWholeRupees(computeInvoiceTotals(booking.items).grand_total)}</Text> },
                {
                  key: 'status', label: 'Status', width: 90, grow: false,
                  render: booking => <Text className={`px-2 py-0.5 font-bold rounded-full text-[9px] uppercase self-start ${booking.status === 'Booked' ? 'bg-emerald-100 text-emerald-700' : booking.status === 'Delivered' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{booking.status}</Text>,
                },
                {
                  key: 'actions', label: 'Actions', width: 150, grow: false,
                  render: booking => (
                    <View className="flex-row flex-wrap items-center gap-1">
                      <Pressable onPress={() => handleDownloadPreBookingPdf(booking)} className="p-1.5 rounded-lg border bg-slate-50 border-slate-200"><Download size={13} color="#475569" /></Pressable>
                      {booking.status === 'Booked' && (
                        <>
                          <Pressable onPress={() => handleOpenEditPreBooking(booking)} className="p-1.5 rounded-lg border bg-slate-50 border-slate-200"><Edit size={13} color="#475569" /></Pressable>
                          <Pressable onPress={() => handleDeliverPreBookingOrder(booking.id)} className="py-1 px-2 bg-emerald-600 rounded-lg active:bg-emerald-700"><Text className="text-white text-[9px] font-black">Deliver</Text></Pressable>
                          <Pressable onPress={() => handleCancelPreBookingOrder(booking.id)} className="py-1 px-2 bg-rose-50 border border-rose-200 rounded-lg active:bg-rose-100"><Text className="text-rose-700 text-[9px] font-bold">Cancel</Text></Pressable>
                        </>
                      )}
                    </View>
                  ),
                },
              ] as DataTableColumn<typeof pendingPreBookings[number]>[]}
            />
          ) : pendingPreBookings.length === 0 ? (
            <View className="py-10 items-center bg-white/70 border border-dashed border-white/70 rounded-2xl">
              <ShoppingCart size={28} color="#cbd5e1" />
              <Text className="text-slate-400 font-semibold text-xs mt-2">No pre-bookings saved yet.</Text>
              <Pressable onPress={() => setPreBookingView('create')} className="mt-3"><Text className="text-emerald-600 font-extrabold text-[11px] underline">Create your first booking</Text></Pressable>
            </View>
          ) : (
            <View className="gap-3 md:flex-row md:flex-wrap">
              {pendingPreBookings.map(booking => {
                const store = data.stores.find(s => s.id === booking.store_id);
                const itemCountLabel = formatQty({ boxes: booking.items.reduce((sum, item) => sum + item.quantity, 0), pieces: booking.items.reduce((sum, item) => sum + item.quantity_pieces, 0) });
                const isBooked = booking.status === 'Booked';
                const { tax: taxTotal, grand_total: grandTotal } = computeInvoiceTotals(booking.items);
                const isExpanded = expandedPreBookings.includes(booking.id);
                return (
                  <View key={booking.id} className={`w-full md:w-[48%] xl:w-[32%] p-3 border bg-white rounded-2xl gap-2.5 ${isBooked ? 'border-emerald-200' : 'border-slate-200'}`}>
                    <View className="flex-row justify-between items-center">
                      <View><Text className="font-extrabold text-slate-800 text-xs">{booking.id.toUpperCase()}</Text><Text className="text-[10px] text-slate-400">Created: {new Date(booking.created_at).toLocaleDateString()}</Text></View>
                      <Text className={`px-2.5 py-0.5 font-bold rounded-full text-[9px] uppercase ${booking.status === 'Booked' ? 'bg-emerald-100 text-emerald-700' : booking.status === 'Delivered' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{booking.status}</Text>
                    </View>
                    {store && (
                      <View className="bg-slate-50 rounded-xl p-2">
                        <Text className="font-bold text-slate-700 text-xs">{store.name}</Text>
                        <View className="flex-row justify-between"><Text className="text-[10px] text-slate-500">Owner: {store.owner_name}</Text><Text className="text-[10px] text-slate-500">Ph: {store.phone}</Text></View>
                        <Text className="text-[10px] text-slate-400 mt-0.5">Scheduled: {booking.scheduled_delivery_date}</Text>
                        {booking.notes && <Text className="text-[10px] text-amber-700 italic mt-1 bg-amber-50 px-2 py-0.5 rounded">"{booking.notes}"</Text>}
                      </View>
                    )}
                    <View className="flex-row justify-between bg-slate-50 p-2 rounded-xl">
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">ITEMS</Text><Text className="font-black text-slate-700 text-[11px]">{itemCountLabel}</Text></View>
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">TAX</Text><Text className="font-black text-slate-700 text-[11px]">Rs. {taxTotal.toFixed(2)}</Text></View>
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">TOTAL</Text><Text className="font-black text-indigo-600 text-[11px]">{formatWholeRupees(grandTotal)}</Text></View>
                    </View>
                    {isExpanded && (
                      <View className="bg-slate-50 rounded-xl p-3 gap-2">
                        {booking.items.map((item, idx) => {
                          const p = data.products.find(prod => prod.id === item.product_id);
                          return (
                            <View key={idx} className="flex-row justify-between items-center bg-white p-2 rounded-lg">
                              <Text className="font-bold text-slate-800 text-[10px] flex-1">{p ? p.name : item.product_id}</Text>
                              <Text className="text-slate-700 text-[10px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}{p && item.unit_price === p.wholesale_price ? ' (Wholesale)' : p && item.unit_price === p.selling_price ? ' (Selling)' : ''}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                    <View className="flex-row flex-wrap gap-2 justify-end border-t border-slate-100 pt-2.5">
                      <Pressable onPress={() => togglePreBookingExpand(booking.id)} className={`p-1.5 rounded-lg border flex-row items-center gap-1 ${isExpanded ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                        <Eye size={14} color={isExpanded ? '#1d4ed8' : '#475569'} /><Text className={`font-bold text-[10px] ${isExpanded ? 'text-blue-700' : 'text-slate-600'}`}>{isExpanded ? 'Hide' : 'Details'}</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDownloadPreBookingPdf(booking)} className="p-1.5 rounded-lg border bg-slate-50 border-slate-200"><Download size={14} color="#475569" /></Pressable>
                      {isBooked && (
                        <>
                          <Pressable onPress={() => handleOpenEditPreBooking(booking)} className="p-1.5 rounded-lg border bg-slate-50 border-slate-200 flex-row items-center gap-1"><Edit size={14} color="#475569" /><Text className="font-bold text-[10px] text-slate-600">Edit</Text></Pressable>
                          <Pressable onPress={() => handleDeliverPreBookingOrder(booking.id)} className="py-1 px-3 bg-emerald-600 rounded-lg active:bg-emerald-700"><Text className="text-white text-[10px] font-black">Deliver</Text></Pressable>
                          <Pressable onPress={() => handleCancelPreBookingOrder(booking.id)} className="py-1 px-3 bg-rose-50 border border-rose-200 rounded-lg active:bg-rose-100"><Text className="text-rose-700 text-[10px] font-bold">Cancel</Text></Pressable>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View><Text className="font-extrabold text-slate-700 text-xs uppercase">Warehouse Reserve</Text><Text className="text-[10px] text-slate-400 mt-0.5">Stock held until booking is delivered or cancelled.</Text></View>
              <Text className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{data.preBookingOrders.filter(order => order.status === 'Booked').length} Active</Text>
            </View>
            <View className={`gap-2 md:flex-row md:flex-wrap ${data.warehouse_inventory.filter(item => isPositiveQty({ boxes: item.reserved_qty, pieces: item.reserved_pieces })).length === 0 ? 'flex-1' : ''}`}>
              {data.warehouse_inventory.filter(item => isPositiveQty({ boxes: item.reserved_qty, pieces: item.reserved_pieces })).length === 0 ? (
                <EmptyState message="No reserved warehouse stock." />
              ) : (
                data.warehouse_inventory.filter(item => isPositiveQty({ boxes: item.reserved_qty, pieces: item.reserved_pieces })).map(item => {
                  const product = data.products.find(p => p.id === item.product_id);
                  return (
                    <View key={item.product_id} className="w-full md:w-[48%] xl:w-[32%] bg-white/90 border border-amber-100 rounded-xl p-3 flex-row items-center justify-between">
                      <View><Text className="font-bold text-slate-800 text-xs">{product?.name || item.product_id}</Text><Text className="text-[10px] text-slate-400">{formatQty({ boxes: item.available_qty, pieces: item.available_pieces })} avail - <Text className="text-amber-600 font-bold">{formatQty({ boxes: item.reserved_qty, pieces: item.reserved_pieces })} reserved</Text></Text></View>
                      <Text className="text-[9px] font-extrabold px-2 py-1 rounded-lg bg-amber-100 text-amber-700">RESERVED</Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </View>
      )}

      {preBookingConfirmAction && preBookingConfirmAction.action === 'cancel' && (() => {
        const booking = data.preBookingOrders.find(o => o.id === preBookingConfirmAction.bookingId);
        if (!booking) return null;
        return (
          <ConfirmModal
            visible
            onClose={() => setPreBookingConfirmAction(null)}
            icon={AlertTriangle}
            iconBg="bg-rose-50"
            iconColor="#f43f5e"
            title="Confirm Pre-booking Cancel"
            message={`Cancel pre-booking ${booking.id.toUpperCase()}? Reserved stock will be released back into the available pool.`}
            confirmLabel="Yes, Confirm"
            cancelLabel="No, Go Back"
            confirmColor="bg-rose-600"
            onConfirm={() => { executeCancelPreBookingOrder(booking.id); setPreBookingConfirmAction(null); }}
          />
        );
      })()}

      {preBookingConfirmAction && preBookingConfirmAction.action === 'deliver' && (() => {
        const booking = data.preBookingOrders.find(o => o.id === preBookingConfirmAction.bookingId);
        if (!booking) return null;
        const grandTotal = computeInvoiceTotals(booking.items).grand_total;
        const isUnpaid = preBookingSettleMethod === 'Credit' || preBookingSettleAmount <= 0;
        const isPartial = !isUnpaid && preBookingSettleAmount < grandTotal - 0.05;
        let btnColor = 'bg-emerald-600 active:bg-emerald-700';
        let btnLabel = `Record Fully Paid (${formatCurrency(preBookingSettleAmount)})`;
        if (isPartial) { btnColor = 'bg-amber-600 active:bg-amber-700'; btnLabel = `Record Partial Payment (${formatCurrency(preBookingSettleAmount)})`; }
        else if (isUnpaid) { btnColor = 'bg-rose-600 active:bg-rose-700'; btnLabel = 'Record As Unpaid (100% Credit)'; }

        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPreBookingConfirmAction(null)}>
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <ScrollView className="w-full max-w-sm" style={{ maxHeight: '92%' }} contentContainerStyle={{ flexGrow: 0 }}>
                <View className="bg-white w-full rounded-3xl p-4 gap-2.5">
                  <Text className="text-base font-black text-slate-800 text-center">Confirm Delivery & Payment</Text>
                  <Text className="text-[10px] text-slate-500 font-semibold text-center leading-relaxed">
                    Mark pre-booking {booking.id.toUpperCase()} as delivered and record how much was collected from the store.
                  </Text>

                  <View className="bg-slate-50 rounded-xl p-2.5 gap-1">
                    <Text className="text-slate-400 font-black text-[8px] uppercase mb-0.5">Pre-Booking Bill</Text>
                    {booking.items.map(item => {
                      const p = data.products.find(prod => prod.id === item.product_id);
                      const amount = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, p?.pieces_per_box ?? 1) * item.unit_price;
                      return (
                        <View key={item.product_id} className="flex-row justify-between items-center">
                          <Text numberOfLines={1} className="flex-1 text-slate-700 font-bold text-[10px] pr-2">{p?.name || 'Unknown'} <Text className="text-slate-400 font-semibold">x{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })}</Text></Text>
                          <Text className="text-slate-600 font-bold text-[10px]">{formatCurrency(amount)}</Text>
                        </View>
                      );
                    })}
                    <View className="flex-row justify-between items-center border-t border-slate-200 mt-1 pt-1">
                      <Text className="text-slate-400 font-bold text-[10px] uppercase">Bill Total</Text>
                      <Text className="font-black text-indigo-600 text-sm">{formatWholeRupees(grandTotal)}</Text>
                    </View>
                  </View>

                  <View className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 gap-2">
                    <Text className="font-extrabold text-indigo-900 text-xs uppercase">Record Settlement</Text>
                    <View className="flex-row gap-2">
                      <Pressable onPress={() => { setPreBookingSettleMethod('UPI'); setPreBookingSettleAmount(parseFloat(grandTotal.toFixed(2))); }} className={`flex-1 py-2.5 rounded-xl border items-center ${!isPartial && !isUnpaid ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-indigo-100'}`}>
                        <Text className={`font-extrabold text-[10px] ${!isPartial && !isUnpaid ? 'text-white' : 'text-slate-700'}`}>Fully Paid</Text>
                      </Pressable>
                      <Pressable onPress={() => { setPreBookingSettleMethod('UPI'); setPreBookingSettleAmount(parseFloat((grandTotal / 2).toFixed(2))); }} className={`flex-1 py-2.5 rounded-xl border items-center ${isPartial ? 'bg-amber-500 border-amber-500' : 'bg-white border-indigo-100'}`}>
                        <Text className={`font-extrabold text-[10px] ${isPartial ? 'text-white' : 'text-slate-700'}`}>Partial Paid</Text>
                      </Pressable>
                      <Pressable onPress={() => { setPreBookingSettleMethod('Credit'); setPreBookingSettleAmount(0); }} className={`flex-1 py-2.5 rounded-xl border items-center ${isUnpaid ? 'bg-rose-600 border-rose-600' : 'bg-white border-indigo-100'}`}>
                        <Text className={`font-extrabold text-[10px] ${isUnpaid ? 'text-white' : 'text-slate-700'}`}>No Payment</Text>
                      </Pressable>
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className="font-bold text-indigo-700 mb-1 text-xs">Settlement Method</Text>
                        <SelectField
                          value={preBookingSettleMethod}
                          onValueChange={v => {
                            const prevMethod = preBookingSettleMethod;
                            setPreBookingSettleMethod(v as any);
                            if (v === 'Credit') setPreBookingSettleAmount(0);
                            else if (prevMethod === 'Credit' || preBookingSettleAmount === 0) setPreBookingSettleAmount(parseFloat(grandTotal.toFixed(2)));
                          }}
                          options={paymentMethodOptions}
                          title="Select Method"
                          className="bg-white border border-indigo-200 rounded-xl p-2.5 flex-row items-center justify-between"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="font-bold text-indigo-700 mb-1 text-xs">Settled Amount</Text>
                        <TextInput
                          editable={preBookingSettleMethod !== 'Credit'}
                          keyboardType="decimal-pad"
                          value={preBookingSettleAmount === 0 ? '' : String(preBookingSettleAmount)}
                          onChangeText={v => setPreBookingSettleAmount(Math.max(0, Math.min(grandTotal, parseFloat(v) || 0)))}
                          placeholder="0"
                          placeholderTextColor="#94a3b8"
                          className={`w-full border border-indigo-200 font-black text-indigo-900 rounded-xl p-2.5 ${preBookingSettleMethod === 'Credit' ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                        />
                      </View>
                    </View>

                    {isPartial && (
                      <View className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                        <Text className="text-[10px] text-amber-800 font-bold">Partial payment: {formatCurrency(grandTotal - preBookingSettleAmount)} outstanding will be automatically added to store credit.</Text>
                      </View>
                    )}
                    {isUnpaid && (
                      <View className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                        <Text className="text-[10px] text-rose-700 font-bold">Full amount {formatCurrency(grandTotal)} will be added to store outstanding credit.</Text>
                      </View>
                    )}

                    {preBookingSettleMethod === 'UPI' && (
                      <View className="bg-white border border-slate-200 rounded-xl p-2 flex-row items-center gap-2.5">
                        <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=upi://pay?pa=distributor@ic-erp&pn=Ice%20Cream%20Distributors&am=${preBookingSettleAmount}&cu=INR` }} className="w-16 h-16" />
                        <Text className="flex-1 text-[9px] font-black text-slate-500 uppercase">Scan via GPay, PhonePe, Paytm, BHIM UPI</Text>
                      </View>
                    )}
                  </View>

                  <View className="gap-2 mt-1">
                    <Pressable onPress={() => executeDeliverPreBookingOrder(booking.id)} className={`w-full py-2.5 rounded-xl items-center ${btnColor}`}>
                      <Text className="text-white font-black text-xs uppercase">{btnLabel}</Text>
                    </Pressable>
                    <Pressable onPress={() => setPreBookingConfirmAction(null)} className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                      <Text className="text-slate-700 font-extrabold text-xs">Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </View>
          </Modal>
        );
      })()}
    </View>
    </ScrollView>
  );
}
