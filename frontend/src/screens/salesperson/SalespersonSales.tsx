import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, Linking, Modal } from 'react-native';
import { Search, Plus, ShoppingCart, CheckCircle, Download, Eye, MessageSquare, X, CreditCard } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { Order, Invoice, Payment, Store, Product, AppNotification, NotificationEntityType, BoxPieceQty } from '../../types';
import SelectField from '../../components/common/SelectField';
import DateField from '../../components/common/DateField';
import BoxPieceInput from '../../components/common/BoxPieceInput';
import { formatQty, isPositiveQty, compareQty, readQtyField, toTotalPieces, formatUnitRate } from '../../utils/qty';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import FilterBar, { FILTER_PILL_CLASS, FILTER_PILL_TEXT_CLASS } from '../../components/common/FilterBar';
import ViewToggle from '../../components/common/ViewToggle';
import { exportHtmlReport, openWebPreviewWindow } from '../../utils/reportExport';
import { buildOrderInvoicePdf } from '../../utils/orderInvoicePdf';
import { useAppContext } from '../../context/AppContext';
import { useViewMode } from '../../context/ViewModeContext';
import { ordersApi, storesApi } from '../../api/endpoints';
import { getEffectiveProductPrice } from '../../utils/pricing';
import { isGstToggleEnabled, isRetailPricingEnabled } from '../../utils/permissions';
import { computeInvoiceTotals, formatWholeRupees, formatCurrency } from '../../utils/billing';

export type SalespersonSalesForm =
  | 'list' | 'create_order' | 'preview_invoice' | 'payment_settlement' | 'collect_payment'
  | 'qr_pay' | 'register_store' | 'add_visit' | 'bill_settlement_ledger';

interface SalespersonSalesProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  showAlert: (opts: any) => void;
  // Which nominal screen was selected from the outer nav ('home' or 'stores'
  // - both live in this one component, like AdminSales's own activeScreen
  // groups several registry items into one component's internal sub-view).
  activeScreen?: 'home' | 'stores';
  // Lifted to the caller (SalespersonFlow.tsx, or whichever host is
  // rendering this as a cross-role "Additional Access" screen) so the
  // caller's own chrome (e.g. the mobile bottom tab bar) can hide itself
  // while a full-screen form is open here, exactly as it did before this
  // file was extracted out of SalespersonFlow.tsx.
  activeForm: SalespersonSalesForm;
  setActiveForm: (form: SalespersonSalesForm) => void;
  // "Pre-book" button hands off to the Deliveries screen with this store
  // pre-selected - Deliveries is now a separate component/screen entirely.
  onNavigateToDeliveries?: (storeId: string) => void;
  // The Home tab's "Create New Order" quick action switches to the Stores
  // sub-view - since the outer shell's own sidebar/bottom-tab highlighting
  // needs to stay in sync with that (it used to be one shared `activeTab`),
  // this notifies the caller so its own top-level nav state follows along.
  onRequestSalesTab?: (tab: 'home' | 'stores') => void;
}

const inputClass = "w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800";

