import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, Linking, Modal } from 'react-native';
import {
  LayoutDashboard, Truck, Search, Store as StoreIcon, Plus, ShoppingCart, CheckCircle,
  CreditCard, LogOut, MessageCircle, Download, Eye, MessageSquare, AlertTriangle, Edit,
} from 'lucide-react-native';
import { ERPData } from '../../storage';
import { Order, Invoice, Payment, Store, PreBookingOrder, AppNotification } from '../../types';
import SelectField from '../../components/common/SelectField';
import DateField from '../../components/common/DateField';
import ConfirmModal from '../../components/common/ConfirmModal';
import { exportHtmlReport } from '../../utils/reportExport';
import { buildOrderInvoicePdf } from '../../utils/orderInvoicePdf';
import { useAppContext } from '../../context/AppContext';
import { ordersApi, storesApi, preBookingsApi } from '../../api/endpoints';

interface SalespersonFlowProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string) => void;
  syncQueueOffline: (action: string, payload: any) => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
  showAlert: (opts: any) => void;
}

const inputClass = "w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800";

export default function SalespersonFlow({ data, setData, addNotification, syncQueueOffline, currentUser, setCurrentUser, showAlert }: SalespersonFlowProps) {
  const { refreshData } = useAppContext();
  const [activeTab, setActiveTab] = useState<'home' | 'inventory' | 'stores' | 'deliveries' | 'visits'>('home');
  const [activeForm, setActiveForm] = useState<'list' | 'create_order' | 'preview_invoice' | 'payment_settlement' | 'collect_payment' | 'qr_pay' | 'register_store' | 'add_visit' | 'bill_settlement_ledger'>('list');

  const formatINR = (amount: number) => `Rs ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [availSearch, setAvailSearch] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState<'All' | 'Paid' | 'Partial' | 'Credit'>('All');
  const [storeStatusFilter, setStoreStatusFilter] = useState<'All' | 'Paid' | 'Unpaid' | 'Partial'>('All');
  const [expandedInvoices, setExpandedInvoices] = useState<string[]>([]);
  const [settlementOrigin, setSettlementOrigin] = useState<'order' | 'ledger'>('order');
  const [preBookingView, setPreBookingView] = useState<'create' | 'list'>('create');
  const [expandedPreBookings, setExpandedPreBookings] = useState<string[]>([]);
  const [preBookingConfirmAction, setPreBookingConfirmAction] = useState<{ bookingId: string; action: 'deliver' | 'cancel' } | null>(null);
  const [preBookingSettleAmount, setPreBookingSettleAmount] = useState(0);
  const [preBookingSettleMethod, setPreBookingSettleMethod] = useState<'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'>('UPI');

  const togglePreBookingExpand = (bookingId: string) => {
    setExpandedPreBookings(prev => (prev.includes(bookingId) ? prev.filter(id => id !== bookingId) : [...prev, bookingId]));
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

  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<Order | null>(null);
  const [tempOrder, setTempOrder] = useState<Order | null>(null);
  const [tempInvoice, setTempInvoice] = useState<Invoice | null>(null);

  const [orderItems, setOrderItems] = useState<{ [productId: string]: number }>({});
  const [pricingMode, setPricingMode] = useState<'wholesale' | 'retail'>('wholesale');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'>('UPI');

  const [newStoreForm, setNewStoreForm] = useState({ name: '', owner_name: '', phone: '', address: '', area: 'Kothrud', city: 'Pune' });
  const [visitForm, setVisitForm] = useState({
    notes: 'Completed routine site check-in. Cleaned ice cream freezer.',
    follow_up_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  });
  const [bookingItems, setBookingItems] = useState<{ [productId: string]: number }>({});
  const [preBookingForm, setPreBookingForm] = useState({
    scheduled_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    notes: ''
  });
  const [preBookingPricingMode, setPreBookingPricingMode] = useState<'wholesale' | 'retail'>('wholesale');
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);

  const assignedTruck = data.trucks.find(t => t.driver_user_id === currentUser.id);
  const truckId = assignedTruck?.id || 't1';
  const hasTruckStock = data.products.some(p => (data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === p.id)?.quantity || 0) > 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLocalStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const todayCollections = data.payments
    .filter(p => p.collected_by === currentUser.id && (p.date.includes(todayStr) || p.date.includes(todayLocalStr)))
    .reduce((s, p) => s + p.amount, 0);

  const pendingDeliveries = data.orders.filter(o => o.truck_id === truckId && o.status === 'Confirmed');
  const pendingPreBookings = data.preBookingOrders.filter(order => order.status === 'Booked').sort((a, b) => b.created_at.localeCompare(a.created_at));

  const downloadInvoicePDF = async (order: Order, invoice: Invoice, store: Store) => {
    const { html, fileName } = buildOrderInvoicePdf(order, invoice, store, data.products);
    await exportHtmlReport(html, fileName, showAlert);
  };

  const handleWhatsAppShare = (inv: Invoice, store: Store, order?: Order) => {
    const phoneClean = store.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = phoneClean.length === 10 ? `91${phoneClean}` : phoneClean;
    let itemDetails = '';
    if (order) {
      itemDetails = '\n\n*Items Ordered:*' + order.items.map(item => {
        const p = data.products.find(prod => prod.id === item.product_id);
        return `\n- ${p?.name || 'Product'}: ${item.quantity} x Rs. ${item.unit_price.toFixed(2)} = Rs. ${(item.quantity * item.unit_price).toFixed(2)}`;
      }).join('');
    }
    const paidVal = inv.paid_amount || 0;
    const dueVal = Math.max(0, inv.grand_total - paidVal);
    const paymentStatusText = inv.payment_status === 'Paid' ? 'FULLY PAID' : inv.payment_status === 'Partial' ? `PARTIAL PAID (Paid: Rs. ${paidVal.toFixed(2)})` : 'UNPAID / CREDIT';
    const text = `*FROSTFLOW ICE CREAMS - DISPATCH INVOICE*\n\nHello *${store.owner_name}* (${store.name}), your invoice *${inv.invoice_number}* is ready and dispatched.${itemDetails}\n\n*Billing Summary:*\n- Total: Rs. ${inv.total.toFixed(2)}\n- GST Tax: Rs. ${inv.tax.toFixed(2)}\n- *Grand Total: Rs. ${inv.grand_total.toFixed(2)}*\n- Settlement Status: *${paymentStatusText}*\n- Balance Outstanding: *Rs. ${dueVal.toFixed(2)}*\n\nThank you for choosing FrostFlow Ice Creams!`;
    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => showAlert('Could not open WhatsApp. Please ensure it is installed.'));
  };

  const handleStartOrder = (store: Store) => {
    if (data.products.length === 0) {
      showAlert('No ice cream products are available in the catalog yet. Please contact your administrator before creating an order.');
      return;
    }
    setSelectedStore(store);
    setOrderItems({});
    setPricingMode('wholesale');
    setActiveForm('create_order');
  };

  const handleUpdateItemQty = (productId: string, val: number) => {
    const currentTruckStock = data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === productId)?.quantity || 0;
    const nextQty = Math.max(0, (orderItems[productId] || 0) + val);
    if (nextQty > currentTruckStock) {
      showAlert(`Limit exceeded! Only ${currentTruckStock} units of this flavor are available in your truck inventory.`);
      return;
    }
    setOrderItems({ ...orderItems, [productId]: nextQty });
  };

  const handleSetItemQty = (productId: string, valStr: string) => {
    const currentTruckStock = data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === productId)?.quantity || 0;
    const cleanStr = valStr.replace(/\D/g, '');
    const num = cleanStr === '' ? 0 : parseInt(cleanStr, 10);
    if (num > currentTruckStock) {
      showAlert(`Limit exceeded! Only ${currentTruckStock} units of this flavor are available in your truck inventory.`);
    }
    setOrderItems({ ...orderItems, [productId]: Math.max(0, Math.min(currentTruckStock, num)) });
  };

  const getEffectiveAvailableForBooking = (productId: string) => {
    const liveAvailable = data.warehouse_inventory.find(inv => inv.product_id === productId)?.available_qty || 0;
    if (!editingBookingId) return liveAvailable;
    const existingBooking = data.preBookingOrders.find(b => b.id === editingBookingId);
    const alreadyHeld = existingBooking?.items.find(i => i.product_id === productId)?.quantity || 0;
    return liveAvailable + alreadyHeld;
  };

  const handleUpdatePreBookingQty = (productId: string, val: number) => {
    const currentWarehouseStock = getEffectiveAvailableForBooking(productId);
    const nextQty = Math.max(0, (bookingItems[productId] || 0) + val);
    if (nextQty > currentWarehouseStock) {
      const productName = data.products.find(p => p.id === productId)?.name || productId;
      showAlert(currentWarehouseStock === 0
        ? `${productName} is out of stock in the warehouse. It cannot be added to this pre-booking.`
        : `Only ${currentWarehouseStock} units of ${productName} are available in the warehouse right now.`);
      return;
    }
    setBookingItems({ ...bookingItems, [productId]: nextQty });
  };

  const handleSetPreBookingQty = (productId: string, valStr: string) => {
    const currentWarehouseStock = getEffectiveAvailableForBooking(productId);
    const cleanStr = valStr.replace(/\D/g, '');
    const num = cleanStr === '' ? 0 : parseInt(cleanStr, 10);
    if (num > currentWarehouseStock) {
      const productName = data.products.find(p => p.id === productId)?.name || productId;
      showAlert(currentWarehouseStock === 0
        ? `${productName} is out of stock in the warehouse. It cannot be added to this pre-booking.`
        : `Only ${currentWarehouseStock} units of ${productName} are available in the warehouse right now.`);
    }
    setBookingItems({ ...bookingItems, [productId]: Math.max(0, Math.min(currentWarehouseStock, num)) });
  };

  const handleConfirmOrder = () => {
    const activeItems = Object.entries(orderItems)
      .filter(([_, qty]) => (qty as number) > 0)
      .map(([prodId, qty]) => {
        const p = data.products.find(prod => prod.id === prodId)!;
        const appliedPrice = pricingMode === 'wholesale' ? p.wholesale_price : p.selling_price;
        return { product_id: prodId, quantity: qty as number, unit_price: appliedPrice, tax_pct: p.tax_pct };
      });
    if (activeItems.length === 0) {
      showAlert('Please add at least one ice cream item to create an order.');
      return;
    }
    // Round total/tax to cents before summing into grand_total, so grand_total
    // always equals total+tax exactly as displayed/stored.
    const total = parseFloat(activeItems.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0).toFixed(2));
    const tax = parseFloat(activeItems.reduce((acc, item) => acc + (item.quantity * item.unit_price * (item.tax_pct / 100)), 0).toFixed(2));
    const grandTotal = parseFloat((total + tax).toFixed(2));
    const orderId = 'o_' + Date.now();
    const newOrder: Order = { id: orderId, store_id: selectedStore!.id, salesperson_id: currentUser.id, truck_id: truckId, status: 'Delivered', created_at: new Date().toISOString(), items: activeItems };
    const newInvoice: Invoice = {
      id: 'inv_' + Date.now(), order_id: orderId, invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
      total, tax, grand_total: grandTotal, created_at: new Date().toISOString()
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
      addNotification('new_order', `Driver completed order for ${selectedStore?.name}. Grand Total: Rs${result.invoice.grand_total.toFixed(2)}`);
      showAlert('Order Confirmed successfully! Now please record the payment settlement.');
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
      if (result.actualCollection > 0) {
        addNotification('payment_received', `Driver collected Rs${result.actualCollection} from ${selectedStore?.name}.`);
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
        last_purchase_date: '', next_refill_date: new Date().toISOString().split('T')[0], ranking: 'Silver', status: 'Active'
      };
      syncQueueOffline('REGISTER_STORE', { store: newStore });
      showAlert('Network Offline: New store registered and queued!');
      setActiveForm('list');
      return;
    }
    try {
      await storesApi.create({
        name: newStoreForm.name, owner_name: newStoreForm.owner_name || 'Manager', phone: newStoreForm.phone,
        alt_phone: '', address: newStoreForm.address || 'Address placeholder', area: newStoreForm.area, city: newStoreForm.city,
        state: 'Maharashtra', pincode: '411001', gst_number: '', credit_limit: 1000, refill_frequency: 'Weekly', ranking: 'Silver',
      });
      await refreshData();
      addNotification('partner_update', `Driver registered new store in area ${newStoreForm.area}: ${newStoreForm.name}`);
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

  const buildPreBookingItems = () => {
    return Object.entries(bookingItems)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([productId, quantity]) => {
        const product = data.products.find(item => item.id === productId);
        if (!product) return null;
        const unit_price = preBookingPricingMode === 'wholesale' ? product.wholesale_price : product.selling_price;
        return { product_id: productId, quantity: Number(quantity), unit_price, tax_pct: product.tax_pct };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  };

  const reserveWarehouseStock = (items: { product_id: string; quantity: number }[], warehouseInventory = data.warehouse_inventory) => {
    return warehouseInventory.map(inv => {
      const match = items.find(item => item.product_id === inv.product_id);
      if (!match) return inv;
      return { ...inv, available_qty: Math.max(0, inv.available_qty - match.quantity), reserved_qty: inv.reserved_qty + match.quantity };
    });
  };

  const restoreReservedWarehouseStock = (items: { product_id: string; quantity: number }[], warehouseInventory = data.warehouse_inventory) => {
    return warehouseInventory.map(inv => {
      const match = items.find(item => item.product_id === inv.product_id);
      if (!match) return inv;
      return { ...inv, available_qty: inv.available_qty + match.quantity, reserved_qty: Math.max(0, inv.reserved_qty - match.quantity) };
    });
  };

  const resetPreBookingForm = () => {
    setBookingItems({});
    setPreBookingForm({ scheduled_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], notes: '' });
    setPreBookingPricingMode('wholesale');
    setEditingBookingId(null);
    setSelectedStore(null);
  };

  const handleOpenEditPreBooking = (booking: PreBookingOrder) => {
    const store = data.stores.find(s => s.id === booking.store_id) || null;
    setSelectedStore(store);
    setPreBookingForm({ scheduled_delivery_date: booking.scheduled_delivery_date, notes: booking.notes || '' });
    const items: { [productId: string]: number } = {};
    booking.items.forEach(item => { items[item.product_id] = item.quantity; });
    setBookingItems(items);
    const firstItem = booking.items[0];
    const firstProduct = firstItem ? data.products.find(p => p.id === firstItem.product_id) : null;
    setPreBookingPricingMode(firstProduct && firstItem.unit_price === firstProduct.wholesale_price ? 'wholesale' : 'retail');
    setEditingBookingId(booking.id);
    setPreBookingView('create');
  };

  const handleSavePreBookingOrder = async () => {
    if (!selectedStore) {
      showAlert('Please select a store for the pre-booking order.');
      return;
    }

    if (editingBookingId) {
      const existingBooking = data.preBookingOrders.find(b => b.id === editingBookingId);
      if (!existingBooking) {
        showAlert('This pre-booking no longer exists.');
        resetPreBookingForm();
        setPreBookingView('list');
        return;
      }
      const bookingItemsList = buildPreBookingItems();
      if (bookingItemsList.length === 0) {
        showAlert('Please add at least one product to pre-book.');
        return;
      }

      if (data.isOffline) {
        const releasedWarehouse = restoreReservedWarehouseStock(existingBooking.items);
        const updatedWarehouse = reserveWarehouseStock(bookingItemsList, releasedWarehouse);
        const updatedBooking: PreBookingOrder = {
          ...existingBooking, store_id: selectedStore.id, scheduled_delivery_date: preBookingForm.scheduled_delivery_date,
          items: bookingItemsList, notes: preBookingForm.notes.trim() || undefined
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
          store_id: selectedStore.id, scheduled_delivery_date: preBookingForm.scheduled_delivery_date,
          items: bookingItemsList, notes: preBookingForm.notes.trim() || undefined,
        });
        await refreshData();
        addNotification('order_update', `Pre-booking updated for ${selectedStore.name}.`);
        showAlert('Pre-booking updated successfully.');
        resetPreBookingForm();
        setPreBookingView('list');
      } catch (e: any) {
        showAlert(e.message ?? 'Unable to update pre-booking.');
      }
      return;
    }

    const bookingItemsList = buildPreBookingItems();
    if (bookingItemsList.length === 0) {
      showAlert('Please add at least one product to pre-book.');
      return;
    }

    if (data.isOffline) {
      const updatedWarehouse = reserveWarehouseStock(bookingItemsList);
      const newBooking: PreBookingOrder = {
        id: `pb_${Date.now()}`, store_id: selectedStore.id, salesperson_id: currentUser.id, created_at: new Date().toISOString(),
        scheduled_delivery_date: preBookingForm.scheduled_delivery_date, status: 'Booked', items: bookingItemsList, notes: preBookingForm.notes.trim() || undefined
      };
      syncQueueOffline('CREATE_PREBOOKING', { preBookingOrder: newBooking, reservation: updatedWarehouse });
      setData({ ...data, warehouse_inventory: updatedWarehouse, preBookingOrders: [newBooking, ...data.preBookingOrders] });
      showAlert('Network Offline: pre-booking saved and stock reserved locally.');
      resetPreBookingForm();
      setPreBookingView('list');
      return;
    }

    try {
      await preBookingsApi.create({
        store_id: selectedStore.id, salesperson_id: currentUser.id, scheduled_delivery_date: preBookingForm.scheduled_delivery_date,
        items: bookingItemsList, notes: preBookingForm.notes.trim() || undefined,
      });
      await refreshData();
      addNotification('new_order', `Pre-booking saved for ${selectedStore.name} and stock reserved in warehouse.`);
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
      addNotification('delivery', `Pre-booking order ${preBookingOrderId} completed. Payment status: ${result.payment_status}.`);
      showAlert(`Pre-booking delivery completed. Payment status: ${result.payment_status}.`);
      setPreBookingConfirmAction(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to deliver pre-booking.');
    }
  };

  const handleDeliverPreBookingOrder = (preBookingOrderId: string) => {
    const booking = data.preBookingOrders.find(item => item.id === preBookingOrderId);
    const grandTotal = booking ? booking.items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (1 + item.tax_pct / 100)), 0) : 0;
    setPreBookingSettleAmount(parseFloat(grandTotal.toFixed(2)));
    setPreBookingSettleMethod('UPI');
    setPreBookingConfirmAction({ bookingId: preBookingOrderId, action: 'deliver' });
  };

  const executeCancelPreBookingOrder = async (preBookingOrderId: string) => {
    try {
      await preBookingsApi.cancel(preBookingOrderId);
      await refreshData();
      addNotification('partner_update', `Pre-booking order ${preBookingOrderId} cancelled.`);
      showAlert('Pre-booking cancelled and warehouse stock released.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to cancel pre-booking.');
    }
  };

  const handleCancelPreBookingOrder = (preBookingOrderId: string) => setPreBookingConfirmAction({ bookingId: preBookingOrderId, action: 'cancel' });

  const paymentMethodOptions = ['UPI', 'Cash', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Credit'].map(m => ({ label: m === 'UPI' ? 'UPI Payment QR' : m === 'Cash' ? 'Cash Handover' : m === 'Credit' ? 'Pay on Credit (Outstanding)' : m, value: m }));

  const navTabs = [
    { tab: 'home' as const, icon: LayoutDashboard, label: 'Shift Home' },
    { tab: 'inventory' as const, icon: Truck, label: 'My Cargo' },
    { tab: 'stores' as const, icon: StoreIcon, label: 'Outlets' },
    { tab: 'deliveries' as const, icon: CheckCircle, label: 'Pre-booking' },
    { tab: 'visits' as const, icon: MessageCircle, label: 'Audits Visit' },
  ];

  return (
    <View className="flex-1 bg-sky-50 md:flex-row">
      {/* PERSISTENT DESKTOP/TABLET SIDEBAR */}
      <View className="hidden md:flex md:w-64 lg:w-72 md:shrink-0 md:h-full md:bg-white/70 md:border-r md:border-white/50 md:p-4">
        <View className="flex-row items-center gap-3 pb-4 border-b border-slate-200/50 mb-4">
          <View className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center">
            <Text className="text-xs font-black text-blue-600">{currentUser.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}</Text>
          </View>
          <View>
            <Text className="text-[10px] font-extrabold uppercase text-blue-600">Route Operator</Text>
            <Text className="text-xs font-black text-slate-800">{currentUser.name.split(' ')[0]}</Text>
          </View>
        </View>
        <View className="flex-1 gap-1">
          {navTabs.map(({ tab, icon: Icon, label }) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => { setActiveTab(tab); setActiveForm('list'); }}
                className={`w-full py-2.5 px-3 rounded-lg flex-row items-center gap-2.5 mb-1 ${isActive ? 'bg-blue-500/15 border border-blue-200/50' : ''}`}
              >
                <Icon size={16} color={isActive ? '#2563eb' : '#94a3b8'} />
                <Text className={`text-xs font-semibold ${isActive ? 'text-blue-700 font-extrabold' : 'text-slate-600'}`}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => setCurrentUser(null)}
          className="w-full py-2.5 mt-2 bg-rose-50 rounded-xl items-center border border-rose-100 flex-row justify-center gap-2 active:bg-rose-100"
        >
          <LogOut size={14} color="#f43f5e" />
          <Text className="text-rose-600 font-bold text-xs">Log Out</Text>
        </Pressable>
      </View>

      <View className="flex-1 md:min-w-0">
      <View className="h-14 shrink-0 bg-white/80 border-b border-white/30 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="w-8 h-8 bg-blue-500/10 border border-blue-500/30 rounded-xl items-center justify-center md:hidden">
            <Text className="text-xs font-black text-blue-600">{currentUser.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}</Text>
          </View>
          <View>
            <Text className="text-[10px] font-extrabold uppercase text-blue-600 md:hidden">Route Operator</Text>
            <Text className="text-xs font-black text-slate-800 md:text-base">{currentUser.name.split(' ')[0]}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="font-extrabold text-slate-500 font-mono text-[9px] bg-white/60 border border-slate-200 px-2 py-0.5 rounded-lg uppercase">{assignedTruck?.vehicle_number || 'TRK-981'}</Text>
          <Pressable onPress={() => setCurrentUser(null)} className="p-1.5 rounded-lg active:bg-rose-50 md:hidden">
            <LogOut size={18} color="#f43f5e" />
          </Pressable>
        </View>
      </View>

      {activeForm === 'create_order' ? (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-4xl gap-4">
          <View className="flex-row justify-between items-center border-b border-slate-200 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Create Store Order ({selectedStore?.name})</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-500 text-xs font-bold">Back</Text></Pressable>
          </View>

          <View className="flex-row items-center justify-between bg-white/70 p-3 rounded-xl border border-slate-200">
            <Text className="text-[10px] font-bold text-slate-500 uppercase">Pricing Mode</Text>
            <View className="flex-row bg-slate-100 p-1 rounded-lg">
              <Pressable onPress={() => setPricingMode('wholesale')} className={`px-3 py-1.5 rounded-md ${pricingMode === 'wholesale' ? 'bg-white' : ''}`}>
                <Text className={`text-xs font-bold ${pricingMode === 'wholesale' ? 'text-indigo-700' : 'text-slate-500'}`}>Wholesale</Text>
              </Pressable>
              <Pressable onPress={() => setPricingMode('retail')} className={`px-3 py-1.5 rounded-md ${pricingMode === 'retail' ? 'bg-white' : ''}`}>
                <Text className={`text-xs font-bold ${pricingMode === 'retail' ? 'text-indigo-700' : 'text-slate-500'}`}>Selling</Text>
              </Pressable>
            </View>
          </View>

          <View className="gap-2 md:flex-row md:flex-wrap">
            {data.products
              .filter(p => (data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === p.id)?.quantity || 0) > 0)
              .map(p => {
              const truckStock = data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === p.id)?.quantity || 0;
              const qty = orderItems[p.id] || 0;
              return (
                <View key={p.id} className="w-full md:w-[48%] bg-white/70 border border-white/60 p-3.5 rounded-2xl flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="font-bold text-slate-800 text-xs">{p.name}</Text>
                    <Text className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded self-start mt-1">Truck Stock: {truckStock}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[8px] text-slate-400 font-bold">Rate</Text>
                    <Text className="text-xs font-black text-emerald-700">{formatINR(pricingMode === 'wholesale' ? p.wholesale_price : p.selling_price)}</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Pressable onPress={() => handleUpdateItemQty(p.id, -1)} className="w-7 h-7 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"><Text className="font-bold text-slate-800">-</Text></Pressable>
                    <TextInput keyboardType="number-pad" value={qty === 0 ? '' : String(qty)} onChangeText={v => handleSetItemQty(p.id, v)} placeholder="0" placeholderTextColor="#94a3b8" className="w-12 text-center font-black text-xs text-slate-800 bg-white border border-slate-200 rounded-lg py-1.5" />
                    <Pressable onPress={() => handleUpdateItemQty(p.id, 1)} className="w-7 h-7 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"><Text className={`font-bold ${qty >= truckStock ? 'text-slate-300' : 'text-slate-800'}`}>+</Text></Pressable>
                  </View>
                </View>
              );
            })}
            {!hasTruckStock && (
              <Text className="w-full py-8 text-center text-slate-400 italic bg-white/70 rounded-2xl border border-white/50">No cargo loaded on this truck — no products available to order.</Text>
            )}
          </View>

          {hasTruckStock && (
            <Pressable onPress={handleConfirmOrder} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
              <Text className="text-white font-bold text-xs">Confirm & Preview Invoice</Text>
            </Pressable>
          )}
        </View>
        </ScrollView>
      ) : activeForm === 'preview_invoice' ? (
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
                const amount = item.quantity * item.unit_price;
                return (
                  <View key={item.product_id} className="flex-row justify-between border-b border-slate-50 py-1.5">
                    <Text className="font-bold text-slate-700 text-[11px] flex-1">{prod?.name || 'Unknown'}</Text>
                    <Text className="font-black text-slate-800 text-[11px] w-10 text-center">{item.quantity}</Text>
                    <Text className="text-slate-500 text-[10px] w-16 text-right">{formatINR(item.unit_price)}</Text>
                    <Text className="font-bold text-slate-700 text-[11px] w-16 text-right">{formatINR(amount)}</Text>
                  </View>
                );
              })}
            </View>

            <View className="pt-2 border-t border-slate-100 gap-1.5">
              <View className="flex-row justify-between"><Text className="text-slate-500 text-xs">Subtotal:</Text><Text className="font-bold text-slate-700 text-xs">{tempInvoice ? formatINR(tempInvoice.total) : formatINR(0)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-slate-500 text-xs">GST:</Text><Text className="font-bold text-slate-700 text-xs">{tempInvoice ? formatINR(tempInvoice.tax) : formatINR(0)}</Text></View>
              <View className="flex-row justify-between bg-slate-50 p-2 rounded-xl">
                <Text className="text-indigo-600 uppercase font-extrabold text-xs">Grand Total:</Text>
                <Text className="text-indigo-600 text-sm font-black">{tempInvoice ? formatINR(tempInvoice.grand_total) : formatINR(0)}</Text>
              </View>
            </View>
          </View>

          <Pressable onPress={handleFinalizeOrderOnly} className="w-full py-3 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
            <Text className="text-white font-black text-xs uppercase">Confirm Order</Text>
          </Pressable>
        </View>
        </ScrollView>
      ) : activeForm === 'payment_settlement' ? (() => {
        const dbInvoice = generatedInvoice ? data.invoices.find(i => i.id === generatedInvoice.id) : null;
        const priorPaid = dbInvoice ? (dbInvoice.paid_amount || 0) : 0;
        const totalBillAmount = generatedInvoice ? generatedInvoice.grand_total : 0;
        const remainingToPay = Math.max(0, totalBillAmount - priorPaid);
        const isPaidPreset = paymentMethod !== 'Credit' && Math.abs(paymentAmount - remainingToPay) < 0.05;
        const isPartialPreset = paymentMethod !== 'Credit' && paymentAmount > 0 && paymentAmount < remainingToPay - 0.05;
        const isUnpaidPreset = paymentMethod === 'Credit' || paymentAmount === 0;
        let btnColor = 'bg-emerald-600 active:bg-emerald-700';
        let btnLabel = `Record Fully Paid (${formatINR(paymentAmount)})`;
        if (isPartialPreset) { btnColor = 'bg-amber-600 active:bg-amber-700'; btnLabel = `Record Partial Payment (${formatINR(paymentAmount)})`; }
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

            <View className="bg-white border border-slate-200 rounded-2xl p-4 gap-2">
              <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Client Partner</Text><Text className="font-extrabold text-slate-800 text-xs">{selectedStore?.name}</Text></View>
              <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Invoice Number</Text><Text className="font-extrabold text-slate-800 text-xs">{generatedInvoice?.invoice_number}</Text></View>
              <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Grand Total</Text><Text className="font-extrabold text-slate-800 text-xs">{formatINR(totalBillAmount)}</Text></View>
              {priorPaid > 0 && <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Previously Paid</Text><Text className="font-extrabold text-emerald-600 text-xs">{formatINR(priorPaid)}</Text></View>}
              <View className="flex-row justify-between"><Text className="text-slate-400 font-bold uppercase text-[9px]">Remaining Due</Text><Text className="font-black text-indigo-600 text-sm">{formatINR(remainingToPay)}</Text></View>
            </View>

            <View className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 gap-3">
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
                    value={String(paymentAmount)}
                    onChangeText={v => {
                      const requested = parseFloat(Number(v || 0).toFixed(2));
                      if (requested > remainingToPay + 0.05) {
                        showAlert(`Only ${formatINR(remainingToPay)} is owed on this bill — the amount has been capped to that.`);
                      }
                      setPaymentAmount(Math.max(0, Math.min(remainingToPay, requested)));
                    }}
                    className={`w-full border border-indigo-200 font-black text-indigo-900 rounded-xl p-2.5 ${paymentMethod === 'Credit' ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                  />
                </View>
              </View>

              {paymentMethod !== 'Credit' && paymentAmount < remainingToPay - 0.05 && (
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                  <Text className="text-[10px] text-amber-800 font-bold">Partial payment: {formatINR(remainingToPay - paymentAmount)} outstanding will be automatically added to store credit.</Text>
                </View>
              )}

              {paymentMethod === 'UPI' && (
                <View className="bg-white border border-slate-200 rounded-2xl p-3 items-center gap-2">
                  <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=distributor@ic-erp&pn=Ice%20Cream%20Distributors&am=${paymentAmount}&cu=INR` }} className="w-32 h-32" />
                  <Text className="text-[9px] font-black text-slate-500 uppercase">Scan via GPay, PhonePe, Paytm, BHIM UPI</Text>
                </View>
              )}

              <Pressable onPress={handleFinalizeSettlementOnly} className={`w-full py-3 rounded-xl items-center ${btnColor}`}>
                <Text className="text-white font-black text-xs uppercase">{btnLabel}</Text>
              </Pressable>
            </View>
          </View>
          </ScrollView>
        );
      })() : activeForm === 'collect_payment' ? (
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
              <View className="flex-row justify-between border-b border-slate-100 pb-2"><Text className="text-slate-400 font-bold uppercase text-[9px]">Settle Amount:</Text><Text className="font-black text-emerald-600 text-xs">{formatINR(paymentAmount)}</Text></View>
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
      ) : activeForm === 'register_store' ? (
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
          </View>
          <Pressable onPress={handleRegisterStore} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
            <Text className="text-white font-bold text-xs">Register Partner Outlet</Text>
          </Pressable>
        </View>
        </ScrollView>
      ) : activeForm === 'add_visit' ? (
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
      ) : activeForm === 'bill_settlement_ledger' ? (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-5xl gap-4">
          <View className="flex-row justify-between items-center border-b border-slate-200 pb-3">
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">Bills & Settlement Ledger</Text>
              <Text className="text-[10px] text-slate-400">View all dispatch bills and settlement states</Text>
            </View>
            <Pressable onPress={() => setActiveForm('list')} className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg active:bg-slate-50"><Text className="text-slate-500 font-bold text-xs">Back</Text></Pressable>
          </View>

          <View className="relative justify-center lg:max-w-sm">
            <View className="absolute left-3 z-10"><Search size={14} color="#94a3b8" /></View>
            <TextInput value={ledgerSearch} onChangeText={setLedgerSearch} placeholder="Search by Invoice #, Outlet, Owner name..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-[11px] rounded-xl" />
          </View>

          <View className="flex-row flex-wrap gap-1.5">
            {(['All', 'Paid', 'Partial', 'Credit'] as const).map(f => (
              <Pressable key={f} onPress={() => setLedgerFilter(f)} className={`px-2.5 py-1 rounded-lg border ${ledgerFilter === f ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}>
                <Text className={`text-[10px] font-bold ${ledgerFilter === f ? 'text-white' : 'text-slate-600'}`}>{f === 'Credit' ? 'Unpaid / Credit' : f}</Text>
              </Pressable>
            ))}
          </View>

          <View className="gap-3 md:flex-row md:flex-wrap">
            {(() => {
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
              if (filteredInvoices.length === 0) {
                return <Text className="w-full text-center text-slate-400 italic py-8 bg-white border border-slate-200 rounded-2xl text-xs">No bills match your current search and filters.</Text>;
              }
              return filteredInvoices.map(inv => {
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
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">BILL TOTAL</Text><Text className="font-black text-slate-700 text-[11px]">Rs {inv.grand_total.toFixed(2)}</Text></View>
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">PAID</Text><Text className="font-black text-emerald-600 text-[11px]">Rs {paidVal.toFixed(2)}</Text></View>
                      <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">DUE</Text><Text className={`font-black text-[11px] ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{formatINR(remainingVal)}</Text></View>
                    </View>

                    {isExpanded && store && order && (
                      <View className="bg-slate-50 rounded-xl p-3 border border-slate-100 gap-2">
                        <Text className="font-bold text-slate-600 text-[9px] uppercase">Items & Dispatch Breakdown</Text>
                        {order.items.map((item, idx) => {
                          const p = data.products.find(prod => prod.id === item.product_id);
                          return (
                            <View key={idx} className="flex-row justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                              <Text className="font-bold text-slate-800 text-[10px] flex-1">{p ? p.name : item.product_id}</Text>
                              <Text className="text-slate-700 text-[10px]">{item.quantity} x Rs {item.unit_price.toFixed(2)}</Text>
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
                                    <Text className="font-black text-emerald-600 text-[9px]">Rs {pay.amount.toFixed(2)}</Text>
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
                            <CreditCard size={14} color="#fff" /><Text className="font-black text-[10px] text-white">Settle</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                );
              });
            })()}
          </View>
        </View>
        </ScrollView>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        <View className="w-full lg:max-w-[1400px] gap-4">
          {activeTab === 'home' && (
            <View className="gap-4">
              <View className="bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-blue-400">
                <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Today's Assigned Area</Text>
                <Text className="text-sm font-extrabold text-slate-800 mt-0.5">{assignedTruck?.route || 'Route A - Deccan Corridor'}</Text>
                <View className="flex-row gap-4 mt-4">
                  <View><Text className="text-[9px] uppercase font-bold text-slate-400">Collections Today</Text><Text className="font-black text-lg text-slate-800">Rs {todayCollections.toFixed(2)}</Text></View>
                  <View><Text className="text-[9px] uppercase font-bold text-slate-400">Pending Deliveries</Text><Text className="font-black text-lg text-slate-800">{pendingDeliveries.length} Stores</Text></View>
                </View>
              </View>

              <View className="bg-white/70 border border-white/50 rounded-2xl p-3.5 gap-2">
                <Text className="font-bold text-slate-800 text-xs">Quick Sales Actions</Text>
                <View className="flex-row gap-2">
                  <Pressable onPress={() => setActiveForm('register_store')} className="flex-1 py-2.5 px-3 bg-white/90 rounded-xl border border-white/60 items-center gap-1 active:bg-white">
                    <Plus size={16} color="#ec4899" /><Text className="font-bold text-slate-700 text-[10px]">Register Store</Text>
                  </Pressable>
                  <Pressable onPress={() => setActiveTab('stores')} className="flex-1 py-2.5 px-3 bg-white/90 rounded-xl border border-white/60 items-center gap-1 active:bg-white">
                    <ShoppingCart size={16} color="#3b82f6" /><Text className="font-bold text-slate-700 text-[10px]">Create New Order</Text>
                  </Pressable>
                </View>
              </View>

              <View className="bg-white/70 border border-white/50 rounded-2xl p-3">
                <Text className="font-bold text-slate-800 text-xs mb-3">Refill Reminders & Tasks Today</Text>
                <View className="gap-2.5 md:flex-row md:flex-wrap">
                  {data.stores.filter(s => s.status === 'Active' && (s.area === assignedTruck?.area || s.area === 'Kothrud')).slice(0, 3).map(s => (
                    <View key={s.id} className="w-full md:w-[48%] xl:w-[32%] p-2.5 rounded-xl bg-white/80 border border-white/60 flex-row items-center justify-between">
                      <View><Text className="font-bold text-slate-800 text-xs">{s.name}</Text><Text className="text-slate-400 text-[10px]">Outstanding: {formatINR(s.outstanding_balance)}</Text></View>
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
                          <Text className="text-[9px] font-extrabold text-slate-700">Rs{inv.grand_total.toFixed(2)}</Text>
                          <Text className="text-[9px] font-extrabold text-emerald-600">Rs{paidVal.toFixed(2)}</Text>
                          <Text className={`text-[9px] font-extrabold ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>Rs{remainingVal.toFixed(2)}</Text>
                        </View>
                      </View>
                    );
                  })}
                  {data.invoices.length === 0 && <Text className="text-center text-slate-400 italic text-[10px] py-4">No bills recorded yet.</Text>}
                </View>
              </View>
            </View>
          )}

          {activeTab === 'inventory' && (
            <View className="gap-4">
              <View className="relative justify-center lg:max-w-sm">
                <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                <TextInput value={availSearch} onChangeText={setAvailSearch} placeholder="Search truck stock..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
              </View>
              <View className="bg-white/70 border border-white/50 p-3 rounded-2xl">
                <Text className="font-bold text-slate-800 text-xs mb-3">My Dispatched Cargo Quantities</Text>
                <View className="gap-2 md:flex-row md:flex-wrap">
                  {data.products
                    .filter(p => p.name.toLowerCase().includes(availSearch.toLowerCase()))
                    .map(p => {
                      const truckQty = data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === p.id)?.quantity || 0;
                      const whQty = data.warehouse_inventory.find(wh => wh.product_id === p.id)?.available_qty || 0;
                      return { ...p, truckQty, whQty };
                    })
                    .sort((a, b) => { const aHas = a.truckQty > 0 ? 1 : 0; const bHas = b.truckQty > 0 ? 1 : 0; if (aHas !== bHas) return bHas - aHas; return a.name.localeCompare(b.name); })
                    .map(p => {
                      const isNotLoaded = p.truckQty === 0;
                      return (
                        <View key={p.id} className={`w-full md:w-[48%] xl:w-[32%] p-2.5 rounded-xl border flex-row items-center justify-between ${isNotLoaded ? 'bg-slate-100 border-slate-200' : 'bg-white/80 border-white/60'}`}>
                          <View className="flex-1">
                            <Text className={`font-bold text-xs ${isNotLoaded ? 'text-slate-500' : 'text-slate-800'}`}>{p.name}</Text>
                            <Text className="text-[10px] text-slate-400">{p.brand}</Text>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <View className="items-center"><Text className="text-[9px] text-slate-400 font-bold">Truck</Text><Text className={`font-black px-1.5 py-0.5 rounded text-[10px] ${isNotLoaded ? 'text-slate-400 bg-slate-200' : 'text-pink-700 bg-pink-100'}`}>{p.truckQty}</Text></View>
                            <View className="items-center"><Text className="text-[9px] text-slate-400 font-bold">Silo</Text><Text className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{p.whQty}</Text></View>
                          </View>
                        </View>
                      );
                    })}
                </View>
              </View>
            </View>
          )}

          {activeTab === 'stores' && (
            <View className="gap-4">
              <View className="flex-row items-center gap-2">
                <View className="flex-1 lg:max-w-sm relative justify-center">
                  <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                  <TextInput value={storeSearch} onChangeText={setStoreSearch} placeholder="Search client outlet directory..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
                </View>
                <Pressable onPress={() => setActiveForm('register_store')} className="bg-blue-600 p-2.5 rounded-xl active:bg-blue-700"><Plus size={20} color="#fff" /></Pressable>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {(['All', 'Paid', 'Unpaid', 'Partial'] as const).map(f => (
                  <Pressable key={f} onPress={() => setStoreStatusFilter(f)} className={`px-3 py-1 rounded-lg border ${storeStatusFilter === f ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}>
                    <Text className={`text-[10px] font-bold ${storeStatusFilter === f ? 'text-white' : 'text-slate-600'}`}>{f === 'Unpaid' ? 'Unpaid / Credit' : f}</Text>
                  </Pressable>
                ))}
              </View>
              <View className="gap-2.5 md:flex-row md:flex-wrap">
                {(() => {
                  const filteredStores = data.stores.filter(s => {
                    if (s.status !== 'Active') return false;
                    const searchMatch = s.name.toLowerCase().includes(storeSearch.toLowerCase()) || s.area.toLowerCase().includes(storeSearch.toLowerCase()) || (s.owner_name && s.owner_name.toLowerCase().includes(storeSearch.toLowerCase()));
                    if (!searchMatch) return false;
                    if (storeStatusFilter === 'All') return true;
                    return getStoreStatus(s.id, s.outstanding_balance) === storeStatusFilter;
                  });
                  if (filteredStores.length === 0) return <Text className="w-full text-center text-slate-400 italic py-8 bg-white/70 border border-white/50 rounded-2xl text-xs">No partner outlets match your search or filter.</Text>;
                  return filteredStores.map(s => {
                    const status = getStoreStatus(s.id, s.outstanding_balance);
                    return (
                      <View key={s.id} className="w-full md:w-[48%] xl:w-[32%] bg-white/70 border border-white/50 rounded-2xl p-3 relative border-l-4 border-l-blue-400">
                        <View className="absolute top-3 right-3 flex-row items-center gap-1.5">
                          <Text className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase ${status === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : status === 'Partial' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{status === 'Unpaid' ? 'Credit/Unpaid' : status}</Text>
                        </View>
                        <Text className="font-bold text-slate-800 text-xs pr-20">{s.name}</Text>
                        <Text className="text-[10px] text-slate-400 mt-0.5">Area: {s.area} - Ph: {s.phone}</Text>
                        <Text className="font-bold text-slate-700 text-xs mt-1">{formatINR(s.outstanding_balance)}</Text>
                        <View className="flex-row flex-wrap gap-2 mt-3 pt-2 border-t border-white/40 justify-end">
                          <Pressable onPress={() => { setSelectedStore(s); setActiveForm('add_visit'); }} className="py-1 px-2.5 bg-amber-50 border border-amber-200 rounded-lg active:bg-amber-100"><Text className="text-amber-700 text-[9px] font-bold">Log Visit</Text></Pressable>
                          <Pressable onPress={() => { setSelectedStore(s); setActiveTab('deliveries'); }} className="py-1 px-2.5 bg-emerald-50 border border-emerald-200 rounded-lg active:bg-emerald-100"><Text className="text-emerald-700 text-[9px] font-bold">Pre-book</Text></Pressable>
                          <Pressable onPress={() => handleStartOrder(s)} className="py-1 px-3 bg-blue-600 rounded-lg active:bg-blue-700"><Text className="text-white text-[9px] font-black">Create Order</Text></Pressable>
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          )}

          {activeTab === 'deliveries' && (
            <View className="gap-4">
              <View className="flex-row bg-white/80 border border-white/60 rounded-2xl p-1">
                <Pressable onPress={() => { if (editingBookingId) resetPreBookingForm(); setPreBookingView('create'); }} className={`flex-1 py-2 rounded-xl items-center ${preBookingView === 'create' ? 'bg-emerald-600' : ''}`}>
                  <Text className={`text-[11px] font-extrabold ${preBookingView === 'create' ? 'text-white' : 'text-slate-500'}`}>+ New Booking</Text>
                </Pressable>
                <Pressable onPress={() => setPreBookingView('list')} className={`flex-1 py-2 rounded-xl items-center flex-row justify-center gap-1.5 ${preBookingView === 'list' ? 'bg-blue-600' : ''}`}>
                  <Text className={`text-[11px] font-extrabold ${preBookingView === 'list' ? 'text-white' : 'text-slate-500'}`}>My Bookings</Text>
                  {pendingPreBookings.length > 0 && <Text className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${preBookingView === 'list' ? 'bg-white/30 text-white' : 'bg-blue-100 text-blue-700'}`}>{pendingPreBookings.length}</Text>}
                </Pressable>
              </View>

              {preBookingView === 'create' && (
                <View className="gap-3 w-full lg:max-w-3xl lg:self-center">
                  <View className="bg-emerald-600 rounded-2xl p-4 flex-row items-center justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-0.5"><ShoppingCart size={16} color="#fff" /><Text className="font-extrabold text-sm text-white">{editingBookingId ? `Edit Pre-booking ${editingBookingId.toUpperCase()}` : 'New Pre-booking Order'}</Text></View>
                      <Text className="text-[10px] text-white/85 leading-relaxed">{editingBookingId ? 'Adjust quantities, pricing, or delivery details for this pre-booking.' : 'Reserve warehouse stock now, deliver it later from the reserved pool.'}</Text>
                    </View>
                    {editingBookingId && (
                      <Pressable onPress={() => { resetPreBookingForm(); setPreBookingView('list'); }} className="bg-white/20 px-2.5 py-1.5 rounded-lg active:bg-white/30">
                        <Text className="text-white font-bold text-[10px]">Cancel Edit</Text>
                      </Pressable>
                    )}
                  </View>

                  <View className="bg-white/70 border border-white/50 rounded-2xl p-4 gap-3">
                    <Text className="text-xs font-extrabold text-slate-700 uppercase">1. Store & Delivery Date</Text>
                    <View>
                      <Text className="text-[10px] font-bold text-slate-500 mb-1 uppercase">Store Partner</Text>
                      <SelectField
                        value={selectedStore?.id || ''}
                        onValueChange={v => setSelectedStore(data.stores.find(store => store.id === v) || null)}
                        options={data.stores.filter(store => store.status === 'Active' || store.id === selectedStore?.id).map(store => ({ label: store.name, value: store.id }))}
                        title="Select Store"
                        className="bg-white border border-slate-200 rounded-xl p-2.5 flex-row items-center justify-between"
                      />
                    </View>
                    <View>
                      <Text className="text-[10px] font-bold text-slate-500 mb-1 uppercase">Scheduled Delivery Date</Text>
                      <DateField value={preBookingForm.scheduled_delivery_date} onValueChange={v => setPreBookingForm({ ...preBookingForm, scheduled_delivery_date: v })} title="Select Delivery Date" className={inputClass + ' flex-row items-center justify-between'} />
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between bg-white/70 border border-white/50 rounded-2xl p-3">
                    <Text className="text-[10px] font-bold text-slate-500 uppercase">Pricing Mode</Text>
                    <View className="flex-row bg-slate-100 p-1 rounded-lg">
                      <Pressable onPress={() => setPreBookingPricingMode('wholesale')} className={`px-3 py-1.5 rounded-md ${preBookingPricingMode === 'wholesale' ? 'bg-white' : ''}`}>
                        <Text className={`text-xs font-bold ${preBookingPricingMode === 'wholesale' ? 'text-indigo-700' : 'text-slate-500'}`}>Wholesale</Text>
                      </Pressable>
                      <Pressable onPress={() => setPreBookingPricingMode('retail')} className={`px-3 py-1.5 rounded-md ${preBookingPricingMode === 'retail' ? 'bg-white' : ''}`}>
                        <Text className={`text-xs font-bold ${preBookingPricingMode === 'retail' ? 'text-indigo-700' : 'text-slate-500'}`}>Selling</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View className="bg-white/70 border border-white/50 rounded-2xl p-4 gap-3">
                    <Text className="text-xs font-extrabold text-slate-700 uppercase">2. Select Products & Quantities</Text>
                    <View className="gap-2 md:flex-row md:flex-wrap">
                      {data.products.filter(product => product.status === 'Active' && getEffectiveAvailableForBooking(product.id) > 0).length === 0 && (
                        <Text className="text-[10px] text-slate-400 italic py-2 text-center">No products currently have warehouse stock available to pre-book.</Text>
                      )}
                      {data.products.filter(product => product.status === 'Active' && getEffectiveAvailableForBooking(product.id) > 0).map(product => {
                        const warehouseInventory = data.warehouse_inventory.find(inv => inv.product_id === product.id);
                        const availableQty = getEffectiveAvailableForBooking(product.id);
                        const reservedQty = warehouseInventory?.reserved_qty || 0;
                        const qty = bookingItems[product.id] || 0;
                        return (
                          <View key={product.id} className={`w-full md:w-[48%] bg-white/90 border rounded-xl p-3 flex-row items-center justify-between gap-3 ${qty > 0 ? 'border-emerald-300' : 'border-white/60'}`}>
                            <View className="flex-1">
                              <Text className="font-bold text-slate-800 text-xs">{product.name}</Text>
                              <Text className="text-[9px] font-bold text-emerald-700 mt-0.5">Rate: {formatINR(preBookingPricingMode === 'wholesale' ? product.wholesale_price : product.selling_price)}</Text>
                              <Text className={`text-[9px] font-bold px-1.5 py-0.5 rounded self-start mt-1 ${availableQty > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>WH: {availableQty} avail{reservedQty > 0 ? ` - ${reservedQty} reserved` : ''}</Text>
                            </View>
                            <View className="flex-row items-center gap-1.5">
                              <Pressable onPress={() => handleUpdatePreBookingQty(product.id, -1)} className="w-7 h-7 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"><Text className="font-bold text-slate-700">-</Text></Pressable>
                              <TextInput keyboardType="number-pad" value={String(qty)} onChangeText={v => handleSetPreBookingQty(product.id, v)} className="w-12 bg-white border border-slate-200 rounded-lg p-1 text-center font-extrabold text-xs" />
                              <Pressable onPress={() => handleUpdatePreBookingQty(product.id, 1)} className="w-7 h-7 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"><Text className={`font-bold ${qty >= availableQty ? 'text-slate-300' : 'text-slate-700'}`}>+</Text></Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                    {Object.values(bookingItems).some(q => (q as number) > 0) && (
                      <View className="flex-row items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                        <Text className="font-bold text-emerald-700 text-[10px]">Items selected:</Text>
                        <Text className="font-black text-emerald-800 text-[10px]">{Object.values(bookingItems).reduce((s: number, q) => s + (q as number), 0)} units</Text>
                      </View>
                    )}
                  </View>

                  <View className="bg-white/70 border border-white/50 rounded-2xl p-4 gap-3">
                    <Text className="text-xs font-extrabold text-slate-700 uppercase">3. Notes & Confirm</Text>
                    <TextInput
                      value={preBookingForm.notes}
                      onChangeText={v => setPreBookingForm({ ...preBookingForm, notes: v })}
                      multiline
                      numberOfLines={2}
                      placeholder="e.g. Reserve for birthday order, deliver Friday evening."
                      placeholderTextColor="#94a3b8"
                      className={inputClass}
                      style={{ minHeight: 60, textAlignVertical: 'top' }}
                    />
                    <Pressable onPress={handleSavePreBookingOrder} className="w-full py-3 bg-emerald-600 rounded-xl items-center flex-row justify-center gap-2 active:bg-emerald-700">
                      <CheckCircle size={16} color="#fff" />
                      <Text className="text-white font-extrabold text-xs">{editingBookingId ? 'Update Pre-booking & Adjust Reservation' : 'Save Pre-booking & Reserve Stock'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {preBookingView === 'list' && (
                <View className="gap-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-extrabold text-slate-700 text-xs uppercase">Saved Pre-bookings</Text>
                    <Text className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">{pendingPreBookings.length} Saved</Text>
                  </View>

                  {pendingPreBookings.length === 0 ? (
                    <View className="py-10 items-center bg-white/70 border border-dashed border-white/70 rounded-2xl">
                      <ShoppingCart size={28} color="#cbd5e1" />
                      <Text className="text-slate-400 font-semibold text-xs mt-2">No pre-bookings saved yet.</Text>
                      <Pressable onPress={() => setPreBookingView('create')} className="mt-3"><Text className="text-emerald-600 font-extrabold text-[11px] underline">Create your first booking</Text></Pressable>
                    </View>
                  ) : (
                    <View className="gap-3 md:flex-row md:flex-wrap">
                      {pendingPreBookings.map(booking => {
                        const store = data.stores.find(s => s.id === booking.store_id);
                        const itemCount = booking.items.reduce((sum, item) => sum + item.quantity, 0);
                        const isBooked = booking.status === 'Booked';
                        const subtotal = booking.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
                        const taxTotal = booking.items.reduce((sum, item) => sum + ((item.quantity * item.unit_price * item.tax_pct) / 100), 0);
                        const grandTotal = subtotal + taxTotal;
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
                              <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">ITEMS</Text><Text className="font-black text-slate-700 text-[11px]">{itemCount} units</Text></View>
                              <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">TAX</Text><Text className="font-black text-slate-700 text-[11px]">Rs{taxTotal.toFixed(2)}</Text></View>
                              <View className="items-center flex-1"><Text className="text-slate-400 font-bold text-[8px]">TOTAL</Text><Text className="font-black text-indigo-600 text-[11px]">Rs{grandTotal.toFixed(2)}</Text></View>
                            </View>
                            {isExpanded && (
                              <View className="bg-slate-50 rounded-xl p-3 gap-2">
                                {booking.items.map((item, idx) => {
                                  const p = data.products.find(prod => prod.id === item.product_id);
                                  return (
                                    <View key={idx} className="flex-row justify-between items-center bg-white p-2 rounded-lg">
                                      <Text className="font-bold text-slate-800 text-[10px] flex-1">{p ? p.name : item.product_id}</Text>
                                      <Text className="text-slate-700 text-[10px]">{item.quantity} x Rs{item.unit_price.toFixed(2)}{p && item.unit_price === p.wholesale_price ? ' (Wholesale)' : p && item.unit_price === p.selling_price ? ' (Selling)' : ''}</Text>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                            <View className="flex-row flex-wrap gap-2 justify-end border-t border-slate-100 pt-2.5">
                              <Pressable onPress={() => togglePreBookingExpand(booking.id)} className={`p-1.5 rounded-lg border flex-row items-center gap-1 ${isExpanded ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                                <Eye size={14} color={isExpanded ? '#1d4ed8' : '#475569'} /><Text className={`font-bold text-[10px] ${isExpanded ? 'text-blue-700' : 'text-slate-600'}`}>{isExpanded ? 'Hide' : 'Details'}</Text>
                              </Pressable>
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
                    <View className="gap-2 md:flex-row md:flex-wrap">
                      {data.warehouse_inventory.filter(item => item.reserved_qty > 0).length === 0 ? (
                        <Text className="py-4 text-center text-slate-400 italic text-[10px]">No reserved warehouse stock.</Text>
                      ) : (
                        data.warehouse_inventory.filter(item => item.reserved_qty > 0).map(item => {
                          const product = data.products.find(p => p.id === item.product_id);
                          return (
                            <View key={item.product_id} className="w-full md:w-[48%] xl:w-[32%] bg-white/90 border border-amber-100 rounded-xl p-3 flex-row items-center justify-between">
                              <View><Text className="font-bold text-slate-800 text-xs">{product?.name || item.product_id}</Text><Text className="text-[10px] text-slate-400">{item.available_qty} avail - <Text className="text-amber-600 font-bold">{item.reserved_qty} reserved</Text></Text></View>
                              <Text className="text-[9px] font-extrabold px-2 py-1 rounded-lg bg-amber-100 text-amber-700">RESERVED</Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {activeTab === 'visits' && (
            <View className="gap-2.5">
              <Text className="font-bold text-slate-600 text-xs uppercase">Site Visits Logging History</Text>
              <View className="gap-2.5 md:flex-row md:flex-wrap">
              {data.visits.map((v: any) => {
                const store = data.stores.find(s => s.id === v.store_id);
                return (
                  <View key={v.id} className="w-full md:w-[48%] xl:w-[32%] bg-white/70 border border-white/50 p-3 rounded-2xl border-l-4 border-l-pink-400">
                    <View className="flex-row items-center justify-between mb-1.5"><Text className="font-bold text-slate-800 text-xs">{store?.name}</Text><Text className="text-[9px] text-slate-400">{new Date(v.date).toLocaleDateString()}</Text></View>
                    <Text className="text-slate-600 italic text-xs">"{v.notes}"</Text>
                    {v.follow_up_date && <Text className="text-[9px] text-pink-600 font-extrabold mt-1.5 uppercase">Follow-up: {v.follow_up_date}</Text>}
                  </View>
                );
              })}
              {data.visits.length === 0 && <Text className="w-full py-8 text-center text-slate-400 italic bg-white/70 rounded-2xl border border-white/50">No visit audits logged yet for this shift.</Text>}
              </View>
            </View>
          )}
        </View>
        </ScrollView>
      )}

      {activeForm === 'list' && (
        <View className="h-16 shrink-0 bg-white/90 border-t border-white/30 flex-row items-stretch md:hidden">
          {navTabs.map(({ tab, icon: Icon, label }) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} className="flex-1 items-center justify-center gap-1">
              <Icon size={20} color={activeTab === tab ? '#2563eb' : '#94a3b8'} />
              <Text className={`text-[9px] font-bold ${activeTab === tab ? 'text-blue-600' : 'text-slate-400'}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      </View>

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
        const grandTotal = booking.items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (1 + item.tax_pct / 100)), 0);
        const isUnpaid = preBookingSettleMethod === 'Credit' || preBookingSettleAmount <= 0;
        const isPartial = !isUnpaid && preBookingSettleAmount < grandTotal - 0.05;
        let btnColor = 'bg-emerald-600 active:bg-emerald-700';
        let btnLabel = `Record Fully Paid (${formatINR(preBookingSettleAmount)})`;
        if (isPartial) { btnColor = 'bg-amber-600 active:bg-amber-700'; btnLabel = `Record Partial Payment (${formatINR(preBookingSettleAmount)})`; }
        else if (isUnpaid) { btnColor = 'bg-rose-600 active:bg-rose-700'; btnLabel = 'Record As Unpaid (100% Credit)'; }

        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPreBookingConfirmAction(null)}>
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <ScrollView className="w-full max-w-sm" style={{ maxHeight: '92%' }} contentContainerStyle={{ flexGrow: 0 }}>
                <View className="bg-white w-full rounded-3xl p-5 gap-3">
                  <Text className="text-base font-black text-slate-800 text-center">Confirm Delivery & Payment</Text>
                  <Text className="text-xs text-slate-500 font-semibold text-center leading-relaxed">
                    Mark pre-booking {booking.id.toUpperCase()} as delivered and record how much was collected from the store.
                  </Text>

                  <View className="bg-slate-50 rounded-xl p-3 flex-row justify-between items-center">
                    <Text className="text-slate-400 font-bold text-[10px] uppercase">Bill Total</Text>
                    <Text className="font-black text-indigo-600 text-sm">{formatINR(grandTotal)}</Text>
                  </View>

                  <View className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 gap-3">
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
                          value={String(preBookingSettleAmount)}
                          onChangeText={v => setPreBookingSettleAmount(Math.max(0, Math.min(grandTotal, parseFloat(v) || 0)))}
                          className={`w-full border border-indigo-200 font-black text-indigo-900 rounded-xl p-2.5 ${preBookingSettleMethod === 'Credit' ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                        />
                      </View>
                    </View>

                    {isPartial && (
                      <View className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                        <Text className="text-[10px] text-amber-800 font-bold">Partial payment: {formatINR(grandTotal - preBookingSettleAmount)} outstanding will be automatically added to store credit.</Text>
                      </View>
                    )}
                    {isUnpaid && (
                      <View className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                        <Text className="text-[10px] text-rose-700 font-bold">Full amount {formatINR(grandTotal)} will be added to store outstanding credit.</Text>
                      </View>
                    )}

                    {preBookingSettleMethod === 'UPI' && (
                      <View className="bg-white border border-slate-200 rounded-2xl p-3 items-center gap-2">
                        <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=distributor@ic-erp&pn=Ice%20Cream%20Distributors&am=${preBookingSettleAmount}&cu=INR` }} className="w-32 h-32" />
                        <Text className="text-[9px] font-black text-slate-500 uppercase">Scan via GPay, PhonePe, Paytm, BHIM UPI</Text>
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
  );
}
