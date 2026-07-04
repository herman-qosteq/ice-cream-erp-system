import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Image, Modal, Linking } from 'react-native';
import { Search, MapPin, DollarSign, AlertTriangle, MessageSquare, Download, Eye, Plus, Truck } from 'lucide-react-native';
import { ERPData, logAudit } from '../../storage';
import { Store, Order, Invoice, Payment, Supplier, PreBookingItem } from '../../types';
import { calculateStoreHealthScore } from '../../data';
import SelectField from '../../components/common/SelectField';
import ConfirmModal from '../../components/common/ConfirmModal';
import { exportHtmlReport } from '../../utils/reportExport';

interface AdminSalesProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: any, message: string) => void;
  currentUser: any;
  activeScreen?: string;
  showAlert: (opts: any) => void;
}

const inputClass = "w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800";

export default function AdminSales({ data, setData, addNotification, currentUser, activeScreen, showAlert }: AdminSalesProps) {
  const [salesTab, setSalesTab] = useState<'stores' | 'suppliers' | 'orders' | 'prebookings' | 'payments' | 'credit' | 'refill' | 'inactive'>('stores');

  useEffect(() => {
    if (!activeScreen) return;
    const screenLower = activeScreen.toLowerCase();
    if (screenLower === 'stores') setSalesTab('stores');
    else if (screenLower === 'suppliers' || screenLower === 'purchases') setSalesTab('suppliers');
    else if (screenLower === 'orders' || screenLower === 'invoices') setSalesTab('orders');
    else if (screenLower === 'payments') setSalesTab('payments');
    else if (screenLower === 'credit') setSalesTab('credit');
    else if (screenLower === 'refill') setSalesTab('refill');
    else if (screenLower === 'inactive') setSalesTab('inactive');
  }, [activeScreen]);

  const [storeSearch, setStoreSearch] = useState('');
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [deleteStoreConfirmId, setDeleteStoreConfirmId] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [viewingStore, setViewingStore] = useState<Store | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeForm, setActiveForm] = useState<'list' | 'add_store' | 'edit_store' | 'add_payment' | 'order_details' | 'add_supplier' | 'add_prebooking'>('list');
  const [preBookingStoreId, setPreBookingStoreId] = useState<string>(data.stores[0]?.id || '');
  const [preBookingDate, setPreBookingDate] = useState<string>(new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]);
  const [preBookingNotes, setPreBookingNotes] = useState<string>('');
  const [preBookingItems, setPreBookingItems] = useState<Record<string, number>>({});
  const [preBookingSearch, setPreBookingSearch] = useState<string>('');
  const [preBookingStatusFilter, setPreBookingStatusFilter] = useState<'All' | 'Booked' | 'Delivered' | 'Cancelled'>('All');
  const [preBookingConfirmAction, setPreBookingConfirmAction] = useState<{ bookingId: string; action: 'deliver' | 'cancel' } | null>(null);
  const [preBookingSettleAmount, setPreBookingSettleAmount] = useState(0);
  const [preBookingSettleMethod, setPreBookingSettleMethod] = useState<'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'>('UPI');
  const [cancelOrderConfirmId, setCancelOrderConfirmId] = useState<string | null>(null);
  const [inactiveDaysTab, setInactiveDaysTab] = useState<30 | 60 | 90>(30);
  const [creditSort, setCreditSort] = useState<'balance_desc' | 'balance_asc' | 'limit_desc' | 'limit_asc'>('balance_desc');
  const [creditSearch, setCreditSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'All' | 'Confirmed' | 'Delivered' | 'Cancelled'>('All');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'All' | 'Paid' | 'Partial' | 'Unpaid'>('All');

  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [deleteSupplierConfirmId, setDeleteSupplierConfirmId] = useState<string | null>(null);

  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });

  const handleOpenAddSupplier = () => {
    setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '' });
    setEditingSupplierId(null);
    setActiveForm('add_supplier');
  };

  const handleOpenEditSupplier = (supplier: Supplier) => {
    setSupplierForm({ name: supplier.name, contact_person: supplier.contact_person, phone: supplier.phone, email: supplier.email, address: supplier.address });
    setEditingSupplierId(supplier.id);
    setActiveForm('add_supplier');
  };

  const handleSaveSupplier = () => {
    if (!supplierForm.name || !supplierForm.phone) {
      showAlert('Supplier name and contact number are required.');
      return;
    }
    if (editingSupplierId) {
      const updatedSuppliers = data.suppliers.map(s => (s.id === editingSupplierId ? { ...s, ...supplierForm } : s));
      let tempState = { ...data, suppliers: updatedSuppliers };
      tempState = logAudit(tempState, 'SUPPLIER_UPDATE', 'Supplier', editingSupplierId, currentUser?.id || 'admin', `Updated details for supplier ${supplierForm.name}`);
      setData(tempState);
      addNotification('partner_update', `Supplier "${supplierForm.name}" updated successfully.`);
    } else {
      const newSupplier: Supplier = { id: 's_' + Date.now(), ...supplierForm };
      let tempState = { ...data, suppliers: [newSupplier, ...data.suppliers] };
      tempState = logAudit(tempState, 'SUPPLIER_CREATE', 'Supplier', newSupplier.id, currentUser?.id || 'admin', `Registered supplier ${newSupplier.name}`);
      setData(tempState);
      addNotification('partner_update', `Supplier "${supplierForm.name}" registered successfully.`);
    }
    setActiveForm('list');
    setEditingSupplierId(null);
  };

  const [storeForm, setStoreForm] = useState({
    name: '', owner_name: '', phone: '', alt_phone: '', address: '', area: 'Downtown',
    city: 'Metro City', state: 'New York', pincode: '10001', gst_number: '',
    credit_limit: 1000, refill_frequency: 'Weekly' as 'Weekly' | '15 Days' | 'Monthly' | 'Custom',
    custom_days: 7, ranking: 'Silver' as 'Platinum' | 'Gold' | 'Silver' | 'Bronze'
  });

  const [paymentForm, setPaymentForm] = useState({
    store_id: data.stores[0]?.id || '', invoice_id: 'general', amount: 100,
    method: 'UPI' as 'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'
  });

  const handleSavePreBooking = () => {
    if (!preBookingStoreId) {
      showAlert('Please select a store for the pre-booking order.');
      return;
    }
    const selectedStoreObj = data.stores.find(s => s.id === preBookingStoreId);
    if (!selectedStoreObj) {
      showAlert('Selected store not found.');
      return;
    }
    const itemsList: PreBookingItem[] = Object.entries(preBookingItems)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([prodId, qty]) => {
        const prod = data.products.find(p => p.id === prodId);
        return { product_id: prodId, quantity: Number(qty), unit_price: prod?.selling_price || 0, tax_pct: prod?.tax_pct || 18 };
      });
    if (itemsList.length === 0) {
      showAlert('Please add at least one product with quantity > 0.');
      return;
    }
    for (const item of itemsList) {
      const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === item.product_id);
      const available = warehouseInv?.available_qty || 0;
      if (item.quantity > available) {
        const productName = data.products.find(product => product.id === item.product_id)?.name || item.product_id;
        showAlert(`Insufficient warehouse stock for ${productName}. Only ${available} units are available.`);
        return;
      }
    }
    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      const match = itemsList.find(item => item.product_id === inv.product_id);
      if (!match) return inv;
      return { ...inv, available_qty: Math.max(0, inv.available_qty - match.quantity), reserved_qty: inv.reserved_qty + match.quantity };
    });
    const newBooking = {
      id: `pb_${Date.now()}`, store_id: preBookingStoreId, salesperson_id: currentUser?.id || 'admin',
      created_at: new Date().toISOString(), scheduled_delivery_date: preBookingDate, status: 'Booked' as const,
      items: itemsList, notes: preBookingNotes.trim() || undefined
    };
    let temp = { ...data, warehouse_inventory: updatedWarehouse, preBookingOrders: [newBooking, ...(data.preBookingOrders || [])] };
    temp = logAudit(temp, 'PREBOOKING_CREATE', 'Store', preBookingStoreId, currentUser?.id || 'admin', `Reserved warehouse stock for pre-booking order ${newBooking.id} at ${selectedStoreObj.name}.`);
    setData(temp);
    addNotification('new_order', `Pre-booking saved for ${selectedStoreObj.name} and stock reserved in warehouse.`);
    showAlert('Pre-booking saved successfully.');
    setPreBookingItems({});
    setPreBookingNotes('');
    setPreBookingDate(new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]);
    setActiveForm('list');
    setSalesTab('prebookings');
  };

  const handleDeliverPreBooking = (preBookingOrderId: string) => {
    const booking = (data.preBookingOrders || []).find(item => item.id === preBookingOrderId);
    if (!booking) return;
    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      const match = booking.items.find(item => item.product_id === inv.product_id);
      if (!match) return inv;
      return { ...inv, reserved_qty: Math.max(0, inv.reserved_qty - match.quantity) };
    });
    const updatedPreBookings = data.preBookingOrders.map(item => (item.id === preBookingOrderId ? { ...item, status: 'Delivered' as const } : item));

    const orderId = `o_${Date.now()}`;
    const total = booking.items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);
    const tax = booking.items.reduce((acc, item) => acc + (item.quantity * item.unit_price * (item.tax_pct / 100)), 0);
    const grandTotal = parseFloat((total + tax).toFixed(2));

    const isPayLater = preBookingSettleMethod === 'Credit' || preBookingSettleAmount <= 0;
    const actualCollection = isPayLater ? 0 : Math.min(parseFloat(preBookingSettleAmount.toFixed(2)), grandTotal);
    const paymentStatus: 'Paid' | 'Partial' | 'Credit' = actualCollection >= grandTotal - 0.05 ? 'Paid' : actualCollection > 0 ? 'Partial' : 'Credit';

    const newOrder: Order = {
      id: orderId, store_id: booking.store_id, salesperson_id: booking.salesperson_id, truck_id: '',
      status: 'Delivered', created_at: new Date().toISOString(), items: booking.items
    };
    const newInvoice: Invoice = {
      id: `inv_${Date.now()}`, order_id: orderId, invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
      total: parseFloat(total.toFixed(2)), tax: parseFloat(tax.toFixed(2)), grand_total: grandTotal, created_at: new Date().toISOString(),
      paid_amount: actualCollection, payment_status: paymentStatus, payment_method: actualCollection > 0 ? preBookingSettleMethod : 'Credit'
    };
    const newPayment: Payment | null = actualCollection > 0 ? {
      id: `pay_${Date.now()}`, store_id: booking.store_id, order_id: orderId, amount: actualCollection,
      method: preBookingSettleMethod as any, date: new Date().toISOString(), collected_by: booking.salesperson_id
    } : null;
    const updatedStores = data.stores.map(st => {
      if (st.id !== booking.store_id) return st;
      let refillDays = 7;
      if (st.refill_frequency === 'Weekly') refillDays = 7;
      else if (st.refill_frequency === '15 Days') refillDays = 15;
      else if (st.refill_frequency === 'Monthly') refillDays = 30;
      else if (st.refill_frequency === 'Custom') refillDays = st.custom_days || 7;
      return {
        ...st,
        outstanding_balance: parseFloat((st.outstanding_balance + (grandTotal - actualCollection)).toFixed(2)),
        last_purchase_date: '2026-06-27',
        next_refill_date: new Date(new Date('2026-06-27').getTime() + refillDays * 86400000).toISOString().split('T')[0]
      };
    });

    let temp: any = { ...data, warehouse_inventory: updatedWarehouse, preBookingOrders: updatedPreBookings, orders: [newOrder, ...data.orders], invoices: [newInvoice, ...data.invoices], stores: updatedStores, payments: newPayment ? [newPayment, ...data.payments] : data.payments };
    temp = logAudit(temp, 'PREBOOKING_DELIVER', 'PreBookingOrder', preBookingOrderId, currentUser?.id || 'admin', `Delivered pre-booking order ${preBookingOrderId}, generated order ${orderId} (Rs${grandTotal.toFixed(2)}, ${paymentStatus}), and released reserved warehouse stock.`);
    setData(temp);
    addNotification('delivery', `Pre-booking order ${preBookingOrderId} completed. Payment status: ${paymentStatus}.`);
    showAlert(`Pre-booking delivery completed. Payment status: ${paymentStatus}.`);
  };

  const handleCancelPreBooking = (preBookingOrderId: string) => {
    const booking = (data.preBookingOrders || []).find(item => item.id === preBookingOrderId);
    if (!booking) return;
    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      const match = booking.items.find(item => item.product_id === inv.product_id);
      if (!match) return inv;
      return { ...inv, available_qty: inv.available_qty + match.quantity, reserved_qty: Math.max(0, inv.reserved_qty - match.quantity) };
    });
    const updatedPreBookings = data.preBookingOrders.map(item => (item.id === preBookingOrderId ? { ...item, status: 'Cancelled' as const } : item));
    let temp = { ...data, warehouse_inventory: updatedWarehouse, preBookingOrders: updatedPreBookings };
    temp = logAudit(temp, 'PREBOOKING_CANCEL', 'PreBookingOrder', preBookingOrderId, currentUser?.id || 'admin', `Cancelled pre-booking order ${preBookingOrderId} and released reserved warehouse stock.`);
    setData(temp);
    addNotification('partner_update', `Pre-booking order ${preBookingOrderId} cancelled.`);
    showAlert('Pre-booking cancelled and warehouse stock released.');
  };

  const filteredStores = data.stores.filter(s =>
    s.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
    s.area.toLowerCase().includes(storeSearch.toLowerCase()) ||
    s.owner_name.toLowerCase().includes(storeSearch.toLowerCase())
  );

  const handleOpenAddStore = () => {
    setStoreForm({
      name: '', owner_name: '', phone: '', alt_phone: '', address: '', area: 'Downtown',
      city: 'Metro City', state: 'New York', pincode: '10001', gst_number: '',
      credit_limit: 2000, refill_frequency: 'Weekly', custom_days: 7, ranking: 'Silver'
    });
    setActiveForm('add_store');
  };

  const handleSaveStore = () => {
    if (!storeForm.name || !storeForm.phone) {
      showAlert('Store name and primary phone are required.');
      return;
    }
    const isNew = activeForm === 'add_store';
    let refillDays = 7;
    if (storeForm.refill_frequency === 'Weekly') refillDays = 7;
    else if (storeForm.refill_frequency === '15 Days') refillDays = 15;
    else if (storeForm.refill_frequency === 'Monthly') refillDays = 30;
    else if (storeForm.refill_frequency === 'Custom') refillDays = storeForm.custom_days || 7;

    if (isNew) {
      const newStore: Store = {
        id: 'st_' + Date.now(), outstanding_balance: 0, last_purchase_date: '',
        next_refill_date: new Date(new Date('2026-06-27').getTime() + refillDays * 86400000).toISOString().split('T')[0],
        ...storeForm
      };
      let temp = { ...data, stores: [newStore, ...data.stores] };
      temp = logAudit(temp, 'STORE_REGISTER', 'Store', newStore.id, currentUser?.id || 'admin', `Registered new client store: ${newStore.name}`);
      setData(temp);
      addNotification('partner_update', `New client store registered: ${newStore.name}`);
    } else {
      const updatedStores = data.stores.map(s => {
        if (s.id === selectedStore?.id) {
          const baseDate = s.last_purchase_date ? new Date(s.last_purchase_date) : new Date('2026-06-27');
          const nextRefill = new Date(baseDate.getTime() + refillDays * 86400000).toISOString().split('T')[0];
          return { ...s, ...storeForm, next_refill_date: nextRefill };
        }
        return s;
      });
      let temp = { ...data, stores: updatedStores };
      temp = logAudit(temp, 'STORE_EDIT', 'Store', selectedStore!.id, currentUser?.id || 'admin', `Modified client details for ${storeForm.name}`);
      setData(temp);
      addNotification('partner_update', `Store details updated for ${storeForm.name}.`);
    }
    setActiveForm('list');
  };

  const handleCancelOrder = (orderId: string) => setCancelOrderConfirmId(orderId);

  const executeCancelOrder = (orderId: string) => {
    const order = data.orders.find(o => o.id === orderId);
    if (!order) return;
    let updatedWarehouse = [...data.warehouse_inventory];
    if (order.status === 'Confirmed') {
      updatedWarehouse = data.warehouse_inventory.map(inv => {
        const itemMatch = order.items.find(item => item.product_id === inv.product_id);
        if (itemMatch) return { ...inv, available_qty: inv.available_qty + itemMatch.quantity, reserved_qty: Math.max(0, inv.reserved_qty - itemMatch.quantity) };
        return inv;
      });
    }
    const updatedOrders = data.orders.map(o => (o.id === orderId ? { ...o, status: 'Cancelled' as any } : o));
    let temp = { ...data, orders: updatedOrders, warehouse_inventory: updatedWarehouse };
    temp = logAudit(temp, 'ORDER_CANCEL', 'Order', orderId, currentUser?.id || 'admin', `Cancelled order ID ${orderId}. Released any reserved stock back to available.`);
    setData(temp);
    addNotification('order_update', `Order ID ${orderId} has been CANCELLED.`);
    setActiveForm('list');
  };

  const handleConfirmDraftOrder = (orderId: string) => {
    const order = data.orders.find(o => o.id === orderId);
    if (!order) return;
    for (const item of order.items) {
      const pInv = data.warehouse_inventory.find(inv => inv.product_id === item.product_id);
      const pName = data.products.find(p => p.id === item.product_id)?.name || item.product_id;
      if (!pInv || pInv.available_qty < item.quantity) {
        showAlert(`Cannot confirm order: Insufficient available stock for ${pName}. Only ${pInv?.available_qty || 0} units available, but ${item.quantity} are requested.`);
        return;
      }
    }
    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      const itemMatch = order.items.find(item => item.product_id === inv.product_id);
      if (itemMatch) return { ...inv, available_qty: Math.max(0, inv.available_qty - itemMatch.quantity), reserved_qty: inv.reserved_qty + itemMatch.quantity };
      return inv;
    });
    const updatedOrders = data.orders.map(o => (o.id === orderId ? { ...o, status: 'Confirmed' as any } : o));
    let temp = { ...data, orders: updatedOrders, warehouse_inventory: updatedWarehouse };
    temp = logAudit(temp, 'ORDER_CONFIRM', 'Order', orderId, currentUser?.id || 'admin', `Confirmed Draft order ID ${orderId}. Moved items to reserved warehouse stock.`);
    setData(temp);
    addNotification('order_update', `Order ID ${orderId} has been CONFIRMED & stock reserved.`);
    setActiveForm('list');
  };

  const handleDeliverConfirmedOrder = (orderId: string) => {
    const order = data.orders.find(o => o.id === orderId);
    if (!order) return;
    const updatedWarehouse = data.warehouse_inventory.map(inv => {
      const itemMatch = order.items.find(item => item.product_id === inv.product_id);
      if (itemMatch) return { ...inv, reserved_qty: Math.max(0, inv.reserved_qty - itemMatch.quantity) };
      return inv;
    });
    const updatedOrders = data.orders.map(o => (o.id === orderId ? { ...o, status: 'Delivered' as any } : o));

    const existingInvoice = data.invoices.find(inv => inv.order_id === orderId);
    let updatedInvoices = data.invoices;
    let updatedStores = data.stores;
    if (!existingInvoice) {
      const total = order.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const tax = order.items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (item.tax_pct / 100)), 0);
      const grandTotal = parseFloat((total + tax).toFixed(2));
      const newInvoice: Invoice = {
        id: 'inv_' + Date.now(), order_id: orderId, invoice_number: 'INV-' + Math.floor(Math.random() * 90000 + 10000),
        total: parseFloat(total.toFixed(2)), tax: parseFloat(tax.toFixed(2)), grand_total: grandTotal,
        created_at: new Date().toISOString(), paid_amount: 0, payment_status: 'Unpaid'
      };
      updatedInvoices = [newInvoice, ...data.invoices];
      updatedStores = data.stores.map(s => (s.id === order.store_id ? { ...s, outstanding_balance: parseFloat((s.outstanding_balance + grandTotal).toFixed(2)) } : s));
    }

    let temp = { ...data, orders: updatedOrders, warehouse_inventory: updatedWarehouse, invoices: updatedInvoices, stores: updatedStores };
    temp = logAudit(temp, 'DELIVERY_CONFIRM', 'Order', orderId, currentUser?.id || 'admin', `Delivered confirmed order ID ${orderId}. Fulfilled reserved stock${!existingInvoice ? ' and billed the store for the invoice total' : ''}.`);
    setData(temp);
    addNotification('delivery', `Order ID ${orderId} marked as Delivered.`);
    setActiveForm('list');
  };

  const handleSavePayment = () => {
    const payAmount = Number(paymentForm.amount);
    if (payAmount <= 0) {
      showAlert('Please enter a valid payment amount.');
      return;
    }
    const store = data.stores.find(s => s.id === paymentForm.store_id);
    if (!store) return;
    const selectedInv = paymentForm.invoice_id && paymentForm.invoice_id !== 'general' ? data.invoices.find(inv => inv.id === paymentForm.invoice_id) : null;

    const amountOwed = selectedInv ? Math.max(0, selectedInv.grand_total - (selectedInv.paid_amount || 0)) : store.outstanding_balance;
    if (payAmount > amountOwed + 0.05) {
      showAlert(`Only Rs${amountOwed.toFixed(2)} is owed ${selectedInv ? 'on this invoice' : 'by this store'} — the collected amount has been capped to that.`);
    }
    const actualCollection = Math.min(payAmount, amountOwed);
    if (actualCollection <= 0) {
      showAlert('Nothing is currently owed, so no payment was recorded.');
      return;
    }

    const newPayment: Payment = {
      id: 'pay_' + Date.now(), store_id: paymentForm.store_id, order_id: selectedInv ? selectedInv.order_id : undefined,
      amount: actualCollection, method: paymentForm.method, date: new Date().toISOString(), collected_by: currentUser?.id || 'admin'
    };
    const updatedStores = data.stores.map(s => (s.id === paymentForm.store_id ? { ...s, outstanding_balance: parseFloat(Math.max(0, s.outstanding_balance - actualCollection).toFixed(2)) } : s));
    const updatedInvoices = data.invoices.map(inv => {
      if (paymentForm.invoice_id && paymentForm.invoice_id !== 'general' && inv.id === paymentForm.invoice_id) {
        const currentPaid = inv.paid_amount || 0;
        const totalPaid = Math.min(inv.grand_total, currentPaid + actualCollection);
        const finalStatus = totalPaid >= inv.grand_total - 0.05 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
        return { ...inv, paid_amount: parseFloat(totalPaid.toFixed(2)), payment_status: finalStatus as any, payment_method: paymentForm.method };
      }
      return inv;
    });
    let temp = { ...data, payments: [newPayment, ...data.payments], stores: updatedStores, invoices: updatedInvoices };
    temp = logAudit(temp, 'PAYMENT_RECEIVE', 'Store', paymentForm.store_id, currentUser?.id || 'admin', `Received payment of Rs${actualCollection.toFixed(2)} via ${paymentForm.method} from ${store.name}`);
    setData(temp);
    addNotification('payment_received', `Payment of Rs${actualCollection.toFixed(2)} received from ${store.name}.`);
    setActiveForm('list');
  };

  const downloadInvoicePDF = async (order: Order, invoice: Invoice, store: Store) => {
    const rows = order.items.map((item, idx) => {
      const p = data.products.find(prod => prod.id === item.product_id);
      const productName = p ? `${p.name} (${p.code})` : `Product ${item.product_id}`;
      return `<tr><td>${idx + 1}</td><td>${productName}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">Rs ${item.unit_price.toFixed(2)}</td><td style="text-align:right">${item.tax_pct}%</td><td style="text-align:right">Rs ${(item.quantity * item.unit_price).toFixed(2)}</td></tr>`;
    }).join('');

    const paidVal = invoice.paid_amount || 0;
    const balanceDue = Math.max(0, invoice.grand_total - paidVal);
    const statusLabel = invoice.payment_status === 'Paid' ? 'FULLY PAID' : invoice.payment_status === 'Partial' ? 'PARTIAL PAYMENT' : 'NOT PAID (CREDIT ACCT)';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:30px;color:#1e293b}
      .brand{color:#c2410c;font-weight:800;font-size:22px}
      .muted{color:#64748b;font-size:9px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}
      th{background:#f8fafc;text-align:left;padding:6px;border-bottom:2px solid #cbd5e1;font-size:9px;text-transform:uppercase;color:#475569}
      td{padding:6px;border-bottom:1px solid #e2e8f0}
      .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-top:10px}
    </style></head><body>
      <div class="brand">FROSTFLOW ICE CREAMS</div>
      <div class="muted">Premium Distribution & Logistics Network ERP</div>
      <div class="muted">GSTIN: 27AAAAA1111A1Z1 | Support: +91 98765 43210</div>
      <hr/>
      <table><tr>
        <td style="border:none;vertical-align:top;width:50%">
          <strong>BILL TO (PARTNER OUTLET)</strong><br/>
          Store: ${store.name}<br/>Owner: ${store.owner_name}<br/>
          Contact: ${store.phone} / ${store.alt_phone || 'N/A'}<br/>
          Address: ${store.address}, ${store.area}<br/>
          City: ${store.city}, ${store.state} - ${store.pincode}<br/>
          GSTIN: ${store.gst_number || 'Composition / Unregistered'}
        </td>
        <td style="border:none;vertical-align:top;width:50%">
          <strong>Invoice No:</strong> ${invoice.invoice_number}<br/>
          <strong>Date:</strong> ${new Date(invoice.created_at).toLocaleDateString()}<br/>
          <strong>Order ID:</strong> ${order.id.toUpperCase()}<br/>
          <strong>Fulfillment Vehicle:</strong> ${order.truck_id || 'Fleet Truck'}<br/>
          <strong>Sales Executive ID:</strong> ${order.salesperson_id || 'Self Admin'}
        </td>
      </tr></table>
      <table><thead><tr><th>#</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Tax</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="box" style="text-align:right">
        Taxable Subtotal: Rs ${invoice.total.toFixed(2)}<br/>
        GST Total: Rs ${invoice.tax.toFixed(2)}<br/>
        <strong>Grand Total: Rs ${invoice.grand_total.toFixed(2)}</strong><br/>
        Paid: Rs ${paidVal.toFixed(2)}<br/>
        <strong>Balance Due: Rs ${balanceDue.toFixed(2)}</strong>
      </div>
      <div class="box"><strong>PAYMENT STATUS: ${statusLabel}</strong><br/>Settled Via: ${invoice.payment_method || 'Credit (Pay Later)'}</div>
      <p class="muted" style="text-align:center;margin-top:30px">Thank you for your partner outlet association with FrostFlow Ice Creams ERP.<br/>This is a computer-generated tax invoice and requires no physical signature.</p>
    </body></html>`;

    await exportHtmlReport(html, `${invoice.invoice_number}_${store.name.replace(/\s+/g, '_')}.pdf`, showAlert);
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

  const getInactiveStores = (days: number) => {
    const limitDate = new Date('2026-06-27');
    limitDate.setDate(limitDate.getDate() - days);
    return data.stores.filter(s => {
      if (!s.last_purchase_date) return true;
      return new Date(s.last_purchase_date) < limitDate;
    });
  };

  const [qrSettings, setQrSettings] = useState(data.qrCodeSettings);
  const handleSimulateQRUpload = () => {
    showAlert('Simulated gallery upload: Custom QR Code receipt file uploaded!');
    const updatedSettings = { ...qrSettings, image_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop' };
    setQrSettings(updatedSettings);
    setData(prev => ({ ...prev, qrCodeSettings: updatedSettings }));
  };

  const handleToggleQR = () => {
    const updatedSettings = { ...qrSettings, is_enabled: !qrSettings.is_enabled };
    setQrSettings(updatedSettings);
    setData(prev => ({ ...prev, qrCodeSettings: updatedSettings }));
    showAlert(`UPI QR Code payments toggled: ${updatedSettings.is_enabled ? 'ENABLED' : 'DISABLED'}`);
  };

  const storeOptions = data.stores.map(s => ({ label: `${s.name} (${s.owner_name})`, value: s.id }));
  const areaOptions = ['Downtown', 'Westside', 'Sandy Bay', 'Suburbs', 'North Uptown'].map(a => ({ label: a, value: a }));
  const rankingOptions = [
    { label: 'Platinum (High)', value: 'Platinum' }, { label: 'Gold (Medium)', value: 'Gold' },
    { label: 'Silver (Regular)', value: 'Silver' }, { label: 'Bronze (Low)', value: 'Bronze' },
  ];
  const refillOptions = [
    { label: 'Weekly (7 Days)', value: 'Weekly' }, { label: 'Fortnightly (15 Days)', value: '15 Days' },
    { label: 'Monthly (30 Days)', value: 'Monthly' }, { label: 'Custom Days', value: 'Custom' },
  ];
  const paymentMethodOptions = ['Cash', 'UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer'].map(m => ({ label: m, value: m }));
  const preBookingMethodOptions = ['Cash', 'UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Bank Transfer', 'Credit'].map(m => ({ label: m === 'Credit' ? 'Pay on Credit (Outstanding)' : m, value: m }));

  return (
    <View className="gap-4">
      {activeForm === 'list' && (
        <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
          {(['stores', 'suppliers', 'orders', 'prebookings', 'payments', 'credit', 'refill', 'inactive'] as const).map(tab => (
            <Pressable key={tab} onPress={() => setSalesTab(tab)} className={`py-1 px-2.5 rounded-lg ${salesTab === tab ? 'bg-white' : ''}`}>
              <Text className={`text-[10px] font-extrabold capitalize ${salesTab === tab ? 'text-slate-800' : 'text-slate-500'}`}>
                {tab === 'inactive' ? 'Inactive Partners' : tab === 'stores' ? 'Partner Shops' : tab === 'suppliers' ? 'Supply Partners' : tab === 'prebookings' ? 'Pre-Bookings' : tab}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {activeForm === 'add_store' || activeForm === 'edit_store' ? (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">{activeForm === 'add_store' ? 'Register Client Partner Store' : 'Edit Store Details'}</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Store Outlet Name</Text><TextInput value={storeForm.name} onChangeText={v => setStoreForm({ ...storeForm, name: v })} placeholder="e.g. Candy Land Parlor" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Owner Name</Text><TextInput value={storeForm.owner_name} onChangeText={v => setStoreForm({ ...storeForm, owner_name: v })} placeholder="e.g. Melissa Smith" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Primary Phone</Text><TextInput value={storeForm.phone} onChangeText={v => setStoreForm({ ...storeForm, phone: v })} placeholder="+1 (555) 000-0000" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">GST/TAX Reg Number</Text><TextInput value={storeForm.gst_number} onChangeText={v => setStoreForm({ ...storeForm, gst_number: v })} placeholder="TAX-8821B-NY" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View>
            <Text className="font-bold text-slate-500 mb-1 text-xs">Address Location</Text>
            <TextInput value={storeForm.address} onChangeText={v => setStoreForm({ ...storeForm, address: v })} className={inputClass} />
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">District Area</Text><SelectField value={storeForm.area} onValueChange={v => setStoreForm({ ...storeForm, area: v })} options={areaOptions} title="Select Area" className={inputClass + ' flex-row items-center justify-between'} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Credit Limit (Rs)</Text><TextInput keyboardType="number-pad" value={String(storeForm.credit_limit)} onChangeText={v => setStoreForm({ ...storeForm, credit_limit: Number(v) || 0 })} className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Ranking</Text><SelectField value={storeForm.ranking} onValueChange={v => setStoreForm({ ...storeForm, ranking: v as any })} options={rankingOptions} title="Select Ranking" className={inputClass + ' flex-row items-center justify-between'} /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Refill Interval</Text><SelectField value={storeForm.refill_frequency} onValueChange={v => setStoreForm({ ...storeForm, refill_frequency: v as any })} options={refillOptions} title="Select Interval" className={inputClass + ' flex-row items-center justify-between'} /></View>
            {storeForm.refill_frequency === 'Custom' && (
              <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Interval Days</Text><TextInput keyboardType="number-pad" value={String(storeForm.custom_days)} onChangeText={v => setStoreForm({ ...storeForm, custom_days: Number(v) || 0 })} className={inputClass + ' text-center'} /></View>
            )}
          </View>
          <Pressable onPress={handleSaveStore} className="w-full py-2.5 bg-rose-500 rounded-xl items-center active:bg-rose-600">
            <Text className="text-white font-bold text-xs">Save Partner Store Specs</Text>
          </Pressable>
        </View>
      ) : activeForm === 'add_supplier' ? (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">{editingSupplierId ? 'Edit Supply Partner Details' : 'Register Cold-Chain Supply Partner'}</Text>
            <Pressable onPress={() => { setActiveForm('list'); setEditingSupplierId(null); }}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Supplier / Factory Name</Text><TextInput value={supplierForm.name} onChangeText={v => setSupplierForm({ ...supplierForm, name: v })} placeholder="e.g. Frosty Peak Dairy" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Contact Person</Text><TextInput value={supplierForm.contact_person} onChangeText={v => setSupplierForm({ ...supplierForm, contact_person: v })} placeholder="e.g. John Doe" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Phone Number</Text><TextInput value={supplierForm.phone} onChangeText={v => setSupplierForm({ ...supplierForm, phone: v })} placeholder="e.g. +91 98765 43210" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Email Address</Text><TextInput value={supplierForm.email} onChangeText={v => setSupplierForm({ ...supplierForm, email: v })} placeholder="e.g. contact@frostypeak.com" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View><Text className="font-bold text-slate-500 mb-1 text-xs">Address Location</Text><TextInput value={supplierForm.address} onChangeText={v => setSupplierForm({ ...supplierForm, address: v })} placeholder="e.g. Plot No. 24, Industrial Area Phase II" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          <Pressable onPress={handleSaveSupplier} className="w-full py-2.5 bg-rose-500 rounded-xl items-center active:bg-rose-600">
            <Text className="text-white font-bold text-xs">{editingSupplierId ? 'Save Supplier Details' : 'Confirm Supplier Registration'}</Text>
          </Pressable>
        </View>
      ) : activeForm === 'add_payment' ? (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Add Store Payment (Credit Recovery)</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View>
            <Text className="font-bold text-slate-500 mb-1 text-xs">Select Store</Text>
            <SelectField
              value={paymentForm.store_id}
              onValueChange={v => setPaymentForm({ ...paymentForm, store_id: v, invoice_id: 'general' })}
              options={data.stores.map(s => ({ label: `${s.name} (Outstanding: Rs${s.outstanding_balance})`, value: s.id }))}
              title="Select Store"
              className={inputClass + ' flex-row items-center justify-between'}
            />
          </View>
          {(() => {
            const storeInvoices = data.invoices.filter(i => {
              const order = data.orders.find(o => o.id === i.order_id);
              return order && order.store_id === paymentForm.store_id;
            });
            const unpaidInvoices = storeInvoices.filter(i => (i.grand_total - (i.paid_amount || 0)) > 0.01);
            if (unpaidInvoices.length === 0) return null;
            return (
              <View>
                <Text className="font-bold text-slate-500 mb-1 text-xs">Apply to Bill / Invoice (Optional)</Text>
                <SelectField
                  value={paymentForm.invoice_id}
                  onValueChange={invId => {
                    const selectedInv = unpaidInvoices.find(inv => inv.id === invId);
                    setPaymentForm({ ...paymentForm, invoice_id: invId, amount: selectedInv ? parseFloat((selectedInv.grand_total - (selectedInv.paid_amount || 0)).toFixed(2)) : 100 });
                  }}
                  options={[
                    { label: 'General Credit Recovery (No specific invoice)', value: 'general' },
                    ...unpaidInvoices.map(inv => ({ label: `${inv.invoice_number} (Due: Rs${(inv.grand_total - (inv.paid_amount || 0)).toFixed(2)} of Rs${inv.grand_total.toFixed(2)})`, value: inv.id })),
                  ]}
                  title="Select Invoice"
                  className={inputClass + ' flex-row items-center justify-between'}
                />
              </View>
            );
          })()}
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Collected Amount (Rs)</Text><TextInput keyboardType="decimal-pad" value={String(paymentForm.amount)} onChangeText={v => setPaymentForm({ ...paymentForm, amount: Number(v) || 0 })} className={inputClass + ' font-bold text-emerald-600'} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Settlement Method</Text><SelectField value={paymentForm.method} onValueChange={v => setPaymentForm({ ...paymentForm, method: v as any })} options={paymentMethodOptions} title="Select Method" className={inputClass + ' flex-row items-center justify-between'} /></View>
          </View>
          <Pressable onPress={handleSavePayment} className="w-full py-2.5 bg-emerald-500 rounded-xl items-center active:bg-emerald-600">
            <Text className="text-white font-bold text-xs">Confirm Collection Payment Receipt</Text>
          </Pressable>
        </View>
      ) : activeForm === 'add_prebooking' ? (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Create Pre-booking Order</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Select Partner Store</Text>
            <SelectField value={preBookingStoreId} onValueChange={setPreBookingStoreId} options={storeOptions} title="Select Store" className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Scheduled Delivery Date</Text>
            <TextInput value={preBookingDate} onChangeText={setPreBookingDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" className={inputClass + ' rounded-xl'} />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Notes (Optional)</Text>
            <TextInput value={preBookingNotes} onChangeText={setPreBookingNotes} multiline numberOfLines={2} placeholder="Enter special delivery instructions or notes..." placeholderTextColor="#94a3b8" className={inputClass + ' rounded-xl'} style={{ minHeight: 60, textAlignVertical: 'top' }} />
          </View>
          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
            <Text className="font-bold text-slate-500 text-[10px] uppercase">Select Products & Pre-book Quantities:</Text>
            {data.products.map(product => {
              const warehouseInv = data.warehouse_inventory.find(inv => inv.product_id === product.id);
              const available = warehouseInv?.available_qty || 0;
              const qty = preBookingItems[product.id] || 0;
              const warnStockLimit = (nextQty: number) => {
                if (nextQty <= available) return true;
                showAlert(available === 0
                  ? `${product.name} is out of stock in the warehouse. It cannot be added to this pre-booking.`
                  : `Limit exceeded! Only ${available} units of ${product.name} are available in warehouse stock.`);
                return false;
              };
              return (
                <View key={product.id} className="flex-row items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-2">
                  <View className="flex-1">
                    <Text className="font-bold text-slate-800 text-[11px]">{product.name}</Text>
                    <Text className="text-slate-400 text-[9px]">Rs{product.selling_price.toFixed(2)} - Stock: {available} units available</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Pressable onPress={() => setPreBookingItems(prev => ({ ...prev, [product.id]: Math.max(0, qty - 1) }))} className="w-7 h-7 bg-slate-100 rounded-lg items-center justify-center active:bg-slate-200">
                      <Text className="font-extrabold text-slate-800 text-xs">-</Text>
                    </Pressable>
                    <TextInput
                      keyboardType="number-pad"
                      value={qty ? String(qty) : ''}
                      onChangeText={v => {
                        const num = Math.max(0, parseInt(v) || 0);
                        warnStockLimit(num);
                        setPreBookingItems(prev => ({ ...prev, [product.id]: Math.min(available, num) }));
                      }}
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      className="w-10 text-center text-xs font-bold text-slate-800 border border-slate-200 rounded-lg p-1"
                    />
                    <Pressable
                      onPress={() => { if (warnStockLimit(qty + 1)) setPreBookingItems(prev => ({ ...prev, [product.id]: qty + 1 })); }}
                      className={`w-7 h-7 rounded-lg items-center justify-center ${qty >= available ? 'bg-slate-50' : 'bg-slate-100 active:bg-slate-200'}`}
                    >
                      <Text className={`font-extrabold text-xs ${qty >= available ? 'text-slate-300' : 'text-slate-800'}`}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
          <View className="bg-slate-100 p-2.5 rounded-xl flex-row justify-between items-center">
            <Text className="font-bold text-slate-500 text-xs">Estimated Total Value:</Text>
            <Text className="font-black text-slate-800 text-sm">
              Rs {Object.entries(preBookingItems).reduce((sum, [pId, qty]) => { const prod = data.products.find(p => p.id === pId); return sum + (Number(qty) * (prod?.selling_price || 0)); }, 0).toFixed(2)}
            </Text>
          </View>
          <Pressable onPress={handleSavePreBooking} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
            <Text className="text-white font-bold text-xs">Save Pre-booking & Reserve Stock</Text>
          </Pressable>
        </View>
      ) : activeForm === 'order_details' && selectedOrder ? (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Order Cargo Manifest Details</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
          </View>
          <View className="gap-1.5">
            <View className="flex-row justify-between"><Text className="text-slate-400 text-[10px]">Order ID:</Text><Text className="font-bold text-slate-700 uppercase font-mono text-[10px]">{selectedOrder.id}</Text></View>
            <View className="flex-row justify-between"><Text className="text-slate-400 text-[10px]">Partner Store:</Text><Text className="font-bold text-slate-800 text-[10px]">{data.stores.find(s => s.id === selectedOrder.store_id)?.name}</Text></View>
            <View className="flex-row justify-between"><Text className="text-slate-400 text-[10px]">Order Date:</Text><Text className="font-semibold text-slate-600 text-[10px]">{new Date(selectedOrder.created_at).toLocaleString()}</Text></View>
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-400 text-[10px]">Status Tracker:</Text>
              <Text className={`px-2 py-0.5 font-bold rounded text-[9px] uppercase ${selectedOrder.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : selectedOrder.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{selectedOrder.status}</Text>
            </View>
          </View>
          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
            <Text className="font-bold text-slate-500 text-[10px]">MANIFEST ITEMS CARGO:</Text>
            {selectedOrder.items.map((item, i) => {
              const p = data.products.find(prod => prod.id === item.product_id);
              return (
                <View key={i} className="flex-row justify-between items-center border-b border-slate-100 pb-1.5 last:border-0">
                  <View>
                    <Text className="font-bold text-slate-800 text-[11px]">{p?.name}</Text>
                    <Text className="text-slate-400 text-[9px]">{item.quantity} units x Rs{item.unit_price.toFixed(2)}</Text>
                  </View>
                  <Text className="font-bold text-slate-700 text-[11px]">Rs{(item.quantity * item.unit_price).toFixed(2)}</Text>
                </View>
              );
            })}
          </View>
          <View className="gap-2">
            <View className="flex-row gap-2">
              {selectedOrder.status === 'Draft' && (
                <Pressable onPress={() => handleConfirmDraftOrder(selectedOrder.id)} className="flex-1 py-2 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
                  <Text className="text-white font-bold text-xs">Confirm Order (Reserve Stock)</Text>
                </Pressable>
              )}
              {selectedOrder.status === 'Confirmed' && (
                <Pressable onPress={() => handleDeliverConfirmedOrder(selectedOrder.id)} className="flex-1 py-2 bg-emerald-600 rounded-xl items-center active:bg-emerald-700">
                  <Text className="text-white font-bold text-xs">Mark as Delivered</Text>
                </Pressable>
              )}
              {selectedOrder.status !== 'Delivered' && selectedOrder.status !== 'Cancelled' && (
                <Pressable onPress={() => handleCancelOrder(selectedOrder.id)} className="py-2 px-4 bg-red-100 rounded-xl border border-red-200 active:bg-red-200">
                  <Text className="text-red-600 font-bold text-xs">Cancel Order</Text>
                </Pressable>
              )}
            </View>

            {selectedOrder.status === 'Delivered' && (() => {
              const inv = data.invoices.find(i => i.order_id === selectedOrder.id);
              if (!inv) return null;
              const isPaid = inv.payment_status === 'Paid';
              const isPartial = inv.payment_status === 'Partial';
              const paidVal = inv.paid_amount || 0;
              const remainingVal = Math.max(0, inv.grand_total - paidVal);
              const paymentsForInvoice = data.payments.filter(p => p.order_id === selectedOrder.id);
              return (
                <View className="p-3 bg-slate-50 border border-slate-200 rounded-xl gap-2">
                  <View className="flex-row justify-between items-center border-b border-slate-200 pb-1.5">
                    <Text className="font-extrabold text-slate-700 text-xs">Bill Payment Tracking</Text>
                    <Text className={`px-2 py-0.5 font-bold rounded-full text-[8px] uppercase ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{inv.payment_status || 'Unpaid / Credit'}</Text>
                  </View>
                  <View className="flex-row justify-between pt-1">
                    <View><Text className="text-slate-400 font-bold text-[10px]">Bill Total</Text><Text className="font-black text-slate-800 text-sm">Rs{inv.grand_total.toFixed(2)}</Text></View>
                    <View><Text className="text-slate-400 font-bold text-[10px]">Payment Method</Text><Text className="font-black text-slate-800 text-sm uppercase">{inv.payment_method || 'Credit'}</Text></View>
                  </View>
                  <View className="flex-row justify-between pt-1 border-t border-slate-200 pb-2">
                    <View><Text className="text-slate-400 font-bold text-[10px]">Paid Amount</Text><Text className="font-black text-emerald-600">Rs{paidVal.toFixed(2)}</Text></View>
                    <View><Text className="text-slate-400 font-bold text-[10px]">Due Outstanding</Text><Text className={`font-black ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>Rs{remainingVal.toFixed(2)}</Text></View>
                  </View>
                  <View className="pt-2 border-t border-slate-200 gap-1.5">
                    <Text className="font-extrabold text-slate-700 text-[9px] uppercase">Partial Payments History</Text>
                    {paymentsForInvoice.length === 0 ? (
                      <Text className="text-[9px] text-slate-400 italic bg-white p-2 rounded-xl border border-slate-200 text-center">No payment transactions logged yet. Status: Credit</Text>
                    ) : (
                      paymentsForInvoice.map((pay, pIdx) => (
                        <View key={pay.id} className="flex-row justify-between items-center bg-white border border-slate-100 rounded-xl p-2">
                          <View>
                            <Text className="font-bold text-slate-800 text-[9px]">Transaction #{paymentsForInvoice.length - pIdx}</Text>
                            <Text className="text-[8px] text-slate-400">{new Date(pay.date).toLocaleDateString()} - {pay.method}</Text>
                          </View>
                          <View className="items-end">
                            <Text className="font-black text-emerald-600 text-[9px]">Rs{pay.amount.toFixed(2)}</Text>
                            <Text className="text-[8px] text-slate-400">By: {pay.collected_by}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              );
            })()}

            {selectedOrder.status === 'Delivered' && (
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    const inv = data.invoices.find(i => i.order_id === selectedOrder.id);
                    const store = data.stores.find(s => s.id === selectedOrder.store_id);
                    if (inv && store) downloadInvoicePDF(selectedOrder, inv, store);
                    else showAlert('Could not locate generated invoice details for this delivered order.');
                  }}
                  className="flex-1 py-2 bg-slate-100 rounded-xl flex-row items-center justify-center gap-1 border border-slate-200 active:bg-slate-200"
                >
                  <Download size={14} color="#475569" />
                  <Text className="text-slate-700 font-bold text-xs">Invoice PDF</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const inv = data.invoices.find(i => i.order_id === selectedOrder.id);
                    const store = data.stores.find(s => s.id === selectedOrder.store_id);
                    if (inv && store) handleWhatsAppShare(inv, store, selectedOrder);
                  }}
                  className="flex-1 py-2 bg-emerald-50 rounded-xl flex-row items-center justify-center gap-1 border border-emerald-200 active:bg-emerald-100"
                >
                  <MessageSquare size={14} color="#059669" />
                  <Text className="text-emerald-600 font-bold text-xs">Share WhatsApp</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View className="gap-4">
          {salesTab === 'suppliers' && (
            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <View className="flex-1 relative justify-center">
                  <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                  <TextInput value={supplierSearchQuery} onChangeText={setSupplierSearchQuery} placeholder="Search supplier name, contact, phone..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
                </View>
                <Pressable onPress={handleOpenAddSupplier} className="bg-rose-500 p-2.5 rounded-xl active:bg-rose-600"><Plus size={20} color="#fff" /></Pressable>
              </View>

              <View className="gap-2.5">
                {data.suppliers.length === 0 ? (
                  <View className="p-8 items-center bg-white border border-dashed border-slate-200 rounded-3xl gap-2">
                    <View className="w-12 h-12 bg-slate-50 rounded-full items-center justify-center border border-slate-100"><Truck size={20} color="#94a3b8" /></View>
                    <Text className="text-xs font-black text-slate-800">No suppliers registered yet</Text>
                    <Text className="text-[10px] text-slate-500 font-bold text-center">Register your first supplier to start receiving stock into the warehouse silos.</Text>
                    <Pressable onPress={handleOpenAddSupplier} className="py-1.5 px-3 bg-rose-500 rounded-lg active:bg-rose-600"><Text className="text-white text-[10px] font-bold">+ Register First Supplier</Text></Pressable>
                  </View>
                ) : (
                  data.suppliers
                    .filter(s => s.name.toLowerCase().includes(supplierSearchQuery.toLowerCase()) || s.contact_person.toLowerCase().includes(supplierSearchQuery.toLowerCase()) || s.phone.includes(supplierSearchQuery) || s.email.toLowerCase().includes(supplierSearchQuery.toLowerCase()))
                    .map(s => {
                      const supplierPurchases = data.purchases.filter(p => p.supplier_id === s.id);
                      const isExpanded = expandedSupplierId === s.id;
                      return (
                        <View key={s.id} className="bg-white rounded-2xl p-3 border border-slate-200 relative">
                          <Text className="absolute top-3 right-3 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Active</Text>
                          <View className="flex-row items-start gap-2 pr-16">
                            <View className="p-2 bg-emerald-50 rounded-xl mt-0.5"><Truck size={16} color="#10b981" /></View>
                            <View className="flex-1">
                              <Text className="font-bold text-slate-800 text-xs">{s.name}</Text>
                              <Text className="text-[10px] text-slate-400 mt-0.5">Contact: {s.contact_person || 'N/A'} - Phone: {s.phone}</Text>
                            </View>
                          </View>
                          <View className="flex-row justify-between mt-3 pt-2 border-t border-slate-50">
                            <View><Text className="text-slate-400 text-[9px]">Supplier Email</Text><Text className="font-semibold text-slate-700 text-[10px]">{s.email || 'N/A'}</Text></View>
                            <View className="items-end"><Text className="text-slate-400 text-[9px]">Receipts/Logs</Text><Text className="font-bold text-slate-700 text-[10px]">{supplierPurchases.length} Inwards</Text></View>
                          </View>
                          <View className="flex-row flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-50 justify-end">
                            <Pressable onPress={() => setViewingSupplier(s)} className="py-1 px-2.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100"><Text className="text-indigo-600 font-bold text-[9px]">View Info</Text></Pressable>
                            <Pressable onPress={() => handleOpenEditSupplier(s)} className="py-1 px-2.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"><Text className="text-slate-600 font-bold text-[9px]">Edit</Text></Pressable>
                            <Pressable onPress={() => setDeleteSupplierConfirmId(s.id)} className="py-1 px-2.5 bg-rose-50 rounded-lg border border-rose-100 active:bg-rose-100"><Text className="text-rose-600 font-bold text-[9px]">Delete</Text></Pressable>
                            <Pressable onPress={() => setExpandedSupplierId(isExpanded ? null : s.id)} className={`py-1 px-2.5 rounded-lg border ${isExpanded ? 'bg-rose-500 border-rose-600' : 'bg-white border-slate-200'}`}>
                              <Text className={`font-bold text-[9px] ${isExpanded ? 'text-white' : 'text-slate-600'}`}>{isExpanded ? 'Close' : 'View Receipts'}</Text>
                            </Pressable>
                          </View>
                          {isExpanded && (
                            <View className="mt-3 bg-slate-50 border-t border-slate-100 p-3 rounded-xl gap-2">
                              <Text className="font-extrabold text-slate-700 text-[10px]">Recent Cold-Chain Stock Inwards</Text>
                              {supplierPurchases.length === 0 ? (
                                <Text className="text-[10px] text-slate-400 font-semibold italic">No stock inward dispatches registered from this supplier yet.</Text>
                              ) : (
                                supplierPurchases.map(p => {
                                  const totalQty = p.items.reduce((sum, item) => sum + item.quantity, 0);
                                  const totalCost = p.items.reduce((sum, item) => sum + (item.quantity * item.purchase_price), 0);
                                  return (
                                    <View key={p.id} className="bg-white border border-slate-200 p-2.5 rounded-xl gap-1.5">
                                      <View className="flex-row justify-between border-b border-slate-100 pb-1"><Text className="text-slate-700 font-bold text-[10px]">Invoice: {p.invoice_number}</Text><Text className="text-slate-400 text-[10px]">{new Date(p.date).toLocaleDateString()}</Text></View>
                                      {p.items.map((item, idx) => {
                                        const prod = data.products.find(prod => prod.id === item.product_id);
                                        return (
                                          <View key={idx} className="bg-slate-50 p-1.5 rounded-lg">
                                            <View className="flex-row justify-between"><Text className="font-semibold text-slate-700 text-[10px]">{prod?.name || 'Unknown'}</Text><Text className="text-[10px] text-slate-600">{item.quantity} units (Rs{item.purchase_price}/u)</Text></View>
                                          </View>
                                        );
                                      })}
                                      <View className="flex-row justify-between pt-1 border-t border-slate-100"><Text className="text-[10px] font-bold text-slate-700">Total: {totalQty} units</Text><Text className="text-[10px] font-black text-emerald-600">Rs{totalCost.toFixed(2)}</Text></View>
                                    </View>
                                  );
                                })
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                )}
              </View>
            </View>
          )}

          {salesTab === 'stores' && (
            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <View className="flex-1 relative justify-center">
                  <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                  <TextInput value={storeSearch} onChangeText={setStoreSearch} placeholder="Search store name, owner, area..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
                </View>
                <Pressable onPress={handleOpenAddStore} className="bg-rose-500 p-2.5 rounded-xl active:bg-rose-600"><Plus size={20} color="#fff" /></Pressable>
              </View>

              <View className="gap-2.5">
                {data.stores.length === 0 ? (
                  <View className="p-8 items-center bg-white border border-dashed border-slate-200 rounded-3xl gap-2">
                    <View className="w-12 h-12 bg-slate-50 rounded-full items-center justify-center border border-slate-100"><MapPin size={20} color="#94a3b8" /></View>
                    <Text className="text-xs font-black text-slate-800">No shop partners registered yet</Text>
                    <Pressable onPress={handleOpenAddStore} className="py-1.5 px-3 bg-rose-500 rounded-lg active:bg-rose-600"><Text className="text-white text-[10px] font-bold">+ Register First Shop Partner</Text></Pressable>
                  </View>
                ) : filteredStores.length === 0 ? (
                  <Text className="py-6 text-center text-slate-400 italic bg-white rounded-2xl border border-slate-200 text-xs">No partner stores match your search query.</Text>
                ) : (
                  filteredStores.map(s => {
                    const isExpanded = expandedStoreId === s.id;
                    const storeOrders = data.orders.filter(o => o.store_id === s.id);
                    return (
                      <View key={s.id} className="bg-white rounded-2xl p-3 border border-slate-200 relative">
                        <Text className={`absolute top-3 right-3 text-[9px] font-black px-1.5 py-0.5 rounded-full ${s.ranking === 'Platinum' ? 'bg-indigo-50 text-indigo-600' : s.ranking === 'Gold' ? 'bg-amber-50 text-amber-600' : s.ranking === 'Silver' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-500'}`}>{s.ranking}</Text>
                        <View className="flex-row items-start gap-2 pr-16">
                          <View className="p-2 bg-rose-50 rounded-xl mt-0.5"><MapPin size={16} color="#f43f5e" /></View>
                          <View className="flex-1">
                            <Text className="font-bold text-slate-800 text-xs">{s.name}</Text>
                            <Text className="text-[10px] text-slate-400 mt-0.5">Owner: {s.owner_name} - Phone: {s.phone}</Text>
                          </View>
                        </View>
                        <View className="flex-row justify-between mt-3 pt-2 border-t border-slate-50">
                          <View><Text className="text-slate-400 text-[9px]">Outstanding Bal</Text><Text className={`font-bold text-[10px] ${s.outstanding_balance > s.credit_limit ? 'text-red-500' : 'text-slate-700'}`}>Rs{s.outstanding_balance} / Rs{s.credit_limit} Max</Text></View>
                          <View className="items-end"><Text className="text-slate-400 text-[9px]">Health Index</Text><Text className="font-extrabold text-indigo-500 text-[10px]">{calculateStoreHealthScore(s)}/100</Text></View>
                        </View>
                        <View className="flex-row flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-50 justify-end">
                          <Pressable onPress={() => setViewingStore(s)} className="py-1 px-2.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100"><Text className="text-indigo-600 font-bold text-[9px]">View Info</Text></Pressable>
                          <Pressable
                            onPress={() => {
                              setSelectedStore(s);
                              setStoreForm({ name: s.name, owner_name: s.owner_name, phone: s.phone, alt_phone: s.alt_phone, address: s.address, area: s.area, city: s.city, state: s.state, pincode: s.pincode, gst_number: s.gst_number, credit_limit: s.credit_limit, refill_frequency: s.refill_frequency, custom_days: s.custom_days || 7, ranking: s.ranking });
                              setActiveForm('edit_store');
                            }}
                            className="py-1 px-2.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"
                          ><Text className="text-slate-600 font-bold text-[9px]">Edit</Text></Pressable>
                          <Pressable onPress={() => setDeleteStoreConfirmId(s.id)} className="py-1 px-2.5 bg-rose-50 rounded-lg border border-rose-100 active:bg-rose-100"><Text className="text-rose-600 font-bold text-[9px]">Delete</Text></Pressable>
                          <Pressable onPress={() => setExpandedStoreId(isExpanded ? null : s.id)} className={`py-1 px-2.5 rounded-lg border ${isExpanded ? 'bg-rose-500 border-rose-600' : 'bg-white border-slate-200'}`}>
                            <Text className={`font-bold text-[9px] ${isExpanded ? 'text-white' : 'text-slate-600'}`}>{isExpanded ? 'Close' : 'View Details'}</Text>
                          </Pressable>
                        </View>
                        {isExpanded && (
                          <View className="mt-3 bg-slate-50 border-t border-slate-100 p-3 rounded-xl gap-2">
                            <View className="flex-row justify-between"><View><Text className="text-slate-400 text-[9px]">Alt Phone</Text><Text className="font-semibold text-slate-700 text-[10px]">{s.alt_phone || 'N/A'}</Text></View><View className="items-end"><Text className="text-slate-400 text-[9px]">GST Number</Text><Text className="font-semibold text-slate-700 text-[10px]">{s.gst_number || 'N/A'}</Text></View></View>
                            <View><Text className="text-slate-400 text-[9px]">Full Address</Text><Text className="font-semibold text-slate-700 text-[10px]">{s.address}, {s.area}, {s.city}, {s.state} - {s.pincode}</Text></View>
                            <Text className="font-bold text-slate-700 text-[9px]">Recent Orders ({storeOrders.length})</Text>
                            {storeOrders.length === 0 ? (
                              <Text className="text-[9px] text-slate-400 italic">No orders logged for this store yet.</Text>
                            ) : (
                              storeOrders.slice(0, 5).map(o => {
                                const totalQty = o.items.reduce((acc, item) => acc + item.quantity, 0);
                                const orderVal = o.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
                                return (
                                  <View key={o.id} className="bg-white border border-slate-100 p-2 rounded-lg flex-row justify-between items-center">
                                    <View><Text className="font-bold text-indigo-600 text-[9px]">#{o.id}</Text><Text className="text-slate-400 text-[9px]">{new Date(o.created_at).toLocaleDateString()} - {totalQty} units</Text></View>
                                    <View className="items-end"><Text className={`px-1.5 py-0.5 rounded-md font-bold text-[8px] uppercase ${o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : o.status === 'Confirmed' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>{o.status}</Text><Text className="font-bold text-slate-700 text-[9px]">Rs{orderVal}</Text></View>
                                  </View>
                                );
                              })
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {salesTab === 'orders' && (
            <View className="gap-3">
              <View className="flex-row justify-between items-center">
                <Text className="font-bold text-slate-600 text-xs">Ice Cream Order Fleet Dispatch</Text>
                <Text className="text-[10px] text-slate-400">Total: {data.orders.length}</Text>
              </View>
              <View className="relative justify-center">
                <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                <TextInput value={orderSearch} onChangeText={setOrderSearch} placeholder="Search by Outlet name, Owner, or Order ID..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
              </View>
              <View className="gap-1">
                <Text className="text-[9px] font-bold text-slate-400 uppercase">Fulfillment Status</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {(['All', 'Confirmed', 'Delivered', 'Cancelled'] as const).map(status => (
                    <Pressable key={status} onPress={() => setOrderStatusFilter(status)} className={`px-2.5 py-1 rounded-lg border ${orderStatusFilter === status ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold ${orderStatusFilter === status ? 'text-white' : 'text-slate-600'}`}>{status}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View className="gap-1">
                <Text className="text-[9px] font-bold text-slate-400 uppercase">Settlement Status</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {(['All', 'Paid', 'Partial', 'Unpaid'] as const).map(payStat => (
                    <Pressable key={payStat} onPress={() => setOrderPaymentFilter(payStat)} className={`px-2.5 py-1 rounded-lg border ${orderPaymentFilter === payStat ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold ${orderPaymentFilter === payStat ? 'text-white' : 'text-slate-600'}`}>{payStat === 'Paid' ? 'Fully Paid' : payStat === 'Partial' ? 'Partial Paid' : payStat === 'Unpaid' ? 'Not Paid' : 'All'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="gap-2.5">
                {(() => {
                  const filteredOrders = data.orders.filter(o => {
                    const store = data.stores.find(s => s.id === o.store_id);
                    const inv = data.invoices.find(i => i.order_id === o.id);
                    const searchMatch = !orderSearch || o.id.toLowerCase().includes(orderSearch.toLowerCase()) || (store && (store.name.toLowerCase().includes(orderSearch.toLowerCase()) || store.owner_name.toLowerCase().includes(orderSearch.toLowerCase())));
                    if (!searchMatch) return false;
                    if (orderStatusFilter !== 'All' && o.status !== orderStatusFilter) return false;
                    if (orderPaymentFilter !== 'All') {
                      if (o.status !== 'Delivered') return false;
                      if (!inv) return orderPaymentFilter === 'Unpaid';
                      const isPaid = inv.payment_status === 'Paid';
                      const isPartial = inv.payment_status === 'Partial';
                      const isUnpaid = inv.payment_status === 'Credit' || !inv.payment_status;
                      if (orderPaymentFilter === 'Paid' && !isPaid) return false;
                      if (orderPaymentFilter === 'Partial' && !isPartial) return false;
                      if (orderPaymentFilter === 'Unpaid' && !isUnpaid) return false;
                    }
                    return true;
                  });
                  if (filteredOrders.length === 0) {
                    return <Text className="text-center text-slate-400 italic py-8 bg-white border border-slate-200 rounded-2xl text-xs">No orders match the current filters.</Text>;
                  }
                  return filteredOrders.map(o => {
                    const store = data.stores.find(s => s.id === o.store_id);
                    const itemsCount = o.items.reduce((s, i) => s + i.quantity, 0);
                    const orderVal = o.items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
                    const inv = data.invoices.find(i => i.order_id === o.id);
                    return (
                      <View key={o.id} className="bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                        <View className="flex-1 pr-2">
                          <View className="flex-row items-center gap-2 flex-wrap">
                            <Text className="font-extrabold text-slate-800 text-xs">{store?.name}</Text>
                            <Text className="text-[8px] bg-slate-100 text-slate-400 font-bold uppercase px-1 rounded">{o.id}</Text>
                          </View>
                          <Text className="text-slate-400 text-[10px] mt-0.5">{itemsCount} units - Rs {orderVal.toFixed(2)}</Text>
                          <Text className="text-[9px] text-slate-400">{new Date(o.created_at).toLocaleDateString()}</Text>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <View className="items-end gap-1">
                            <Text className={`px-2 py-0.5 font-bold rounded text-[8px] uppercase ${o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : o.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{o.status}</Text>
                            {o.status === 'Delivered' && inv && (() => {
                              const isPaid = inv.payment_status === 'Paid';
                              const isPartial = inv.payment_status === 'Partial';
                              return <Text className={`px-2 py-0.5 font-black rounded text-[7px] uppercase ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{isPaid ? 'Fully Paid' : isPartial ? 'Partial Paid' : 'Not Paid'}</Text>;
                            })()}
                          </View>
                          {o.status === 'Delivered' && inv && store && (
                            <>
                              <Pressable onPress={() => downloadInvoicePDF(o, inv, store)} className="p-1.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"><Download size={14} color="#475569" /></Pressable>
                              <Pressable onPress={() => handleWhatsAppShare(inv, store, o)} className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-200 active:bg-emerald-100"><MessageSquare size={14} color="#059669" /></Pressable>
                            </>
                          )}
                          <Pressable onPress={() => { setSelectedOrder(o); setActiveForm('order_details'); }} className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 active:bg-slate-100"><Eye size={14} color="#64748b" /></Pressable>
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          )}

          {salesTab === 'payments' && (
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-bold text-slate-700 text-xs">UPI & Cash Payments Collection</Text>
                <Pressable onPress={() => setActiveForm('add_payment')} className="py-1 px-2.5 bg-emerald-50 border border-emerald-100 rounded-lg active:bg-emerald-100"><Text className="text-emerald-600 font-extrabold text-[9px]">+ Add Payment Collection</Text></Pressable>
              </View>
              <View className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <View className="flex-row items-center justify-between">
                  <View><Text className="font-extrabold text-slate-700 text-xs">UPI QR Payments Integration</Text><Text className="text-[9px] text-slate-400">Scan-and-pay receiver setting</Text></View>
                  <Pressable onPress={handleToggleQR} className={`py-1 px-2 rounded-lg ${qrSettings.is_enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <Text className={`text-[9px] font-black ${qrSettings.is_enabled ? 'text-white' : 'text-slate-500'}`}>{qrSettings.is_enabled ? 'ENABLED' : 'DISABLED'}</Text>
                  </Pressable>
                </View>
                {qrSettings.is_enabled && (
                  <View className="mt-3 flex-row items-center gap-3">
                    <Image source={{ uri: qrSettings.image_url }} className="w-12 h-12 rounded border border-slate-200" />
                    <View>
                      <Pressable onPress={handleSimulateQRUpload} className="py-1 px-2.5 bg-white border border-slate-200 rounded active:bg-slate-50"><Text className="text-[9px] font-bold text-slate-700">Upload QR Code Image</Text></Pressable>
                    </View>
                  </View>
                )}
              </View>
              <View className="gap-2.5">
                {data.payments.map(p => {
                  const store = data.stores.find(s => s.id === p.store_id);
                  return (
                    <View key={p.id} className="bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                      <View>
                        <Text className="font-bold text-slate-800 text-xs">{store?.name}</Text>
                        <Text className="text-slate-400 text-[9px] mt-0.5">Method: {p.method} - Officer: {p.collected_by}</Text>
                        <Text className="text-[9px] text-slate-400">{new Date(p.date).toLocaleString()}</Text>
                      </View>
                      <Text className="text-emerald-600 font-black bg-emerald-50 px-2 py-1 rounded-xl text-xs">+Rs{p.amount.toFixed(2)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {salesTab === 'credit' && (
            <View className="gap-3">
              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 gap-3">
                <View>
                  <Text className="font-extrabold text-slate-800 text-xs uppercase">Outstanding Credit Limits Monitoring</Text>
                  <Text className="text-[10px] text-slate-400 font-medium">Filter, search, and sort partner outlet credit utilization</Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1 relative justify-center">
                    <View className="absolute left-2.5 z-10"><Search size={14} color="#94a3b8" /></View>
                    <TextInput value={creditSearch} onChangeText={setCreditSearch} placeholder="Search partner..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-[11px] font-bold text-slate-700" />
                  </View>
                  <SelectField
                    value={creditSort}
                    onValueChange={v => setCreditSort(v as any)}
                    options={[
                      { label: 'Balance: High to Low', value: 'balance_desc' }, { label: 'Balance: Low to High', value: 'balance_asc' },
                      { label: 'Credit Limit: High to Low', value: 'limit_desc' }, { label: 'Credit Limit: Low to High', value: 'limit_asc' },
                    ]}
                    title="Sort By"
                    className="bg-white border border-slate-200 rounded-xl py-2 px-2.5 flex-row items-center"
                    textClassName="text-[11px] font-black text-slate-600"
                  />
                </View>
              </View>

              <View className="gap-2.5">
                {data.stores
                  .filter(s => s.name.toLowerCase().includes(creditSearch.toLowerCase()) || s.owner_name.toLowerCase().includes(creditSearch.toLowerCase()))
                  .sort((a, b) => creditSort === 'balance_desc' ? b.outstanding_balance - a.outstanding_balance : creditSort === 'balance_asc' ? a.outstanding_balance - b.outstanding_balance : creditSort === 'limit_desc' ? b.credit_limit - a.credit_limit : a.credit_limit - b.credit_limit)
                  .map(s => {
                    const limitRatio = s.outstanding_balance / (s.credit_limit || 1);
                    const isOverdue = limitRatio > 0.8;
                    const percentUsed = Math.min(100, Math.round(limitRatio * 100));
                    return (
                      <View key={s.id} className="bg-white rounded-2xl p-4 border border-slate-200 gap-3">
                        <View className="flex-row items-center justify-between gap-2">
                          <View className="flex-1"><Text className="font-extrabold text-slate-800 text-xs">{s.name}</Text><Text className="text-[9px] text-slate-400 font-bold mt-0.5">Owner: {s.owner_name} - Phone: {s.phone}</Text></View>
                          {isOverdue ? (
                            <Text className="bg-rose-500 text-white font-black text-[9px] px-2 py-0.5 rounded">CRITICAL ({percentUsed}%)</Text>
                          ) : (
                            <Text className="bg-emerald-50 text-emerald-600 border border-emerald-100 font-extrabold text-[9px] px-2 py-0.5 rounded">{percentUsed}%</Text>
                          )}
                        </View>
                        <View className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <View className={`h-full rounded-full ${isOverdue ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${percentUsed}%` }} />
                        </View>
                        <View className="flex-row justify-between pt-1 border-t border-slate-100">
                          <View><Text className="text-slate-400 font-semibold text-[11px]">Credit Limit:</Text><Text className="font-bold text-slate-700 text-[11px]">Rs{s.credit_limit.toLocaleString('en-IN')}</Text></View>
                          <View className="items-end"><Text className="text-slate-400 font-semibold text-[11px]">Outstanding:</Text><Text className={`font-extrabold text-[11px] ${isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>Rs{s.outstanding_balance.toLocaleString('en-IN')}</Text></View>
                        </View>
                        <View className="flex-row justify-between items-center pt-2.5 border-t border-slate-100">
                          <Text className="text-[10px] text-slate-400 font-medium">{s.outstanding_balance > 0 ? 'Has unpaid dues' : 'Credit balance clear'}</Text>
                          <Pressable
                            onPress={() => { setPaymentForm({ store_id: s.id, invoice_id: 'general', amount: s.outstanding_balance > 0 ? s.outstanding_balance : 0, method: 'UPI' }); setActiveForm('add_payment'); }}
                            className="py-1 px-2.5 bg-emerald-600 rounded-lg flex-row items-center gap-1 active:bg-emerald-700"
                          >
                            <DollarSign size={12} color="#fff" />
                            <Text className="text-white text-[10px] font-black">Record Payment</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
              </View>
            </View>
          )}

          {salesTab === 'refill' && (
            <View className="gap-2.5">
              <Text className="font-bold text-slate-600 text-xs">Smart Refill Cycles Reminders</Text>
              {data.stores.map(s => {
                const todayDate = new Date('2026-06-27');
                const nextRefill = new Date(s.next_refill_date);
                const daysDiff = Math.ceil((nextRefill.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
                let badgeClass = 'bg-slate-100'; let textClass = 'text-slate-600'; let text = `In ${daysDiff} Days`;
                if (daysDiff < 0) { badgeClass = 'bg-red-500'; textClass = 'text-white'; text = `OVERDUE BY ${Math.abs(daysDiff)} DAYS`; }
                else if (daysDiff === 0) { badgeClass = 'bg-red-500'; textClass = 'text-white'; text = 'DUE TODAY'; }
                else if (daysDiff === 1) { badgeClass = 'bg-amber-500'; textClass = 'text-white'; text = 'DUE TOMORROW'; }
                else if (daysDiff === 2) { badgeClass = 'bg-amber-100'; textClass = 'text-amber-700'; text = 'DUE IN 2 DAYS'; }
                return (
                  <View key={s.id} className="bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                    <View><Text className="font-bold text-slate-800 text-xs">{s.name}</Text><Text className="text-slate-400 text-[9px] mt-0.5">Cycle: {s.refill_frequency} - Last: {s.last_purchase_date || 'N/A'}</Text></View>
                    <Text className={`px-2.5 py-1 text-[9px] font-black rounded-lg ${badgeClass} ${textClass}`}>{text}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {salesTab === 'inactive' && (
            <View className="gap-3">
              <View className="flex-row bg-slate-50 p-1 rounded-xl border border-slate-200">
                {([30, 60, 90] as const).map(days => (
                  <Pressable key={days} onPress={() => setInactiveDaysTab(days)} className={`flex-1 py-1 rounded-lg items-center ${inactiveDaysTab === days ? 'bg-white' : ''}`}>
                    <Text className={`text-[10px] font-extrabold ${inactiveDaysTab === days ? 'text-slate-800' : 'text-slate-400'}`}>No order in {days} Days</Text>
                  </Pressable>
                ))}
              </View>
              <View className="gap-2.5">
                {getInactiveStores(inactiveDaysTab).map(s => (
                  <View key={s.id} className="bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                    <View><Text className="font-bold text-slate-800 text-xs">{s.name}</Text><Text className="text-slate-400 text-[10px] mt-0.5">Area: {s.area} - Last: {s.last_purchase_date || 'NEVER'}</Text></View>
                    <Text className="bg-red-50 text-red-600 font-extrabold text-[9px] px-2 py-0.5 rounded-full border border-red-100">WARNING</Text>
                  </View>
                ))}
                {getInactiveStores(inactiveDaysTab).length === 0 && (
                  <Text className="py-6 text-center text-slate-400 italic bg-white rounded-2xl border border-slate-200 text-xs">No partner stores found in this inactivity range.</Text>
                )}
              </View>
            </View>
          )}

          {salesTab === 'prebookings' && (
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-bold text-slate-600 text-xs">Pre-Booking Orders List</Text>
                <Pressable
                  onPress={() => { setPreBookingStoreId(data.stores[0]?.id || ''); setPreBookingItems({}); setPreBookingNotes(''); setPreBookingDate(new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]); setActiveForm('add_prebooking'); }}
                  className="px-3 py-1.5 bg-blue-600 rounded-lg flex-row items-center gap-1 active:bg-blue-700"
                >
                  <Plus size={12} color="#fff" />
                  <Text className="text-white font-bold text-[10px]">New Pre-Booking</Text>
                </Pressable>
              </View>
              <View className="relative justify-center">
                <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                <TextInput value={preBookingSearch} onChangeText={setPreBookingSearch} placeholder="Search by Outlet name or Pre-Booking ID..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
              </View>
              <View className="gap-1">
                <Text className="text-[9px] font-bold text-slate-400 uppercase">Fulfillment Status</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {(['All', 'Booked', 'Delivered', 'Cancelled'] as const).map(status => (
                    <Pressable key={status} onPress={() => setPreBookingStatusFilter(status)} className={`px-2.5 py-1 rounded-lg border ${preBookingStatusFilter === status ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}>
                      <Text className={`text-[10px] font-bold ${preBookingStatusFilter === status ? 'text-white' : 'text-slate-600'}`}>{status === 'Booked' ? 'Active / Booked' : status}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View className="gap-2.5">
                {(() => {
                  const preBookingsList = data.preBookingOrders || [];
                  const filteredPreBookings = preBookingsList.filter(pb => {
                    const store = data.stores.find(s => s.id === pb.store_id);
                    const searchMatch = !preBookingSearch || pb.id.toLowerCase().includes(preBookingSearch.toLowerCase()) || (store && store.name.toLowerCase().includes(preBookingSearch.toLowerCase()));
                    if (!searchMatch) return false;
                    if (preBookingStatusFilter !== 'All' && pb.status !== preBookingStatusFilter) return false;
                    return true;
                  });
                  if (filteredPreBookings.length === 0) {
                    return <Text className="text-center text-slate-400 italic py-8 bg-white border border-slate-200 rounded-2xl text-xs">No pre-booking orders match the current filters.</Text>;
                  }
                  return filteredPreBookings.map(pb => {
                    const store = data.stores.find(s => s.id === pb.store_id);
                    const itemsCount = pb.items.reduce((s, i) => s + i.quantity, 0);
                    const orderVal = pb.items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
                    return (
                      <View key={pb.id} className="bg-white rounded-2xl p-3 border border-slate-200 gap-2">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 pr-2">
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <Text className="font-extrabold text-slate-800 text-xs">{store?.name}</Text>
                              <Text className="text-[8px] bg-slate-100 text-slate-400 font-bold uppercase px-1 rounded">{pb.id}</Text>
                            </View>
                            <Text className="text-slate-400 text-[10px] mt-0.5">{itemsCount} units - Rs {orderVal.toFixed(2)}</Text>
                            <Text className="text-[9px] text-slate-400 mt-0.5">Booked: {new Date(pb.created_at).toLocaleDateString()} - Scheduled: {new Date(pb.scheduled_delivery_date).toLocaleDateString()}</Text>
                            {pb.notes && <Text className="text-slate-500 italic text-[9px] bg-slate-50 p-1.5 rounded-lg border border-slate-100 mt-1">Note: {pb.notes}</Text>}
                          </View>
                          <Text className={`px-2 py-0.5 font-bold rounded text-[8px] uppercase ${pb.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : pb.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{pb.status}</Text>
                        </View>
                        <View className="border-t border-slate-100 pt-2 gap-1">
                          <Text className="text-[9px] font-bold text-slate-400 uppercase">Pre-booked Cargo:</Text>
                          {pb.items.map((item, idx) => {
                            const p = data.products.find(prod => prod.id === item.product_id);
                            return (
                              <View key={idx} className="flex-row justify-between bg-slate-50 p-1 rounded">
                                <Text className="text-[9px] text-slate-600">{p?.name || item.product_id}</Text>
                                <Text className="font-extrabold text-slate-800 text-[9px]">{item.quantity} units</Text>
                              </View>
                            );
                          })}
                        </View>
                        {pb.status === 'Booked' && (
                          <View className="flex-row gap-2 justify-end pt-2 border-t border-slate-100">
                            <Pressable onPress={() => { const grandTotal = pb.items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (1 + item.tax_pct / 100)), 0); setPreBookingSettleAmount(parseFloat(grandTotal.toFixed(2))); setPreBookingSettleMethod('UPI'); setPreBookingConfirmAction({ bookingId: pb.id, action: 'deliver' }); }} className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[9px]">Confirm Delivery</Text></Pressable>
                            <Pressable onPress={() => setPreBookingConfirmAction({ bookingId: pb.id, action: 'cancel' })} className="px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg active:bg-red-100"><Text className="text-red-600 font-bold text-[9px]">Cancel</Text></Pressable>
                          </View>
                        )}
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          )}
        </View>
      )}

      <ConfirmModal
        visible={!!deleteSupplierConfirmId}
        onClose={() => setDeleteSupplierConfirmId(null)}
        icon={AlertTriangle}
        title="Confirm Supplier Deletion"
        message={`Are you sure you want to delete this supplier? This won't delete historical purchase logs but will prevent new purchase logs from selecting this supplier.`}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        onConfirm={() => {
          const supplierToDelete = data.suppliers.find(s => s.id === deleteSupplierConfirmId);
          if (!supplierToDelete) return;
          const filtered = data.suppliers.filter(sup => sup.id !== supplierToDelete.id);
          const tempState = logAudit({ ...data, suppliers: filtered }, 'SUPPLIER_DELETE', 'Supplier', supplierToDelete.id, currentUser?.id || 'admin', `Deleted supplier ${supplierToDelete.name}`);
          setData(tempState);
          addNotification('partner_update', `Supplier "${supplierToDelete.name}" has been deleted.`);
          setDeleteSupplierConfirmId(null);
        }}
      />

      <ConfirmModal
        visible={!!deleteStoreConfirmId}
        onClose={() => setDeleteStoreConfirmId(null)}
        icon={AlertTriangle}
        title="Confirm Shop Partner Deletion"
        message="Are you sure you want to delete this partner store? Historical orders and dispatch schedules remain preserved."
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        onConfirm={() => {
          const storeToDelete = data.stores.find(s => s.id === deleteStoreConfirmId);
          if (!storeToDelete) return;
          if (storeToDelete.outstanding_balance > 0) {
            setDeleteStoreConfirmId(null);
            showAlert(`Cannot delete ${storeToDelete.name}: it still has Rs${storeToDelete.outstanding_balance.toFixed(2)} outstanding balance owed. Collect or write off the balance first so it isn't lost from your credit reports.`);
            return;
          }
          const filtered = data.stores.filter(store => store.id !== storeToDelete.id);
          const tempState = logAudit({ ...data, stores: filtered }, 'STORE_DELETE', 'Store', storeToDelete.id, currentUser?.id || 'admin', `Deleted partner store ${storeToDelete.name}`);
          setData(tempState);
          addNotification('partner_update', `Partner store "${storeToDelete.name}" has been deleted.`);
          setDeleteStoreConfirmId(null);
        }}
      />

      <ConfirmModal
        visible={!!cancelOrderConfirmId}
        onClose={() => setCancelOrderConfirmId(null)}
        icon={AlertTriangle}
        title="Cancel This Order?"
        message="Are you sure? This action is irreversible. Any reserved warehouse stock will be released back to available inventory."
        confirmLabel="Yes, Cancel Order"
        cancelLabel="No, Keep Order"
        onConfirm={() => { if (cancelOrderConfirmId) { executeCancelOrder(cancelOrderConfirmId); setCancelOrderConfirmId(null); } }}
      />

      {preBookingConfirmAction && preBookingConfirmAction.action === 'cancel' && (() => {
        const booking = (data.preBookingOrders || []).find(o => o.id === preBookingConfirmAction.bookingId);
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
            onConfirm={() => { handleCancelPreBooking(booking.id); setPreBookingConfirmAction(null); }}
          />
        );
      })()}

      {preBookingConfirmAction && preBookingConfirmAction.action === 'deliver' && (() => {
        const booking = (data.preBookingOrders || []).find(o => o.id === preBookingConfirmAction.bookingId);
        if (!booking) return null;
        const grandTotal = booking.items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (1 + item.tax_pct / 100)), 0);
        const isUnpaid = preBookingSettleMethod === 'Credit' || preBookingSettleAmount <= 0;
        const isPartial = !isUnpaid && preBookingSettleAmount < grandTotal - 0.05;
        const settlementLabel = isUnpaid ? 'Not Paid' : isPartial ? 'Partial' : 'Fully Paid';

        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPreBookingConfirmAction(null)}>
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white w-full max-w-sm rounded-3xl p-5 gap-3">
                <Text className="text-base font-black text-slate-800 text-center">Confirm Delivery & Payment</Text>
                <Text className="text-xs text-slate-500 font-semibold text-center leading-relaxed">
                  Mark pre-booking {booking.id.toUpperCase()} as delivered and record how much was collected from the store.
                </Text>

                <View className="bg-slate-50 rounded-xl p-3 flex-row justify-between items-center">
                  <Text className="text-slate-400 font-bold text-[10px] uppercase">Bill Total</Text>
                  <Text className="font-black text-indigo-600 text-sm">Rs {grandTotal.toFixed(2)}</Text>
                </View>

                <View>
                  <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">Payment Method</Text>
                  <SelectField
                    value={preBookingSettleMethod}
                    onValueChange={v => {
                      const prevMethod = preBookingSettleMethod;
                      setPreBookingSettleMethod(v as any);
                      if (v === 'Credit') setPreBookingSettleAmount(0);
                      else if (prevMethod === 'Credit' || preBookingSettleAmount === 0) setPreBookingSettleAmount(parseFloat(grandTotal.toFixed(2)));
                    }}
                    options={preBookingMethodOptions}
                    title="Select Method"
                    className={inputClass + ' rounded flex-row items-center justify-between'}
                  />
                </View>

                <View>
                  <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1">Amount Collected</Text>
                  <TextInput
                    editable={preBookingSettleMethod !== 'Credit'}
                    keyboardType="numeric"
                    value={String(preBookingSettleAmount)}
                    onChangeText={v => setPreBookingSettleAmount(Math.max(0, Math.min(grandTotal, parseFloat(v) || 0)))}
                    className={`w-full border border-indigo-200 font-black text-indigo-900 rounded-xl p-2.5 ${preBookingSettleMethod === 'Credit' ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                  />
                </View>

                {isPartial && (
                  <View className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                    <Text className="text-[10px] text-amber-800 font-bold">Partial payment: Rs {(grandTotal - preBookingSettleAmount).toFixed(2)} will be added to store outstanding credit.</Text>
                  </View>
                )}
                {isUnpaid && (
                  <View className="bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                    <Text className="text-[10px] text-rose-700 font-bold">Full amount Rs {grandTotal.toFixed(2)} will be added to store outstanding credit.</Text>
                  </View>
                )}

                <View className="gap-2 mt-1">
                  <Pressable onPress={() => { handleDeliverPreBooking(booking.id); setPreBookingConfirmAction(null); }} className="w-full py-2.5 bg-emerald-600 rounded-xl items-center active:bg-emerald-700">
                    <Text className="text-white font-black text-xs">Confirm Delivery ({settlementLabel})</Text>
                  </Pressable>
                  <Pressable onPress={() => setPreBookingConfirmAction(null)} className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                    <Text className="text-slate-700 font-extrabold text-xs">Cancel</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      <Modal visible={!!viewingSupplier} transparent animationType="fade" onRequestClose={() => setViewingSupplier(null)}>
        {viewingSupplier && (() => {
          const supplierPurchases = data.purchases.filter(p => p.supplier_id === viewingSupplier.id);
          const totalUnitsSupplied = supplierPurchases.reduce((acc, p) => acc + p.items.reduce((sum, item) => sum + item.quantity, 0), 0);
          const totalSpend = supplierPurchases.reduce((acc, p) => acc + p.items.reduce((sum, item) => sum + (item.quantity * item.purchase_price), 0), 0);
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-lg w-full max-h-[85%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <Text className="font-extrabold text-slate-800 text-sm">Supply Partner Portfolio</Text>
                  <Pressable onPress={() => setViewingSupplier(null)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>
                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Receipts</Text><Text className="text-xs font-black text-slate-800">{supplierPurchases.length}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Units</Text><Text className="text-xs font-black text-slate-800">{totalUnitsSupplied}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Volume</Text><Text className="text-xs font-black text-emerald-600">Rs{totalSpend.toFixed(0)}</Text></View>
                </View>
                <View className="gap-1 bg-slate-50 p-3 rounded-2xl mb-3">
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Contact:</Text> {viewingSupplier.contact_person || 'N/A'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Phone:</Text> {viewingSupplier.phone}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Email:</Text> {viewingSupplier.email || 'N/A'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Address:</Text> {viewingSupplier.address || 'N/A'}</Text>
                </View>
                <Pressable onPress={() => setViewingSupplier(null)} className="w-full py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close Portfolio</Text></Pressable>
              </View>
            </View>
          );
        })()}
      </Modal>

      <Modal visible={!!viewingStore} transparent animationType="fade" onRequestClose={() => setViewingStore(null)}>
        {viewingStore && (() => {
          const storeOrders = data.orders.filter(o => o.store_id === viewingStore.id);
          const totalUnitsPurchased = storeOrders.reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + item.quantity, 0), 0);
          const totalLtv = storeOrders.reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0), 0);
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-lg w-full max-h-[85%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <Text className="font-extrabold text-slate-800 text-sm">Partner Shop Portfolio</Text>
                  <Pressable onPress={() => setViewingStore(null)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>
                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Orders</Text><Text className="text-xs font-black text-slate-800">{storeOrders.length}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Volume</Text><Text className="text-xs font-black text-slate-800">{totalUnitsPurchased}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">LTV</Text><Text className="text-xs font-black text-indigo-600">Rs{totalLtv.toFixed(0)}</Text></View>
                </View>
                <View className="gap-1 bg-slate-50 p-3 rounded-2xl mb-3">
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Owner:</Text> {viewingStore.owner_name}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Phone:</Text> {viewingStore.phone} / {viewingStore.alt_phone || 'N/A'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">GST:</Text> {viewingStore.gst_number || 'N/A'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Address:</Text> {viewingStore.address}, {viewingStore.area}, {viewingStore.city}, {viewingStore.state} - {viewingStore.pincode}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Refill Cycle:</Text> {viewingStore.refill_frequency}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Last Purchase:</Text> {viewingStore.last_purchase_date || 'No purchases'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Next Refill:</Text> {viewingStore.next_refill_date || 'N/A'}</Text>
                </View>
                <Pressable onPress={() => setViewingStore(null)} className="w-full py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close Portfolio</Text></Pressable>
              </View>
            </View>
          );
        })()}
      </Modal>
    </View>
  );
}