// Extracted from SalespersonFlow.tsx's former 'home' + 'stores' tabs, plus
// every form screen reachable from either of them. These two tabs share
// state (selectedStore, the whole order-creation/settlement/ledger flow,
// handleStartOrder called identically from both) so - like AdminSales.tsx
// already does for 8 of Admin's own registry items - they live in one
// component with an internal `salesTab` sub-view instead of two separate
// components.
export default function SalespersonSales({ data, setData, addNotification, currentUser, showAlert, activeScreen, activeForm, setActiveForm, onNavigateToDeliveries, onRequestSalesTab }: SalespersonSalesProps) {
  const { refreshData, syncQueueOffline } = useAppContext();
  const { viewMode } = useViewMode();

  const [salesTab, setSalesTab] = useState<'home' | 'stores'>(activeScreen === 'stores' ? 'stores' : 'home');
  useEffect(() => {
    if (activeScreen === 'home' || activeScreen === 'stores') setSalesTab(activeScreen);
  }, [activeScreen]);


  const [storeSearch, setStoreSearch] = useState('');
  const [storeStatusFilter, setStoreStatusFilter] = useState<'All' | 'Paid' | 'Unpaid' | 'Partial'>('All');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<'All' | 'Paid' | 'Partial' | 'Credit'>('All');
  const [expandedInvoices, setExpandedInvoices] = useState<string[]>([]);
  // Table view can't expand a row in place the way the card grid does (see
  // DataTable.tsx - fixed columns only, no per-row expansion), so a "View
  // Details" action there opens the same items/payments breakdown in a
  // modal instead, keeping detail access available regardless of view mode.
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [settlementOrigin, setSettlementOrigin] = useState<'order' | 'ledger'>('order');

  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<Order | null>(null);
  const [tempOrder, setTempOrder] = useState<Order | null>(null);
  const [tempInvoice, setTempInvoice] = useState<Invoice | null>(null);

  const [orderItems, setOrderItems] = useState<{ [productId: string]: BoxPieceQty }>({});
  const [orderItemOrder, setOrderItemOrder] = useState<string[]>([]);
  const updateOrderItemOrder = (productId: string, qty: BoxPieceQty) => {
    setOrderItemOrder(prev => {
      if (isPositiveQty(qty)) return prev.includes(productId) ? prev : [...prev, productId];
      return prev.includes(productId) ? prev.filter(id => id !== productId) : prev;
    });
  };
  const [pricingMode, setPricingMode] = useState<'wholesale' | 'retail'>('wholesale');
  const [orderGstMode, setOrderGstMode] = useState<'with_gst' | 'without_gst'>('with_gst');
  const [orderProductSearch, setOrderProductSearch] = useState('');

  const canToggleGst = isGstToggleEnabled(currentUser, data.rolePermissions, data.userPermissions);
  const retailEnabled = isRetailPricingEnabled(currentUser, data.rolePermissions, data.userPermissions);
  const effectivePricingMode = retailEnabled ? pricingMode : 'wholesale';
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'>('UPI');

  const [newStoreForm, setNewStoreForm] = useState({ name: '', owner_name: '', phone: '', address: '', area: 'Kothrud', city: 'Pune', partner_type: 'Retail Shop' });
  const [visitForm, setVisitForm] = useState({
    notes: 'Completed routine site check-in. Cleaned ice cream freezer.',
    follow_up_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  });

  const assignedTruck = data.trucks.find(t => t.driver_user_id === currentUser.id);
  const truckId = assignedTruck?.id || 't1';
  const hasTruckStock = data.products.some(p => p.status === 'Active' && isPositiveQty(readQtyField(data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === p.id), 'quantity', 'quantity_pieces')));

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLocalStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const todayCollections = data.payments
    .filter(p => p.collected_by === currentUser.id && (p.date.includes(todayStr) || p.date.includes(todayLocalStr)))
    .reduce((s, p) => s + p.amount, 0);

  const pendingDeliveries = data.orders.filter(o => o.truck_id === truckId && o.status === 'Confirmed');

  const paymentMethodOptions = ['UPI', 'Cash', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Credit'].map(m => ({ label: m === 'UPI' ? 'UPI Payment QR' : m === 'Cash' ? 'Cash Handover' : m === 'Credit' ? 'Pay on Credit (Outstanding)' : m, value: m }));

  const downloadInvoicePDF = async (order: Order, invoice: Invoice, store: Store) => {
    const previewWindow = openWebPreviewWindow();
    const { html, fileName } = buildOrderInvoicePdf(order, invoice, store, data.products);
    await exportHtmlReport(html, fileName, showAlert, previewWindow);
  };

  const handleWhatsAppShare = (inv: Invoice, store: Store, order?: Order) => {
    const phoneClean = store.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = phoneClean.length === 10 ? `91${phoneClean}` : phoneClean;
    let itemDetails = '';
    if (order) {
      itemDetails = '\n\n*Items Ordered:*' + order.items.map(item => {
        const p = data.products.find(prod => prod.id === item.product_id);
        const eff = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, p?.pieces_per_box ?? 1);
        return `\n- ${p?.name || 'Product'}: ${formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x ${formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)} = Rs. ${(eff * item.unit_price).toFixed(2)}`;
      }).join('');
    }
    const paidVal = inv.paid_amount || 0;
    const dueVal = Math.max(0, inv.grand_total - paidVal);
    const paymentStatusText = inv.payment_status === 'Paid' ? 'FULLY PAID' : inv.payment_status === 'Partial' ? `PARTIAL PAID (Paid: Rs. ${paidVal.toFixed(2)})` : 'UNPAID / CREDIT';
    const roundOffLine = `\n- Round Off: ${(inv.round_off || 0) > 0 ? '+' : ''}Rs. ${(inv.round_off || 0).toFixed(2)}`;
    const text = `*FROSTFLOW ICE CREAMS - DISPATCH INVOICE*\n\nHello *${store.owner_name}* (${store.name}), your invoice *${inv.invoice_number}* is ready and dispatched.${itemDetails}\n\n*Billing Summary:*\n- Total: Rs. ${inv.total.toFixed(2)}\n- GST Tax: Rs. ${inv.tax.toFixed(2)}${roundOffLine}\n- *Grand Total: Rs. ${inv.grand_total.toFixed(2)}*\n- Settlement Status: *${paymentStatusText}*\n- Balance Outstanding: *Rs. ${dueVal.toFixed(2)}*\n\nThank you for choosing FrostFlow Ice Creams!`;
    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => showAlert('Could not open WhatsApp. Please ensure it is installed.'));
  };

  const getStoreStatus = (storeId: string, outstanding: number) => {
    const storeInvoices = data.invoices.filter(inv => {
      const order = data.orders.find(o => o.id === inv.order_id);
      return order && order.store_id === storeId;
    });
    if (storeInvoices.length === 0) return outstanding > 0.05 ? 'Unpaid' : 'Paid';
    const hasUnpaid = storeInvoices.some(inv => inv.payment_status === 'Credit' || !inv.payment_status);
    const hasPartial = storeInvoices.some(inv => inv.payment_status === 'Partial');
    if (hasUnpaid) return 'Unpaid';
    if (hasPartial) return 'Partial';
    return 'Paid';
  };

  const toggleInvoiceExpand = (invoiceId: string) => {
    setExpandedInvoices(prev => (prev.includes(invoiceId) ? prev.filter(id => id !== invoiceId) : [...prev, invoiceId]));
  };

  const handleStartOrder = (store: Store) => {
    if (data.products.length === 0) {
      showAlert('No ice cream products are available in the catalog yet. Please contact your administrator before creating an order.');
      return;
    }
    setSelectedStore(store);
    setOrderItems({});
    setOrderItemOrder([]);
    setPricingMode('wholesale');
    setOrderGstMode('with_gst');
    setOrderProductSearch('');
    setActiveForm('create_order');
  };

  const handleSetItemQty = (productId: string, requested: BoxPieceQty) => {
    const product = data.products.find(p => p.id === productId);
    const piecesPerBox = product?.pieces_per_box ?? 1;
    const currentTruckStock = readQtyField(data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === productId), 'quantity', 'quantity_pieces');
    if (compareQty(requested, currentTruckStock, piecesPerBox) > 0) {
      showAlert(`Limit exceeded! Only ${formatQty(currentTruckStock)} of this flavor are available in your truck inventory.`);
    }
    const nextQty = compareQty(requested, currentTruckStock, piecesPerBox) > 0 ? currentTruckStock : requested;
    setOrderItems({ ...orderItems, [productId]: nextQty });
    updateOrderItemOrder(productId, nextQty);
  };

  // Shared by handleConfirmOrder below and the live "Estimated Total Value"
  // banner on the create_order screen, so the number shown while picking
  // products is computed exactly the same way as what actually gets
  // submitted - same pattern as AdminSales.tsx's buildNewOrderItemsList().
  const buildOrderItemsList = () =>
    orderItemOrder
      .map(prodId => {
        const qty = orderItems[prodId] ?? { boxes: 0, pieces: 0 };
        if (!isPositiveQty(qty)) return null;
        const p = data.products.find(prod => prod.id === prodId)!;
        const appliedPrice = getEffectiveProductPrice(p, effectivePricingMode, selectedStore?.id, data.storePricing);
        const tax_pct = canToggleGst && orderGstMode === 'without_gst' ? 0 : p.tax_pct;
        return { product_id: prodId, quantity: qty.boxes, quantity_pieces: qty.pieces, pieces_per_box: p.pieces_per_box, unit_price: appliedPrice, tax_pct };
      })
      .filter((item): item is { product_id: string; quantity: number; quantity_pieces: number; pieces_per_box: number; unit_price: number; tax_pct: number } => item !== null);

  const handleConfirmOrder = () => {
    const activeItems = buildOrderItemsList();
    if (activeItems.length === 0) {
      showAlert('Please add at least one ice cream item to create an order.');
      return;
    }
    const { total, tax, grand_total: grandTotal, round_off: roundOff } = computeInvoiceTotals(activeItems);
    const orderId = 'o_' + Date.now();
    const newOrder: Order = { id: orderId, store_id: selectedStore!.id, salesperson_id: currentUser.id, truck_id: truckId, status: 'Delivered', created_at: new Date().toISOString(), items: activeItems };
    const newInvoice: Invoice = {
      id: 'inv_' + Date.now(), order_id: orderId, invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
      total, tax, grand_total: grandTotal, round_off: roundOff, created_at: new Date().toISOString()
    };
    setTempOrder(newOrder);
    setTempInvoice(newInvoice);
    setPaymentAmount(parseFloat(grandTotal.toFixed(2)));
    setPaymentMethod('UPI');
    setActiveForm('preview_invoice');
  };

  const handleFinalizeOrderOnly = async () => {
    if (!tempOrder || !tempInvoice) return;

    if (data.isOffline) {
      syncQueueOffline('CREATE_ORDER', { order: tempOrder, invoice: tempInvoice });
      showAlert('Network Offline: Order recorded and queued for auto-sync once connection is restored!');
      setData({ ...data, orders: [tempOrder, ...data.orders], invoices: [tempInvoice, ...data.invoices] });
      setGeneratedInvoice(tempInvoice);
      setLastCreatedOrder(tempOrder);
      setPaymentAmount(parseFloat(tempInvoice.grand_total.toFixed(2)));
      setPaymentMethod('UPI');
      setSettlementOrigin('order');
      setActiveForm('payment_settlement');
      return;
    }

    try {
      const result = await ordersApi.create({ store_id: selectedStore!.id, salesperson_id: currentUser.id, truck_id: truckId, items: tempOrder.items });
      await refreshData();
      setGeneratedInvoice(result.invoice);
      setLastCreatedOrder(result.order);
      setPaymentAmount(parseFloat(result.invoice.grand_total.toFixed(2)));
      setPaymentMethod('UPI');
      setSettlementOrigin('order');
      setActiveForm('payment_settlement');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to create order.');
    }
  };

  const handleFinalizeSettlementOnly = async () => {
    if (!lastCreatedOrder || !generatedInvoice) return;

    if (data.isOffline) {
      const remainingOwed = Math.max(0, generatedInvoice.grand_total - (generatedInvoice.paid_amount || 0));
      const isPayLater = paymentMethod === 'Credit' || paymentAmount === 0;
      const actualCollection = isPayLater ? 0 : Math.min(paymentAmount, remainingOwed);
      const newPayment: Payment | null = actualCollection > 0
        ? { id: 'pay_' + Date.now(), store_id: selectedStore!.id, order_id: lastCreatedOrder.id, amount: actualCollection, method: paymentMethod as any, date: new Date().toISOString(), collected_by: currentUser.id }
        : null;
      if (newPayment) syncQueueOffline('RECORD_PAYMENT', { payment: newPayment });
      showAlert('Network Offline: Payment settlement recorded and queued for auto-sync!');
      if (newPayment) setData({ ...data, payments: [newPayment, ...data.payments] });
      setActiveForm(settlementOrigin === 'ledger' ? 'bill_settlement_ledger' : 'collect_payment');
      return;
    }

    try {
      const result = await ordersApi.settle(lastCreatedOrder.id, { method: paymentMethod, amount: paymentAmount });
      await refreshData();
      if (settlementOrigin === 'order') {
        const paymentStatusLabel = result.paymentStatus === 'Paid' ? 'Fully Paid' : result.paymentStatus === 'Partial' ? 'Partially Paid' : 'Payment Pending (Credit)';
        addNotification('new_order', `Order confirmed for ${selectedStore?.name} - ${paymentStatusLabel}. Grand Total: ${formatWholeRupees(generatedInvoice.grand_total)}.`, 'order', lastCreatedOrder.id);
      }
      if (result.actualCollection > 0) {
        addNotification('payment_received', `Driver collected ${formatWholeRupees(result.actualCollection)} from ${selectedStore?.name}.`, 'store', selectedStore?.id);
      }
      showAlert('Payment Settlement recorded successfully!');
      setActiveForm(settlementOrigin === 'ledger' ? 'bill_settlement_ledger' : 'collect_payment');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to record payment settlement.');
    }
  };

  const handleRegisterStore = async () => {
    if (!newStoreForm.name || !newStoreForm.phone) {
      showAlert('Name and contact phone are required.');
      return;
    }
    if (data.isOffline) {
      const newStore: Store = {
        id: 'st_' + Date.now(), name: newStoreForm.name, owner_name: newStoreForm.owner_name || 'Manager', phone: newStoreForm.phone,
        alt_phone: '', address: newStoreForm.address || 'Address placeholder', area: newStoreForm.area, city: newStoreForm.city,
        state: 'Maharashtra', pincode: '411001', gst_number: '', credit_limit: 1000, outstanding_balance: 0, refill_frequency: 'Weekly',
        last_purchase_date: '', next_refill_date: new Date().toISOString().split('T')[0], ranking: 'Silver',
        partner_type: newStoreForm.partner_type || 'Retail Shop', status: 'Active'
      };
      syncQueueOffline('REGISTER_STORE', { store: newStore });
      showAlert('Network Offline: New store registered and queued!');
      setActiveForm('list');
      return;
    }
    try {
      const created = await storesApi.create({
        name: newStoreForm.name, owner_name: newStoreForm.owner_name || 'Manager', phone: newStoreForm.phone,
        alt_phone: '', address: newStoreForm.address || 'Address placeholder', area: newStoreForm.area, city: newStoreForm.city,
        state: 'Maharashtra', pincode: '411001', gst_number: '', credit_limit: 1000, refill_frequency: 'Weekly', ranking: 'Silver',
        partner_type: newStoreForm.partner_type || 'Retail Shop',
      });
      await refreshData();
      addNotification('partner_update', `Driver registered new store in area ${newStoreForm.area}: ${newStoreForm.name}`, 'store', created.id);
      showAlert('Store registered successfully!');
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to register store.');
    }
  };

  const handleRecordVisit = async () => {
    if (data.isOffline) {
      const newVisit = { id: 'v_' + Date.now(), store_id: selectedStore!.id, salesperson_id: currentUser.id, date: new Date().toISOString(), notes: visitForm.notes, follow_up_date: visitForm.follow_up_date, completed: true };
      syncQueueOffline('REGISTER_VISIT', { visit: newVisit });
      showAlert('Network Offline: Site visit logged and queued!');
      setActiveForm('list');
      return;
    }
    try {
      await storesApi.recordVisit({ store_id: selectedStore!.id, notes: visitForm.notes, follow_up_date: visitForm.follow_up_date });
      await refreshData();
      showAlert('Site visit notes logged successfully!');
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to log site visit.');
    }
  };

  if (activeForm === 'create_order') {
    const getTruckStock = (productId: string): BoxPieceQty => readQtyField(data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === productId), 'quantity', 'quantity_pieces');

    const renderQtyStepper = (product: Product) => (
      <BoxPieceInput
        value={orderItems[product.id] ?? { boxes: 0, pieces: 0 }}
        onChange={q => handleSetItemQty(product.id, q)}
        piecesPerBox={product.pieces_per_box}
        compact
      />
    );

    const filteredOrderProducts = data.products
      .filter(p => p.status === 'Active' && isPositiveQty(getTruckStock(p.id)) && p.name.toLowerCase().includes(orderProductSearch.trim().toLowerCase()));

    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Create Store Order ({selectedStore?.name})</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
          </View>

          <View className="gap-2 sm:flex-row sm:flex-wrap">
            {retailEnabled && (
              <View className="sm:flex-1 flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
                <Text className="text-[9px] font-bold text-slate-500 uppercase">Pricing Mode</Text>
                <View className="flex-row bg-white p-0.5 rounded-lg border border-slate-200">
                  <Pressable onPress={() => setPricingMode('wholesale')} className={`px-2 py-1 rounded-md ${pricingMode === 'wholesale' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${pricingMode === 'wholesale' ? 'text-white' : 'text-slate-500'}`}>Wholesale</Text>
                  </Pressable>
                  <Pressable onPress={() => setPricingMode('retail')} className={`px-2 py-1 rounded-md ${pricingMode === 'retail' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${pricingMode === 'retail' ? 'text-white' : 'text-slate-500'}`}>Selling</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {canToggleGst && (
              <View className="sm:flex-1 flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
                <Text className="text-[9px] font-bold text-slate-500 uppercase">GST</Text>
                <View className="flex-row bg-white p-0.5 rounded-lg border border-slate-200">
                  <Pressable onPress={() => setOrderGstMode('with_gst')} className={`px-2 py-1 rounded-md ${orderGstMode === 'with_gst' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${orderGstMode === 'with_gst' ? 'text-white' : 'text-slate-500'}`}>With GST</Text>
                  </Pressable>
                  <Pressable onPress={() => setOrderGstMode('without_gst')} className={`px-2 py-1 rounded-md ${orderGstMode === 'without_gst' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${orderGstMode === 'without_gst' ? 'text-white' : 'text-slate-500'}`}>No GST</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
            <View className="flex-row items-center justify-between flex-wrap gap-2">
              <Text className="font-bold text-slate-500 text-[10px] uppercase">Select Products & Quantities (Truck Stock):</Text>
              <ViewToggle />
            </View>
            <View className="flex-row items-center gap-2 bg-white border border-slate-200 rounded-xl px-3">
              <Search size={14} color="#94a3b8" />
              <TextInput
                value={orderProductSearch}
                onChangeText={setOrderProductSearch}
                placeholder="Search products..."
                placeholderTextColor="#94a3b8"
                className="flex-1 text-xs text-slate-800 py-2"
                style={{ outlineStyle: 'none' } as any}
              />
              {orderProductSearch.length > 0 && (
                <Pressable onPress={() => setOrderProductSearch('')} hitSlop={8}>
                  <X size={14} color="#94a3b8" />
                </Pressable>
              )}
            </View>

            {filteredOrderProducts.length === 0 ? (
              <Text className="text-[10px] text-slate-400 italic py-2 text-center">
                {!hasTruckStock ? 'No cargo loaded on this truck — no products available to order.' : orderProductSearch.trim() ? 'No products match your search.' : 'No products currently have truck stock available.'}
              </Text>
            ) : viewMode === 'table' ? (
              <DataTable
                data={filteredOrderProducts}
                keyExtractor={p => p.id}
                emptyText="No products currently have truck stock available."
                columns={[
                  { key: 'product', label: 'Product', width: 170, render: p => <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{p.name}</Text> },
                  { key: 'price', label: 'Rate', width: 130, render: p => <Text className="text-slate-600 text-[11px] font-bold">{formatCurrency(getEffectiveProductPrice(p, effectivePricingMode, selectedStore?.id, data.storePricing))}</Text> },
                  { key: 'stock', label: 'Truck Stock', width: 90, align: 'center', grow: false, render: p => <Text className="text-center text-[11px] font-black text-slate-800">{formatQty(getTruckStock(p.id))}</Text> },
                  { key: 'qty', label: 'Quantity', width: 140, grow: false, render: renderQtyStepper },
                ] as DataTableColumn<Product>[]}
              />
            ) : (
              <View className="gap-2 md:flex-row md:flex-wrap">
                {filteredOrderProducts.map(p => (
                  <View key={p.id} className="w-full md:w-[48%] flex-row items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-2">
                    <View className="flex-1">
                      <Text className="font-bold text-slate-800 text-[11px]">{p.name}</Text>
                      <Text className="text-slate-400 text-[9px]">{formatCurrency(getEffectiveProductPrice(p, effectivePricingMode, selectedStore?.id, data.storePricing))} - Truck Stock: {formatQty(getTruckStock(p.id))} available</Text>
                    </View>
                    {renderQtyStepper(p)}
                  </View>
                ))}
              </View>
            )}
          </View>

          <View className="bg-slate-100 p-2.5 rounded-xl flex-row justify-between items-center">
            <Text className="font-bold text-slate-500 text-xs">Estimated Total Value{orderGstMode === 'with_gst' ? ' (Incl. GST)' : ''}:</Text>
            <Text className="font-black text-slate-800 text-sm">{formatWholeRupees(computeInvoiceTotals(buildOrderItemsList()).grand_total)}</Text>
          </View>

          {hasTruckStock && (
            <Pressable onPress={handleConfirmOrder} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
              <Text className="text-white font-bold text-xs">Confirm & Preview Invoice</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    );
  }

  if (activeForm === 'preview_invoice') {
    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-2xl gap-4">
          <View className="flex-row justify-between items-center border-b border-slate-200 pb-2">
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">Invoice Draft & Preview</Text>
              <Text className="text-[10px] text-slate-400">Verify bill details before recording settlement</Text>
            </View>
            <Pressable onPress={() => setActiveForm('create_order')} className="border border-slate-200 bg-white px-2.5 py-1 rounded-xl active:bg-slate-50"><Text className="text-slate-500 text-xs font-extrabold">Back</Text></Pressable>
          </View>

          <View className="bg-white border border-slate-200 rounded-2xl p-4 gap-3">
            <View className="flex-row justify-between items-start border-b border-slate-100 pb-2.5">
              <View>
                <Text className="font-black text-xs text-slate-800 uppercase">Amul Ice Cream Distributors</Text>
                <Text className="text-[9px] text-slate-400">Authorized Logistics & Supply Partner</Text>
              </View>
              <View className="items-end">
                <Text className="font-bold text-slate-700 text-xs">{tempInvoice?.invoice_number}</Text>
                <Text className="text-[9px] text-slate-400 font-bold">{new Date().toLocaleDateString('en-IN')}</Text>
              </View>
            </View>

            <View className="flex-row gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
              <View className="flex-1">
                <Text className="text-slate-400 font-bold uppercase text-[8px]">Bill To Partner:</Text>
                <Text className="font-bold text-slate-700 text-[11px]">{selectedStore?.name}</Text>
                <Text className="text-slate-500 text-[10px]">Prop: {selectedStore?.owner_name}</Text>
                <Text className="text-slate-400 text-[10px]">Phone: {selectedStore?.phone}</Text>
              </View>
              <View className="flex-1 items-end">
                <Text className="text-slate-400 font-bold uppercase text-[8px]">Delivered By:</Text>
                <Text className="font-bold text-slate-700 text-[11px]">{currentUser?.name}</Text>
                <Text className="text-slate-400 text-[10px]">Vehicle: {assignedTruck?.vehicle_number}</Text>
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="font-extrabold text-slate-400 uppercase text-[8px]">Bill Details (Cargo Items)</Text>
              {tempOrder?.items.map(item => {
                const prod = data.products.find(p => p.id === item.product_id);
                const amount = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, prod?.pieces_per_box ?? 1) * item.unit_price;
                return (
                  <View key={item.product_id} className="flex-row justify-between border-b border-slate-50 py-1.5">
                    <Text className="font-bold text-slate-700 text-[11px] flex-1">{prod?.name || 'Unknown'}</Text>
                    <Text className="font-black text-slate-800 text-[11px] w-16 text-center">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })}</Text>
                    <Text className="text-slate-500 text-[10px] w-16 text-right">{formatCurrency(item.unit_price)}</Text>
                    <Text className="font-bold text-slate-700 text-[11px] w-16 text-right">{formatCurrency(amount)}</Text>
                  </View>
                );
              })}
            </View>

            <View className="pt-2 border-t border-slate-100 gap-1.5">
              <View className="flex-row justify-between"><Text className="text-slate-500 text-xs">Subtotal:</Text><Text className="font-bold text-slate-700 text-xs">{tempInvoice ? formatCurrency(tempInvoice.total) : formatCurrency(0)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-slate-500 text-xs">GST:</Text><Text className="font-bold text-slate-700 text-xs">{tempInvoice ? formatCurrency(tempInvoice.tax) : formatCurrency(0)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-slate-500 text-xs">Total (Before Round Off):</Text><Text className="font-bold text-slate-700 text-xs">{tempInvoice ? formatCurrency(tempInvoice.total + tempInvoice.tax) : formatCurrency(0)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-slate-500 text-xs">Round Off:</Text><Text className="font-bold text-slate-700 text-xs">{(tempInvoice?.round_off || 0) > 0 ? '+' : ''}{formatCurrency(tempInvoice?.round_off || 0)}</Text></View>
              <View className="flex-row justify-between bg-slate-50 p-2 rounded-xl">
                <Text className="text-indigo-600 uppercase font-extrabold text-xs">Net Amount (Grand Total):</Text>
                <Text className="text-indigo-600 text-sm font-black">{formatWholeRupees(tempInvoice ? tempInvoice.grand_total : 0)}</Text>
              </View>
            </View>
          </View>

          <Pressable onPress={handleFinalizeOrderOnly} className="w-full py-3 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
            <Text className="text-white font-black text-xs uppercase">Save Order & Continue to Payment</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (activeForm === 'payment_settlement') {
    const dbInvoice = generatedInvoice ? data.invoices.find(i => i.id === generatedInvoice.id) : null;
    const priorPaid = dbInvoice ? (dbInvoice.paid_amount || 0) : 0;
    const totalBillAmount = generatedInvoice ? generatedInvoice.grand_total : 0;
    const remainingToPay = Math.max(0, totalBillAmount - priorPaid);
    const isPaidPreset = paymentMethod !== 'Credit' && Math.abs(paymentAmount - remainingToPay) < 0.05;
    const isPartialPreset = paymentMethod !== 'Credit' && paymentAmount > 0 && paymentAmount < remainingToPay - 0.05;
    const isUnpaidPreset = paymentMethod === 'Credit' || paymentAmount === 0;
    let btnColor = 'bg-emerald-600 active:bg-emerald-700';
    let btnLabel = `Record Fully Paid (${formatCurrency(paymentAmount)})`;
    if (isPartialPreset) { btnColor = 'bg-amber-600 active:bg-amber-700'; btnLabel = `Record Partial Payment (${formatCurrency(paymentAmount)})`; }
    else if (isUnpaidPreset) { btnColor = 'bg-rose-600 active:bg-rose-700'; btnLabel = 'Record As Unpaid (100% Credit)'; }

    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-2xl gap-4">
          <View className="flex-row items-center gap-2 border-b border-slate-200 pb-2">
            <Pressable onPress={() => setActiveForm(settlementOrigin === 'ledger' ? 'bill_settlement_ledger' : 'list')} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
              <Text className="font-extrabold text-[10px] uppercase text-slate-600">Back</Text>
            </Pressable>
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">Payment Settlement</Text>
              <Text className="text-[10px] text-slate-400">Record payment received for confirmed delivery</Text>
            </View>
          </View>

          <View className="bg-white border border-slate-200 rounded-2xl p-3 gap-1.5">
            <View className="flex-row justify-between border-b border-slate-100 pb-1.5"><Text className="text-slate-400 font-bold uppercase text-[9px]">Client Partner</Text><Text className="font-extrabold text-slate-800 text-xs">{selectedStore?.name}</Text></View>
            <View className="flex-row justify-between border-b border-slate-100 pb-1.5"><Text className="text-slate-400 font-bold uppercase text-[9px]">Invoice Number</Text><Text className="font-extrabold text-slate-800 text-xs">{generatedInvoice?.invoice_number}</Text></View>

            {!!lastCreatedOrder?.items.length && (
              <View className="border-b border-slate-100 pb-1.5 gap-1">
                <Text className="text-slate-400 font-black text-[8px] uppercase">Order Bill</Text>
                {lastCreatedOrder.items.map(item => {
                  const prod = data.products.find(p => p.id === item.product_id);
                  const amount = toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces }, prod?.pieces_per_box ?? 1) * item.unit_price;
                  return (
                    <View key={item.product_id} className="flex-row justify-between items-center">
                      <Text numberOfLines={1} className="flex-1 text-slate-700 font-bold text-[10px] pr-2">{prod?.name || 'Unknown'} <Text className="text-slate-400 font-semibold">x{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })}</Text></Text>
                      <Text className="text-slate-600 font-bold text-[10px]">{formatCurrency(amount)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View className="flex-row justify-between border-b border-slate-100 pb-1.5"><Text className="text-slate-400 font-bold uppercase text-[9px]">Grand Total</Text><Text className="font-extrabold text-slate-800 text-xs">{formatCurrency(totalBillAmount)}</Text></View>
            {priorPaid > 0 && <View className="flex-row justify-between border-b border-slate-100 pb-1.5"><Text className="text-slate-400 font-bold uppercase text-[9px]">Previously Paid</Text><Text className="font-extrabold text-emerald-600 text-xs">{formatCurrency(priorPaid)}</Text></View>}
            <View className="flex-row justify-between"><Text className="text-slate-400 font-bold uppercase text-[9px]">Remaining Due</Text><Text className="font-black text-indigo-600 text-sm">{formatCurrency(remainingToPay)}</Text></View>
          </View>

          <View className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 gap-2">
            <Text className="font-extrabold text-indigo-900 text-xs uppercase">Record Settlement</Text>
            <View className="flex-row gap-2">
              <Pressable onPress={() => { setPaymentMethod('UPI'); setPaymentAmount(parseFloat(remainingToPay.toFixed(2))); }} className={`flex-1 py-2.5 rounded-xl border items-center ${isPaidPreset ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-indigo-100'}`}>
                <Text className={`font-extrabold text-[10px] ${isPaidPreset ? 'text-white' : 'text-slate-700'}`}>Fully Paid</Text>
              </Pressable>
              <Pressable onPress={() => { setPaymentMethod('UPI'); setPaymentAmount(parseFloat((remainingToPay / 2).toFixed(2))); }} className={`flex-1 py-2.5 rounded-xl border items-center ${isPartialPreset ? 'bg-amber-500 border-amber-500' : 'bg-white border-indigo-100'}`}>
                <Text className={`font-extrabold text-[10px] ${isPartialPreset ? 'text-white' : 'text-slate-700'}`}>Partial Paid</Text>
              </Pressable>
              <Pressable onPress={() => { setPaymentMethod('Credit'); setPaymentAmount(0); }} className={`flex-1 py-2.5 rounded-xl border items-center ${isUnpaidPreset ? 'bg-rose-600 border-rose-600' : 'bg-white border-indigo-100'}`}>
                <Text className={`font-extrabold text-[10px] ${isUnpaidPreset ? 'text-white' : 'text-slate-700'}`}>No Payment</Text>
              </Pressable>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-bold text-indigo-700 mb-1 text-xs">Settlement Method</Text>
                <SelectField
                  value={paymentMethod}
                  onValueChange={v => {
                    const method = v as any;
                    const prevMethod = paymentMethod;
                    setPaymentMethod(method);
                    if (method === 'Credit') setPaymentAmount(0);
                    else if (prevMethod === 'Credit' || paymentAmount === 0) setPaymentAmount(parseFloat(remainingToPay.toFixed(2)));
                  }}
                  options={paymentMethodOptions}
                  title="Select Method"
                  className="bg-white border border-indigo-200 rounded-xl p-2.5 flex-row items-center justify-between"
                />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-indigo-700 mb-1 text-xs">Settled Amount</Text>
                <TextInput
                  editable={paymentMethod !== 'Credit'}
                  keyboardType="decimal-pad"
                  value={paymentAmount === 0 ? '' : String(paymentAmount)}
                  onChangeText={v => {
                    const requested = parseFloat(Number(v || 0).toFixed(2));
                    if (requested > remainingToPay + 0.05) {
                      showAlert(`Only ${formatCurrency(remainingToPay)} is owed on this bill — the amount has been capped to that.`);
                    }
                    setPaymentAmount(Math.max(0, Math.min(remainingToPay, requested)));
                  }}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  className={`w-full border border-indigo-200 font-black text-indigo-900 rounded-xl p-2.5 ${paymentMethod === 'Credit' ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                />
              </View>
            </View>

            {paymentMethod !== 'Credit' && paymentAmount < remainingToPay - 0.05 && (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                <Text className="text-[10px] text-amber-800 font-bold">Partial payment: {formatCurrency(remainingToPay - paymentAmount)} outstanding will be automatically added to store credit.</Text>
              </View>
            )}

            {paymentMethod === 'UPI' && (
              <View className="bg-white border border-slate-200 rounded-xl p-2 flex-row items-center gap-2.5">
                <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=upi://pay?pa=distributor@ic-erp&pn=Ice%20Cream%20Distributors&am=${paymentAmount}&cu=INR` }} className="w-16 h-16" />
                <Text className="flex-1 text-[9px] font-black text-slate-500 uppercase">Scan via GPay, PhonePe, Paytm, BHIM UPI</Text>
              </View>
            )}

            <Pressable onPress={handleFinalizeSettlementOnly} className={`w-full py-3 rounded-xl items-center ${btnColor}`}>
              <Text className="text-white font-black text-xs uppercase">{btnLabel}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (activeForm === 'collect_payment') {
    return (
      <View className="flex-1 p-4 items-center">
        <View className="w-full lg:max-w-lg flex-1 justify-between">
          <View className="gap-4">
            <View className="items-center py-4 gap-2">
              <View className="w-14 h-14 bg-emerald-100 border border-emerald-200 rounded-full items-center justify-center">
                <CheckCircle size={28} color="#059669" />
              </View>
              <Text className="font-black text-slate-800 text-sm">Order Placed & Settled!</Text>
              <Text className="text-[10px] text-slate-400">Draft Invoice committed successfully</Text>
            </View>
            <View className="bg-white border border-slate-200 rounded-2xl p-4 gap-2">
              <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Invoice Number:</Text><Text className="font-black text-slate-800 text-xs">{generatedInvoice?.invoice_number}</Text></View>
              <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Client Partner:</Text><Text className="font-extrabold text-slate-800 text-xs">{selectedStore?.name}</Text></View>
              <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Settle Amount:</Text><Text className="font-black text-emerald-600 text-xs">{formatCurrency(paymentAmount)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-slate-400 font-bold uppercase text-[9px]">Method:</Text><Text className="font-extrabold text-indigo-600 uppercase text-xs">{paymentMethod === 'Credit' ? 'Outstanding Credit' : paymentMethod}</Text></View>
            </View>
          </View>
          <Pressable
            onPress={() => { setActiveForm('list'); setOrderItems({}); setTempOrder(null); setTempInvoice(null); }}
            className="w-full py-3 bg-slate-800 rounded-xl items-center active:bg-slate-900"
          >
            <Text className="text-white font-black text-xs uppercase">Finish & Return to Partner Outlets</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (activeForm === 'register_store') {
    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-2xl gap-4">
          <View className="flex-row justify-between items-center border-b border-slate-200 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Register New Outlet</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 font-bold text-xs">Back</Text></Pressable>
          </View>
          <View className="gap-3">
            <View><Text className="font-bold text-slate-500 mb-1 text-xs">Outlet Store Name</Text><TextInput value={newStoreForm.name} onChangeText={v => setNewStoreForm({ ...newStoreForm, name: v })} className={inputClass} /></View>
            <View className="flex-row gap-2">
              <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Owner Name</Text><TextInput value={newStoreForm.owner_name} onChangeText={v => setNewStoreForm({ ...newStoreForm, owner_name: v })} className={inputClass} /></View>
              <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Contact Phone</Text><TextInput value={newStoreForm.phone} onChangeText={v => setNewStoreForm({ ...newStoreForm, phone: v })} className={inputClass} /></View>
            </View>
            <View><Text className="font-bold text-slate-500 mb-1 text-xs">Address Details</Text><TextInput value={newStoreForm.address} onChangeText={v => setNewStoreForm({ ...newStoreForm, address: v })} className={inputClass} /></View>
            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Partner Type</Text>
              <SelectField
                value={newStoreForm.partner_type}
                onValueChange={v => setNewStoreForm({ ...newStoreForm, partner_type: v })}
                options={data.partnerTypes.map(t => ({ label: t.name, value: t.name }))}
                title="Select Partner Type"
                className={inputClass + ' flex-row items-center justify-between'}
              />
            </View>
          </View>
          <Pressable onPress={handleRegisterStore} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
            <Text className="text-white font-bold text-xs">Register Partner Outlet</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (activeForm === 'add_visit') {
    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-2xl gap-4">
          <View className="flex-row justify-between items-center border-b border-slate-200 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Site Visit Logs ({selectedStore?.name})</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 font-bold text-xs">Back</Text></Pressable>
          </View>
          <View className="gap-3">
            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Visit notes / Field updates</Text>
              <TextInput value={visitForm.notes} onChangeText={v => setVisitForm({ ...visitForm, notes: v })} multiline numberOfLines={3} className={inputClass} style={{ minHeight: 80, textAlignVertical: 'top' }} />
            </View>
            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Schedule Follow-up Date</Text>
              <DateField value={visitForm.follow_up_date} onValueChange={v => setVisitForm({ ...visitForm, follow_up_date: v })} title="Select Follow-up Date" className={inputClass + ' flex-row items-center justify-between'} />
            </View>
          </View>
          <Pressable onPress={handleRecordVisit} className="w-full py-2.5 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
            <Text className="text-white font-bold text-xs">Log Completed Visit Check</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (activeForm === 'bill_settlement_ledger') {
    const filteredInvoices = data.invoices.filter(inv => {
      const order = data.orders.find(o => o.id === inv.order_id);
      const store = order ? data.stores.find(s => s.id === order.store_id) : null;
      const searchMatch = !ledgerSearch || inv.invoice_number.toLowerCase().includes(ledgerSearch.toLowerCase()) || (store && (store.name.toLowerCase().includes(ledgerSearch.toLowerCase()) || store.owner_name.toLowerCase().includes(ledgerSearch.toLowerCase())));
      let filterMatch = true;
      if (ledgerFilter === 'Paid') filterMatch = inv.payment_status === 'Paid';
      else if (ledgerFilter === 'Partial') filterMatch = inv.payment_status === 'Partial';
      else if (ledgerFilter === 'Credit') filterMatch = inv.payment_status === 'Credit' || !inv.payment_status;
      return searchMatch && filterMatch;
    });

    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-5xl gap-4">
          <View className="flex-row justify-between items-center border-b border-slate-200 pb-3">
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">Bills & Settlement Ledger</Text>
              <Text className="text-[10px] text-slate-400">View all dispatch bills and settlement states</Text>
            </View>
            <Pressable onPress={() => setActiveForm('list')} className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg active:bg-slate-50"><Text className="text-slate-500 font-bold text-xs">Back</Text></Pressable>
          </View>

          <FilterBar searchValue={ledgerSearch} onSearchChange={setLedgerSearch} searchPlaceholder="Search by Invoice #, Outlet, Owner name...">
            <SelectField
              value={ledgerFilter}
              onValueChange={v => setLedgerFilter(v as typeof ledgerFilter)}
              options={[
                { label: 'All Payments', value: 'All' },
                { label: 'Fully Paid', value: 'Paid' },
                { label: 'Partial Paid', value: 'Partial' },
                { label: 'Unpaid / Credit', value: 'Credit' },
              ]}
              title="Settlement Status"
              className={FILTER_PILL_CLASS}
              textClassName={FILTER_PILL_TEXT_CLASS}
            />
          </FilterBar>

          {viewMode === 'table' ? (
            <DataTable
              data={filteredInvoices}
              keyExtractor={inv => inv.id}
              emptyText="No bills match your current search and filters."
              columns={[
                { key: 'invoice', label: 'Invoice', width: 110, render: inv => <Text className="font-extrabold text-slate-800 text-[11px]" numberOfLines={1}>{inv.invoice_number}</Text> },
                {
                  key: 'store', label: 'Store', width: 160,
                  render: inv => {
                    const order = data.orders.find(o => o.id === inv.order_id);
                    const store = order ? data.stores.find(s => s.id === order.store_id) : null;
                    return <Text className="text-[10px] text-slate-600" numberOfLines={1}>{store?.name || '-'}</Text>;
                  },
                },
                { key: 'date', label: 'Date', width: 100, grow: false, render: inv => <Text className="text-[10px] text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</Text> },
                {
                  key: 'amounts', label: 'Total / Paid / Due', width: 170,
                  render: inv => {
                    const paidVal = inv.paid_amount || 0;
                    const remainingVal = Math.max(0, inv.grand_total - paidVal);
                    return (
                      <Text className="text-[10px]" numberOfLines={1}>
                        <Text className="font-bold text-slate-700">{formatWholeRupees(inv.grand_total)}</Text>
                        {' / '}<Text className="font-bold text-emerald-600">{formatWholeRupees(paidVal)}</Text>
                        {' / '}<Text className={`font-bold ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{formatWholeRupees(remainingVal)}</Text>
                      </Text>
                    );
                  },
                },
                {
                  key: 'status', label: 'Status', width: 90, grow: false,
                  render: inv => {
                    const isPaid = inv.payment_status === 'Paid';
                    const isPartial = inv.payment_status === 'Partial';
                    return <Text className={`px-2 py-0.5 font-bold rounded-full text-[9px] uppercase self-start ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{inv.payment_status || 'Unpaid'}</Text>;
                  },
                },
                {
                  key: 'actions', label: 'Actions', width: 180, grow: false,
                  render: inv => {
                    const order = data.orders.find(o => o.id === inv.order_id);
                    const store = order ? data.stores.find(s => s.id === order.store_id) : null;
                    const isPaid = inv.payment_status === 'Paid';
                    const paidVal = inv.paid_amount || 0;
                    const remainingVal = Math.max(0, inv.grand_total - paidVal);
                    if (!store || !order) return null;
                    return (
                      <View className="flex-row flex-wrap items-center gap-1">
                        <Pressable onPress={() => setDetailInvoiceId(inv.id)} className="p-1.5 bg-slate-50 rounded-lg border border-slate-200"><Eye size={13} color="#475569" /></Pressable>
                        <Pressable onPress={() => downloadInvoicePDF(order, inv, store)} className="p-1.5 bg-slate-50 rounded-lg border border-slate-200"><Download size={13} color="#475569" /></Pressable>
                        <Pressable onPress={() => handleWhatsAppShare(inv, store, order)} className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-200"><MessageSquare size={13} color="#059669" /></Pressable>
                        {!isPaid && (
                          <Pressable
                            onPress={() => { setSelectedStore(store); setGeneratedInvoice(inv); setLastCreatedOrder(order); setPaymentAmount(parseFloat(remainingVal.toFixed(2))); setSettlementOrigin('ledger'); setActiveForm('payment_settlement'); }}
                            className="py-1 px-2 bg-blue-600 rounded-lg active:bg-blue-700"
                          >
                            <Text className="font-black text-[9px] text-white">Settle</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  },
                },
              ] as DataTableColumn<typeof filteredInvoices[number]>[]}
            />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState message="No bills match your current search and filters." />
          ) : (
            <View className="gap-3 md:flex-row md:flex-wrap">
              {filteredInvoices.map(inv => {
                const order = data.orders.find(o => o.id === inv.order_id);
                const store = order ? data.stores.find(s => s.id === order.store_id) : null;
                const isPaid = inv.payment_status === 'Paid';
                const isPartial = inv.payment_status === 'Partial';
                const paidVal = inv.paid_amount || 0;
                const remainingVal = Math.max(0, inv.grand_total - paidVal);
                const isExpanded = expandedInvoices.includes(inv.id);
                return (
                  <View key={inv.id} className="w-full md:w-[48%] p-3 border border-slate-200 bg-white rounded-2xl gap-2.5">
                    <View className="flex-row justify-between items-center">
                      <View><Text className="font-extrabold text-slate-800 text-xs">{inv.invoice_number}</Text><Text className="text-[10px] text-slate-400">Issued: {new Date(inv.created_at).toLocaleDateString()}</Text></View>
                      <Text className={`px-2.5 py-0.5 font-bold rounded-full text-[9px] uppercase ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{inv.payment_status || 'Unpaid / Credit'}</Text>
                    </View>
                    {store && (
                      <View className="bg-slate-50 rounded-xl p-2">
                        <Text className="font-bold text-slate-700 text-xs">{store.name}</Text>
                        <View className="flex-row justify-between"><Text className="text-[10px] text-slate-500">Owner: {store.owner_name}</Text><Text className="text-[10px] text-slate-500">Ph: {store.phone}</Text></View>
                      </View>
                    )}
                    <View className="flex-row justify-between bg-slate-50 p-2 rounded-xl">
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">BILL TOTAL</Text><Text className="font-black text-slate-700 text-[11px]">{formatWholeRupees(inv.grand_total)}</Text></View>
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">PAID</Text><Text className="font-black text-emerald-600 text-[11px]">{formatWholeRupees(paidVal)}</Text></View>
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">DUE</Text><Text className={`font-black text-[11px] ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{formatWholeRupees(remainingVal)}</Text></View>
                    </View>

                    {isExpanded && store && order && (
                      <View className="bg-slate-50 rounded-xl p-3 border border-slate-100 gap-2">
                        <Text className="font-bold text-slate-600 text-[9px] uppercase">Items & Dispatch Breakdown</Text>
                        {order.items.map((item, idx) => {
                          const p = data.products.find(prod => prod.id === item.product_id);
                          return (
                            <View key={idx} className="flex-row justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                              <Text className="font-bold text-slate-800 text-[10px] flex-1">{p ? p.name : item.product_id}</Text>
                              <Text className="text-slate-700 text-[10px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}</Text>
                            </View>
                          );
                        })}
                        {(() => {
                          const invoicePayments = data.payments.filter(p => p.order_id === order.id);
                          return (
                            <View className="bg-white rounded-lg p-2.5 border border-slate-200 gap-1.5">
                              <Text className="font-extrabold text-slate-700 text-[9px] uppercase">Payment Receipts</Text>
                              {invoicePayments.length === 0 ? (
                                <Text className="text-slate-400 italic text-[9px]">No partial payments logged yet.</Text>
                              ) : (
                                invoicePayments.map((pay, pIdx) => (
                                  <View key={pay.id} className="flex-row justify-between items-center bg-slate-50 p-1.5 rounded-lg">
                                    <Text className="font-bold text-slate-700 text-[9px]">Receipt #{invoicePayments.length - pIdx}</Text>
                                    <Text className="font-black text-emerald-600 text-[9px]">Rs. {pay.amount.toFixed(2)}</Text>
                                  </View>
                                ))
                              )}
                            </View>
                          );
                        })()}
                      </View>
                    )}

                    {store && order && (
                      <View className="flex-row flex-wrap gap-2 justify-end border-t border-slate-100 pt-2.5">
                        <Pressable onPress={() => toggleInvoiceExpand(inv.id)} className={`p-1.5 rounded-lg border flex-row items-center gap-1 ${isExpanded ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                          <Eye size={14} color={isExpanded ? '#1d4ed8' : '#475569'} />
                          <Text className={`font-bold text-[10px] ${isExpanded ? 'text-blue-700' : 'text-slate-600'}`}>{isExpanded ? 'Hide' : 'Details'}</Text>
                        </Pressable>
                        <Pressable onPress={() => downloadInvoicePDF(order, inv, store)} className="p-1.5 bg-slate-50 rounded-lg border border-slate-200 flex-row items-center gap-1 active:bg-slate-100">
                          <Download size={14} color="#475569" /><Text className="font-bold text-[10px] text-slate-600">PDF</Text>
                        </Pressable>
                        <Pressable onPress={() => handleWhatsAppShare(inv, store, order)} className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-200 flex-row items-center gap-1 active:bg-emerald-100">
                          <MessageSquare size={14} color="#059669" /><Text className="font-bold text-[10px] text-emerald-600">WhatsApp</Text>
                        </Pressable>
                        {!isPaid && (
                          <Pressable
                            onPress={() => { setSelectedStore(store); setGeneratedInvoice(inv); setLastCreatedOrder(order); setPaymentAmount(parseFloat(remainingVal.toFixed(2))); setSettlementOrigin('ledger'); setActiveForm('payment_settlement'); }}
                            className="py-1 px-3 bg-blue-600 rounded-lg flex-row items-center gap-1 active:bg-blue-700"
                          >
                            <CreditCard size={14} color="#fff" />
                            <Text className="font-black text-[10px] text-white">Settle</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {(() => {
          const detailInvoice = detailInvoiceId ? filteredInvoices.find(inv => inv.id === detailInvoiceId) : null;
          if (!detailInvoice) return null;
          const order = data.orders.find(o => o.id === detailInvoice.order_id);
          const store = order ? data.stores.find(s => s.id === order.store_id) : null;
          if (!order || !store) return null;
          const isPaid = detailInvoice.payment_status === 'Paid';
          const paidVal = detailInvoice.paid_amount || 0;
          const remainingVal = Math.max(0, detailInvoice.grand_total - paidVal);
          const invoicePayments = data.payments.filter(p => p.order_id === order.id);
          return (
            <Modal visible transparent animationType="fade" onRequestClose={() => setDetailInvoiceId(null)}>
              <Pressable className="flex-1 bg-slate-900/50 items-center justify-center p-4" onPress={() => setDetailInvoiceId(null)}>
                <Pressable className="bg-white w-full max-w-md rounded-3xl p-4 gap-3" onPress={e => e.stopPropagation()}>
                  <View className="flex-row justify-between items-center border-b border-slate-100 pb-2">
                    <View>
                      <Text className="font-extrabold text-slate-800 text-sm">{detailInvoice.invoice_number}</Text>
                      <Text className="text-[10px] text-slate-400">Issued: {new Date(detailInvoice.created_at).toLocaleDateString()}</Text>
                    </View>
                    <Pressable onPress={() => setDetailInvoiceId(null)} hitSlop={8}><X size={16} color="#94a3b8" /></Pressable>
                  </View>

                  <View className="bg-slate-50 rounded-xl p-2">
                    <Text className="font-bold text-slate-700 text-xs">{store.name}</Text>
                    <View className="flex-row justify-between"><Text className="text-[10px] text-slate-500">Owner: {store.owner_name}</Text><Text className="text-[10px] text-slate-500">Ph: {store.phone}</Text></View>
                  </View>

                  <View className="flex-row justify-between bg-slate-50 p-2 rounded-xl">
                    <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">BILL TOTAL</Text><Text className="font-black text-slate-700 text-[11px]">{formatWholeRupees(detailInvoice.grand_total)}</Text></View>
                    <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">PAID</Text><Text className="font-black text-emerald-600 text-[11px]">{formatWholeRupees(paidVal)}</Text></View>
                    <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">DUE</Text><Text className={`font-black text-[11px] ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{formatWholeRupees(remainingVal)}</Text></View>
                  </View>

                  <ScrollView style={{ maxHeight: 260 }}>
                    <View className="bg-slate-50 rounded-xl p-3 border border-slate-100 gap-2">
                      <Text className="font-bold text-slate-600 text-[9px] uppercase">Items & Dispatch Breakdown</Text>
                      {order.items.map((item, idx) => {
                        const p = data.products.find(prod => prod.id === item.product_id);
                        return (
                          <View key={idx} className="flex-row justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                            <Text className="font-bold text-slate-800 text-[10px] flex-1">{p ? p.name : item.product_id}</Text>
                            <Text className="text-slate-700 text-[10px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}</Text>
                          </View>
                        );
                      })}
                    </View>

                    <View className="bg-white rounded-lg p-2.5 border border-slate-200 gap-1.5 mt-2">
                      <Text className="font-extrabold text-slate-700 text-[9px] uppercase">Payment Receipts</Text>
                      {invoicePayments.length === 0 ? (
                        <Text className="text-slate-400 italic text-[9px]">No partial payments logged yet.</Text>
                      ) : (
                        invoicePayments.map((pay, pIdx) => (
                          <View key={pay.id} className="flex-row justify-between items-center bg-slate-50 p-1.5 rounded-lg">
                            <Text className="font-bold text-slate-700 text-[9px]">Receipt #{invoicePayments.length - pIdx}</Text>
                            <Text className="font-black text-emerald-600 text-[9px]">Rs. {pay.amount.toFixed(2)}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  </ScrollView>

                  <View className="flex-row flex-wrap gap-2 justify-end border-t border-slate-100 pt-2.5">
                    <Pressable onPress={() => downloadInvoicePDF(order, detailInvoice, store)} className="p-1.5 bg-slate-50 rounded-lg border border-slate-200 flex-row items-center gap-1 active:bg-slate-100">
                      <Download size={14} color="#475569" /><Text className="font-bold text-[10px] text-slate-600">PDF</Text>
                    </Pressable>
                    <Pressable onPress={() => handleWhatsAppShare(detailInvoice, store, order)} className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-200 flex-row items-center gap-1 active:bg-emerald-100">
                      <MessageSquare size={14} color="#059669" /><Text className="font-bold text-[10px] text-emerald-600">WhatsApp</Text>
                    </Pressable>
                    {!isPaid && (
                      <Pressable
                        onPress={() => { setSelectedStore(store); setGeneratedInvoice(detailInvoice); setLastCreatedOrder(order); setPaymentAmount(parseFloat(remainingVal.toFixed(2))); setSettlementOrigin('ledger'); setDetailInvoiceId(null); setActiveForm('payment_settlement'); }}
                        className="py-1 px-3 bg-blue-600 rounded-lg flex-row items-center gap-1 active:bg-blue-700"
                      >
                        <CreditCard size={14} color="#fff" />
                        <Text className="font-black text-[10px] text-white">Settle</Text>
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              </Pressable>
            </Modal>
          );
        })()}
      </ScrollView>
    );
  }

  // activeForm === 'list' (default): the tab list view (home / stores).
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
      <View className="w-full lg:max-w-[1400px] gap-4">
        {salesTab === 'home' && (
          <View className="gap-4">
            <View className="bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-blue-400">
              <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Today's Assigned Area</Text>
              <Text className="text-sm font-extrabold text-slate-800 mt-0.5">{assignedTruck?.route || 'Route A - Deccan Corridor'}</Text>
              <View className="flex-row gap-4 mt-4">
                <View><Text className="text-[9px] uppercase font-bold text-slate-400">Collections Today</Text><Text className="font-black text-lg text-slate-800">Rs. {todayCollections.toFixed(2)}</Text></View>
                <View><Text className="text-[9px] uppercase font-bold text-slate-400">Pending Deliveries</Text><Text className="font-black text-lg text-slate-800">{pendingDeliveries.length} Stores</Text></View>
              </View>
            </View>

            <View className="bg-white/70 border border-white/50 rounded-2xl p-3.5 gap-2">
              <Text className="font-bold text-slate-800 text-xs">Quick Sales Actions</Text>
              <View className="flex-row gap-2">
                <Pressable onPress={() => setActiveForm('register_store')} className="flex-1 py-2.5 px-3 bg-white/90 rounded-xl border border-white/60 items-center gap-1 active:bg-white">
                  <Plus size={16} color="#ec4899" /><Text className="font-bold text-slate-700 text-[10px]">Register Store</Text>
                </Pressable>
                <Pressable onPress={() => { setSalesTab('stores'); onRequestSalesTab?.('stores'); }} className="flex-1 py-2.5 px-3 bg-white/90 rounded-xl border border-white/60 items-center gap-1 active:bg-white">
                  <ShoppingCart size={16} color="#3b82f6" /><Text className="font-bold text-slate-700 text-[10px]">Create New Order</Text>
                </Pressable>
              </View>
            </View>

            <View className="bg-white/70 border border-white/50 rounded-2xl p-3">
              <Text className="font-bold text-slate-800 text-xs mb-3">Refill Reminders & Tasks Today</Text>
              <View className="gap-2.5 md:flex-row md:flex-wrap">
                {data.stores.filter(s => s.status === 'Active' && (s.area === assignedTruck?.area || s.area === 'Kothrud')).slice(0, 3).map(s => (
                  <View key={s.id} className="w-full md:w-[48%] xl:w-[32%] p-2.5 rounded-xl bg-white/80 border border-white/60 flex-row items-center justify-between">
                    <View><Text className="font-bold text-slate-800 text-xs">{s.name}</Text><Text className="text-slate-400 text-[10px]">Outstanding: {formatCurrency(s.outstanding_balance)}</Text></View>
                    <Pressable onPress={() => handleStartOrder(s)} className="py-1 px-3 bg-blue-600 rounded-lg active:bg-blue-700"><Text className="text-white font-extrabold text-[10px]">Settle Order</Text></Pressable>
                  </View>
                ))}
              </View>
            </View>

            <View className="bg-white/70 border border-white/50 rounded-2xl p-3">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="font-bold text-slate-800 text-xs">Recent Bills & Settlement Status</Text>
                <Pressable onPress={() => setActiveForm('bill_settlement_ledger')} className="bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 active:bg-blue-100"><Text className="text-[10px] text-blue-600 font-extrabold">View All</Text></Pressable>
              </View>
              <View className="gap-2.5 md:flex-row md:flex-wrap">
                {data.invoices.slice(0, 5).map(inv => {
                  const order = data.orders.find(o => o.id === inv.order_id);
                  const store = order ? data.stores.find(s => s.id === order.store_id) : null;
                  const isPaid = inv.payment_status === 'Paid';
                  const isPartial = inv.payment_status === 'Partial';
                  const paidVal = inv.paid_amount || 0;
                  const remainingVal = Math.max(0, inv.grand_total - paidVal);
                  return (
                    <View key={inv.id} className="w-full md:w-[48%] xl:w-[32%] p-2 border border-slate-100 rounded-xl bg-white/80 gap-1.5">
                      <View className="flex-row justify-between items-center">
                        <View><Text className="font-black text-slate-700 text-[10px]">{inv.invoice_number}</Text><Text className="text-slate-500 font-bold text-[9px]">{store?.name || 'Partner Outlet'}</Text></View>
                        <Text className={`px-2 py-0.5 font-bold rounded-full text-[8px] uppercase ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{inv.payment_status || 'Unpaid'}</Text>
                      </View>
                      <View className="flex-row justify-between pt-1 border-t border-slate-100">
                        <Text className="text-[9px] font-extrabold text-slate-700">{formatWholeRupees(inv.grand_total)}</Text>
                        <Text className="text-[9px] font-extrabold text-emerald-600">{formatWholeRupees(paidVal)}</Text>
                        <Text className={`text-[9px] font-extrabold ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{formatWholeRupees(remainingVal)}</Text>
                      </View>
                    </View>
                  );
                })}
                {data.invoices.length === 0 && <Text className="text-center text-slate-400 italic text-[10px] py-4">No bills recorded yet.</Text>}
              </View>
            </View>
          </View>
        )}

        {salesTab === 'stores' && (
          <View className="gap-4">
            <View className="flex-row items-center gap-2">
              <View className="flex-1 lg:max-w-sm relative justify-center">
                <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                <TextInput value={storeSearch} onChangeText={setStoreSearch} placeholder="Search client outlet directory..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
              </View>
              <Pressable onPress={() => setActiveForm('register_store')} className="bg-blue-600 p-2.5 rounded-xl active:bg-blue-700"><Plus size={20} color="#fff" /></Pressable>
            </View>
            <FilterBar hideSearch>
              <SelectField
                value={storeStatusFilter}
                onValueChange={v => setStoreStatusFilter(v as typeof storeStatusFilter)}
                options={[
                  { label: 'All Payments', value: 'All' },
                  { label: 'Fully Paid', value: 'Paid' },
                  { label: 'Unpaid / Credit', value: 'Unpaid' },
                  { label: 'Partial Paid', value: 'Partial' },
                ]}
                title="Settlement Status"
                className={FILTER_PILL_CLASS}
                textClassName={FILTER_PILL_TEXT_CLASS}
              />
            </FilterBar>
            {(() => {
              const filteredStores = data.stores.filter(s => {
                if (s.status !== 'Active') return false;
                const searchMatch = s.name.toLowerCase().includes(storeSearch.toLowerCase()) || s.area.toLowerCase().includes(storeSearch.toLowerCase()) || (s.owner_name && s.owner_name.toLowerCase().includes(storeSearch.toLowerCase()));
                if (!searchMatch) return false;
                if (storeStatusFilter === 'All') return true;
                return getStoreStatus(s.id, s.outstanding_balance) === storeStatusFilter;
              });

              if (viewMode === 'table') {
                return (
                  <DataTable
                    data={filteredStores}
                    keyExtractor={s => s.id}
                    emptyText="No partner outlets match your search or filter."
                    columns={[
                      {
                        key: 'name', label: 'Store', width: 190,
                        render: s => {
                          const status = getStoreStatus(s.id, s.outstanding_balance);
                          return (
                            <View className="gap-0.5">
                              <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text>
                              <Text className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase self-start ${status === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : status === 'Partial' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{status === 'Unpaid' ? 'Credit/Unpaid' : status}</Text>
                            </View>
                          );
                        },
                      },
                      { key: 'area', label: 'Area', width: 100, render: s => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.area}</Text> },
                      { key: 'phone', label: 'Phone', width: 110, render: s => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.phone}</Text> },
                      { key: 'outstanding', label: 'Outstanding', width: 100, align: 'right' as const, render: s => <Text className="font-bold text-slate-700 text-[11px] text-right">{formatCurrency(s.outstanding_balance)}</Text> },
                      {
                        key: 'actions', label: 'Actions', width: 150, grow: false,
                        render: s => (
                          <View className="flex-row flex-wrap items-center gap-1.5">
                            <Pressable onPress={() => { setSelectedStore(s); setActiveForm('add_visit'); }} className="py-1 px-2 bg-amber-50 border border-amber-200 rounded-lg active:bg-amber-100"><Text className="text-amber-700 text-[9px] font-bold">Visit</Text></Pressable>
                            <Pressable onPress={() => onNavigateToDeliveries?.(s.id)} className="py-1 px-2 bg-emerald-50 border border-emerald-200 rounded-lg active:bg-emerald-100"><Text className="text-emerald-700 text-[9px] font-bold">Pre-book</Text></Pressable>
                            <Pressable onPress={() => handleStartOrder(s)} className="py-1 px-2 bg-blue-600 rounded-lg active:bg-blue-700"><Text className="text-white text-[9px] font-black">Order</Text></Pressable>
                          </View>
                        ),
                      },
                    ] as DataTableColumn<typeof filteredStores[number]>[]}
                  />
                );
              }

              if (filteredStores.length === 0) return <EmptyState message="No partner outlets match your search or filter." />;
              return (
                <View className="gap-2.5 md:flex-row md:flex-wrap">
                  {filteredStores.map(s => {
                    const status = getStoreStatus(s.id, s.outstanding_balance);
                    return (
                      <View key={s.id} className="w-full md:w-[48%] xl:w-[32%] bg-white/70 border border-white/50 rounded-2xl p-3 relative border-l-4 border-l-blue-400">
                        <View className="absolute top-3 right-3 flex-row items-center gap-1.5">
                          <Text className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase ${status === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : status === 'Partial' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{status === 'Unpaid' ? 'Credit/Unpaid' : status}</Text>
                        </View>
                        <Text className="font-bold text-slate-800 text-xs pr-20">{s.name}</Text>
                        <Text className="text-[10px] text-slate-400 mt-0.5">Area: {s.area} - Ph: {s.phone}</Text>
                        <Text className="font-bold text-slate-700 text-xs mt-1">{formatCurrency(s.outstanding_balance)}</Text>
                        <View className="flex-row flex-wrap gap-2 mt-3 pt-2 border-t border-white/40 justify-end">
                          <Pressable onPress={() => { setSelectedStore(s); setActiveForm('add_visit'); }} className="py-1 px-2.5 bg-amber-50 border border-amber-200 rounded-lg active:bg-amber-100"><Text className="text-amber-700 text-[9px] font-bold">Log Visit</Text></Pressable>
                          <Pressable onPress={() => onNavigateToDeliveries?.(s.id)} className="py-1 px-2.5 bg-emerald-50 border border-emerald-200 rounded-lg active:bg-emerald-100"><Text className="text-emerald-700 text-[9px] font-bold">Pre-book</Text></Pressable>
                          <Pressable onPress={() => handleStartOrder(s)} className="py-1 px-3 bg-blue-600 rounded-lg active:bg-blue-700"><Text className="text-white text-[9px] font-black">Create Order</Text></Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
