import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, Pressable, Image, Modal, Linking, ScrollView, Settings } from 'react-native';
import { Search, MapPin, DollarSign, AlertTriangle, MessageSquare, Download, Eye, Plus, Truck, X, Tag, Edit, Check, Trash2, RotateCcw, Copy, Settings2 } from 'lucide-react-native';
import { ERPData, resolveActor } from '../../storage';
import { Store, Order, Invoice, Payment, Supplier, Purchase, PreBookingItem, PreBookingOrder, Product, NotificationEntityType, Asset, Area, Village, PartnerType, BoxPieceQty } from '../../types';
import { calculateStoreHealthScore } from '../../data';
import SelectField from '../../components/common/SelectField';
import DateField from '../../components/common/DateField';
import ConfirmModal from '../../components/common/ConfirmModal';
import BoxPieceInput from '../../components/common/BoxPieceInput';
import { formatQty, isPositiveQty, compareQty, readQtyField, addQty, toTotalPieces, formatUnitRate } from '../../utils/qty';
import { exportHtmlReport, openWebPreviewWindow } from '../../utils/reportExport';
import { buildOrderInvoicePdf, buildPreBookingBillPdf } from '../../utils/orderInvoicePdf';
import { renderPdfDocument, renderInfoTable, renderPartyBox, renderKv, renderSummaryLine, buildPdfFileName, buildAttachmentFileName, stableRecordRef, freshReportRef } from '../../utils/pdfTemplate';
import { viewOrDownloadDataUriFile, pickBillFileAsDataUri } from '../../utils/documentPicker';
import { useAppContext } from '../../context/AppContext';
import { useViewMode } from '../../context/ViewModeContext';
import { useResetScrollOnChange } from '../../context/ScrollResetContext';
import ViewToggle from '../../components/common/ViewToggle';
import EmptyState from '../../components/common/EmptyState';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import FilterBar, { FILTER_PILL_CLASS, FILTER_PILL_TEXT_CLASS } from '../../components/common/FilterBar';
import DateRangeFilterField from '../../components/common/DateRangeFilterField';
import ScrollableSection from '../../components/common/ScrollableSection';
import PaginationFooter from '../../components/common/PaginationFooter';
import AutocompleteInput from '../../components/common/AutocompleteInput';
import { suppliersApi, storesApi, preBookingsApi, ordersApi, paymentsApi, areasApi, villagesApi, partnerTypesApi, storePricingApi, purchasesApi, assetsApi } from '../../api/endpoints';
import { getEffectiveProductPrice, getEffectiveDiscountPct, priceFromDiscount, discountFromPrice, findStorePricingOverride } from '../../utils/pricing';
import { hasAdminOverride, isGstToggleEnabled, isRetailPricingEnabled } from '../../utils/permissions';
import {
  ORDERS_EDIT_OVERRIDE_FEATURE, ORDERS_DELETE_OVERRIDE_FEATURE,
  PREBOOKINGS_EDIT_OVERRIDE_FEATURE, PREBOOKINGS_DELETE_OVERRIDE_FEATURE,
} from '../../config/permissionsRegistry';
import { computeInvoiceTotals, formatWholeRupees, formatCurrency } from '../../utils/billing';
import { DateFilterMode, getDateFilterRange as getDateFilterRangeUtil, isWithinDateFilter as isWithinDateFilterUtil } from '../../utils/dateFilter';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useResponsiveTableHeight } from '../../hooks/useResponsiveTableHeight';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

interface AdminSalesProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: any, message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  activeScreen?: string;
  showAlert: (opts: any) => void;
  initialPreBookingTodayFilter?: boolean;
  onConsumeInitialPreBookingTodayFilter?: () => void;
  pendingNotificationTarget?: { entityType: NotificationEntityType; entityId: string } | null;
  onConsumePendingNotificationTarget?: () => void;
  hideAdminControls?: boolean;
  // Set by AdminFlow when "Create Order" is tapped on an assigned asset's
  // detail view (see AdminAssets.tsx) - opens the Create Order form with
  // that asset's partner pre-selected instead of the usual first-active-store default.
  initialCreateOrderStoreId?: string | null;
  onConsumeInitialCreateOrderStoreId?: () => void;
  // Cancelling that same Create Order flow should return to the Assets
  // screen it was launched from, instead of falling through to the Orders
  // list like every other Cancel does.
  onCancelCreateOrderToAssets?: () => void;
}

const inputClass = "w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800";

export default function AdminSales({ data, setData, addNotification, currentUser, activeScreen, showAlert, initialPreBookingTodayFilter, onConsumeInitialPreBookingTodayFilter, pendingNotificationTarget, onConsumePendingNotificationTarget, hideAdminControls = false, initialCreateOrderStoreId, onConsumeInitialCreateOrderStoreId, onCancelCreateOrderToAssets }: AdminSalesProps) {
  const { refreshData, notifyResourceChanged } = useAppContext();
  const { viewMode } = useViewMode();
  const [salesTab, setSalesTab] = useState<'stores' | 'suppliers' | 'orders' | 'prebookings' | 'payments' | 'credit' | 'refill' | 'inactive'>('stores');

  // Admin-grantable, app-wide: off by default, hiding the Retail/Selling
  // price tier everywhere (pricing-mode toggles, Store Pricing "Selling %"
  // overrides). Read sites below use an "effective" mode that clamps to
  // 'wholesale' rather than resetting state, so a stale 'retail' selection
  // from before the feature was disabled can't silently leak through.
  const retailEnabled = isRetailPricingEnabled(currentUser, data.rolePermissions, data.userPermissions);
  // Native Admin gets this on by default (see permissionsRegistry.ts); a
  // Warehouse operator viewing this same component (hideAdminControls) gets
  // it off by default, individually grantable via Manage Permissions.
  const canToggleGst = isGstToggleEnabled(currentUser, data.rolePermissions, data.userPermissions);

  // computeInvoiceTotals needs each item's pieces_per_box to bill a partial
  // box correctly (e.g. 1 box + 4 pcs of a 12-pc box) - order/booking items
  // only ever store quantity/quantity_pieces themselves, so this looks the
  // rest up from the product catalog before delegating to the real totals fn.
  const computeItemsTotal = (items: { product_id: string; quantity: number; quantity_pieces?: number; unit_price: number; tax_pct: number }[]) =>
    computeInvoiceTotals(items.map(i => ({ ...i, pieces_per_box: data.products.find(p => p.id === i.product_id)?.pieces_per_box ?? 1 })));

  // Ad-hoc "quantity * price" line-value math (report/list summaries, not a
  // full invoice) needs the same partial-box awareness - looks up the
  // product's pieces_per_box so quantity_pieces is weighted correctly.
  const effectiveLineValue = (item: { product_id: string; quantity: number; quantity_pieces?: number }, price: number) => {
    const ppb = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
    return toTotalPieces({ boxes: item.quantity, pieces: item.quantity_pieces ?? 0 }, ppb) * price;
  };

  // Receive Stock / supplier bill pricing is recorded at the box rate, so
  // the displayed receipt total needs to prorate loose pieces from that box
  // price instead of treating the rate as per-piece like sales orders do.
  const purchaseLineValue = (item: { product_id: string; quantity: number; quantity_pieces?: number }, price: number) => {
    const ppb = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
    const perPiecePrice = price / Math.max(1, ppb);
    return item.quantity * price + (item.quantity_pieces ?? 0) * perPiecePrice;
  };

  const formatPurchaseUnitRate = (item: { product_id: string; quantity: number; quantity_pieces?: number }, price: number) => {
    const ppb = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
    const perPiecePrice = price / Math.max(1, ppb);
    if ((item.quantity_pieces ?? 0) === 0) return `Rs. ${price.toFixed(2)}/box`;
    if (item.quantity === 0) return `Rs. ${perPiecePrice.toFixed(2)}/pc`;
    return `Rs. ${price.toFixed(2)}/box + Rs. ${perPiecePrice.toFixed(2)}/pc`;
  };

  useEffect(() => {
    if (!activeScreen) return;
    const screenLower = activeScreen.toLowerCase();
    if (screenLower === 'stores') setSalesTab('stores');
    else if (screenLower === 'suppliers' || screenLower === 'purchases') setSalesTab('suppliers');
    else if (screenLower === 'orders' || screenLower === 'invoices') setSalesTab('orders');
    else if (screenLower === 'deliveries') setSalesTab('prebookings');
    else if (screenLower === 'payments') setSalesTab('payments');
    else if (screenLower === 'credit') setSalesTab('credit');
    else if (screenLower === 'refill') setSalesTab('refill');
    else if (screenLower === 'inactive') setSalesTab('inactive');

    // Navigating to a (possibly different) tab must always drop back to the
    // list - activeForm drives a top-level ternary that overrides the
    // salesTab-driven list view entirely, so without this reset a still-open
    // Bill/Edit/Details/Create sub-view stays on screen forever no matter
    // what the user taps in the sidebar or tab bar. Any popup/ConfirmModal
    // below is rendered independently of activeForm too (it's just gated by
    // its own visible flag), so it's closed here for the same reason - none
    // of these should survive an explicit "go look at something else" action.
    // (If this same navigation is actually a notification deep-link into a
    // specific record, the pendingNotificationTarget effect below re-opens
    // the right activeForm/record right after this runs.)
    setActiveForm('list');
    setViewingStore(null);
    setReportingStore(null);
    setViewingSupplier(null);
    setReportingSupplier(null);
    setViewingPreBooking(null);
    setDeleteStoreConfirmId(null);
    setDeleteAreaConfirmId(null);
    setDeleteSupplierConfirmId(null);
    setDeleteOrderConfirmId(null);
    setDeletePreBookingConfirmId(null);
    setCancelOrderConfirmId(null);
    setShowUnsavedPricingModal(false);
    setShowClonePricingModal(false);
    setShowCloneFromModal(false);
    setShowNewOrderPaymentModal(false);
    setShowConfirmOrderDialog(false);
    setPreBookingConfirmAction(null);
  }, [activeScreen]);

  // Opens the specific record a tapped notification pointed at, once its
  // owning tab is on-screen (AdminFlow switched screens to get here - see
  // notificationEntityScreen there). Each branch owns a different tab/state
  // pair, so only the matching entityType actually does anything per tap.
  useEffect(() => {
    if (!pendingNotificationTarget) return;
    const { entityType, entityId } = pendingNotificationTarget;
    if (entityType === 'order') {
      const order = data.orders.find(o => o.id === entityId);
      if (order) { setSalesTab('orders'); setSelectedOrder(order); setActiveForm('order_details'); }
    } else if (entityType === 'prebooking') {
      const pb = data.preBookingOrders.find(p => p.id === entityId);
      if (pb) { setSalesTab('prebookings'); openPreBookingViewer(pb); }
    } else if (entityType === 'purchase') {
      const purchase = data.purchases.find(p => p.id === entityId);
      if (purchase) { setSalesTab('suppliers'); openPurchaseViewer(purchase); }
    } else if (entityType === 'store') {
      const store = data.stores.find(s => s.id === entityId);
      if (store) { setSalesTab('stores'); setViewingStore(store); }
    } else if (entityType === 'supplier') {
      const supplier = data.suppliers.find(s => s.id === entityId);
      if (supplier) { setSalesTab('suppliers'); setViewingSupplier(supplier); }
    } else {
      return;
    }
    onConsumePendingNotificationTarget?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotificationTarget]);

  // "Create Order" tapped on an assigned asset's detail view (AdminAssets.tsx)
  // - runs after the activeScreen-reset effect above (same ordering as the
  // pendingNotificationTarget effect) so its setActiveForm('create_order')
  // isn't immediately clobbered by that reset-to-list effect.
  useEffect(() => {
    if (!initialCreateOrderStoreId) return;
    setSalesTab('orders');
    handleOpenCreateOrder(initialCreateOrderStoreId);
    onConsumeInitialCreateOrderStoreId?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCreateOrderStoreId]);

  const [storeSearch, setStoreSearch] = useState('');
  const [storeListTab, setStoreListTab] = useState<'active' | 'inactive'>('active');
  const [storeAreaFilter, setStoreAreaFilter] = useState('All');
  const [storeVillageFilter, setStoreVillageFilter] = useState('All');
  // Assets aren't part of the main ERPData blob (paginated separately, see
  // AdminAssets.tsx) - fetched once whenever the Partners tab is open, so
  // every row/card can show a "who owns what" indicator without a per-row fetch.
  const [partnerAssets, setPartnerAssets] = useState<Asset[]>([]);
  useEffect(() => {
    if (salesTab !== 'stores') return;
    assetsApi.list().then(setPartnerAssets).catch(() => {});
  }, [salesTab]);
  // Null when a partner holds no assets (renders nothing); otherwise a
  // compact "count x Type" badge, or "count Assets" when the types differ.
  const getPartnerAssetBadge = (storeId: string): string | null => {
    const assigned = partnerAssets.filter(a => a.assigned_partner_id === storeId);
    if (assigned.length === 0) return null;
    const types = Array.from(new Set(assigned.map(a => a.asset_type)));
    return types.length === 1 ? `${assigned.length}x ${types[0]}` : `${assigned.length} Assets`;
  };
  // Freezer Box assignment shortcut on the store form: '' means "None".
  // originalFreezerBoxAssetId tracks what was assigned when the form opened,
  // so handleSaveStore only touches the assignment if it actually changed.
  const [freezerBoxAssetId, setFreezerBoxAssetId] = useState('');
  const [originalFreezerBoxAssetId, setOriginalFreezerBoxAssetId] = useState('');
  const refetchPartnerAssets = () => assetsApi.list().then(setPartnerAssets).catch(() => {});
  const [supplierListTab, setSupplierListTab] = useState<'active' | 'inactive'>('active');
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [deleteStoreConfirmId, setDeleteStoreConfirmId] = useState<string | null>(null);
  const [newAreaName, setNewAreaName] = useState('');
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [deleteAreaConfirmId, setDeleteAreaConfirmId] = useState<string | null>(null);
  // Village dropdown management - same pattern as the Area state block above.
  const [newVillageName, setNewVillageName] = useState('');
  const [editingVillageId, setEditingVillageId] = useState<string | null>(null);
  const [editingVillageName, setEditingVillageName] = useState('');
  const [deleteVillageConfirmId, setDeleteVillageConfirmId] = useState<string | null>(null);
  const [newPartnerTypeName, setNewPartnerTypeName] = useState('');
  const [editingPartnerTypeId, setEditingPartnerTypeId] = useState<string | null>(null);
  const [editingPartnerTypeName, setEditingPartnerTypeName] = useState('');
  const [deletePartnerTypeConfirmId, setDeletePartnerTypeConfirmId] = useState<string | null>(null);
  const [managePartnerTypesReturnTo, setManagePartnerTypesReturnTo] = useState<'list' | 'add_store' | 'edit_store'>('list');
  const [pricingStore, setPricingStore] = useState<Store | null>(null);
  // Set when Custom Pricing is opened from the pencil icon on a Create Order
  // product row (rather than the Stores list) - leaveStorePricing() reads
  // this so "Back"/"Save & Leave"/"Leave Without Saving" return to the
  // in-progress order draft instead of dropping to the Partner Outlets list.
  const [pricingReturnTo, setPricingReturnTo] = useState<'list' | 'create_order'>('list');
  const [storePricingEdits, setStorePricingEdits] = useState<Record<string, { wholesale: string; retail: string; wholesalePrice: string; retailPrice: string }>>({});
  const emptyPricingEdit = { wholesale: '', retail: '', wholesalePrice: '', retailPrice: '' };
  // Price -> % direction: recomputes just that side's % from the typed
  // price; the price itself is stored exactly as typed.
  const updateStorePricingPrice = (productId: string, field: 'wholesale' | 'retail', priceStr: string, mrp: number) => {
    setStorePricingEdits(prev => {
      const current = prev[productId] || emptyPricingEdit;
      const priceField = field === 'wholesale' ? 'wholesalePrice' : 'retailPrice';
      return { ...prev, [productId]: { ...current, [priceField]: priceStr, [field]: String(discountFromPrice(mrp, parseFloat(priceStr) || 0)) } };
    });
  };
  // % -> Price direction: recomputes just that side's price from the typed %.
  const updateStorePricingPct = (productId: string, field: 'wholesale' | 'retail', pctStr: string, mrp: number) => {
    setStorePricingEdits(prev => {
      const current = prev[productId] || emptyPricingEdit;
      const priceField = field === 'wholesale' ? 'wholesalePrice' : 'retailPrice';
      return { ...prev, [productId]: { ...current, [field]: pctStr, [priceField]: priceFromDiscount(mrp, parseFloat(pctStr) || 0).toFixed(2) } };
    });
  };
  const [pricingProductIds, setPricingProductIds] = useState<string[]>([]);
  const [productPricingSearch, setProductPricingSearch] = useState('');
  const [showUnsavedPricingModal, setShowUnsavedPricingModal] = useState(false);
  const [showClonePricingModal, setShowClonePricingModal] = useState(false);
  const [cloneTargetStoreIds, setCloneTargetStoreIds] = useState<string[]>([]);
  const [cloneStoreSearch, setCloneStoreSearch] = useState('');
  const [showCloneFromModal, setShowCloneFromModal] = useState(false);
  const [cloneSourceStoreId, setCloneSourceStoreId] = useState('');
  const [cloneFromStoreSearch, setCloneFromStoreSearch] = useState('');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [viewingStore, setViewingStore] = useState<Store | null>(null);
  const [reportingStore, setReportingStore] = useState<Store | null>(null);
  // Set when a bill is opened from the Purchase Report popup, so "Back" on
  // the order details screen can reopen that popup instead of falling
  // through to the plain stores list. Null when order_details was opened
  // from anywhere else (e.g. the Orders tab), so Back behaves as before.
  const [returnToStoreReport, setReturnToStoreReport] = useState<Store | null>(null);
  // Same idea for opening an invoice from inside the Partner Purchase Report -
  // Back should return to that report instead of dropping to the plain list.
  const [returnToSupplierReport, setReturnToSupplierReport] = useState<Supplier | null>(null);
  // Independent from the shared dateFilterMode/customDateFrom/customDateTo
  // above (used by the Orders/Payments/Stores/Pre-bookings tabs) so opening
  // a store's report can't change - or be changed by - filters on other tabs.
  const [storeReportDateMode, setStoreReportDateMode] = useState<DateFilterMode>('today');
  const [storeReportFrom, setStoreReportFrom] = useState(new Date().toISOString().split('T')[0]);
  const [storeReportTo, setStoreReportTo] = useState(new Date().toISOString().split('T')[0]);
  // Which section of the Purchase Report modal is showing: 'orders' (the
  // original Order Details + Pre-Bookings lists, filtered by order
  // created_at/scheduled delivery date via storeReportDateMode above) vs
  // 'paid' (Payment rows filtered by payment.date via paidReportDateMode
  // below) - a bill just paid today needs to show up on the 'paid' tab even
  // when the underlying order was placed on an earlier date, which is
  // exactly the case storeReportDateMode's "Today" default was hiding.
  const [storeReportTab, setStoreReportTab] = useState<'orders' | 'paid'>('orders');
  // Deliberately independent from storeReportDateMode/From/To (same
  // reasoning as that block's own comment above) - "when was this order
  // created" and "when was this payment made" are different questions, and
  // sharing state would let switching one tab's range silently move the
  // other's.
  const [paidReportDateMode, setPaidReportDateMode] = useState<DateFilterMode>('today');
  const [paidReportFrom, setPaidReportFrom] = useState(new Date().toISOString().split('T')[0]);
  const [paidReportTo, setPaidReportTo] = useState(new Date().toISOString().split('T')[0]);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [reportingSupplier, setReportingSupplier] = useState<Supplier | null>(null);
  // Independent from every other date-filter state in this file - same
  // reasoning as storeReportDateMode above.
  const [supplierReportSearch, setSupplierReportSearch] = useState('');
  const [supplierReportDateMode, setSupplierReportDateMode] = useState<DateFilterMode>('today');
  const [supplierReportFrom, setSupplierReportFrom] = useState(new Date().toISOString().split('T')[0]);
  const [supplierReportTo, setSupplierReportTo] = useState(new Date().toISOString().split('T')[0]);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  // Bill remove/replace feedback stays entirely inside the invoice viewer's
  // own <Modal> instead of opening a second one - two RN <Modal>s (or a
  // <Modal> plus the app's global alert, which renders outside any portal)
  // don't reliably stack in front of one another, so a second popup can end
  // up invisible behind the first until it's manually closed.
  const [confirmRemoveBill, setConfirmRemoveBill] = useState(false);
  const [billActionStatus, setBillActionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const openPurchaseViewer = (p: Purchase) => {
    setConfirmRemoveBill(false);
    setBillActionStatus(null);
    setViewingPurchase(p);
    setActiveForm('purchase_details');
    // The invoice viewer is a full page now (activeForm-driven), not a
    // <Modal> - switching pages underneath a still-open Partner Purchase
    // Report <Modal> is invisible to the user since that Modal keeps
    // covering the whole screen, so it must be closed too when navigating
    // to the invoice from inside it. Remembered so Back can reopen it.
    if (reportingSupplier) {
      setReturnToSupplierReport(reportingSupplier);
      setReportingSupplier(null);
    }
  };
  const closePurchaseViewer = () => {
    setActiveForm('list');
    setViewingPurchase(null);
    setConfirmRemoveBill(false);
    setBillActionStatus(null);
    if (returnToSupplierReport) {
      setReportingSupplier(returnToSupplierReport);
      setReturnToSupplierReport(null);
    }
  };
  const [viewingPreBooking, setViewingPreBooking] = useState<PreBookingOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeForm, setActiveForm] = useState<'list' | 'add_store' | 'edit_store' | 'add_payment' | 'order_details' | 'edit_order' | 'edit_delivered_prebooking' | 'add_supplier' | 'add_prebooking' | 'prebooking_confirmation' | 'create_order' | 'order_confirmation' | 'manage_areas' | 'manage_villages' | 'manage_partner_types' | 'store_pricing' | 'purchase_details'>('list');
  useResetScrollOnChange(salesTab, activeForm);
  const [newOrderStoreId, setNewOrderStoreId] = useState<string>('');
  const [createOrderReturnToAssets, setCreateOrderReturnToAssets] = useState(false);
  const [newOrderItems, setNewOrderItems] = useState<Record<string, BoxPieceQty>>({});
  // Admin-only "Edit Order" (Confirmed/Delivered orders) - product_id -> qty,
  // seeded from the order's current items when the form opens.
  const [editOrderItems, setEditOrderItems] = useState<Record<string, BoxPieceQty>>({});
  const [editOrderProductSearch, setEditOrderProductSearch] = useState('');
  const debouncedEditOrderProductSearch = useDebouncedValue(editOrderProductSearch, 150);
  const [deleteOrderConfirmId, setDeleteOrderConfirmId] = useState<string | null>(null);
  // Admin-only "Edit" for a Delivered pre-booking (operates on the real order
  // it produced - see backend prebookings.service.ts editDeliveredPreBooking).
  const [editDeliveredPreBookingItems, setEditDeliveredPreBookingItems] = useState<Record<string, BoxPieceQty>>({});
  const [editDeliveredPreBookingSearch, setEditDeliveredPreBookingSearch] = useState('');
  const debouncedEditDeliveredPreBookingSearch = useDebouncedValue(editDeliveredPreBookingSearch, 150);
  const [editingDeliveredPreBookingId, setEditingDeliveredPreBookingId] = useState<string | null>(null);
  const [deletePreBookingConfirmId, setDeletePreBookingConfirmId] = useState<string | null>(null);

  const openPreBookingViewer = (pb: PreBookingOrder) => {
    setDeletePreBookingConfirmId(null);
    // Same reasoning as openPurchaseViewer above - the Pre-Booking Bill is
    // itself a <Modal>, so it must not open on top of the still-visible
    // Partner Store Report <Modal> (nested Modals don't reliably stack).
    if (reportingStore) {
      setReturnToStoreReport(reportingStore);
      setReportingStore(null);
    }
    setViewingPreBooking(pb);
  };
  const closePreBookingViewer = () => {
    setDeletePreBookingConfirmId(null);
    setViewingPreBooking(null);
    if (returnToStoreReport) {
      setReportingStore(returnToStoreReport);
      setReturnToStoreReport(null);
    }
  };
  // Tracks product IDs in the order they were first selected (qty raised
  // above 0), so the picker and every downstream bill/invoice view can show
  // "recently touched" items pinned to the top instead of resorting the
  // whole catalog alphabetically. A product drops back out once its qty
  // returns to 0, and re-adding it later puts it back at the end.
  const [newOrderItemOrder, setNewOrderItemOrder] = useState<string[]>([]);
  const updateNewOrderItemOrder = (productId: string, qty: BoxPieceQty) => {
    setNewOrderItemOrder(prev => {
      if (isPositiveQty(qty)) return prev.includes(productId) ? prev : [...prev, productId];
      return prev.includes(productId) ? prev.filter(id => id !== productId) : prev;
    });
  };
  const [newOrderPricingMode, setNewOrderPricingMode] = useState<'wholesale' | 'retail'>('wholesale');
  const [newOrderGstMode, setNewOrderGstMode] = useState<'with_gst' | 'without_gst'>('with_gst');
  const [newOrderProductSearch, setNewOrderProductSearch] = useState('');
  const debouncedNewOrderProductSearch = useDebouncedValue(newOrderProductSearch, 150);
  const newOrderProductSearchSuggestions = useMemo(() => data.products.filter(p => p.status === 'Active').map(p => p.name), [data.products]);
  const [pendingNewOrder, setPendingNewOrder] = useState<{ items: { product_id: string; quantity: number; quantity_pieces: number; unit_price: number; tax_pct: number }[]; storeId: string; grandTotal: number; roundOff: number; storeName: string } | null>(null);
  // Gates the payment-collection modal separately from pendingNewOrder itself,
  // so "Create Order & Generate Invoice" first lands on a full Order
  // Confirmation page (activeForm 'order_confirmation') and the payment modal
  // only opens once the admin explicitly hits "Confirm Order" there.
  const [showNewOrderPaymentModal, setShowNewOrderPaymentModal] = useState(false);
  // Gates the "are these details correct?" popup on the Order Confirmation
  // page — payment only opens once the admin explicitly confirms there.
  const [showConfirmOrderDialog, setShowConfirmOrderDialog] = useState(false);
  const [newOrderSettleAmount, setNewOrderSettleAmount] = useState(0);
  const [newOrderSettleMethod, setNewOrderSettleMethod] = useState<'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'>('UPI');
  const [preBookingStoreId, setPreBookingStoreId] = useState<string>(data.stores[0]?.id || '');
  const [preBookingDate, setPreBookingDate] = useState<string>(new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]);
  const [preBookingNotes, setPreBookingNotes] = useState<string>('');
  const [preBookingItems, setPreBookingItems] = useState<Record<string, BoxPieceQty>>({});
  // Product IDs in the order they were first selected (qty raised above 0) -
  // keeps the picker (Table + Grid) and the saved booking's item order
  // showing "recently touched" items pinned to the top instead of resorting
  // alphabetically. A product drops back out once its qty returns to 0.
  const [preBookingItemOrder, setPreBookingItemOrder] = useState<string[]>([]);
  const updatePreBookingItemOrder = (productId: string, qty: BoxPieceQty) => {
    setPreBookingItemOrder(prev => {
      if (isPositiveQty(qty)) return prev.includes(productId) ? prev : [...prev, productId];
      return prev.includes(productId) ? prev.filter(id => id !== productId) : prev;
    });
  };
  const [preBookingPricingMode, setPreBookingPricingMode] = useState<'wholesale' | 'retail'>('wholesale');
  const effectiveNewOrderPricingMode = retailEnabled ? newOrderPricingMode : 'wholesale';
  const effectivePreBookingPricingMode = retailEnabled ? preBookingPricingMode : 'wholesale';
  const [preBookingGstMode, setPreBookingGstMode] = useState<'with_gst' | 'without_gst'>('with_gst');
  const [preBookingProductSearch, setPreBookingProductSearch] = useState('');
  const debouncedPreBookingProductSearch = useDebouncedValue(preBookingProductSearch, 150);
  const [editingPreBookingId, setEditingPreBookingId] = useState<string | null>(null);
  // Draft built by handleSavePreBooking (the "Save Pre-Booking & Reserve
  // Stock" button) and reviewed on the Pre-Booking Confirmation page; the
  // API call only happens once the user hits "Confirm Pre-Booking" there.
  const [pendingPreBooking, setPendingPreBooking] = useState<{ items: PreBookingItem[]; storeId: string; storeName: string; scheduledDate: string; notes?: string; grandTotal: number; roundOff: number } | null>(null);
  const [preBookingSearch, setPreBookingSearch] = useState<string>('');
  const [preBookingStatusFilter, setPreBookingStatusFilter] = useState<'All' | 'Booked' | 'Delivered' | 'Cancelled'>('All');
  const [preBookingConfirmAction, setPreBookingConfirmAction] = useState<{ bookingId: string; action: 'deliver' | 'cancel' } | null>(null);
  const [preBookingSettleAmount, setPreBookingSettleAmount] = useState(0);
  const [preBookingSettleMethod, setPreBookingSettleMethod] = useState<'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'>('UPI');
  const [cancelOrderConfirmId, setCancelOrderConfirmId] = useState<string | null>(null);
  const [inactiveDaysTab, setInactiveDaysTab] = useState<30 | 60 | 90>(30);
  const [creditSort, setCreditSort] = useState<'balance_desc' | 'balance_asc' | 'limit_desc' | 'limit_asc'>('balance_desc');
  const [creditSearch, setCreditSearch] = useState('');
  const debouncedCreditSearch = useDebouncedValue(creditSearch, 150);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'All' | 'Confirmed' | 'Delivered' | 'Cancelled'>('All');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'All' | 'Paid' | 'Partial' | 'Unpaid'>('All');
  const [orderPartnerTypeFilter, setOrderPartnerTypeFilter] = useState('All');
  const [orderSalespersonFilter, setOrderSalespersonFilter] = useState('All');
  const [orderTruckFilter, setOrderTruckFilter] = useState('All');
  const [orderAreaFilter, setOrderAreaFilter] = useState('All');

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('today');
  const todayIso = new Date().toISOString().split('T')[0];
  const [customDateFrom, setCustomDateFrom] = useState(todayIso);
  const [customDateTo, setCustomDateTo] = useState(todayIso);

  const orders = usePaginatedList<Order, { status?: string; paymentStatus?: string; partnerType?: string; salespersonId?: string; truckId?: string; area?: string }>({
    resource: 'orders',
    mode: 'offset',
    pageSize: 25,
    enabled: salesTab === 'orders',
    filters: {
      status: orderStatusFilter !== 'All' ? orderStatusFilter : undefined,
      paymentStatus: orderPaymentFilter !== 'All' ? orderPaymentFilter : undefined,
      partnerType: orderPartnerTypeFilter !== 'All' ? orderPartnerTypeFilter : undefined,
      salespersonId: orderSalespersonFilter !== 'All' ? orderSalespersonFilter : undefined,
      truckId: orderTruckFilter !== 'All' ? orderTruckFilter : undefined,
      area: orderAreaFilter !== 'All' ? orderAreaFilter : undefined,
    },
    search: orderSearch,
    dateFilterMode,
    customDateFrom,
    customDateTo,
    fetcher: params => ordersApi.listPaged(params),
  });
  const ordersTableHeight = useResponsiveTableHeight(350, { max: 900 });

  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('All');
  const [paymentPartnerTypeFilter, setPaymentPartnerTypeFilter] = useState('All');
  const payments = usePaginatedList<Payment, { method?: string; partnerType?: string }>({
    resource: 'payments',
    mode: 'offset',
    pageSize: 25,
    enabled: salesTab === 'payments',
    filters: {
      method: paymentMethodFilter !== 'All' ? paymentMethodFilter : undefined,
      partnerType: paymentPartnerTypeFilter !== 'All' ? paymentPartnerTypeFilter : undefined,
    },
    search: paymentSearch,
    dateFilterMode,
    customDateFrom,
    customDateTo,
    fetcher: params => paymentsApi.listPaged(params),
  });
  const paymentsTableHeight = useResponsiveTableHeight(450, { max: 900 });

  const preBookings = usePaginatedList<PreBookingOrder, { status?: string }>({
    resource: 'prebookings',
    mode: 'offset',
    pageSize: 25,
    enabled: salesTab === 'prebookings',
    filters: { status: hideAdminControls ? 'Booked' : (preBookingStatusFilter !== 'All' ? preBookingStatusFilter : undefined) },
    search: preBookingSearch,
    dateFilterMode,
    customDateFrom,
    customDateTo,
    fetcher: params => preBookingsApi.listPaged(params),
  });
  const preBookingsTableHeight = useResponsiveTableHeight(350, { max: 900 });

  // Purchase receipts are always viewed scoped to one supplier at a time (the
  // "Purchase Report" modal below) rather than a flat cross-supplier table -
  // enabled only while that modal is open, filtered server-side by supplier.
  const supplierPurchases = usePaginatedList<Purchase, { supplier_id?: string }>({
    resource: 'purchases',
    mode: 'offset',
    pageSize: 25,
    enabled: !!reportingSupplier,
    filters: { supplier_id: reportingSupplier?.id },
    search: supplierReportSearch,
    dateFilterMode: supplierReportDateMode,
    customDateFrom: supplierReportFrom,
    customDateTo: supplierReportTo,
    fetcher: params => purchasesApi.listPaged(params),
  });

  const getDateFilterRange = (): { start: Date; end: Date } | null => getDateFilterRangeUtil(dateFilterMode, customDateFrom, customDateTo);

  const isWithinDateFilter = (dateStr: string | undefined | null) => isWithinDateFilterUtil(dateStr, dateFilterMode, customDateFrom, customDateTo);

  // Single compact pill (folds the custom From/To pickers into its own
  // sheet) shared by every tab that filters on this same date-range state -
  // Orders, Payments, and Prebookings all render this exact instance rather
  // than each keeping its own copy.
  const renderDateFilterField = () => (
    <DateRangeFilterField
      mode={dateFilterMode}
      onModeChange={setDateFilterMode}
      customFrom={customDateFrom}
      customTo={customDateTo}
      onCustomFromChange={setCustomDateFrom}
      onCustomToChange={setCustomDateTo}
      title="Date Range"
    />
  );

  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const debouncedSupplierSearch = useDebouncedValue(supplierSearchQuery, 150);
  const supplierSearchSuggestions = useMemo(() => data.suppliers.filter(s => s.status === 'Active').map(s => s.name), [data.suppliers]);
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

  const handleSaveSupplier = async () => {
    if (!supplierForm.name || !supplierForm.phone) {
      showAlert('Supplier name and contact number are required.');
      return;
    }
    try {
      if (editingSupplierId) {
        await suppliersApi.update(editingSupplierId, supplierForm);
        await refreshData();
        addNotification('partner_update', `Supplier "${supplierForm.name}" updated successfully.`, 'supplier', editingSupplierId);
      } else {
        const created = await suppliersApi.create(supplierForm);
        await refreshData();
        addNotification('partner_update', `Supplier "${supplierForm.name}" registered successfully.`, 'supplier', created.id);
      }
      setActiveForm('list');
      setEditingSupplierId(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save supplier.');
    }
  };

  const handleReactivateSupplier = async (supplierId: string) => {
    const supplier = data.suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    try {
      await suppliersApi.setStatus(supplierId, 'Active');
      await refreshData();
      addNotification('partner_update', `Supplier "${supplier.name}" has been reactivated.`, 'supplier', supplierId);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to reactivate supplier.');
    }
  };

  // Goods Received Note for a single stock-inward record — built from the
  // same shared template as the Order Invoice, so this looks like it came
  // from the same document system rather than a different report engine.
  const handleDownloadStockReceiptPdf = async (purchase: Purchase, supplier: Supplier) => {
    // Opened synchronously up front so this stays safe even if async work
    // (e.g. an API fetch) is ever added before the html/fileName below are
    // ready - see openWebPreviewWindow's own comment.
    const previewWindow = openWebPreviewWindow();
    const totalUnits = formatQty({ boxes: purchase.items.reduce((sum, item) => sum + item.quantity, 0), pieces: purchase.items.reduce((sum, item) => sum + item.quantity_pieces, 0) });
    const totalValue = purchase.items.reduce((sum, item) => {
      return sum + purchaseLineValue(item, item.purchase_price);
    }, 0);
    const receivedDate = new Date(purchase.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

    const infoTable = renderInfoTable(
      renderPartyBox('Received From (Supplier)',
        renderKv('Supplier', supplier.name, true) +
        renderKv('Contact Person', supplier.contact_person || 'N/A') +
        renderKv('Phone', supplier.phone) +
        renderKv('Email', supplier.email || 'N/A') +
        renderKv('Address', supplier.address || 'N/A')),
      renderPartyBox('Receipt Details',
        renderKv('GRN ID', purchase.id, true) +
        renderKv('Supplier Invoice No', purchase.invoice_number) +
        renderKv('Date Received', receivedDate) +
        renderKv('Received Into', 'FrostyFlow Central Warehouse') +
        renderKv('Received By', 'Warehouse Operations Team'))
    );

    const tableRows = purchase.items.map(item => {
      const product = data.products.find(p => p.id === item.product_id);
      const lineTotal = purchaseLineValue(item, item.purchase_price);
      const rateLabel = formatPurchaseUnitRate(item, item.purchase_price);
      return `<tr><td>${product?.code || item.product_id}</td><td>${product?.name || 'Unknown Product'}</td><td style="text-align:right">${formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })}</td><td style="text-align:right">${rateLabel}</td><td style="text-align:center">${item.mfg_date || 'N/A'}</td><td style="text-align:center">${item.expiry_date || 'N/A'}</td><td style="text-align:right">Rs. ${lineTotal.toFixed(2)}</td></tr>`;
    }).join('');

    const bodyHtml = `
      ${infoTable}
      ${renderSummaryLine([
        { label: 'SKUs Received', value: String(purchase.items.length) },
        { label: 'Total Units', value: totalUnits, accent: true },
        { label: 'Total Purchase Value', value: `Rs. ${totalValue.toFixed(2)}`, accent: true },
      ])}
      <div class="section-title">Items Received (${purchase.items.length})</div>
      <table><thead><tr><th>SKU</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Cost</th><th>Mfg Date</th><th>Expiry Date</th><th style="text-align:right">Line Total</th></tr></thead>
      <tbody>${tableRows}</tbody></table>`;

    const html = renderPdfDocument({
      title: 'GOODS RECEIVED NOTE',
      subtitle: `Stock Inward Receipt | Supplier Invoice: ${purchase.invoice_number}`,
      bodyHtml,
      footerNote: 'This is a computer-generated goods received note and requires no physical signature.',
    });

    // Derived from the purchase's own DB id, so re-downloading the same
    // receipt always produces the same filename instead of a fresh one.
    const fileName = buildPdfFileName('Received_Stock', stableRecordRef('RS', purchase.id));
    await exportHtmlReport(html, fileName, showAlert, previewWindow);
  };

  // Lets a wrongly-attached supplier bill (wrong photo/PDF/Excel picked during
  // Receive Stock) be swapped for the correct one after the receipt was
  // already confirmed, instead of being stuck with the mistake forever.
  // Deliberately keeps the invoice viewer open and reports outcomes via the
  // inline billActionStatus banner rather than the OS picker's own showAlert
  // path or a second <Modal> - the global alert renders outside any Modal's
  // portal, so it (and any other stacked <Modal>) ends up invisible behind
  // whichever <Modal> is already open until that one is manually closed.
  const handleReplaceSupplierBill = async (purchaseId: string) => {
    const picked = await pickBillFileAsDataUri((opts) => {
      setBillActionStatus({ type: 'error', message: typeof opts === 'string' ? opts : opts.message });
    });
    if (!picked) return;
    try {
      await purchasesApi.updateBillFile(purchaseId, { bill_file_url: picked.dataUri, bill_file_name: picked.name, bill_file_type: picked.mimeType });
      await refreshData();
      setViewingPurchase(prev => (prev && prev.id === purchaseId ? { ...prev, bill_file_url: picked.dataUri, bill_file_name: picked.name, bill_file_type: picked.mimeType } : prev));
      setBillActionStatus({ type: 'success', message: 'Supplier bill updated.' });
    } catch (e: any) {
      setBillActionStatus({ type: 'error', message: e.message ?? 'Unable to replace the supplier bill.' });
    }
  };

  const handleConfirmRemoveSupplierBill = async (purchaseId: string) => {
    setConfirmRemoveBill(false);
    try {
      await purchasesApi.updateBillFile(purchaseId, { bill_file_url: null, bill_file_name: null, bill_file_type: null });
      await refreshData();
      setViewingPurchase(prev => (prev && prev.id === purchaseId ? { ...prev, bill_file_url: undefined, bill_file_name: undefined, bill_file_type: undefined } : prev));
      setBillActionStatus({ type: 'success', message: 'Supplier bill removed.' });
    } catch (e: any) {
      setBillActionStatus({ type: 'error', message: e.message ?? 'Unable to remove the supplier bill.' });
    }
  };

  const [storeForm, setStoreForm] = useState({
    name: '', owner_name: '', phone: '', alt_phone: '', address: '', area: 'Kothrud', village: '',
    city: 'Pune', state: 'Maharashtra', pincode: '411001', gst_number: '',
    credit_limit: 1000, refill_frequency: 'Weekly' as 'Weekly' | '15 Days' | 'Monthly' | 'Custom',
    custom_days: 7, ranking: 'Silver' as 'Platinum' | 'Gold' | 'Silver' | 'Bronze', partner_type: 'Retail Shop',
  });

  const [paymentForm, setPaymentForm] = useState({
    store_id: data.stores[0]?.id || '', invoice_id: 'general', amount: 100,
    method: 'UPI' as 'Cash' | 'UPI' | 'Google Pay' | 'PhonePe' | 'Paytm' | 'Bank Transfer' | 'Credit'
  });

  useEffect(() => {
    if (!initialPreBookingTodayFilter) return;
    setSalesTab('prebookings');
    setPreBookingStatusFilter('All');
    setPreBookingSearch('');
    setDateFilterMode('today');
    onConsumeInitialPreBookingTodayFilter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPreBookingTodayFilter]);

  const resetPreBookingForm = () => {
    setPreBookingItems({});
    setPreBookingItemOrder([]);
    setPendingPreBooking(null);
    setPreBookingNotes('');
    setPreBookingDate(new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]);
    setPreBookingPricingMode('wholesale');
    setPreBookingGstMode('with_gst');
    setPreBookingProductSearch('');
    setEditingPreBookingId(null);
  };

  const handleOpenEditPreBooking = (booking: PreBookingOrder) => {
    setPreBookingStoreId(booking.store_id);
    setPreBookingDate(booking.scheduled_delivery_date);
    setPreBookingNotes(booking.notes || '');
    const items: Record<string, BoxPieceQty> = {};
    booking.items.forEach(item => { items[item.product_id] = { boxes: item.quantity, pieces: item.quantity_pieces }; });
    setPreBookingItems(items);
    setPreBookingItemOrder(booking.items.map(item => item.product_id));
    const firstItem = booking.items[0];
    const firstProduct = firstItem ? data.products.find(p => p.id === firstItem.product_id) : null;
    const firstWholesaleRate = firstProduct ? getEffectiveProductPrice(firstProduct, 'wholesale', booking.store_id, data.storePricing) : 0;
    setPreBookingPricingMode(firstProduct && firstItem.unit_price === firstWholesaleRate ? 'wholesale' : 'retail');
    setPreBookingGstMode(firstItem && firstItem.tax_pct <= 0 ? 'without_gst' : 'with_gst');
    setEditingPreBookingId(booking.id);
    setActiveForm('add_prebooking');
  };

  const getEffectiveAvailableForBooking = (productId: string): BoxPieceQty => {
    const liveAvailable = readQtyField(data.warehouse_inventory.find(inv => inv.product_id === productId), 'available_qty', 'available_pieces');
    if (!editingPreBookingId) return liveAvailable;
    const existingBooking = (data.preBookingOrders || []).find(b => b.id === editingPreBookingId);
    const existingItem = existingBooking?.items.find(i => i.product_id === productId);
    if (!existingItem) return liveAvailable;
    const piecesPerBox = data.products.find(p => p.id === productId)?.pieces_per_box ?? 1;
    return addQty(liveAvailable, { boxes: existingItem.quantity, pieces: existingItem.quantity_pieces }, piecesPerBox);
  };

  // Built from preBookingItemOrder (selection order), not Object.entries, so
  // the saved booking - and every downstream bill/delivery view - shows
  // items in the order they were actually picked.
  const buildPreBookingItemsList = (): PreBookingItem[] => {
    return preBookingItemOrder
      .map(prodId => {
        const qty = preBookingItems[prodId] ?? { boxes: 0, pieces: 0 };
        if (!isPositiveQty(qty)) return null;
        const prod = data.products.find(p => p.id === prodId);
        const unit_price = prod ? getEffectiveProductPrice(prod, effectivePreBookingPricingMode, preBookingStoreId, data.storePricing) : 0;
        const tax_pct = canToggleGst && preBookingGstMode === 'without_gst' ? 0 : (prod?.tax_pct ?? 0);
        return { product_id: prodId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price, tax_pct };
      })
      .filter((item): item is PreBookingItem => item !== null);
  };

  // Only builds the pre-booking draft and navigates to the Pre-Booking
  // Confirmation page — nothing is sent to the backend yet. The API call
  // only happens once the user reviews the bill there and hits "Confirm
  // Pre-Booking" (handleConfirmPreBooking).
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

    const itemsList = buildPreBookingItemsList();
    if (itemsList.length === 0) {
      showAlert('Please add at least one product with quantity > 0.');
      return;
    }

    const { grand_total: grandTotal, round_off: roundOff } = computeItemsTotal(itemsList);
    setPendingPreBooking({
      items: itemsList, storeId: preBookingStoreId, storeName: selectedStoreObj.name,
      scheduledDate: preBookingDate, notes: preBookingNotes.trim() || undefined, grandTotal, roundOff,
    });
    setActiveForm('prebooking_confirmation');
  };

  // Discards the draft entirely and returns to the picker — the already
  // chosen quantities are still sitting in preBookingItems/preBookingItemOrder,
  // so nothing needs to be re-picked.
  const handleBackFromPreBookingConfirmation = () => {
    setPendingPreBooking(null);
    setActiveForm('add_prebooking');
  };

  const handleConfirmPreBooking = async () => {
    if (!pendingPreBooking) return;
    const { items, storeId, storeName, scheduledDate, notes } = pendingPreBooking;
    try {
      if (editingPreBookingId) {
        await preBookingsApi.update(editingPreBookingId, {
          store_id: storeId, scheduled_delivery_date: scheduledDate,
          items, notes,
        });
        await refreshData();
        notifyResourceChanged('prebookings');
        addNotification('order_update', `Pre-booking updated for ${storeName}.`, 'prebooking', editingPreBookingId);
        showAlert('Pre-booking updated successfully.');
      } else {
        const created = await preBookingsApi.create({
          store_id: storeId, salesperson_id: currentUser?.id || 'admin', scheduled_delivery_date: scheduledDate,
          items, notes,
        });
        await refreshData();
        notifyResourceChanged('prebookings');
        addNotification('new_order', `Pre-booking saved for ${storeName} and stock reserved in warehouse.`, 'prebooking', created.id);
        showAlert('Pre-booking saved successfully.');
      }
      resetPreBookingForm();
      setPendingPreBooking(null);
      setActiveForm('list');
      setSalesTab('prebookings');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save pre-booking.');
    }
  };

  const handleDeliverPreBooking = async (preBookingOrderId: string) => {
    try {
      const result = await preBookingsApi.deliver(preBookingOrderId, { method: preBookingSettleMethod, amount: preBookingSettleAmount });
      await refreshData();
      notifyResourceChanged('prebookings');
      addNotification('delivery', `Pre-booking order ${preBookingOrderId} completed. Payment status: ${result.payment_status}.`, 'prebooking', preBookingOrderId);
      showAlert(`Pre-booking delivery completed. Payment status: ${result.payment_status}.`);
      setPreBookingConfirmAction(null);
    } catch (e: any) {
      // Close first - a still-open Deliver Pre-Booking Modal would otherwise
      // hide the shared alert, which renders outside any Modal's portal.
      setPreBookingConfirmAction(null);
      showAlert(e.message ?? 'Unable to deliver pre-booking.');
    }
  };

  const handleCancelPreBooking = async (preBookingOrderId: string) => {
    try {
      await preBookingsApi.cancel(preBookingOrderId);
      await refreshData();
      notifyResourceChanged('prebookings');
      addNotification('partner_update', `Pre-booking order ${preBookingOrderId} cancelled.`, 'prebooking', preBookingOrderId);
      showAlert('Pre-booking cancelled and warehouse stock released.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to cancel pre-booking.');
    }
  };

  // Admin-only: correcting a Delivered pre-booking after the fact - operates
  // on the real order it produced (fulfilled_order_id), same as editing an
  // ordinary Confirmed/Delivered order. Seeds the editable quantity map from
  // the booking's current items so unchanged lines don't need re-picking.
  const handleOpenEditDeliveredPreBooking = (booking: PreBookingOrder) => {
    const seeded: Record<string, BoxPieceQty> = {};
    booking.items.forEach(item => { seeded[item.product_id] = { boxes: item.quantity, pieces: item.quantity_pieces }; });
    setEditDeliveredPreBookingItems(seeded);
    setEditDeliveredPreBookingSearch('');
    setEditingDeliveredPreBookingId(booking.id);
    setViewingPreBooking(null);
    setActiveForm('edit_delivered_prebooking');
  };

  const handleSaveEditDeliveredPreBooking = async (booking: PreBookingOrder) => {
    const items = Object.entries(editDeliveredPreBookingItems)
      .filter(([, qty]) => isPositiveQty(qty))
      .map(([productId, qty]) => {
        // Keep the originally-billed rate for lines that already existed on
        // this booking; only a newly added line gets a fresh rate looked up.
        const originalItem = booking.items.find(i => i.product_id === productId);
        if (originalItem) return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price: originalItem.unit_price, tax_pct: originalItem.tax_pct };
        const product = data.products.find(p => p.id === productId)!;
        return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price: getEffectiveProductPrice(product, 'wholesale', booking.store_id, data.storePricing), tax_pct: product.tax_pct };
      });
    if (items.length === 0) {
      showAlert('A pre-booking must have at least one item.');
      return;
    }
    try {
      await preBookingsApi.editDelivered(booking.id, { items });
      await refreshData();
      notifyResourceChanged('prebookings');
      notifyResourceChanged('orders');
      // A shrunk total can claw back an already-collected payment (see
      // editOrder) - nudge the Payments tab/Total Collections so they
      // reflect the recalculated collection amount immediately.
      notifyResourceChanged('payments');
      addNotification('order_update', `Delivered pre-booking ${booking.id} was edited by an admin. Stock and totals were recalculated.`, 'prebooking', booking.id);
      setEditingDeliveredPreBookingId(null);
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save changes to this pre-booking.');
    }
  };

  const handleDeleteDeliveredPreBooking = (bookingId: string) => setDeletePreBookingConfirmId(bookingId);

  const executeDeleteDeliveredPreBooking = async (bookingId: string) => {
    try {
      await preBookingsApi.removeDelivered(bookingId);
      await refreshData();
      notifyResourceChanged('prebookings');
      notifyResourceChanged('orders');
      // Deleting the linked order also removes its Payment row(s) (see
      // deleteOrder) - nudge the Payments tab/Total Collections so they don't
      // keep showing money tied to a now-deleted order.
      notifyResourceChanged('payments');
      addNotification('order_update', `Delivered pre-booking ${bookingId} was deleted by an admin. Warehouse stock and balances were reversed.`, 'prebooking', bookingId);
      setViewingPreBooking(null);
      setActiveForm('list');
    } catch (e: any) {
      // Close first - the shared alert renders outside any Modal's portal,
      // so it stays hidden behind this still-open Pre-Booking Bill Modal
      // otherwise (same reasoning as the confirmRemoveBill comment above).
      setViewingPreBooking(null);
      showAlert(e.message ?? 'Unable to delete this pre-booking.');
    }
  };

  // Debounced so typing/backspacing in the store search box doesn't re-filter
  // and re-render the whole (potentially large) Stores list on every
  // keystroke - see useDebouncedValue.
  const debouncedStoreSearch = useDebouncedValue(storeSearch, 150);
  const filteredStores = useMemo(() => data.stores.filter(s =>
    (storeListTab === 'inactive' ? s.status === 'Inactive' : s.status === 'Active') &&
    (storeAreaFilter === 'All' || s.area === storeAreaFilter) &&
    (storeVillageFilter === 'All' || s.village === storeVillageFilter) && (
      s.name.toLowerCase().includes(debouncedStoreSearch.toLowerCase()) ||
      s.area.toLowerCase().includes(debouncedStoreSearch.toLowerCase()) ||
      s.owner_name.toLowerCase().includes(debouncedStoreSearch.toLowerCase())
    )
  ), [data.stores, storeListTab, storeAreaFilter, storeVillageFilter, debouncedStoreSearch]);
  // Suggestion pool for the store search box's autocomplete panel.
  const storeSearchSuggestions = useMemo(() => data.stores.filter(s => s.status === 'Active').map(s => s.name), [data.stores]);

  const handleOpenAddStore = () => {
    setStoreForm({
      name: '', owner_name: '', phone: '', alt_phone: '', address: '', area: data.areas[0]?.name || '', village: '',
      city: 'Pune', state: 'Maharashtra', pincode: '411001', gst_number: '',
      credit_limit: 2000, refill_frequency: 'Weekly', custom_days: 7, ranking: 'Silver',
      partner_type: data.partnerTypes.find(t => t.name === 'Retail Shop')?.name || data.partnerTypes[0]?.name || 'Retail Shop',
    });
    setFreezerBoxAssetId('');
    setOriginalFreezerBoxAssetId('');
    setActiveForm('add_store');
  };

  const handleOpenManagePartnerTypes = () => {
    // Remember where this was opened from (the store list header vs. the
    // Partner Type field inside the add/edit form) so "Back" returns to the
    // right place instead of always landing on the add-store form.
    setManagePartnerTypesReturnTo(activeForm === 'add_store' || activeForm === 'edit_store' ? activeForm : 'list');
    setNewPartnerTypeName('');
    setEditingPartnerTypeId(null);
    setActiveForm('manage_partner_types');
  };

  const handleAddPartnerType = async () => {
    const name = newPartnerTypeName.trim();
    if (!name) {
      showAlert('Please enter a partner type name.');
      return;
    }
    if (data.partnerTypes.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      showAlert(`A partner type named "${name}" already exists.`);
      return;
    }
    try {
      await partnerTypesApi.create(name);
      await refreshData();
      addNotification('partner_update', `New partner type added: ${name}.`);
      setNewPartnerTypeName('');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to create partner type.');
    }
  };

  const handleStartEditPartnerType = (typeId: string, currentName: string) => {
    setEditingPartnerTypeId(typeId);
    setEditingPartnerTypeName(currentName);
  };

  const handleSaveEditPartnerType = async () => {
    const newName = editingPartnerTypeName.trim();
    const type = data.partnerTypes.find(t => t.id === editingPartnerTypeId);
    if (!type) { setEditingPartnerTypeId(null); return; }
    if (!newName) {
      showAlert('Partner type name cannot be empty.');
      return;
    }
    if (data.partnerTypes.some(t => t.id !== type.id && t.name.toLowerCase() === newName.toLowerCase())) {
      showAlert(`A partner type named "${newName}" already exists.`);
      return;
    }
    const oldName = type.name;
    try {
      await partnerTypesApi.rename(type.id, newName);
      await refreshData();
      addNotification('partner_update', `Partner type "${oldName}" renamed to "${newName}".`);
      setEditingPartnerTypeId(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to rename partner type.');
    }
  };

  const handleConfirmDeletePartnerType = async () => {
    const typeId = deletePartnerTypeConfirmId;
    const type = data.partnerTypes.find(t => t.id === typeId);
    if (!type || !typeId) { setDeletePartnerTypeConfirmId(null); return; }

    const storesOfType = data.stores.filter(s => s.partner_type === type.name).length;
    if (storesOfType > 0) {
      setDeletePartnerTypeConfirmId(null);
      showAlert(`Cannot delete "${type.name}": ${storesOfType} partner(s) still use this type. Move those partners to a different type first.`);
      return;
    }

    try {
      await partnerTypesApi.remove(typeId);
      await refreshData();
      addNotification('partner_update', `Partner type "${type.name}" deleted.`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to delete partner type.');
    } finally {
      setDeletePartnerTypeConfirmId(null);
    }
  };

  const handleOpenManageAreas = () => {
    setNewAreaName('');
    setEditingAreaId(null);
    setActiveForm('manage_areas');
  };

  const handleAddArea = async () => {
    const name = newAreaName.trim();
    if (!name) {
      showAlert('Please enter a district area name.');
      return;
    }
    if (data.areas.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      showAlert(`A district area named "${name}" already exists.`);
      return;
    }
    try {
      await areasApi.create(name);
      await refreshData();
      addNotification('partner_update', `New district area added: ${name}.`);
      setNewAreaName('');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to create district area.');
    }
  };

  const handleStartEditArea = (areaId: string, currentName: string) => {
    setEditingAreaId(areaId);
    setEditingAreaName(currentName);
  };

  const handleSaveEditArea = async () => {
    const newName = editingAreaName.trim();
    const area = data.areas.find(a => a.id === editingAreaId);
    if (!area) { setEditingAreaId(null); return; }
    if (!newName) {
      showAlert('District area name cannot be empty.');
      return;
    }
    if (data.areas.some(a => a.id !== area.id && a.name.toLowerCase() === newName.toLowerCase())) {
      showAlert(`A district area named "${newName}" already exists.`);
      return;
    }
    const oldName = area.name;
    try {
      await areasApi.rename(area.id, newName);
      await refreshData();
      addNotification('partner_update', `District area "${oldName}" renamed to "${newName}".`);
      setEditingAreaId(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to rename district area.');
    }
  };

  const handleConfirmDeleteArea = async () => {
    const areaId = deleteAreaConfirmId;
    const area = data.areas.find(a => a.id === areaId);
    if (!area || !areaId) { setDeleteAreaConfirmId(null); return; }

    const storesInArea = data.stores.filter(s => s.area === area.name).length;
    if (storesInArea > 0) {
      setDeleteAreaConfirmId(null);
      showAlert(`Cannot delete "${area.name}": ${storesInArea} partner outlet(s) still use this area. Move those outlets to a different area first.`);
      return;
    }

    try {
      await areasApi.remove(areaId);
      await refreshData();
      addNotification('partner_update', `District area "${area.name}" was deleted.`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to delete district area.');
    } finally {
      setDeleteAreaConfirmId(null);
    }
  };

  // Village dropdown management handlers - same pattern as the Area handlers above.
  const handleOpenManageVillages = () => {
    setNewVillageName('');
    setEditingVillageId(null);
    setActiveForm('manage_villages');
  };

  const handleAddVillage = async () => {
    const name = newVillageName.trim();
    if (!name) {
      showAlert('Please enter a village name.');
      return;
    }
    if (data.villages.some(v => v.name.toLowerCase() === name.toLowerCase())) {
      showAlert(`A village named "${name}" already exists.`);
      return;
    }
    try {
      await villagesApi.create(name);
      await refreshData();
      addNotification('partner_update', `New village added: ${name}.`);
      setNewVillageName('');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to create village.');
    }
  };

  const handleStartEditVillage = (villageId: string, currentName: string) => {
    setEditingVillageId(villageId);
    setEditingVillageName(currentName);
  };

  const handleSaveEditVillage = async () => {
    const newName = editingVillageName.trim();
    const village = data.villages.find(v => v.id === editingVillageId);
    if (!village) { setEditingVillageId(null); return; }
    if (!newName) {
      showAlert('Village name cannot be empty.');
      return;
    }
    if (data.villages.some(v => v.id !== village.id && v.name.toLowerCase() === newName.toLowerCase())) {
      showAlert(`A village named "${newName}" already exists.`);
      return;
    }
    const oldName = village.name;
    try {
      await villagesApi.rename(village.id, newName);
      await refreshData();
      addNotification('partner_update', `Village "${oldName}" renamed to "${newName}".`);
      setEditingVillageId(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to rename village.');
    }
  };

  const handleConfirmDeleteVillage = async () => {
    const villageId = deleteVillageConfirmId;
    const village = data.villages.find(v => v.id === villageId);
    if (!village || !villageId) { setDeleteVillageConfirmId(null); return; }

    const storesInVillage = data.stores.filter(s => s.village === village.name).length;
    if (storesInVillage > 0) {
      setDeleteVillageConfirmId(null);
      showAlert(`Cannot delete "${village.name}": ${storesInVillage} partner outlet(s) still use this village. Move those outlets to a different village first.`);
      return;
    }

    try {
      await villagesApi.remove(villageId);
      await refreshData();
      addNotification('partner_update', `Village "${village.name}" was deleted.`);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to delete village.');
    } finally {
      setDeleteVillageConfirmId(null);
    }
  };

  const handleOpenStoreReport = (store: Store) => {
    const todayNow = new Date().toISOString().split('T')[0];
    setStoreReportDateMode('today');
    setStoreReportFrom(todayNow);
    setStoreReportTo(todayNow);
    setStoreReportTab('orders');
    setPaidReportDateMode('today');
    setPaidReportFrom(todayNow);
    setPaidReportTo(todayNow);
    setReportingStore(store);
  };

  const handleOpenOrderFromReport = (order: Order) => {
    setSelectedOrder(order);
    setReturnToStoreReport(reportingStore);
    setReportingStore(null);
    setActiveForm('order_details');
  };

  const handleBackFromOrderDetails = () => {
    setActiveForm('list');
    if (returnToStoreReport) {
      setReportingStore(returnToStoreReport);
      setReturnToStoreReport(null);
    }
  };

  const dateRangeLabel = (mode: DateFilterMode, from: string, to: string) => {
    if (mode === 'today') return 'Today';
    if (mode === 'yesterday') return 'Yesterday';
    if (mode === 'week') return 'This Week';
    if (mode === 'month') return 'This Month';
    if (mode === 'custom') return `${from} to ${to}`;
    return 'All Time (Start to End)';
  };

  const handleExportStoreReport = async () => {
    if (!reportingStore) return;
    const previewWindow = openWebPreviewWindow();
    const storeOrders = data.orders
      .filter(o => o.store_id === reportingStore.id && isWithinDateFilterUtil(o.created_at, storeReportDateMode, storeReportFrom, storeReportTo))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    let totalBoxes = 0, totalPieces = 0, totalPurchaseValue = 0, totalOutstanding = 0;
    const rows = storeOrders.map(o => {
      const inv = data.invoices.find(i => i.order_id === o.id);
      const boxes = o.items.reduce((sum, item) => sum + item.quantity, 0);
      const pieces = o.items.reduce((sum, item) => sum + item.quantity_pieces, 0);
      const grandTotal = inv ? inv.grand_total : computeItemsTotal(o.items).grand_total;
      const due = inv ? Math.max(0, inv.grand_total - (inv.paid_amount || 0)) : 0;
      totalBoxes += boxes;
      totalPieces += pieces;
      totalPurchaseValue += grandTotal;
      totalOutstanding += due;
      return `<tr>
          <td>${o.id}</td>
          <td>${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
          <td style="text-align:center">${formatQty({ boxes, pieces })}</td>
          <td>${o.status}</td>
          <td style="text-align:right">Rs. ${grandTotal.toFixed(2)}</td>
          <td style="text-align:right">Rs. ${due.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const html = renderPdfDocument({
      title: 'PARTNER SHOP PURCHASE REPORT',
      subtitle: `${reportingStore.name} - ${dateRangeLabel(storeReportDateMode, storeReportFrom, storeReportTo)}`,
      bodyHtml: `
        ${renderSummaryLine([
          { label: 'Orders', value: String(storeOrders.length) },
          { label: 'Units Purchased', value: formatQty({ boxes: totalBoxes, pieces: totalPieces }) },
          { label: 'Total Purchase Value', value: `Rs. ${totalPurchaseValue.toFixed(2)}`, accent: true },
          { label: 'Outstanding Balance', value: `Rs. ${totalOutstanding.toFixed(2)}` },
        ])}
        <div class="section-title">Order Details</div>
        <table><thead><tr><th>Order ID</th><th>Date</th><th style="text-align:center">Units</th><th>Status</th><th style="text-align:right">Bill Total</th><th style="text-align:right">Due</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">No orders in this date range.</td></tr>'}</tbody></table>`,
      footerNote: 'This is a computer-generated partner purchase report and requires no physical signature.',
    });
    const fileName = buildPdfFileName('Partner_Purchase_Report', freshReportRef('PSR'));
    await exportHtmlReport(html, fileName, showAlert, previewWindow);
  };

  const handleOpenSupplierReport = (supplier: Supplier) => {
    const todayNow = new Date().toISOString().split('T')[0];
    setSupplierReportDateMode('today');
    setSupplierReportFrom(todayNow);
    setSupplierReportTo(todayNow);
    setSupplierReportSearch('');
    setReportingSupplier(supplier);
  };

  // Supplier purchases (stock inwards) have no payment/due tracking in this
  // app - unlike store orders there's no invoice/paid_amount on a Purchase -
  // so this report only ever shows receipt count/units/spend, never a
  // paid/partial/unpaid status.
  const handleExportSupplierReport = async () => {
    if (!reportingSupplier) return;
    const previewWindow = openWebPreviewWindow();
    const supplierPurchases = data.purchases
      .filter(p => p.supplier_id === reportingSupplier.id && isWithinDateFilterUtil(p.date, supplierReportDateMode, supplierReportFrom, supplierReportTo))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let totalBoxes = 0, totalPieces = 0, totalSpendVal = 0;
    const rows = supplierPurchases.map(p => {
      const boxes = p.items.reduce((sum, item) => sum + item.quantity, 0);
      const pieces = p.items.reduce((sum, item) => sum + item.quantity_pieces, 0);
      const value = p.items.reduce((sum, item) => {
        return sum + purchaseLineValue(item, item.purchase_price);
      }, 0);
      totalBoxes += boxes;
      totalPieces += pieces;
      totalSpendVal += value;
      return `<tr>
          <td>${p.invoice_number}</td>
          <td>${new Date(p.date).toLocaleDateString('en-IN')}</td>
          <td style="text-align:center">${p.items.length}</td>
          <td style="text-align:center">${formatQty({ boxes, pieces })}</td>
          <td style="text-align:right">Rs. ${value.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const html = renderPdfDocument({
      title: 'SUPPLY PARTNER PURCHASE REPORT',
      subtitle: `${reportingSupplier.name} - ${dateRangeLabel(supplierReportDateMode, supplierReportFrom, supplierReportTo)}`,
      bodyHtml: `
        ${renderSummaryLine([
          { label: 'Receipts', value: String(supplierPurchases.length) },
          { label: 'Units Received', value: formatQty({ boxes: totalBoxes, pieces: totalPieces }) },
          { label: 'Total Spend', value: `Rs. ${totalSpendVal.toFixed(2)}`, accent: true },
        ])}
        <div class="section-title">Stock Inward Receipts</div>
        <table><thead><tr><th>Invoice #</th><th>Date</th><th style="text-align:center">SKUs</th><th style="text-align:center">Units</th><th style="text-align:right">Value</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8">No stock inwards in this date range.</td></tr>'}</tbody></table>`,
      footerNote: 'This is a computer-generated supplier purchase report and requires no physical signature.',
    });
    const fileName = buildPdfFileName('Supplier_Purchase_Report', freshReportRef('SPR'));
    await exportHtmlReport(html, fileName, showAlert, previewWindow);
  };

  // Rebuilds the local edit state (the table/grid's source of truth) for a
  // store from a given data snapshot. Takes an explicit snapshot rather than
  // reading the `data` prop directly so callers that just awaited
  // refreshData() can pass its freshly-resolved result straight in - the
  // `data` prop closure inside an async handler is still the pre-refresh
  // snapshot until this component re-renders with new props.
  const syncPricingEditState = (store: Store, snapshot: ERPData) => {
    const overrides = snapshot.storePricing.filter(sp => sp.store_id === store.id);
    const edits: Record<string, { wholesale: string; retail: string; wholesalePrice: string; retailPrice: string }> = {};
    overrides.forEach(sp => {
      const product = snapshot.products.find(p => p.id === sp.product_id);
      if (!product) return;
      const wholesalePct = getEffectiveDiscountPct(product, 'wholesale', sp);
      const retailPct = getEffectiveDiscountPct(product, 'retail', sp);
      edits[sp.product_id] = {
        wholesale: String(wholesalePct),
        retail: String(retailPct),
        wholesalePrice: priceFromDiscount(product.mrp, wholesalePct).toFixed(2),
        retailPrice: priceFromDiscount(product.mrp, retailPct).toFixed(2),
      };
    });
    setStorePricingEdits(edits);
    setPricingProductIds(overrides.map(sp => sp.product_id));
  };

  const handleOpenStorePricing = (store: Store) => {
    setPricingStore(store);
    setProductPricingSearch('');
    setPricingReturnTo('list');
    syncPricingEditState(store, data);
    setActiveForm('store_pricing');
  };

  // Shared by "Add Custom Price" (picks the next unpriced product) and the
  // Create Order product-row pencil icon (picks a specific product) - seeds
  // a new pricing row from the product's current catalog rate so the admin
  // edits from a sane starting point instead of blank/zero fields.
  const addPricingProductRow = (product: Product) => {
    setStorePricingEdits(prev => ({
      ...prev,
      [product.id]: {
        wholesale: String(product.wholesale_discount_pct), retail: String(product.retail_discount_pct),
        wholesalePrice: product.wholesale_price.toFixed(2), retailPrice: product.selling_price.toFixed(2),
      },
    }));
    setPricingProductIds(prev => (prev.includes(product.id) ? prev : [...prev, product.id]));
  };

  const handleAddPricingProductRow = () => {
    const nextProduct = data.products.filter(p => p.status === 'Active').find(p => !pricingProductIds.includes(p.id));
    if (!nextProduct) {
      showAlert('Every active product already has custom pricing for this outlet.');
      return;
    }
    addPricingProductRow(nextProduct);
  };

  // Opens Custom Pricing for one specific product (from the Create Order
  // product row's pencil icon) rather than the general Stores-list entry
  // point - adds a row for that exact product if it doesn't already have a
  // custom price, filters the list straight to it, and remembers to return
  // to the order draft (preserved automatically, since only activeForm
  // changes - see leaveStorePricing()) instead of the Partner Outlets list.
  const handleOpenStorePricingForProduct = (store: Store, product: Product, returnTo: 'list' | 'create_order') => {
    setPricingStore(store);
    syncPricingEditState(store, data);
    const hasOverride = data.storePricing.some(sp => sp.store_id === store.id && sp.product_id === product.id);
    if (!hasOverride) addPricingProductRow(product);
    setProductPricingSearch(product.name);
    setPricingReturnTo(returnTo);
    setActiveForm('store_pricing');
  };

  const handleChangePricingProduct = (oldProductId: string, newProductId: string) => {
    if (oldProductId === newProductId) return;
    const newProduct = data.products.find(p => p.id === newProductId);
    setStorePricingEdits(prev => {
      const { [oldProductId]: _removed, ...rest } = prev;
      return {
        ...rest,
        [newProductId]: newProduct
          ? { wholesale: String(newProduct.wholesale_discount_pct), retail: String(newProduct.retail_discount_pct), wholesalePrice: newProduct.wholesale_price.toFixed(2), retailPrice: newProduct.selling_price.toFixed(2) }
          : emptyPricingEdit,
      };
    });
    setPricingProductIds(prev => prev.map(id => (id === oldProductId ? newProductId : id)));
  };

  const handleRemovePricingProduct = async (productId: string) => {
    if (!pricingStore) return;
    const hasOverride = data.storePricing.some(sp => sp.store_id === pricingStore.id && sp.product_id === productId);
    if (hasOverride) {
      await handleResetStorePricingRow(productId);
    }
    setPricingProductIds(prev => prev.filter(id => id !== productId));
  };

  const isPricingRowDirty = (product: Product): boolean => {
    if (!pricingStore) return false;
    const override = data.storePricing.find(sp => sp.store_id === pricingStore.id && sp.product_id === product.id);
    // A row with no saved override yet is a brand-new addition - it has
    // nothing to compare against, so it's always unsaved until the user
    // saves it, even if they haven't touched the pre-filled catalog %.
    if (!override) return true;
    const edit = storePricingEdits[product.id] || emptyPricingEdit;
    const baselineWholesale = String(getEffectiveDiscountPct(product, 'wholesale', override));
    if (edit.wholesale.trim() !== baselineWholesale) return true;
    if (retailEnabled) {
      const baselineRetail = String(getEffectiveDiscountPct(product, 'retail', override));
      if (edit.retail.trim() !== baselineRetail) return true;
    }
    return false;
  };

  const getDirtyPricingProductIds = (): string[] =>
    pricingProductIds.filter(id => {
      const product = data.products.find(p => p.id === id);
      return product ? isPricingRowDirty(product) : false;
    });

  const leaveStorePricing = () => {
    setShowUnsavedPricingModal(false);
    setPricingStore(null);
    if (pricingReturnTo === 'create_order') {
      setPricingReturnTo('list');
      setActiveForm('create_order');
    } else {
      setActiveForm('list');
    }
  };

  const handleBackFromStorePricing = () => {
    if (getDirtyPricingProductIds().length > 0) {
      setShowUnsavedPricingModal(true);
      return;
    }
    leaveStorePricing();
  };

  const saveAllDirtyPricingRows = async () => {
    for (const productId of getDirtyPricingProductIds()) {
      await handleSaveStorePricingRow(productId);
    }
  };

  const handleSaveAllPricingAndLeave = async () => {
    await saveAllDirtyPricingRows();
    leaveStorePricing();
  };

  const handleSaveStorePricingRow = async (productId: string) => {
    if (!pricingStore) return;
    const product = data.products.find(p => p.id === productId);
    if (!product) return;
    const edit = storePricingEdits[productId] || emptyPricingEdit;
    const wholesalePct = edit.wholesale.trim() === '' ? null : Math.max(0, Math.min(100, parseFloat(edit.wholesale)));
    const retailPct = edit.retail.trim() === '' ? null : Math.max(0, Math.min(100, parseFloat(edit.retail)));
    if ((edit.wholesale.trim() !== '' && isNaN(wholesalePct as number)) || (edit.retail.trim() !== '' && isNaN(retailPct as number))) {
      showAlert('Please enter valid discount percentages (0-100).');
      return;
    }
    try {
      await storePricingApi.upsert({ store_id: pricingStore.id, product_id: productId, wholesale_discount_pct: wholesalePct, retail_discount_pct: retailPct });
      await refreshData();
      addNotification('partner_update', `Custom pricing updated for ${product.name} at ${pricingStore.name}.`, 'store', pricingStore.id);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save custom pricing.');
    }
  };

  const handleResetStorePricingRow = async (productId: string) => {
    if (!pricingStore) return;
    const existing = data.storePricing.find(sp => sp.store_id === pricingStore.id && sp.product_id === productId);
    const product = data.products.find(p => p.id === productId);
    setStorePricingEdits(prev => ({
      ...prev,
      [productId]: product
        ? { wholesale: String(product.wholesale_discount_pct), retail: String(product.retail_discount_pct), wholesalePrice: product.wholesale_price.toFixed(2), retailPrice: product.selling_price.toFixed(2) }
        : emptyPricingEdit,
    }));
    if (!existing) return;
    try {
      await storePricingApi.remove(existing.id);
      await refreshData();
      addNotification('partner_update', `Custom pricing reset to catalog rate for ${product?.name || 'product'} at ${pricingStore.name}.`, 'store', pricingStore.id);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to reset custom pricing.');
    }
  };

  const handleOpenClonePricing = () => {
    setCloneTargetStoreIds([]);
    setCloneStoreSearch('');
    setShowClonePricingModal(true);
  };

  const toggleClonePricingTarget = (storeId: string) => {
    setCloneTargetStoreIds(prev => (prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId]));
  };

  const handleConfirmClonePricing = async () => {
    if (!pricingStore) return;
    if (cloneTargetStoreIds.length === 0) {
      showAlert('Select at least one destination store to clone this pricing to.');
      return;
    }
    try {
      await storePricingApi.clone({ source_store_id: pricingStore.id, target_store_ids: cloneTargetStoreIds });
      await refreshData();
      setShowClonePricingModal(false);
      const targetNames = data.stores.filter(s => cloneTargetStoreIds.includes(s.id)).map(s => s.name).join(', ');
      addNotification('partner_update', `Cloned ${pricingStore.name}'s custom pricing to: ${targetNames}.`, 'store', pricingStore.id);
      showAlert({ type: 'success', message: `Custom pricing cloned to ${cloneTargetStoreIds.length} store(s).` });
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to clone custom pricing.');
    }
  };

  const handleOpenCloneFromPricing = () => {
    setCloneSourceStoreId('');
    setCloneFromStoreSearch('');
    setShowCloneFromModal(true);
  };

  const handleConfirmCloneFromPricing = async () => {
    if (!pricingStore) return;
    if (!cloneSourceStoreId) {
      showAlert('Select a store to clone custom pricing from.');
      return;
    }
    const sourceStore = data.stores.find(s => s.id === cloneSourceStoreId);
    try {
      await storePricingApi.clone({ source_store_id: cloneSourceStoreId, target_store_ids: [pricingStore.id] });
      const fresh = await refreshData();
      syncPricingEditState(pricingStore, fresh);
      setShowCloneFromModal(false);
      addNotification('partner_update', `Cloned ${sourceStore?.name || 'store'}'s custom pricing into ${pricingStore.name}.`, 'store', pricingStore.id);
      showAlert({ type: 'success', message: `Custom pricing cloned from ${sourceStore?.name || 'the selected store'}.` });
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to clone custom pricing.');
    }
  };

  const handleSaveStore = async () => {
    if (!storeForm.name || !storeForm.phone) {
      showAlert('Store name and primary phone are required.');
      return;
    }
    const isNew = activeForm === 'add_store';

    try {
      let storeId: string;
      if (isNew) {
        const created = await storesApi.create(storeForm);
        storeId = created.id;
        await refreshData();
        addNotification('partner_update', `New client store registered: ${storeForm.name}`, 'store', created.id);
      } else {
        storeId = selectedStore!.id;
        await storesApi.update(selectedStore!.id, storeForm);
        await refreshData();
        addNotification('partner_update', `Store details updated for ${storeForm.name}.`, 'store', selectedStore!.id);
      }

      // Freezer Box assignment shortcut - only touch it if the selection
      // actually changed from what the form opened with, and keep any
      // failure here separate from the store save itself (which already
      // succeeded at this point).
      if (freezerBoxAssetId !== originalFreezerBoxAssetId) {
        try {
          if (originalFreezerBoxAssetId) await assetsApi.return(originalFreezerBoxAssetId);
          if (freezerBoxAssetId) {
            await assetsApi.assign(freezerBoxAssetId, { partner_id: storeId });
            addNotification('partner_update', `Assigned freezer box to ${storeForm.name}.`, 'asset', freezerBoxAssetId);
          }
          refetchPartnerAssets();
        } catch (e: any) {
          showAlert(e.message ?? 'Store saved, but updating the freezer box assignment failed.');
        }
      }

      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save store.');
    }
  };

  const handleReactivateStore = async (storeId: string) => {
    const store = data.stores.find(s => s.id === storeId);
    if (!store) return;
    try {
      await storesApi.setStatus(storeId, 'Active');
      await refreshData();
      addNotification('partner_update', `Partner store "${store.name}" has been reactivated.`, 'store', storeId);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to reactivate store.');
    }
  };

  const handleCancelOrder = (orderId: string) => setCancelOrderConfirmId(orderId);

  const executeCancelOrder = async (orderId: string) => {
    try {
      await ordersApi.cancel(orderId);
      await refreshData();
      notifyResourceChanged('orders');
      addNotification('order_update', `Order ID ${orderId} has been CANCELLED.`, 'order', orderId);
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to cancel order.');
    }
  };

  const handleConfirmDraftOrder = async (orderId: string) => {
    try {
      await ordersApi.confirmDraft(orderId);
      await refreshData();
      notifyResourceChanged('orders');
      addNotification('order_update', `Order ID ${orderId} has been CONFIRMED & stock reserved.`, 'order', orderId);
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to confirm order.');
    }
  };

  const handleDeliverConfirmedOrder = async (orderId: string) => {
    try {
      await ordersApi.deliverConfirmed(orderId);
      await refreshData();
      notifyResourceChanged('orders');
      addNotification('delivery', `Order ID ${orderId} marked as Delivered.`, 'order', orderId);
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to deliver order.');
    }
  };

  // Admin-only: correcting a Confirmed/Delivered order after the fact.
  // Seeds the editable quantity map from the order's current items so
  // unchanged lines don't need to be re-picked.
  const handleOpenEditOrder = (order: Order) => {
    const seeded: Record<string, BoxPieceQty> = {};
    order.items.forEach(item => { seeded[item.product_id] = { boxes: item.quantity, pieces: item.quantity_pieces }; });
    setEditOrderItems(seeded);
    setEditOrderProductSearch('');
    setActiveForm('edit_order');
  };

  const handleSaveEditOrder = async () => {
    if (!selectedOrder) return;
    const items = Object.entries(editOrderItems)
      .filter(([, qty]) => isPositiveQty(qty))
      .map(([productId, qty]) => {
        // Keep the originally-billed rate for lines that already existed on
        // this order (editing quantity shouldn't silently re-price it against
        // whatever the catalog rate happens to be today); only a newly added
        // line gets a fresh rate looked up.
        const originalItem = selectedOrder.items.find(i => i.product_id === productId);
        if (originalItem) return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price: originalItem.unit_price, tax_pct: originalItem.tax_pct };
        const product = data.products.find(p => p.id === productId)!;
        return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price: getEffectiveProductPrice(product, 'wholesale', selectedOrder.store_id, data.storePricing), tax_pct: product.tax_pct };
      });
    if (items.length === 0) {
      showAlert('An order must have at least one item.');
      return;
    }
    try {
      await ordersApi.edit(selectedOrder.id, { items });
      await refreshData();
      notifyResourceChanged('orders');
      // A shrunk total can claw back an already-collected payment (see
      // editOrder) - nudge the Payments tab/Total Collections so they
      // reflect the recalculated collection amount immediately.
      notifyResourceChanged('payments');
      addNotification('order_update', `Order ID ${selectedOrder.id} was edited by an admin. Stock and totals were recalculated.`, 'order', selectedOrder.id);
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to save changes to this order.');
    }
  };

  const handleDeleteOrder = (orderId: string) => setDeleteOrderConfirmId(orderId);

  const executeDeleteOrder = async (orderId: string) => {
    try {
      await ordersApi.remove(orderId);
      await refreshData();
      notifyResourceChanged('orders');
      // Deleting the order also removes its Payment row(s) (see deleteOrder)
      // - nudge the Payments tab/Total Collections so they don't keep
      // showing money tied to a now-deleted order.
      notifyResourceChanged('payments');
      addNotification('order_update', `Order ID ${orderId} was deleted by an admin. Warehouse stock and balances were reversed.`, 'order', orderId);
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to delete this order.');
    }
  };

  const resetNewOrderForm = () => {
    setNewOrderItems({});
    setNewOrderItemOrder([]);
    setShowNewOrderPaymentModal(false);
    setShowConfirmOrderDialog(false);
    setNewOrderPricingMode('wholesale');
    setNewOrderGstMode('with_gst');
    setNewOrderProductSearch('');
  };

  const handleOpenCreateOrder = (preselectStoreId?: string) => {
    setNewOrderStoreId(preselectStoreId || data.stores.find(s => s.status === 'Active')?.id || '');
    // A preselected store only ever comes from the Assets screen's "Order"
    // button (see the initialCreateOrderStoreId effect above) - remembered
    // here so Cancel below knows to return there instead of the Orders list.
    setCreateOrderReturnToAssets(!!preselectStoreId);
    resetNewOrderForm();
    setActiveForm('create_order');
  };

  // Only builds the order draft and navigates to the Order Confirmation
  // page — nothing is sent to the backend yet, and the payment modal
  // doesn't open until the admin reviews the bill there and hits "Confirm
  // Order" (handleProceedToPayment). The order is only actually created
  // once a payment outcome is confirmed in handleSettleNewOrder(), so
  // backing out anywhere in this review flow truly cancels the order
  // instead of leaving a dangling unpaid one behind.
  // Built from newOrderItemOrder (selection order), not Object.entries, so
  // the bill/invoice/payment steps all show items in the order the admin
  // actually picked them rather than alphabetically or by object-key order.
  // Reads newOrderGstMode live, so both the picker's running estimate and
  // the final order/invoice always reflect the current GST toggle state.
  const buildNewOrderItemsList = () => {
    return newOrderItemOrder
      .map(productId => {
        const qty = newOrderItems[productId] ?? { boxes: 0, pieces: 0 };
        if (!isPositiveQty(qty)) return null;
        const p = data.products.find(prod => prod.id === productId)!;
        const unit_price = getEffectiveProductPrice(p, effectiveNewOrderPricingMode, newOrderStoreId, data.storePricing);
        const tax_pct = canToggleGst && newOrderGstMode === 'without_gst' ? 0 : p.tax_pct;
        return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price, tax_pct };
      })
      .filter((item): item is { product_id: string; quantity: number; quantity_pieces: number; unit_price: number; tax_pct: number } => item !== null);
  };

  const handleCreateNewOrder = () => {
    if (!newOrderStoreId) {
      showAlert('Please select a store for this order.');
      return;
    }
    const activeItems = buildNewOrderItemsList();
    if (activeItems.length === 0) {
      showAlert('Please add at least one ice cream item to create an order.');
      return;
    }
    const store = data.stores.find(s => s.id === newOrderStoreId);
    // Same total/tax/grand-total/round-off math the backend uses, so the
    // bill total shown here matches what actually gets created.
    const { grand_total: grandTotal, round_off: roundOff } = computeItemsTotal(activeItems);

    setPendingNewOrder({ items: activeItems, storeId: newOrderStoreId, grandTotal, roundOff, storeName: store?.name || 'Store' });
    setNewOrderSettleAmount(grandTotal);
    setNewOrderSettleMethod('UPI');
    setActiveForm('order_confirmation');
  };

  // Discards the draft entirely and returns to the picker — the already
  // chosen quantities are still sitting in newOrderItems/newOrderItemOrder,
  // so nothing needs to be re-picked.
  const handleBackFromOrderConfirmation = () => {
    setPendingNewOrder(null);
    setActiveForm('create_order');
  };

  // Only reached once the admin has reviewed the full bill on the Order
  // Confirmation page — opens the payment-collection modal on top of it.
  const handleProceedToPayment = () => {
    setShowNewOrderPaymentModal(true);
  };

  const handleSettleNewOrder = async () => {
    if (!pendingNewOrder) return;
    const { items, storeId, grandTotal, storeName } = pendingNewOrder;
    const isUnpaid = newOrderSettleMethod === 'Credit' || newOrderSettleAmount <= 0;
    const isPartial = !isUnpaid && newOrderSettleAmount < grandTotal - 0.05;
    const paymentSummary = isUnpaid
      ? 'No payment collected — full amount added to store credit.'
      : isPartial
        ? `Partially paid Rs. ${newOrderSettleAmount.toFixed(2)} of ${formatWholeRupees(grandTotal)} via ${newOrderSettleMethod} — balance added to store credit.`
        : `Fully paid Rs. ${newOrderSettleAmount.toFixed(2)} via ${newOrderSettleMethod}.`;

    let createdOrderId: string | null = null;
    try {
      // Admin orders are sourced directly from warehouse stock (no truck_id),
      // unlike the Salesperson/Driver flow which always sells out of their
      // assigned truck's loaded cargo. The order is only created here, once
      // the payment outcome is confirmed.
      const result = await ordersApi.create({ store_id: storeId, salesperson_id: currentUser?.id || 'admin', items });
      createdOrderId = result.order.id;
      await ordersApi.settle(result.order.id, { method: newOrderSettleMethod, amount: newOrderSettleAmount });
      await refreshData();
      notifyResourceChanged('orders');
      // Single combined notification (order + payment outcome) fired only
      // once settlement is decided, instead of an earlier "order created"
      // notification plus a separate un-tracked alert for the payment.
      addNotification('new_order', `Order created for ${storeName}. Grand Total: ${formatWholeRupees(grandTotal)}. ${paymentSummary}`, 'order', createdOrderId!);
      showAlert(`Order created for ${storeName}. Grand Total: ${formatWholeRupees(grandTotal)}. Payment recorded successfully!`);
      resetNewOrderForm();
      setPendingNewOrder(null);
      setActiveForm('list');
    } catch (e: any) {
      if (createdOrderId) {
        // Order creation succeeded but recording the payment failed — the
        // order already exists, so surface that rather than pretending
        // nothing happened.
        await refreshData();
        notifyResourceChanged('orders');
        addNotification('new_order', `Order created for ${storeName}. Grand Total: ${formatWholeRupees(grandTotal)}. Payment recording failed — left as outstanding credit.`, 'order', createdOrderId);
        showAlert(e.message ?? 'Order created, but recording the payment failed. You can settle it later from Credit.');
        resetNewOrderForm();
        setPendingNewOrder(null);
        setActiveForm('list');
      } else {
        // Close first - a still-open payment Modal would otherwise hide the
        // shared alert, which renders outside any Modal's portal. The cart
        // itself (pendingNewOrder) is kept so the user can retry, same as
        // handleSkipNewOrderPayment's Back behavior.
        setShowNewOrderPaymentModal(false);
        showAlert(e.message ?? 'Unable to create the order. Please try again.');
      }
    }
  };

  // Nothing has been sent to the backend yet at this point, so Back simply
  // closes the payment modal and drops back to the Order Confirmation page
  // (the draft itself is untouched) — no order is left behind.
  const handleSkipNewOrderPayment = () => {
    setShowNewOrderPaymentModal(false);
  };

  const handleSavePayment = async () => {
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
      showAlert(`Only Rs. ${amountOwed.toFixed(2)} is owed ${selectedInv ? 'on this invoice' : 'by this store'} — the collected amount has been capped to that.`);
    }

    try {
      const result = await paymentsApi.create({
        store_id: paymentForm.store_id,
        invoice_id: paymentForm.invoice_id !== 'general' ? paymentForm.invoice_id : undefined,
        amount: payAmount, method: paymentForm.method,
      });
      await refreshData();
      addNotification('payment_received', `Payment of Rs. ${result.actualCollection.toFixed(2)} received from ${store.name}.`, 'store', store.id);
      setActiveForm('list');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to record payment.');
    }
  };

  const downloadInvoicePDF = async (order: Order, invoice: Invoice, store: Store) => {
    const previewWindow = openWebPreviewWindow();
    const { html, fileName } = buildOrderInvoicePdf(order, invoice, store, data.products, data.qrCodeSettings);
    await exportHtmlReport(html, fileName, showAlert, previewWindow);
  };

  const handleDownloadPreBookingPdf = async (booking: PreBookingOrder) => {
    const store = data.stores.find(s => s.id === booking.store_id);
    if (!store) { showAlert('Unable to find the partner store for this pre-booking.'); return; }
    const previewWindow = openWebPreviewWindow();
    const { html, fileName } = buildPreBookingBillPdf(booking, store, data.products, data.qrCodeSettings);
    await exportHtmlReport(html, fileName, showAlert, previewWindow);
  };

  const handleWhatsAppShare = (inv: Invoice, store: Store, order?: Order) => {
    const phoneClean = store.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = phoneClean.length === 10 ? `91${phoneClean}` : phoneClean;
    let itemDetails = '';
    if (order) {
      itemDetails = '\n\n*Items Ordered:*' + order.items.map(item => {
        const p = data.products.find(prod => prod.id === item.product_id);
        return `\n- ${p?.name || 'Product'}: ${formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x ${formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)} = Rs. ${(effectiveLineValue(item, item.unit_price)).toFixed(2)}`;
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

  const getInactiveStores = (days: number) => {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - days);
    return data.stores.filter(s => {
      if (!s.last_purchase_date) return true;
      return new Date(s.last_purchase_date) < limitDate;
    });
  };

  const storeOptions = data.stores.filter(s => s.status === 'Active').map(s => ({ label: `${s.name} (${s.owner_name})`, value: s.id }));
  const preBookingStoreOptions = storeOptions.some(o => o.value === preBookingStoreId)
    ? storeOptions
    : [...storeOptions, ...data.stores.filter(s => s.id === preBookingStoreId).map(s => ({ label: `${s.name} (${s.owner_name})`, value: s.id }))];
  const getWarehouseStock = (productId: string): BoxPieceQty => readQtyField(data.warehouse_inventory.find(inv => inv.product_id === productId), 'available_qty', 'available_pieces');
  const areaOptions = data.areas.some(a => a.name === storeForm.area)
    ? data.areas.map(a => ({ label: a.name, value: a.name }))
    : [...data.areas.map(a => ({ label: a.name, value: a.name })), ...(storeForm.area ? [{ label: storeForm.area, value: storeForm.area }] : [])];
  const villageOptions = data.villages.some(v => v.name === storeForm.village)
    ? data.villages.map(v => ({ label: v.name, value: v.name }))
    : [...data.villages.map(v => ({ label: v.name, value: v.name })), ...(storeForm.village ? [{ label: storeForm.village, value: storeForm.village }] : [])];
  const partnerTypeOptions = data.partnerTypes.some(t => t.name === storeForm.partner_type)
    ? data.partnerTypes.map(t => ({ label: t.name, value: t.name }))
    : [...data.partnerTypes.map(t => ({ label: t.name, value: t.name })), ...(storeForm.partner_type ? [{ label: storeForm.partner_type, value: storeForm.partner_type }] : [])];
  // Freezer boxes selectable here: sitting free (Warehouse/Returned/
  // Maintenance) plus whichever one is already assigned to the store being
  // edited (so it still shows as the current selection, not just vanishes).
  const freezerBoxOptions = [
    { label: 'None', value: '' },
    ...partnerAssets
      .filter(a => a.asset_type === 'Freezer Box' && (['Warehouse', 'Returned', 'Maintenance'].includes(a.status) || a.id === originalFreezerBoxAssetId))
      .map(a => ({ label: `${a.code} - ${a.name}`, value: a.id })),
  ];
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

  // Switching the in-page tab strip (as opposed to the sidebar/activeScreen,
  // handled above) still needs to drop any popup left open from the
  // previous tab - these are all rendered independently of salesTab, so
  // they'd otherwise stay visible on top of whichever tab was just picked.
  const handleSalesTabSelect = (tab: typeof salesTab) => {
    setViewingStore(null);
    setReportingStore(null);
    setViewingSupplier(null);
    setReportingSupplier(null);
    setViewingPreBooking(null);
    setDeleteStoreConfirmId(null);
    setDeleteSupplierConfirmId(null);
    setDeleteOrderConfirmId(null);
    setDeletePreBookingConfirmId(null);
    setCancelOrderConfirmId(null);
    setPreBookingConfirmAction(null);
    setSalesTab(tab);
  };

  return (
    <View className="gap-4">
      {activeForm === 'list' && !hideAdminControls && (
        <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
          {(['stores', 'suppliers', 'orders', 'prebookings', 'payments', 'credit', 'refill', 'inactive'] as const).map(tab => (
            <Pressable key={tab} onPress={() => handleSalesTabSelect(tab)} className={`py-1 px-2.5 rounded-lg ${salesTab === tab ? 'bg-indigo-600' : ''}`}>
              <Text className={`text-[10px] font-extrabold capitalize ${salesTab === tab ? 'text-white' : 'text-slate-500'}`}>
                {tab === 'inactive' ? 'Inactive Partners' : tab === 'stores' ? 'Partners' : tab === 'suppliers' ? 'Supply Partners' : tab === 'prebookings' ? 'Pre-Bookings' : tab}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {activeForm === 'add_store' || activeForm === 'edit_store' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-3xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">{activeForm === 'add_store' ? 'Register Client Partner Store' : 'Edit Store Details'}</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Store Outlet Name</Text><TextInput value={storeForm.name} onChangeText={v => setStoreForm({ ...storeForm, name: v })} placeholder="e.g. Ice Cream Junction" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Owner Name</Text><TextInput value={storeForm.owner_name} onChangeText={v => setStoreForm({ ...storeForm, owner_name: v })} placeholder="e.g. Rajesh Kumar" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Primary Phone</Text><TextInput value={storeForm.phone} onChangeText={v => setStoreForm({ ...storeForm, phone: v })} placeholder="+91 7373674757" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">GST/TAX Reg Number</Text><TextInput value={storeForm.gst_number} onChangeText={v => setStoreForm({ ...storeForm, gst_number: v })} placeholder="27AAAAA0000A1Z5" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View>
            <Text className="font-bold text-slate-500 mb-1 text-xs">Address Location</Text>
            <TextInput value={storeForm.address} onChangeText={v => setStoreForm({ ...storeForm, address: v })} className={inputClass} />
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">District Area</Text><SelectField value={storeForm.area} onValueChange={v => setStoreForm({ ...storeForm, area: v })} options={areaOptions} title="Select Area" searchable className={inputClass + ' flex-row items-center justify-between'} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Village</Text><SelectField value={storeForm.village} onValueChange={v => setStoreForm({ ...storeForm, village: v })} options={villageOptions} title="Select Village" searchable className={inputClass + ' flex-row items-center justify-between'} /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Credit Limit (Rs)</Text><TextInput keyboardType="number-pad" value={storeForm.credit_limit === 0 ? '' : String(storeForm.credit_limit)} onChangeText={v => setStoreForm({ ...storeForm, credit_limit: Number(v) || 0 })} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Ranking</Text><SelectField value={storeForm.ranking} onValueChange={v => setStoreForm({ ...storeForm, ranking: v as any })} options={rankingOptions} title="Select Ranking" className={inputClass + ' flex-row items-center justify-between'} /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Refill Interval</Text><SelectField value={storeForm.refill_frequency} onValueChange={v => setStoreForm({ ...storeForm, refill_frequency: v as any })} options={refillOptions} title="Select Interval" className={inputClass + ' flex-row items-center justify-between'} /></View>
            {storeForm.refill_frequency === 'Custom' && (
              <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Interval Days</Text><TextInput keyboardType="number-pad" value={storeForm.custom_days === 0 ? '' : String(storeForm.custom_days)} onChangeText={v => setStoreForm({ ...storeForm, custom_days: Number(v) || 0 })} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass + ' text-center'} /></View>
            )}
            <View className="flex-1">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-bold text-slate-500 text-xs">Partner Type</Text>
                <Pressable onPress={handleOpenManagePartnerTypes}><Text className="text-[10px] font-bold text-indigo-600">Manage</Text></Pressable>
              </View>
              <SelectField value={storeForm.partner_type} onValueChange={v => setStoreForm({ ...storeForm, partner_type: v })} options={partnerTypeOptions} title="Select Partner Type" className={inputClass + ' flex-row items-center justify-between'} />
            </View>
          </View>
          <View>
            <Text className="font-bold text-slate-500 mb-1 text-xs">Freezer Box (Optional)</Text>
            <SelectField value={freezerBoxAssetId} onValueChange={setFreezerBoxAssetId} options={freezerBoxOptions} title="Select Freezer Box" className={inputClass + ' flex-row items-center justify-between'} />
            <Text className="text-[9px] text-slate-400 mt-1">Defaults to None. Pick one of the available freezer boxes to assign it to this partner.</Text>
          </View>
          <Pressable onPress={handleSaveStore} className="w-full py-2.5 bg-rose-500 rounded-xl items-center active:bg-rose-600">
            <Text className="text-white font-bold text-xs">Save Partner Store Specs</Text>
          </Pressable>
        </View>
      ) : activeForm === 'manage_partner_types' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Manage Partner Types</Text>
            <Pressable onPress={() => setActiveForm(managePartnerTypesReturnTo)} className="bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200">
              <Text className="text-slate-500 font-bold text-xs">{managePartnerTypesReturnTo === 'list' ? 'Back to Partners' : 'Back to Partner Form'}</Text>
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <TextInput
              value={newPartnerTypeName}
              onChangeText={setNewPartnerTypeName}
              placeholder="New partner type name..."
              placeholderTextColor="#94a3b8"
              className={inputClass + ' flex-1'}
            />
            <Pressable onPress={handleAddPartnerType} className="bg-rose-500 px-4 rounded-lg items-center justify-center active:bg-rose-600">
              <Text className="text-white font-bold text-xs">Add</Text>
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold text-slate-400 uppercase">{data.partnerTypes.length} Partner Type{data.partnerTypes.length === 1 ? '' : 's'}</Text>
            <ViewToggle />
          </View>

          {viewMode === 'table' ? (
            <DataTable
              data={data.partnerTypes}
              keyExtractor={t => t.id}
              emptyText="No partner types yet."
              columns={[
                {
                  key: 'name', label: 'Partner Type', width: 220,
                  render: (type: PartnerType) => {
                    const isDefault = type.name === 'Retail Shop';
                    return editingPartnerTypeId === type.id ? (
                      <TextInput value={editingPartnerTypeName} onChangeText={setEditingPartnerTypeName} autoFocus className="bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800" />
                    ) : (
                      <Text className="font-bold text-slate-800 text-xs" numberOfLines={1}>{type.name}{isDefault ? ' (Default)' : ''}</Text>
                    );
                  },
                },
                {
                  key: 'partners', label: 'Partners', width: 90, align: 'center' as const, grow: false,
                  render: (type: PartnerType) => <Text className="text-[10px] text-slate-500 text-center">{data.stores.filter(s => s.partner_type === type.name).length}</Text>,
                },
                {
                  key: 'actions', label: 'Actions', width: 100, grow: false,
                  render: (type: PartnerType) => {
                    const isDefault = type.name === 'Retail Shop';
                    if (editingPartnerTypeId === type.id) {
                      return (
                        <View className="flex-row gap-1.5">
                          <Pressable onPress={handleSaveEditPartnerType} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100"><Check size={14} color="#059669" /></Pressable>
                          <Pressable onPress={() => setEditingPartnerTypeId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><X size={14} color="#64748b" /></Pressable>
                        </View>
                      );
                    }
                    if (isDefault) return <Text className="text-[9px] text-slate-300 italic">Locked</Text>;
                    return (
                      <View className="flex-row gap-1.5">
                        <Pressable onPress={() => handleStartEditPartnerType(type.id, type.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><Edit size={14} color="#475569" /></Pressable>
                        <Pressable onPress={() => setDeletePartnerTypeConfirmId(type.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100"><Trash2 size={14} color="#e11d48" /></Pressable>
                      </View>
                    );
                  },
                },
              ] as DataTableColumn<PartnerType>[]}
            />
          ) : (
            <View className={`gap-2 md:flex-row md:flex-wrap ${data.partnerTypes.length === 0 ? 'flex-1' : ''}`}>
              {data.partnerTypes.length === 0 && <EmptyState message="No partner types yet." />}
              {data.partnerTypes.map(type => {
                const partnerCount = data.stores.filter(s => s.partner_type === type.name).length;
                const isEditing = editingPartnerTypeId === type.id;
                const isDefault = type.name === 'Retail Shop';
                return (
                  <View key={type.id} className="w-full md:w-[48%] xl:w-[32%] flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    {isEditing ? (
                      <>
                        <TextInput
                          value={editingPartnerTypeName}
                          onChangeText={setEditingPartnerTypeName}
                          autoFocus
                          className="flex-1 bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800"
                        />
                        <Pressable onPress={handleSaveEditPartnerType} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100">
                          <Check size={16} color="#059669" />
                        </Pressable>
                        <Pressable onPress={() => setEditingPartnerTypeId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                          <X size={16} color="#64748b" />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-xs">{type.name}{isDefault ? ' (Default)' : ''}</Text>
                          <Text className="text-[9px] text-slate-400">{partnerCount} partner{partnerCount === 1 ? '' : 's'}</Text>
                        </View>
                        {!isDefault && (
                          <>
                            <Pressable onPress={() => handleStartEditPartnerType(type.id, type.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                              <Edit size={14} color="#475569" />
                            </Pressable>
                            <Pressable onPress={() => setDeletePartnerTypeConfirmId(type.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100">
                              <Trash2 size={14} color="#e11d48" />
                            </Pressable>
                          </>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : activeForm === 'manage_areas' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Manage District Areas</Text>
            <Pressable onPress={() => setActiveForm('list')} className="bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200">
              <Text className="text-slate-500 font-bold text-xs">Back to Partner Outlets</Text>
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <TextInput
              value={newAreaName}
              onChangeText={setNewAreaName}
              placeholder="New district area name..."
              placeholderTextColor="#94a3b8"
              className={inputClass + ' flex-1'}
            />
            <Pressable onPress={handleAddArea} className="bg-rose-500 px-4 rounded-lg items-center justify-center active:bg-rose-600">
              <Text className="text-white font-bold text-xs">Add</Text>
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold text-slate-400 uppercase">{data.areas.length} District Area{data.areas.length === 1 ? '' : 's'}</Text>
            <ViewToggle />
          </View>

          {viewMode === 'table' ? (
            <DataTable
              data={data.areas}
              keyExtractor={a => a.id}
              emptyText="No district areas yet. Add one above."
              columns={[
                {
                  key: 'name', label: 'District Area', width: 220,
                  render: (area: Area) => editingAreaId === area.id ? (
                    <TextInput value={editingAreaName} onChangeText={setEditingAreaName} autoFocus className="bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800" />
                  ) : (
                    <Text className="font-bold text-slate-800 text-xs" numberOfLines={1}>{area.name}</Text>
                  ),
                },
                {
                  key: 'outlets', label: 'Outlets', width: 90, align: 'center' as const, grow: false,
                  render: (area: Area) => <Text className="text-[10px] text-slate-500 text-center">{data.stores.filter(s => s.area === area.name).length}</Text>,
                },
                {
                  key: 'actions', label: 'Actions', width: 100, grow: false,
                  render: (area: Area) => editingAreaId === area.id ? (
                    <View className="flex-row gap-1.5">
                      <Pressable onPress={handleSaveEditArea} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100"><Check size={14} color="#059669" /></Pressable>
                      <Pressable onPress={() => setEditingAreaId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><X size={14} color="#64748b" /></Pressable>
                    </View>
                  ) : (
                    <View className="flex-row gap-1.5">
                      <Pressable onPress={() => handleStartEditArea(area.id, area.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><Edit size={14} color="#475569" /></Pressable>
                      <Pressable onPress={() => setDeleteAreaConfirmId(area.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100"><Trash2 size={14} color="#e11d48" /></Pressable>
                    </View>
                  ),
                },
              ] as DataTableColumn<Area>[]}
            />
          ) : (
            <View className={`gap-2 md:flex-row md:flex-wrap ${data.areas.length === 0 ? 'flex-1' : ''}`}>
              {data.areas.map(area => {
                const storeCount = data.stores.filter(s => s.area === area.name).length;
                const isEditing = editingAreaId === area.id;
                return (
                  <View key={area.id} className="w-full md:w-[48%] xl:w-[32%] flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    {isEditing ? (
                      <>
                        <TextInput
                          value={editingAreaName}
                          onChangeText={setEditingAreaName}
                          autoFocus
                          className="flex-1 bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800"
                        />
                        <Pressable onPress={handleSaveEditArea} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100">
                          <Check size={16} color="#059669" />
                        </Pressable>
                        <Pressable onPress={() => setEditingAreaId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                          <X size={16} color="#64748b" />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-xs">{area.name}</Text>
                          <Text className="text-[9px] text-slate-400">{storeCount} outlet{storeCount === 1 ? '' : 's'}</Text>
                        </View>
                        <Pressable onPress={() => handleStartEditArea(area.id, area.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                          <Edit size={14} color="#475569" />
                        </Pressable>
                        <Pressable onPress={() => setDeleteAreaConfirmId(area.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100">
                          <Trash2 size={14} color="#e11d48" />
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}
              {data.areas.length === 0 && <EmptyState message="No district areas yet. Add one above." />}
            </View>
          )}
        </View>
      ) : activeForm === 'manage_villages' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Manage Villages</Text>
            <Pressable onPress={() => setActiveForm('list')} className="bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200">
              <Text className="text-slate-500 font-bold text-xs">Back to Partner Outlets</Text>
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <TextInput
              value={newVillageName}
              onChangeText={setNewVillageName}
              placeholder="New village name..."
              placeholderTextColor="#94a3b8"
              className={inputClass + ' flex-1'}
            />
            <Pressable onPress={handleAddVillage} className="bg-rose-500 px-4 rounded-lg items-center justify-center active:bg-rose-600">
              <Text className="text-white font-bold text-xs">Add</Text>
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold text-slate-400 uppercase">{data.villages.length} Village{data.villages.length === 1 ? '' : 's'}</Text>
            <ViewToggle />
          </View>

          {viewMode === 'table' ? (
            <DataTable
              data={data.villages}
              keyExtractor={v => v.id}
              emptyText="No villages yet. Add one above."
              columns={[
                {
                  key: 'name', label: 'Village', width: 220,
                  render: (village: Village) => editingVillageId === village.id ? (
                    <TextInput value={editingVillageName} onChangeText={setEditingVillageName} autoFocus className="bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800" />
                  ) : (
                    <Text className="font-bold text-slate-800 text-xs" numberOfLines={1}>{village.name}</Text>
                  ),
                },
                {
                  key: 'outlets', label: 'Outlets', width: 90, align: 'center' as const, grow: false,
                  render: (village: Village) => <Text className="text-[10px] text-slate-500 text-center">{data.stores.filter(s => s.village === village.name).length}</Text>,
                },
                {
                  key: 'actions', label: 'Actions', width: 100, grow: false,
                  render: (village: Village) => editingVillageId === village.id ? (
                    <View className="flex-row gap-1.5">
                      <Pressable onPress={handleSaveEditVillage} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100"><Check size={14} color="#059669" /></Pressable>
                      <Pressable onPress={() => setEditingVillageId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><X size={14} color="#64748b" /></Pressable>
                    </View>
                  ) : (
                    <View className="flex-row gap-1.5">
                      <Pressable onPress={() => handleStartEditVillage(village.id, village.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200"><Edit size={14} color="#475569" /></Pressable>
                      <Pressable onPress={() => setDeleteVillageConfirmId(village.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100"><Trash2 size={14} color="#e11d48" /></Pressable>
                    </View>
                  ),
                },
              ] as DataTableColumn<Village>[]}
            />
          ) : (
            <View className={`gap-2 md:flex-row md:flex-wrap ${data.villages.length === 0 ? 'flex-1' : ''}`}>
              {data.villages.map(village => {
                const storeCount = data.stores.filter(s => s.village === village.name).length;
                const isEditing = editingVillageId === village.id;
                return (
                  <View key={village.id} className="w-full md:w-[48%] xl:w-[32%] flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    {isEditing ? (
                      <>
                        <TextInput
                          value={editingVillageName}
                          onChangeText={setEditingVillageName}
                          autoFocus
                          className="flex-1 bg-white border border-indigo-200 rounded-lg p-1.5 text-xs text-slate-800"
                        />
                        <Pressable onPress={handleSaveEditVillage} className="p-1.5 bg-emerald-50 rounded-lg active:bg-emerald-100">
                          <Check size={16} color="#059669" />
                        </Pressable>
                        <Pressable onPress={() => setEditingVillageId(null)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                          <X size={16} color="#64748b" />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-xs">{village.name}</Text>
                          <Text className="text-[9px] text-slate-400">{storeCount} outlet{storeCount === 1 ? '' : 's'}</Text>
                        </View>
                        <Pressable onPress={() => handleStartEditVillage(village.id, village.name)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                          <Edit size={14} color="#475569" />
                        </Pressable>
                        <Pressable onPress={() => setDeleteVillageConfirmId(village.id)} className="p-1.5 bg-rose-50 rounded-lg active:bg-rose-100">
                          <Trash2 size={14} color="#e11d48" />
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}
              {data.villages.length === 0 && <EmptyState message="No villages yet. Add one above." />}
            </View>
          )}
        </View>
      ) : activeForm === 'store_pricing' && pricingStore ? (() => {
        const activeProducts = data.products.filter(p => p.status === 'Active');
        const overriddenProductIds = new Set(data.storePricing.filter(sp => sp.store_id === pricingStore.id).map(sp => sp.product_id));
        const addableOptions = activeProducts.filter(p => !pricingProductIds.includes(p.id)).map(p => ({ label: p.name, value: p.id }));
        const customProducts = pricingProductIds
          .map(id => data.products.find(p => p.id === id))
          .filter((p): p is Product => !!p);
        const visibleProducts = customProducts.filter(p => p.name.toLowerCase().includes(productPricingSearch.trim().toLowerCase()));

        const isRowDirty = isPricingRowDirty;
        const dirtyCount = customProducts.filter(isRowDirty).length;

        return (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-4 w-full lg:max-w-4xl lg:self-center">
          <View className="gap-2 border-b border-slate-100 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <View className="sm:flex-1 sm:mr-2">
              <Text className="font-extrabold text-slate-800 text-sm">Custom Pricing</Text>
              <Text className="text-[10px] text-slate-400">{pricingStore.name} - most products stay at the catalog rate. Tap "Add Custom Price" to give this outlet its own negotiated rate on a product.</Text>
            </View>
            <View className="flex-row flex-wrap items-center gap-1.5">
              {overriddenProductIds.size > 0 && (
                <Pressable onPress={handleOpenClonePricing} className="bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg active:bg-emerald-100 flex-row items-center gap-1">
                  <Copy size={12} color="#059669" />
                  <Text className="text-emerald-600 font-bold text-xs">Clone to Other Stores</Text>
                </Pressable>
              )}
              {data.stores.some(s => s.status === 'Active' && s.id !== pricingStore.id) && (
                <Pressable onPress={handleOpenCloneFromPricing} className="bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg active:bg-indigo-100 flex-row items-center gap-1">
                  <Copy size={12} color="#4f46e5" />
                  <Text className="text-indigo-600 font-bold text-xs">Clone from Another Store</Text>
                </Pressable>
              )}
              <Pressable onPress={handleBackFromStorePricing} className="bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200">
                <Text className="text-slate-500 font-bold text-xs">Back to Partner Outlets</Text>
              </Pressable>
            </View>
          </View>

          <View className="flex-row items-center gap-2 flex-wrap">
            <Pressable
              onPress={handleAddPricingProductRow}
              disabled={addableOptions.length === 0}
              className={`flex-row items-center justify-center gap-1 px-3 py-2 rounded-xl ${addableOptions.length === 0 ? 'bg-slate-100' : 'bg-indigo-600 active:bg-indigo-700'}`}
            >
              <Plus size={14} color={addableOptions.length === 0 ? '#94a3b8' : '#ffffff'} />
              <Text className={`font-bold text-xs ${addableOptions.length === 0 ? 'text-slate-400' : 'text-white'}`}>Add</Text>
            </Pressable>
            {pricingProductIds.length > 0 && (
              <View className="flex-1 min-w-[140px] flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3">
                <Search size={14} color="#94a3b8" />
                <TextInput
                  value={productPricingSearch}
                  onChangeText={setProductPricingSearch}
                  placeholder="Search custom-priced products..."
                  placeholderTextColor="#94a3b8"
                  className="flex-1 text-xs text-slate-800 py-2"
                  style={{ outlineStyle: 'none' } as any}
                />
                {productPricingSearch.length > 0 && (
                  <Pressable onPress={() => setProductPricingSearch('')} hitSlop={8}>
                    <X size={14} color="#94a3b8" />
                  </Pressable>
                )}
              </View>
            )}
          </View>
          {addableOptions.length === 0 && (
            <Text className="text-[10px] text-slate-400 italic -mt-2">Every active product already has custom pricing for this outlet.</Text>
          )}

          <View className="gap-2">
            <View className="flex-row items-center justify-between flex-wrap gap-2">
              <Text className="font-extrabold text-slate-500 text-xs">
                {pricingProductIds.length} Custom-Priced Product{pricingProductIds.length === 1 ? '' : 's'}
              </Text>
              <View className="flex-row items-center gap-1.5">
                {dirtyCount > 1 && (
                  <Pressable onPress={saveAllDirtyPricingRows} className="flex-row items-center gap-1 bg-emerald-600 px-2.5 py-1 rounded-lg active:bg-emerald-700">
                    <Check size={12} color="#ffffff" />
                    <Text className="text-white font-bold text-xs">Save All ({dirtyCount})</Text>
                  </Pressable>
                )}
                {pricingProductIds.length > 0 && <ViewToggle />}
              </View>
            </View>

            {pricingProductIds.length === 0 ? (
              <Text className="text-[10px] text-slate-400 italic py-2 text-center">No custom pricing set for this outlet yet - it sells everything at catalog rates. Tap "Add Custom Price" above to add one.</Text>
            ) : visibleProducts.length === 0 ? (
              <Text className="text-[10px] text-slate-400 italic py-2 text-center">No custom-priced products match your search.</Text>
            ) : viewMode === 'table' ? (
              <DataTable
                data={visibleProducts}
                keyExtractor={p => p.id}
                columns={([
                  {
                    key: 'product', label: 'Product', width: 200,
                    render: (product: Product) => (
                      <SelectField
                        value={product.id}
                        onValueChange={v => handleChangePricingProduct(product.id, v)}
                        options={activeProducts.filter(p => p.id === product.id || !pricingProductIds.includes(p.id)).map(p => ({ label: p.name, value: p.id }))}
                        title="Select Product"
                        searchable
                        className="bg-white border border-slate-200 rounded-lg p-1.5 flex-row items-center justify-between"
                      />
                    ),
                  },
                  {
                    key: 'reference', label: 'Pc MRP / Wholesale', width: 150, grow: false,
                    render: (product: Product) => (
                      <View>
                        <Text className="text-[10px] text-slate-600 font-bold">Pc MRP Rs. {product.mrp.toFixed(2)}</Text>
                        <Text className="text-[9px] text-slate-400">Catalog WS Rs. {product.wholesale_price.toFixed(2)}</Text>
                      </View>
                    ),
                  },
                  {
                    key: 'wholesale', label: 'Wholesale % / Rs', width: 110, grow: false,
                    render: (product: Product) => {
                      const edit = storePricingEdits[product.id] || emptyPricingEdit;
                      return (
                        <View className="gap-1">
                          <TextInput
                            keyboardType="decimal-pad"
                            value={edit.wholesale}
                            onChangeText={v => updateStorePricingPct(product.id, 'wholesale', v, product.mrp)}
                            placeholder={`${product.wholesale_discount_pct}`}
                            placeholderTextColor="#94a3b8"
                            className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center"
                            style={{ outlineStyle: 'none' } as any}
                          />
                          <TextInput
                            keyboardType="decimal-pad"
                            value={edit.wholesalePrice}
                            onChangeText={v => updateStorePricingPrice(product.id, 'wholesale', v, product.mrp)}
                            placeholder={product.wholesale_price.toFixed(2)}
                            placeholderTextColor="#94a3b8"
                            className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-[10px] text-center text-slate-500"
                            style={{ outlineStyle: 'none' } as any}
                          />
                        </View>
                      );
                    },
                  },
                  retailEnabled ? {
                    key: 'retail', label: 'Selling % / Rs', width: 110, grow: false,
                    render: (product: Product) => {
                      const edit = storePricingEdits[product.id] || emptyPricingEdit;
                      return (
                        <View className="gap-1">
                          <TextInput
                            keyboardType="decimal-pad"
                            value={edit.retail}
                            onChangeText={v => updateStorePricingPct(product.id, 'retail', v, product.mrp)}
                            placeholder={`${product.retail_discount_pct}`}
                            placeholderTextColor="#94a3b8"
                            className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center"
                            style={{ outlineStyle: 'none' } as any}
                          />
                          <TextInput
                            keyboardType="decimal-pad"
                            value={edit.retailPrice}
                            onChangeText={v => updateStorePricingPrice(product.id, 'retail', v, product.mrp)}
                            placeholder={product.selling_price.toFixed(2)}
                            placeholderTextColor="#94a3b8"
                            className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-[10px] text-center text-slate-500"
                            style={{ outlineStyle: 'none' } as any}
                          />
                        </View>
                      );
                    },
                  } : null,
                  {
                    key: 'actions', label: '', width: 80, align: 'center', grow: false,
                    render: (product: Product) => {
                      const dirty = isRowDirty(product);
                      return (
                      <View className="flex-row items-center justify-center gap-1.5">
                        <Pressable onPress={() => dirty && handleSaveStorePricingRow(product.id)} disabled={!dirty} className={`p-1.5 rounded-lg ${dirty ? 'bg-emerald-50 active:bg-emerald-100' : 'bg-slate-50'}`}>
                          <Check size={14} color={dirty ? '#059669' : '#cbd5e1'} />
                        </Pressable>
                        <Pressable onPress={() => handleRemovePricingProduct(product.id)} className="p-1.5 bg-slate-100 rounded-lg active:bg-slate-200">
                          <Trash2 size={14} color="#e11d48" />
                        </Pressable>
                      </View>
                      );
                    },
                  },
                ].filter(Boolean)) as DataTableColumn<Product>[]}
              />
            ) : (
              <View className="gap-2 md:flex-row md:flex-wrap">
                {visibleProducts.map(product => {
                  const edit = storePricingEdits[product.id] || emptyPricingEdit;
                  const isCustom = overriddenProductIds.has(product.id);
                  const dirty = isRowDirty(product);
                  return (
                    <View key={product.id} className={`w-full md:w-[48%] p-2.5 rounded-xl border gap-2 ${isCustom ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <View className="flex-row items-center gap-1.5">
                        <View className="flex-1">
                          <SelectField
                            value={product.id}
                            onValueChange={v => handleChangePricingProduct(product.id, v)}
                            options={activeProducts.filter(p => p.id === product.id || !pricingProductIds.includes(p.id)).map(p => ({ label: p.name, value: p.id }))}
                            title="Select Product"
                            searchable
                            className="bg-white border border-slate-200 rounded-lg p-1.5 flex-row items-center justify-between"
                          />
                        </View>
                        {isCustom && <Text className="text-[9px] font-black text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded uppercase">Custom</Text>}
                      </View>
                      <Text className="text-[9px] text-slate-400">Piece MRP: Rs. {product.mrp.toFixed(2)} · Catalog Wholesale: Rs. {product.wholesale_price.toFixed(2)}</Text>
                      <View className="flex-row items-center gap-2">
                        <View className="flex-1">
                          <Text className="text-[9px] font-bold text-slate-500 mb-1 uppercase">Wholesale % / Rs</Text>
                          <TextInput
                            keyboardType="decimal-pad"
                            value={edit.wholesale}
                            onChangeText={v => updateStorePricingPct(product.id, 'wholesale', v, product.mrp)}
                            placeholder={`${product.wholesale_discount_pct}`}
                            placeholderTextColor="#94a3b8"
                            className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center"
                            style={{ outlineStyle: 'none' } as any}
                          />
                          <TextInput
                            keyboardType="decimal-pad"
                            value={edit.wholesalePrice}
                            onChangeText={v => updateStorePricingPrice(product.id, 'wholesale', v, product.mrp)}
                            placeholder={product.wholesale_price.toFixed(2)}
                            placeholderTextColor="#94a3b8"
                            className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-[10px] text-center text-slate-500 mt-1"
                            style={{ outlineStyle: 'none' } as any}
                          />
                        </View>
                        {retailEnabled && (
                          <View className="flex-1">
                            <Text className="text-[9px] font-bold text-slate-500 mb-1 uppercase">Selling % / Rs</Text>
                            <TextInput
                              keyboardType="decimal-pad"
                              value={edit.retail}
                              onChangeText={v => updateStorePricingPct(product.id, 'retail', v, product.mrp)}
                              placeholder={`${product.retail_discount_pct}`}
                              placeholderTextColor="#94a3b8"
                              className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center"
                              style={{ outlineStyle: 'none' } as any}
                            />
                            <TextInput
                              keyboardType="decimal-pad"
                              value={edit.retailPrice}
                              onChangeText={v => updateStorePricingPrice(product.id, 'retail', v, product.mrp)}
                              placeholder={product.selling_price.toFixed(2)}
                              placeholderTextColor="#94a3b8"
                              className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-[10px] text-center text-slate-500 mt-1"
                              style={{ outlineStyle: 'none' } as any}
                            />
                          </View>
                        )}
                        <Pressable onPress={() => dirty && handleSaveStorePricingRow(product.id)} disabled={!dirty} className={`p-2 rounded-lg mt-3.5 ${dirty ? 'bg-emerald-50 active:bg-emerald-100' : 'bg-slate-50'}`}>
                          <Check size={16} color={dirty ? '#059669' : '#cbd5e1'} />
                        </Pressable>
                        <Pressable onPress={() => handleRemovePricingProduct(product.id)} className="p-2 bg-slate-100 rounded-lg active:bg-slate-200 mt-3.5">
                          <Trash2 size={16} color="#e11d48" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
        );
      })() : activeForm === 'add_supplier' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">{editingSupplierId ? 'Edit Supply Partner Details' : 'Register Cold-Chain Supply Partner'}</Text>
            <Pressable onPress={() => { setActiveForm('list'); setEditingSupplierId(null); }}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Supplier / Factory Name</Text><TextInput value={supplierForm.name} onChangeText={v => setSupplierForm({ ...supplierForm, name: v })} placeholder="e.g. Konkan Dairy Suppliers" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Contact Person</Text><TextInput value={supplierForm.contact_person} onChangeText={v => setSupplierForm({ ...supplierForm, contact_person: v })} placeholder="e.g. Ramesh Iyer" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Phone Number</Text><TextInput value={supplierForm.phone} onChangeText={v => setSupplierForm({ ...supplierForm, phone: v })} placeholder="e.g. +91 7373674757" placeholderTextColor="#94a3b8" className={inputClass} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Email Address</Text><TextInput value={supplierForm.email} onChangeText={v => setSupplierForm({ ...supplierForm, email: v })} placeholder="e.g. contact@konkandairy.in" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          </View>
          <View><Text className="font-bold text-slate-500 mb-1 text-xs">Address Location</Text><TextInput value={supplierForm.address} onChangeText={v => setSupplierForm({ ...supplierForm, address: v })} placeholder="e.g. Plot No. 24, Industrial Area Phase II" placeholderTextColor="#94a3b8" className={inputClass} /></View>
          <Pressable onPress={handleSaveSupplier} className="w-full py-2.5 bg-rose-500 rounded-xl items-center active:bg-rose-600">
            <Text className="text-white font-bold text-xs">{editingSupplierId ? 'Save Supplier Details' : 'Confirm Supplier Registration'}</Text>
          </Pressable>
        </View>
      ) : activeForm === 'add_payment' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Add Store Payment (Credit Recovery)</Text>
            <Pressable onPress={() => setActiveForm('list')}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View>
            <Text className="font-bold text-slate-500 mb-1 text-xs">Select Store</Text>
            <SelectField
              value={paymentForm.store_id}
              onValueChange={v => setPaymentForm({ ...paymentForm, store_id: v, invoice_id: 'general' })}
              options={data.stores.filter(s => s.status === 'Active').map(s => ({ label: `${s.name} (Outstanding: Rs. ${s.outstanding_balance.toFixed(2)})`, value: s.id }))}
              title="Select Store"
              searchable
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
                    ...unpaidInvoices.map(inv => ({ label: `${inv.invoice_number} (Due: ${formatWholeRupees(inv.grand_total - (inv.paid_amount || 0))} of ${formatWholeRupees(inv.grand_total)})`, value: inv.id })),
                  ]}
                  title="Select Invoice"
                  className={inputClass + ' flex-row items-center justify-between'}
                />
              </View>
            );
          })()}
          <View className="flex-row gap-2">
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Collected Amount (Rs)</Text><TextInput keyboardType="decimal-pad" value={paymentForm.amount === 0 ? '' : String(paymentForm.amount)} onChangeText={v => setPaymentForm({ ...paymentForm, amount: Number(v) || 0 })} placeholder="0" placeholderTextColor="#94a3b8" className={inputClass + ' font-bold text-emerald-600'} /></View>
            <View className="flex-1"><Text className="font-bold text-slate-500 mb-1 text-xs">Settlement Method</Text><SelectField value={paymentForm.method} onValueChange={v => setPaymentForm({ ...paymentForm, method: v as any })} options={paymentMethodOptions} title="Select Method" className={inputClass + ' flex-row items-center justify-between'} /></View>
          </View>
          <Pressable onPress={handleSavePayment} className="w-full py-2.5 bg-emerald-500 rounded-xl items-center active:bg-emerald-600">
            <Text className="text-white font-bold text-xs">Confirm Collection Payment Receipt</Text>
          </Pressable>
        </View>
      ) : activeForm === 'add_prebooking' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">{editingPreBookingId ? `Edit Pre-booking ${editingPreBookingId.toUpperCase()}` : 'Create Pre-booking Order'}</Text>
            <Pressable onPress={() => { resetPreBookingForm(); setActiveForm('list'); }}><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Select Partner Store</Text>
            <SelectField value={preBookingStoreId} onValueChange={setPreBookingStoreId} options={preBookingStoreOptions} title="Select Store" searchable className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Scheduled Delivery Date</Text>
            <DateField value={preBookingDate} onValueChange={setPreBookingDate} title="Select Delivery Date" className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Notes (Optional)</Text>
            <TextInput value={preBookingNotes} onChangeText={setPreBookingNotes} multiline numberOfLines={2} placeholder="Enter special delivery instructions or notes..." placeholderTextColor="#94a3b8" className={inputClass + ' rounded-xl'} style={{ minHeight: 60, textAlignVertical: 'top' }} />
          </View>
          {retailEnabled && (
            <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
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
            <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
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
          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
            <View className="flex-row items-center justify-between flex-wrap gap-2">
              <Text className="font-bold text-slate-500 text-[10px] uppercase">Select Products & Pre-book Quantities:</Text>
              <ViewToggle />
            </View>
            <View className="flex-row items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 z-20">
              <Search size={14} color="#94a3b8" />
              <AutocompleteInput
                value={preBookingProductSearch}
                onChangeText={setPreBookingProductSearch}
                suggestions={newOrderProductSearchSuggestions}
                placeholder="Search products..."
                placeholderTextColor="#94a3b8"
                containerClassName="flex-1"
                className="text-xs text-slate-800 py-2"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>
            {(() => {
              const basePreBookingProducts = data.products.filter(product => product.status === 'Active' && isPositiveQty(getEffectiveAvailableForBooking(product.id)) && product.name.toLowerCase().includes(debouncedPreBookingProductSearch.trim().toLowerCase()));

              if (basePreBookingProducts.length === 0) {
                return <Text className="text-[10px] text-slate-400 italic py-2 text-center">{debouncedPreBookingProductSearch.trim() ? 'No products match your search.' : 'No products currently have warehouse stock available to pre-book.'}</Text>;
              }

              // Deliberately NOT reordered by selection - a product keeps its
              // normal catalog position (and scroll position stays put) no
              // matter how its quantity is changed, so picking multiple items
              // stays predictable instead of the list jumping around.
              const filteredPreBookingProducts = basePreBookingProducts;

              const renderPreBookingQtyStepper = (product: Product) => {
                const available = getEffectiveAvailableForBooking(product.id);
                const qty = preBookingItems[product.id] ?? { boxes: 0, pieces: 0 };
                return (
                  <BoxPieceInput
                    value={qty}
                    onChange={q => {
                      if (compareQty(q, available, product.pieces_per_box) > 0) {
                        showAlert(!isPositiveQty(available)
                          ? `${product.name} is out of stock in the warehouse. It cannot be added to this pre-booking.`
                          : `Only ${formatQty(available)} of ${product.name} are available in the warehouse right now.`);
                      }
                      const next = compareQty(q, available, product.pieces_per_box) > 0 ? available : q;
                      setPreBookingItems(prev => ({ ...prev, [product.id]: next }));
                      updatePreBookingItemOrder(product.id, next);
                    }}
                    piecesPerBox={product.pieces_per_box}
                    compact
                  />
                );
              };

              if (viewMode === 'table') {
                return (
                  <DataTable
                    data={filteredPreBookingProducts}
                    keyExtractor={p => p.id}
                    emptyText="No products currently have warehouse stock available to pre-book."
                    columns={[
                      { key: 'product', label: 'Product', width: 170, render: p => <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{p.name}</Text> },
                      {
                        key: 'price', label: 'Price', width: 130,
                        render: p => {
                          const rate = getEffectiveProductPrice(p, effectivePreBookingPricingMode, preBookingStoreId, data.storePricing);
                          return <Text className="text-slate-600 text-[11px] font-bold">Rs. {rate.toFixed(2)}{retailEnabled ? ` (${effectivePreBookingPricingMode === 'wholesale' ? 'Wholesale' : 'Selling'})` : ''}</Text>;
                        },
                      },
                      { key: 'stock', label: 'Stock', width: 90, align: 'center', grow: false, render: p => <Text className="text-center text-[11px] font-black text-slate-800">{formatQty(getEffectiveAvailableForBooking(p.id))}</Text> },
                      { key: 'qty', label: 'Quantity', width: 140, grow: false, render: renderPreBookingQtyStepper },
                    ] as DataTableColumn<Product>[]}
                  />
                );
              }

              return (
                <View className="gap-2 md:flex-row md:flex-wrap">
                  {filteredPreBookingProducts.map(product => {
                    const available = getEffectiveAvailableForBooking(product.id);
                    const rate = getEffectiveProductPrice(product, effectivePreBookingPricingMode, preBookingStoreId, data.storePricing);
                    return (
                      <View key={product.id} className="w-full md:w-[48%] flex-row items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-2">
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-[11px]">{product.name}</Text>
                          <Text className="text-slate-400 text-[9px]">Rs. {rate.toFixed(2)}{retailEnabled ? ` (${effectivePreBookingPricingMode === 'wholesale' ? 'Wholesale' : 'Selling'})` : ''} - Stock: {formatQty(available)} available</Text>
                        </View>
                        {renderPreBookingQtyStepper(product)}
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
          <View className="bg-slate-100 p-2.5 rounded-xl flex-row justify-between items-center">
            <Text className="font-bold text-slate-500 text-xs">Estimated Total Value{preBookingGstMode === 'with_gst' ? ' (Incl. GST)' : ''}:</Text>
            <Text className="font-black text-slate-800 text-sm">
              {formatWholeRupees(computeItemsTotal(buildPreBookingItemsList()).grand_total)}
            </Text>
          </View>
          <Pressable onPress={handleSavePreBooking} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
            <Text className="text-white font-bold text-xs">{editingPreBookingId ? 'Update Pre-booking & Adjust Reservation' : 'Save Pre-booking & Reserve Stock'}</Text>
          </Pressable>
        </View>
      ) : activeForm === 'prebooking_confirmation' && pendingPreBooking ? (
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

          {/* Same product order as the picker (selection order), never alphabetical. */}
          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-1.5">
            <Text className="font-bold text-slate-500 text-[10px] uppercase mb-0.5">Selected Products & Quantities</Text>
            {pendingPreBooking.items.map(item => {
              const p = data.products.find(prod => prod.id === item.product_id);
              return (
                <View key={item.product_id} className="flex-row justify-between items-center border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                  <View className="flex-1 pr-2">
                    <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{p?.name || 'Unknown'}</Text>
                    <Text className="text-slate-400 text-[9px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}{item.tax_pct > 0 ? ` (+${item.tax_pct}% GST)` : ''}</Text>
                  </View>
                  <Text className="font-bold text-slate-700 text-[11px]">Rs. {(effectiveLineValue(item, item.unit_price)).toFixed(2)}</Text>
                </View>
              );
            })}
          </View>

          <View className="bg-slate-100 p-3 rounded-xl gap-1">
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-500 font-semibold text-[10px] uppercase">Total (Before Round Off)</Text>
              <Text className="font-bold text-slate-600 text-xs">Rs. {(pendingPreBooking.grandTotal - pendingPreBooking.roundOff).toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-500 font-semibold text-[10px] uppercase">Round Off</Text>
              <Text className="font-bold text-slate-600 text-xs">{pendingPreBooking.roundOff > 0 ? '+' : ''}Rs. {pendingPreBooking.roundOff.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center pt-1 border-t border-slate-200">
              <Text className="font-extrabold text-slate-700 text-xs uppercase">Estimated Value</Text>
              <Text className="font-black text-indigo-600 text-sm">{formatWholeRupees(pendingPreBooking.grandTotal)}</Text>
            </View>
          </View>

          <Pressable onPress={handleConfirmPreBooking} className="w-full py-2.5 bg-emerald-600 rounded-xl items-center active:bg-emerald-700">
            <Text className="text-white font-bold text-xs uppercase">{editingPreBookingId ? 'Confirm Update' : 'Confirm Pre-Booking'}</Text>
          </Pressable>
        </View>
      ) : activeForm === 'create_order' ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-4xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Create New Order</Text>
            <Pressable
              onPress={() => {
                resetNewOrderForm();
                if (createOrderReturnToAssets) {
                  setCreateOrderReturnToAssets(false);
                  onCancelCreateOrderToAssets?.();
                } else {
                  setActiveForm('list');
                }
              }}
            ><Text className="text-slate-400 text-xs">Cancel</Text></Pressable>
          </View>
          <View>
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-1">Select Partner Store</Text>
            <SelectField value={newOrderStoreId} onValueChange={setNewOrderStoreId} options={storeOptions} title="Select Store" searchable className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
          </View>
          <View className="gap-2 sm:flex-row sm:flex-wrap">
            {retailEnabled && (
              <View className="sm:flex-1 flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
                <Text className="text-[9px] font-bold text-slate-500 uppercase">Pricing Mode</Text>
                <View className="flex-row bg-white p-0.5 rounded-lg border border-slate-200">
                  <Pressable onPress={() => setNewOrderPricingMode('wholesale')} className={`px-2 py-1 rounded-md ${newOrderPricingMode === 'wholesale' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${newOrderPricingMode === 'wholesale' ? 'text-white' : 'text-slate-500'}`}>Wholesale</Text>
                  </Pressable>
                  <Pressable onPress={() => setNewOrderPricingMode('retail')} className={`px-2 py-1 rounded-md ${newOrderPricingMode === 'retail' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${newOrderPricingMode === 'retail' ? 'text-white' : 'text-slate-500'}`}>Selling</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {canToggleGst && (
              <View className="sm:flex-1 flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2">
                <Text className="text-[9px] font-bold text-slate-500 uppercase">GST</Text>
                <View className="flex-row bg-white p-0.5 rounded-lg border border-slate-200">
                  <Pressable onPress={() => setNewOrderGstMode('with_gst')} className={`px-2 py-1 rounded-md ${newOrderGstMode === 'with_gst' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${newOrderGstMode === 'with_gst' ? 'text-white' : 'text-slate-500'}`}>With GST</Text>
                  </Pressable>
                  <Pressable onPress={() => setNewOrderGstMode('without_gst')} className={`px-2 py-1 rounded-md ${newOrderGstMode === 'without_gst' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-bold ${newOrderGstMode === 'without_gst' ? 'text-white' : 'text-slate-500'}`}>No GST</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
            <View className="flex-row items-center justify-between flex-wrap gap-2">
              <Text className="font-bold text-slate-500 text-[10px] uppercase">Select Products & Quantities (Warehouse Stock):</Text>
              <ViewToggle />
            </View>
            <View className="flex-row items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 z-20">
              <Search size={14} color="#94a3b8" />
              <AutocompleteInput
                value={newOrderProductSearch}
                onChangeText={setNewOrderProductSearch}
                suggestions={newOrderProductSearchSuggestions}
                placeholder="Search products..."
                placeholderTextColor="#94a3b8"
                containerClassName="flex-1"
                className="text-xs text-slate-800 py-2"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>
            {(() => {
              const baseNewOrderProducts = data.products.filter(product => product.status === 'Active' && isPositiveQty(getWarehouseStock(product.id)) && product.name.toLowerCase().includes(debouncedNewOrderProductSearch.trim().toLowerCase()));

              if (baseNewOrderProducts.length === 0) {
                return <Text className="text-[10px] text-slate-400 italic py-2 text-center">{debouncedNewOrderProductSearch.trim() ? 'No products match your search.' : 'No products currently have warehouse stock available.'}</Text>;
              }

              // Deliberately NOT reordered by selection - a product keeps its
              // normal catalog position (and scroll position stays put) no
              // matter how its quantity is changed, so picking multiple items
              // stays predictable instead of the list jumping around.
              const filteredNewOrderProducts = baseNewOrderProducts;

              const renderQtyStepper = (product: Product) => {
                const available = getWarehouseStock(product.id);
                const qty = newOrderItems[product.id] ?? { boxes: 0, pieces: 0 };
                return (
                  <BoxPieceInput
                    value={qty}
                    onChange={q => {
                      if (compareQty(q, available, product.pieces_per_box) > 0) {
                        showAlert(!isPositiveQty(available)
                          ? `${product.name} is out of stock in the warehouse. It cannot be added to this order.`
                          : `Only ${formatQty(available)} of ${product.name} are available in the warehouse right now.`);
                      }
                      const next = compareQty(q, available, product.pieces_per_box) > 0 ? available : q;
                      setNewOrderItems(prev => ({ ...prev, [product.id]: next }));
                      updateNewOrderItemOrder(product.id, next);
                    }}
                    piecesPerBox={product.pieces_per_box}
                    compact
                  />
                );
              };

              // Wholesale/retail discount % for the selected store+product
              // (catalog rate, or this store's negotiated override if one
              // exists) plus a pencil icon that jumps to Custom Pricing for
              // that exact product - editing there and hitting Back returns
              // to this same order draft (see handleOpenStorePricingForProduct
              // / leaveStorePricing).
              const renderDiscountBadge = (product: Product) => {
                const store = data.stores.find(s => s.id === newOrderStoreId);
                const override = findStorePricingOverride(data.storePricing, newOrderStoreId, product.id);
                const wholesalePct = getEffectiveDiscountPct(product, 'wholesale', override);
                const retailPct = getEffectiveDiscountPct(product, 'retail', override);
                return (
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Text className="text-[9px] text-slate-400">
                      WS -{wholesalePct}%{retailEnabled ? `  Sell -${retailPct}%` : ''}
                    </Text>
                    {store && (
                      <Pressable onPress={() => handleOpenStorePricingForProduct(store, product, 'create_order')} hitSlop={6}>
                        <Edit size={10} color="#6366f1" />
                      </Pressable>
                    )}
                  </View>
                );
              };

              if (viewMode === 'table') {
                return (
                  <DataTable
                    data={filteredNewOrderProducts}
                    keyExtractor={p => p.id}
                    emptyText="No products currently have warehouse stock available."
                    columns={[
                      { key: 'product', label: 'Product', width: 170, render: p => <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{p.name}</Text> },
                      {
                        key: 'price', label: 'Price', width: 130,
                        render: p => {
                          const rate = getEffectiveProductPrice(p, effectiveNewOrderPricingMode, newOrderStoreId, data.storePricing);
                          return (
                            <View>
                              <Text className="text-slate-600 text-[11px] font-bold">Rs. {rate.toFixed(2)}{retailEnabled ? ` (${effectiveNewOrderPricingMode === 'wholesale' ? 'Wholesale' : 'Selling'})` : ''}</Text>
                              {renderDiscountBadge(p)}
                            </View>
                          );
                        },
                      },
                      { key: 'stock', label: 'Stock', width: 90, align: 'center', grow: false, render: p => <Text className="text-center text-[11px] font-black text-slate-800">{formatQty(getWarehouseStock(p.id))}</Text> },
                      { key: 'qty', label: 'Quantity', width: 140, grow: false, render: renderQtyStepper },
                    ] as DataTableColumn<Product>[]}
                  />
                );
              }

              return (
                <View className="gap-2 md:flex-row md:flex-wrap">
                  {filteredNewOrderProducts.map(product => {
                    const available = getWarehouseStock(product.id);
                    const rate = getEffectiveProductPrice(product, effectiveNewOrderPricingMode, newOrderStoreId, data.storePricing);
                    return (
                      <View key={product.id} className="w-full md:w-[48%] flex-row items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-2">
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-[11px]">{product.name}</Text>
                          <Text className="text-slate-400 text-[9px]">Rs. {rate.toFixed(2)}{retailEnabled ? ` (${effectiveNewOrderPricingMode === 'wholesale' ? 'Wholesale' : 'Selling'})` : ''} - Stock: {formatQty(available)} available</Text>
                          {renderDiscountBadge(product)}
                        </View>
                        {renderQtyStepper(product)}
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
          <View className="bg-slate-100 p-2.5 rounded-xl flex-row justify-between items-center">
            <Text className="font-bold text-slate-500 text-xs">Estimated Total Value{newOrderGstMode === 'with_gst' ? ' (Incl. GST)' : ''}:</Text>
            <Text className="font-black text-slate-800 text-sm">
              {formatWholeRupees(computeItemsTotal(buildNewOrderItemsList()).grand_total)}
            </Text>
          </View>
          <Pressable onPress={handleCreateNewOrder} className="w-full py-2.5 bg-blue-600 rounded-xl items-center active:bg-blue-700">
            <Text className="text-white font-bold text-xs">Create Order & Generate Invoice</Text>
          </Pressable>
        </View>
      ) : activeForm === 'order_confirmation' && pendingNewOrder ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <View>
              <Text className="font-extrabold text-slate-800 text-sm">Order Confirmation</Text>
              <Text className="text-[10px] text-slate-400">Review the full bill before proceeding to payment</Text>
            </View>
            <Pressable onPress={handleBackFromOrderConfirmation}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
          </View>

          <View className="flex-row justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <Text className="text-slate-400 font-bold uppercase text-[9px]">Partner Store</Text>
            <Text className="font-extrabold text-slate-800 text-xs">{pendingNewOrder.storeName}</Text>
          </View>

          {/* Same product order as the picker (selection order), never alphabetical. */}
          <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-1.5">
            <Text className="font-bold text-slate-500 text-[10px] uppercase mb-0.5">Selected Products & Quantities</Text>
            {pendingNewOrder.items.map(item => {
              const p = data.products.find(prod => prod.id === item.product_id);
              return (
                <View key={item.product_id} className="flex-row justify-between items-center border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                  <View className="flex-1 pr-2">
                    <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{p?.name || 'Unknown'}</Text>
                    <Text className="text-slate-400 text-[9px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}{item.tax_pct > 0 ? ` (+${item.tax_pct}% GST)` : ''}</Text>
                  </View>
                  <Text className="font-bold text-slate-700 text-[11px]">Rs. {(effectiveLineValue(item, item.unit_price)).toFixed(2)}</Text>
                </View>
              );
            })}
          </View>

          <View className="bg-slate-100 p-3 rounded-xl gap-1">
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-500 font-semibold text-[10px] uppercase">Total (Before Round Off)</Text>
              <Text className="font-bold text-slate-600 text-xs">Rs. {(pendingNewOrder.grandTotal - pendingNewOrder.roundOff).toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-500 font-semibold text-[10px] uppercase">Round Off</Text>
              <Text className="font-bold text-slate-600 text-xs">{pendingNewOrder.roundOff > 0 ? '+' : ''}Rs. {pendingNewOrder.roundOff.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center pt-1 border-t border-slate-200">
              <Text className="font-extrabold text-slate-700 text-xs uppercase">Grand Total (Invoice Amount)</Text>
              <Text className="font-black text-indigo-600 text-sm">{formatWholeRupees(pendingNewOrder.grandTotal)}</Text>
            </View>
          </View>

          <Pressable onPress={() => setShowConfirmOrderDialog(true)} className="w-full py-2.5 bg-emerald-600 rounded-xl items-center active:bg-emerald-700">
            <Text className="text-white font-bold text-xs uppercase">Confirm Order</Text>
          </Pressable>
        </View>
      ) : activeForm === 'order_details' && selectedOrder ? (
        <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-extrabold text-slate-800 text-sm">Order Cargo Manifest Details</Text>
            <Pressable onPress={handleBackFromOrderDetails}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
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
                    <Text className="text-slate-400 text-[9px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}</Text>
                  </View>
                  <Text className="font-bold text-slate-700 text-[11px]">Rs. {(effectiveLineValue(item, item.unit_price)).toFixed(2)}</Text>
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

            {/* Permission-gated override: a Confirmed/Delivered order normally
                can't be changed once it's past that point in the pipeline -
                these let an operator with the corresponding privilege (native
                Admin, or anyone individually granted it via Manage
                Permissions) correct a mistake, automatically
                reversing/reapplying warehouse stock and recalculating the
                invoice/balance either way. */}
            {(selectedOrder.status === 'Confirmed' || selectedOrder.status === 'Delivered') &&
              (hasAdminOverride(currentUser, ORDERS_EDIT_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions) ||
                hasAdminOverride(currentUser, ORDERS_DELETE_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions)) && (
              <View className="flex-row gap-2 pt-2 border-t border-slate-100">
                {hasAdminOverride(currentUser, ORDERS_EDIT_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions) && (
                  <Pressable onPress={() => handleOpenEditOrder(selectedOrder)} className="flex-1 py-2 bg-slate-100 rounded-xl flex-row items-center justify-center gap-1.5 border border-slate-200 active:bg-slate-200">
                    <Edit size={13} color="#475569" />
                    <Text className="text-slate-700 font-bold text-xs">Edit Order</Text>
                  </Pressable>
                )}
                {hasAdminOverride(currentUser, ORDERS_DELETE_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions) && (
                  <Pressable onPress={() => handleDeleteOrder(selectedOrder.id)} className="flex-1 py-2 bg-rose-50 rounded-xl flex-row items-center justify-center gap-1.5 border border-rose-200 active:bg-rose-100">
                    <Trash2 size={13} color="#e11d48" />
                    <Text className="text-rose-600 font-bold text-xs">Delete Order</Text>
                  </Pressable>
                )}
              </View>
            )}

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
                    <View><Text className="text-slate-400 font-bold text-[10px]">Bill Total</Text><Text className="font-black text-slate-800 text-sm">{formatWholeRupees(inv.grand_total)}</Text></View>
                    <View><Text className="text-slate-400 font-bold text-[10px]">Payment Method</Text><Text className="font-black text-slate-800 text-sm uppercase">{inv.payment_method || 'Credit'}</Text></View>
                  </View>
                  <View className="flex-row justify-between pt-1 border-t border-slate-200 pb-2">
                    <View><Text className="text-slate-400 font-bold text-[10px]">Paid Amount</Text><Text className="font-black text-emerald-600">{formatWholeRupees(paidVal)}</Text></View>
                    <View><Text className="text-slate-400 font-bold text-[10px]">Due Outstanding</Text><Text className={`font-black ${remainingVal > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{formatWholeRupees(remainingVal)}</Text></View>
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
                            <Text className="font-black text-emerald-600 text-[9px]">Rs. {pay.amount.toFixed(2)}</Text>
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
      ) : activeForm === 'edit_order' && selectedOrder ? (() => {
        const orderStore = data.stores.find(s => s.id === selectedOrder.store_id);
        const editItemsList = Object.entries(editOrderItems).filter(([, qty]) => isPositiveQty(qty));
        const previewItems = editItemsList.map(([productId, qty]) => {
          const originalItem = selectedOrder.items.find(i => i.product_id === productId);
          const product = data.products.find(p => p.id === productId);
          const unit_price = originalItem ? originalItem.unit_price : (product ? getEffectiveProductPrice(product, 'wholesale', selectedOrder.store_id, data.storePricing) : 0);
          const tax_pct = originalItem ? originalItem.tax_pct : (product?.tax_pct ?? 0);
          return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price, tax_pct };
        });
        const { grand_total: previewGrandTotal } = computeItemsTotal(previewItems);
        const filteredEditProducts = data.products.filter(p =>
          p.status === 'Active' &&
          p.name.toLowerCase().includes(debouncedEditOrderProductSearch.trim().toLowerCase()) &&
          !isPositiveQty(editOrderItems[p.id] ?? { boxes: 0, pieces: 0 })
        );

        return (
          <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <Text className="font-extrabold text-slate-800 text-sm">Edit Order</Text>
              <Pressable onPress={() => setActiveForm('order_details')}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
            </View>
            <View className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <Text className="text-amber-700 text-[10px] font-semibold leading-relaxed">
                This order is {selectedOrder.status}. Changing quantities here automatically returns or consumes warehouse stock and recalculates the invoice total and store balance.
              </Text>
            </View>
            <View className="gap-1.5">
              <View className="flex-row justify-between"><Text className="text-slate-400 text-[10px]">Order ID:</Text><Text className="font-bold text-slate-700 uppercase font-mono text-[10px]">{selectedOrder.id}</Text></View>
              <View className="flex-row justify-between"><Text className="text-slate-400 text-[10px]">Partner Store:</Text><Text className="font-bold text-slate-800 text-[10px]">{orderStore?.name}</Text></View>
            </View>

            <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
              <Text className="font-bold text-slate-500 text-[10px] uppercase">Items</Text>
              {editItemsList.length === 0 ? (
                <Text className="text-[10px] text-slate-400 italic py-2 text-center">No items - add at least one product below.</Text>
              ) : (
                editItemsList.map(([productId, qty]) => {
                  const product = data.products.find(p => p.id === productId);
                  const originalItem = selectedOrder.items.find(i => i.product_id === productId);
                  const unitPrice = originalItem ? originalItem.unit_price : (product ? getEffectiveProductPrice(product, 'wholesale', selectedOrder.store_id, data.storePricing) : 0);
                  const piecesPerBox = product?.pieces_per_box ?? 1;
                  // Headroom = what's currently free in the warehouse plus
                  // whatever this line already holds (already committed to
                  // this order, so it isn't "extra" demand on top of itself).
                  const available = addQty(getWarehouseStock(productId), { boxes: originalItem?.quantity ?? 0, pieces: originalItem?.quantity_pieces ?? 0 }, piecesPerBox);
                  const lineAmount = toTotalPieces(qty, piecesPerBox) * unitPrice;
                  return (
                    <View key={productId} className="flex-row items-center justify-between border-b border-slate-100 pb-1.5 last:border-0">
                      <View className="flex-1 pr-2">
                        <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{product?.name}</Text>
                        <Text className="text-slate-400 text-[9px]">Rs. {unitPrice.toFixed(2)} / unit - Rs. {lineAmount.toFixed(2)}</Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <BoxPieceInput
                          value={qty}
                          onChange={q => {
                            if (compareQty(q, available, piecesPerBox) > 0) showAlert(`Only ${formatQty(available)} of ${product?.name ?? 'this product'} can be allocated to this order.`);
                            const next = compareQty(q, available, piecesPerBox) > 0 ? available : q;
                            setEditOrderItems(prev => ({ ...prev, [productId]: next }));
                          }}
                          piecesPerBox={piecesPerBox}
                          compact
                        />
                        <Pressable onPress={() => setEditOrderItems(prev => { const next = { ...prev }; delete next[productId]; return next; })} className="w-7 h-7 bg-rose-50 rounded-lg items-center justify-center active:bg-rose-100 ml-1">
                          <Trash2 size={13} color="#e11d48" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View className="gap-2">
              <Text className="font-bold text-slate-500 text-[10px] uppercase">Add A Product</Text>
              <View className="flex-row items-center gap-2 bg-white border border-slate-200 rounded-xl px-3">
                <Search size={14} color="#94a3b8" />
                <TextInput
                  value={editOrderProductSearch}
                  onChangeText={setEditOrderProductSearch}
                  placeholder="Search products to add..."
                  placeholderTextColor="#94a3b8"
                  className="flex-1 text-xs text-slate-800 py-2"
                  style={{ outlineStyle: 'none' } as any}
                />
                {editOrderProductSearch.length > 0 && (
                  <Pressable onPress={() => setEditOrderProductSearch('')} hitSlop={8}>
                    <X size={14} color="#94a3b8" />
                  </Pressable>
                )}
              </View>
              {editOrderProductSearch.trim().length > 0 && (
                <View className="border border-slate-100 rounded-xl bg-white" style={{ maxHeight: 160 }}>
                  <ScrollView>
                    {filteredEditProducts.slice(0, 20).map(product => (
                      <Pressable
                        key={product.id}
                        onPress={() => { setEditOrderItems(prev => ({ ...prev, [product.id]: { boxes: 1, pieces: 0 } })); setEditOrderProductSearch(''); }}
                        className="flex-row items-center justify-between px-3 py-2 border-b border-slate-50 active:bg-slate-50"
                      >
                        <Text className="text-slate-700 text-xs flex-1" numberOfLines={1}>{product.name}</Text>
                        <Text className="text-slate-400 text-[10px]">{formatQty(getWarehouseStock(product.id))} in stock</Text>
                      </Pressable>
                    ))}
                    {filteredEditProducts.length === 0 && (
                      <Text className="text-[10px] text-slate-400 italic py-2 text-center">No matching products.</Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <View className="bg-slate-100 p-3 rounded-xl gap-1">
              <View className="flex-row justify-between items-center">
                <Text className="font-extrabold text-slate-700 text-xs uppercase">New Grand Total</Text>
                <Text className="font-black text-indigo-600 text-sm">{formatWholeRupees(previewGrandTotal)}</Text>
              </View>
            </View>

            <Pressable onPress={handleSaveEditOrder} className="w-full py-2.5 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
              <Text className="text-white font-bold text-xs uppercase">Save Changes</Text>
            </Pressable>
          </View>
        );
      })() : activeForm === 'edit_delivered_prebooking' && data.preBookingOrders.find(b => b.id === editingDeliveredPreBookingId) ? (() => {
        const booking = data.preBookingOrders.find(b => b.id === editingDeliveredPreBookingId)!;
        const bookingStore = data.stores.find(s => s.id === booking.store_id);
        const editItemsList = Object.entries(editDeliveredPreBookingItems).filter(([, qty]) => isPositiveQty(qty));
        const previewItems = editItemsList.map(([productId, qty]) => {
          const originalItem = booking.items.find(i => i.product_id === productId);
          const product = data.products.find(p => p.id === productId);
          const unit_price = originalItem ? originalItem.unit_price : (product ? getEffectiveProductPrice(product, 'wholesale', booking.store_id, data.storePricing) : 0);
          const tax_pct = originalItem ? originalItem.tax_pct : (product?.tax_pct ?? 0);
          return { product_id: productId, quantity: qty.boxes, quantity_pieces: qty.pieces, unit_price, tax_pct };
        });
        const { grand_total: previewGrandTotal } = computeItemsTotal(previewItems);
        const filteredEditProducts = data.products.filter(p =>
          p.status === 'Active' &&
          p.name.toLowerCase().includes(debouncedEditDeliveredPreBookingSearch.trim().toLowerCase()) &&
          !isPositiveQty(editDeliveredPreBookingItems[p.id] ?? { boxes: 0, pieces: 0 })
        );

        return (
          <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <Text className="font-extrabold text-slate-800 text-sm">Edit Delivered Pre-Booking</Text>
              <Pressable onPress={() => { setEditingDeliveredPreBookingId(null); setActiveForm('list'); }}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
            </View>
            <View className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <Text className="text-amber-700 text-[10px] font-semibold leading-relaxed">
                This pre-booking has already been delivered. Changing quantities here edits the real order/invoice it produced ({booking.fulfilled_order_id}), automatically returning or consuming warehouse stock and recalculating the invoice total and store balance.
              </Text>
            </View>
            <View className="gap-1.5">
              <View className="flex-row justify-between"><Text className="text-slate-400 text-[10px]">Pre-Booking ID:</Text><Text className="font-bold text-slate-700 uppercase font-mono text-[10px]">{booking.id}</Text></View>
              <View className="flex-row justify-between"><Text className="text-slate-400 text-[10px]">Partner Store:</Text><Text className="font-bold text-slate-800 text-[10px]">{bookingStore?.name}</Text></View>
            </View>

            <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
              <Text className="font-bold text-slate-500 text-[10px] uppercase">Items</Text>
              {editItemsList.length === 0 ? (
                <Text className="text-[10px] text-slate-400 italic py-2 text-center">No items - add at least one product below.</Text>
              ) : (
                editItemsList.map(([productId, qty]) => {
                  const product = data.products.find(p => p.id === productId);
                  const originalItem = booking.items.find(i => i.product_id === productId);
                  const unitPrice = originalItem ? originalItem.unit_price : (product ? getEffectiveProductPrice(product, 'wholesale', booking.store_id, data.storePricing) : 0);
                  const piecesPerBox = product?.pieces_per_box ?? 1;
                  // Headroom = what's currently free in the warehouse plus
                  // whatever this line already holds (already committed to
                  // this booking's order, so it isn't "extra" demand on top
                  // of itself).
                  const available = addQty(getWarehouseStock(productId), { boxes: originalItem?.quantity ?? 0, pieces: originalItem?.quantity_pieces ?? 0 }, piecesPerBox);
                  const lineAmount = toTotalPieces(qty, piecesPerBox) * unitPrice;
                  return (
                    <View key={productId} className="flex-row items-center justify-between border-b border-slate-100 pb-1.5 last:border-0">
                      <View className="flex-1 pr-2">
                        <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{product?.name}</Text>
                        <Text className="text-slate-400 text-[9px]">Rs. {unitPrice.toFixed(2)} / unit - Rs. {lineAmount.toFixed(2)}</Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <BoxPieceInput
                          value={qty}
                          onChange={q => {
                            if (compareQty(q, available, piecesPerBox) > 0) showAlert(`Only ${formatQty(available)} of ${product?.name ?? 'this product'} can be allocated to this pre-booking.`);
                            const next = compareQty(q, available, piecesPerBox) > 0 ? available : q;
                            setEditDeliveredPreBookingItems(prev => ({ ...prev, [productId]: next }));
                          }}
                          piecesPerBox={piecesPerBox}
                          compact
                        />
                        <Pressable onPress={() => setEditDeliveredPreBookingItems(prev => { const next = { ...prev }; delete next[productId]; return next; })} className="w-7 h-7 bg-rose-50 rounded-lg items-center justify-center active:bg-rose-100 ml-1">
                          <Trash2 size={13} color="#e11d48" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View className="gap-2">
              <Text className="font-bold text-slate-500 text-[10px] uppercase">Add A Product</Text>
              <View className="flex-row items-center gap-2 bg-white border border-slate-200 rounded-xl px-3">
                <Search size={14} color="#94a3b8" />
                <TextInput
                  value={editDeliveredPreBookingSearch}
                  onChangeText={setEditDeliveredPreBookingSearch}
                  placeholder="Search products to add..."
                  placeholderTextColor="#94a3b8"
                  className="flex-1 text-xs text-slate-800 py-2"
                  style={{ outlineStyle: 'none' } as any}
                />
                {editDeliveredPreBookingSearch.length > 0 && (
                  <Pressable onPress={() => setEditDeliveredPreBookingSearch('')} hitSlop={8}>
                    <X size={14} color="#94a3b8" />
                  </Pressable>
                )}
              </View>
              {editDeliveredPreBookingSearch.trim().length > 0 && (
                <View className="border border-slate-100 rounded-xl bg-white" style={{ maxHeight: 160 }}>
                  <ScrollView>
                    {filteredEditProducts.slice(0, 20).map(product => (
                      <Pressable
                        key={product.id}
                        onPress={() => { setEditDeliveredPreBookingItems(prev => ({ ...prev, [product.id]: { boxes: 1, pieces: 0 } })); setEditDeliveredPreBookingSearch(''); }}
                        className="flex-row items-center justify-between px-3 py-2 border-b border-slate-50 active:bg-slate-50"
                      >
                        <Text className="text-slate-700 text-xs flex-1" numberOfLines={1}>{product.name}</Text>
                        <Text className="text-slate-400 text-[10px]">{formatQty(getWarehouseStock(product.id))} in stock</Text>
                      </Pressable>
                    ))}
                    {filteredEditProducts.length === 0 && (
                      <Text className="text-[10px] text-slate-400 italic py-2 text-center">No matching products.</Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <View className="bg-slate-100 p-3 rounded-xl gap-1">
              <View className="flex-row justify-between items-center">
                <Text className="font-extrabold text-slate-700 text-xs uppercase">New Grand Total</Text>
                <Text className="font-black text-indigo-600 text-sm">{formatWholeRupees(previewGrandTotal)}</Text>
              </View>
            </View>

            <Pressable onPress={() => handleSaveEditDeliveredPreBooking(booking)} className="w-full py-2.5 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
              <Text className="text-white font-bold text-xs uppercase">Save Changes</Text>
            </Pressable>
          </View>
        );
      })() : activeForm === 'purchase_details' && viewingPurchase ? (() => {
        const supplier = data.suppliers.find(s => s.id === viewingPurchase.supplier_id) || reportingSupplier;
        const unitsLabel = formatQty({ boxes: viewingPurchase.items.reduce((sum, item) => sum + item.quantity, 0), pieces: viewingPurchase.items.reduce((sum, item) => sum + item.quantity_pieces, 0) });
        const value = viewingPurchase.items.reduce((sum, item) => {
          return sum + purchaseLineValue(item, item.purchase_price);
        }, 0);
        return (
          <View className="bg-white p-4 lg:p-6 rounded-2xl border border-slate-200 gap-3 w-full lg:max-w-2xl lg:self-center">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
              <View>
                <Text className="font-extrabold text-slate-800 text-sm">Stock Inward Invoice</Text>
                <Text className="text-[10px] text-slate-400 mt-0.5">Invoice: {viewingPurchase.invoice_number}</Text>
              </View>
              <Pressable onPress={closePurchaseViewer}><Text className="text-slate-400 text-xs">Back</Text></Pressable>
            </View>

            <View className="gap-1 bg-slate-50 p-3 rounded-2xl">
              <Text className="text-slate-700 text-xs"><Text className="font-bold">Supplier:</Text> {supplier?.name || 'Unknown'}</Text>
              <Text className="text-slate-700 text-xs"><Text className="font-bold">Date Received:</Text> {new Date(viewingPurchase.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
              <Text className="text-slate-700 text-xs"><Text className="font-bold">GRN ID:</Text> {viewingPurchase.id}</Text>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">SKUs</Text><Text className="text-xs font-black text-slate-800">{viewingPurchase.items.length}</Text></View>
              <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Units</Text><Text className="text-xs font-black text-slate-800">{unitsLabel}</Text></View>
              <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Total Value</Text><Text className="text-xs font-black text-emerald-600">{formatWholeRupees(value)}</Text></View>
            </View>

            <View className="border border-slate-100 rounded-xl p-3 bg-slate-50 gap-2">
              <Text className="font-bold text-slate-500 text-[10px]">LINE ITEMS ({viewingPurchase.items.length}):</Text>
              {viewingPurchase.items.map((item, idx) => {
                const product = data.products.find(p => p.id === item.product_id);
                const lineTotal = purchaseLineValue(item, item.purchase_price);
                return (
                  <View key={idx} className="flex-row justify-between items-center border-b border-slate-100 pb-1.5 last:border-0">
                    <View className="flex-1 mr-2">
                      <Text className="font-bold text-slate-800 text-[11px]">{product?.name || 'Unknown Product'}</Text>
                      <Text className="text-slate-400 text-[9px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatPurchaseUnitRate(item, item.purchase_price)} - Mfg: {item.mfg_date || 'N/A'} - Exp: {item.expiry_date || 'N/A'}</Text>
                    </View>
                    <Text className="font-bold text-slate-700 text-[11px]">Rs. {lineTotal.toFixed(2)}</Text>
                  </View>
                );
              })}
            </View>

            <View className="gap-1.5">
              <Text className="font-bold text-slate-700 text-[9px] uppercase">Supplier Bill (Invoice #{viewingPurchase.invoice_number})</Text>

              {billActionStatus && (
                <View className={`flex-row items-center justify-between p-2 rounded-lg border ${billActionStatus.type === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                  <Text className={`flex-1 text-[10px] font-bold ${billActionStatus.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{billActionStatus.message}</Text>
                  <Pressable onPress={() => setBillActionStatus(null)} hitSlop={8}>
                    <X size={12} color={billActionStatus.type === 'success' ? '#059669' : '#e11d48'} />
                  </Pressable>
                </View>
              )}

              {confirmRemoveBill ? (
                <View className="gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <Text className="text-rose-700 text-[10px] font-bold">Remove this supplier bill? You can attach the correct photo, PDF, or Excel sheet afterward.</Text>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => handleConfirmRemoveSupplierBill(viewingPurchase.id)}
                      className="flex-1 py-1.5 bg-rose-600 rounded-lg items-center active:bg-rose-700"
                    >
                      <Text className="text-white font-bold text-[10px]">Yes, Remove</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmRemoveBill(false)} className="flex-1 py-1.5 bg-white border border-slate-200 rounded-lg items-center active:bg-slate-100">
                      <Text className="text-slate-700 font-bold text-[10px]">No, Keep</Text>
                    </Pressable>
                  </View>
                </View>
              ) : viewingPurchase.bill_file_url ? (() => {
                const billFileName = buildAttachmentFileName(
                  'Supplier_Bill',
                  viewingPurchase.invoice_number,
                  viewingPurchase.bill_file_name || 'bill',
                  viewingPurchase.bill_file_type
                );
                return (
                  <View className="gap-1.5">
                    {(viewingPurchase.bill_file_type || '').startsWith('image/') ? (
                      <Pressable onPress={() => viewOrDownloadDataUriFile(viewingPurchase.bill_file_url!, billFileName, viewingPurchase.bill_file_type || 'application/octet-stream', showAlert)}>
                        <Image source={{ uri: viewingPurchase.bill_file_url }} className="w-full h-40 rounded-xl bg-slate-100" resizeMode="contain" />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => viewOrDownloadDataUriFile(viewingPurchase.bill_file_url!, billFileName, viewingPurchase.bill_file_type || 'application/octet-stream', showAlert)}
                        className="flex-row items-center gap-1.5 py-2 px-3 bg-indigo-50 border border-indigo-100 rounded-xl active:bg-indigo-100"
                      >
                        <Download size={13} color="#4f46e5" />
                        <Text className="text-indigo-600 font-bold text-[11px]" numberOfLines={1}>{billFileName}</Text>
                      </Pressable>
                    )}
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => handleReplaceSupplierBill(viewingPurchase.id)}
                        className="flex-1 flex-row items-center justify-center gap-1 py-1.5 bg-slate-100 border border-slate-200 rounded-lg active:bg-slate-200"
                      >
                        <Edit size={11} color="#475569" />
                        <Text className="text-slate-600 font-bold text-[9px]">Wrong file? Replace</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmRemoveBill(true)}
                        className="flex-1 flex-row items-center justify-center gap-1 py-1.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100"
                      >
                        <Trash2 size={11} color="#e11d48" />
                        <Text className="text-rose-600 font-bold text-[9px]">Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })() : (
                <Pressable
                  onPress={() => handleReplaceSupplierBill(viewingPurchase.id)}
                  className="flex-row items-center justify-center gap-1.5 py-2 bg-white border border-dashed border-slate-300 rounded-lg active:bg-slate-100"
                >
                  <Download size={13} color="#475569" />
                  <Text className="text-slate-600 font-bold text-[11px]">Attach Supplier Bill (Photo / PDF / Excel)</Text>
                </Pressable>
              )}
            </View>

            <View className="flex-row gap-2">
              <Pressable
                onPress={() => supplier && handleDownloadStockReceiptPdf(viewingPurchase, supplier)}
                className="flex-1 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl items-center active:bg-emerald-100 flex-row justify-center gap-1.5"
              >
                <Download size={14} color="#059669" />
                <Text className="text-emerald-600 font-bold text-xs">Download PDF</Text>
              </Pressable>
              <Pressable onPress={closePurchaseViewer} className="flex-1 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close</Text></Pressable>
            </View>
          </View>
        );
      })() : (
        <View className="gap-4">
          {salesTab === 'suppliers' && (
            <View className="gap-3">
              <View className="flex-row items-center gap-2 z-20">
                <View className="flex-1 lg:max-w-sm relative justify-center">
                  <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                  <AutocompleteInput value={supplierSearchQuery} onChangeText={setSupplierSearchQuery} suggestions={supplierSearchSuggestions} placeholder="Search supplier name, contact, phone..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
                </View>
                <Pressable onPress={handleOpenAddSupplier} className="bg-rose-500 p-2.5 rounded-xl active:bg-rose-600"><Plus size={20} color="#fff" /></Pressable>
              </View>

              <FilterBar hideSearch>
                <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
                  <Pressable onPress={() => setSupplierListTab('active')} className={`py-1.5 px-3 rounded-lg items-center justify-center ${supplierListTab === 'active' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-extrabold ${supplierListTab === 'active' ? 'text-white' : 'text-slate-500'}`}>Supply Partners</Text>
                  </Pressable>
                  <Pressable onPress={() => setSupplierListTab('inactive')} className={`py-1.5 px-3 rounded-lg items-center justify-center flex-row gap-1.5 ${supplierListTab === 'inactive' ? 'bg-indigo-600' : ''}`}>
                    <RotateCcw size={13} color={supplierListTab === 'inactive' ? '#ffffff' : '#64748b'} />
                    <Text className={`text-[10px] font-extrabold ${supplierListTab === 'inactive' ? 'text-white' : 'text-slate-500'}`}>Removed Partners</Text>
                    {data.suppliers.filter(s => s.status === 'Inactive').length > 0 && (
                      <View className="bg-red-500 rounded-full px-1.5 py-0.5">
                        <Text className="text-white font-extrabold text-[8px]">{data.suppliers.filter(s => s.status === 'Inactive').length}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </FilterBar>

              {(() => {
                const filteredSuppliers = data.suppliers
                  .filter(s => supplierListTab === 'inactive' ? s.status === 'Inactive' : s.status === 'Active')
                  .filter(s => s.name.toLowerCase().includes(debouncedSupplierSearch.toLowerCase()) || s.contact_person.toLowerCase().includes(debouncedSupplierSearch.toLowerCase()) || s.phone.includes(debouncedSupplierSearch) || s.email.toLowerCase().includes(debouncedSupplierSearch.toLowerCase()));
                const emptySupplierText = supplierListTab === 'inactive' ? 'No removed supply partners. Anything you remove will show up here for restoring.' : 'No suppliers match your search query.';

                if (data.suppliers.length === 0) {
                  return (
                    <View className="p-8 items-center bg-white border border-dashed border-slate-200 rounded-3xl gap-2">
                      <View className="w-12 h-12 bg-slate-50 rounded-full items-center justify-center border border-slate-100"><Truck size={20} color="#94a3b8" /></View>
                      <Text className="text-xs font-black text-slate-800">No suppliers registered yet</Text>
                      <Text className="text-[10px] text-slate-500 font-bold text-center">Register your first supplier to start receiving stock into the warehouse silos.</Text>
                      <Pressable onPress={handleOpenAddSupplier} className="py-1.5 px-3 bg-rose-500 rounded-lg active:bg-rose-600"><Text className="text-white text-[10px] font-bold">+ Register First Supplier</Text></Pressable>
                    </View>
                  );
                }

                if (viewMode === 'table') {
                  return (
                    <DataTable
                      data={filteredSuppliers}
                      keyExtractor={s => s.id}
                      emptyText={emptySupplierText}
                      columns={[
                        {
                          key: 'name', label: 'Supplier', width: 170,
                          render: (s: Supplier) => (
                            <View className="flex-row items-center gap-1">
                              <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text>
                              {s.status === 'Inactive' && <Text className="text-[8px] font-black px-1 rounded-full bg-red-50 text-red-600">Inactive</Text>}
                            </View>
                          ),
                        },
                        { key: 'contact', label: 'Contact', width: 120, render: (s: Supplier) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.contact_person || 'N/A'}</Text> },
                        { key: 'phone', label: 'Phone', width: 100, render: (s: Supplier) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.phone}</Text> },
                        { key: 'email', label: 'Email', width: 150, render: (s: Supplier) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.email || 'N/A'}</Text> },
                        { key: 'receipts', label: 'Receipts', width: 70, align: 'center' as const, render: (s: Supplier) => <Text className="text-[10px] font-bold text-slate-700 text-center">{data.purchases.filter(p => p.supplier_id === s.id).length}</Text> },
                        {
                          key: 'actions', label: 'Actions', width: 170, grow: false,
                          render: (s: Supplier) => {
                            const isInactive = s.status === 'Inactive';
                            return (
                              <View className="flex-row flex-wrap items-center gap-1">
                                <Pressable onPress={() => setViewingSupplier(s)} className="py-0.5 px-1.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100"><Text className="text-indigo-600 font-bold text-[8px]">View Info</Text></Pressable>
                                <Pressable onPress={() => handleOpenSupplierReport(s)} className="py-0.5 px-1.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[8px]">Report</Text></Pressable>
                                <Pressable onPress={() => handleOpenEditSupplier(s)} className="py-0.5 px-1.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"><Text className="text-slate-600 font-bold text-[8px]">Edit</Text></Pressable>
                                {isInactive ? (
                                  <Pressable onPress={() => handleReactivateSupplier(s.id)} className="py-0.5 px-1.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[8px]">Reactivate</Text></Pressable>
                                ) : (
                                  <Pressable onPress={() => setDeleteSupplierConfirmId(s.id)} className="py-0.5 px-1.5 bg-rose-50 rounded-lg border border-rose-100 active:bg-rose-100"><Text className="text-rose-600 font-bold text-[8px]">Delete</Text></Pressable>
                                )}
                              </View>
                            );
                          },
                        },
                      ] as DataTableColumn<Supplier>[]}
                    />
                  );
                }

                return (
                  <View className={`gap-2.5 md:flex-row md:flex-wrap ${filteredSuppliers.length === 0 ? 'flex-1' : ''}`}>
                    {filteredSuppliers.length === 0 ? (
                      <EmptyState message={emptySupplierText} />
                    ) : (
                      filteredSuppliers.map(s => {
                        const supplierPurchases = data.purchases.filter(p => p.supplier_id === s.id);
                        const isExpanded = expandedSupplierId === s.id;
                        const isInactive = s.status === 'Inactive';
                        return (
                          <View key={s.id} className={`w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 relative ${isInactive ? 'opacity-60' : ''}`}>
                            <Text className={`absolute top-3 right-3 text-[9px] font-black px-1.5 py-0.5 rounded-full ${isInactive ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{isInactive ? 'Inactive' : 'Active'}</Text>
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
                              <Pressable onPress={() => handleOpenSupplierReport(s)} className="py-1 px-2.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[9px]">Report</Text></Pressable>
                              <Pressable onPress={() => handleOpenEditSupplier(s)} className="py-1 px-2.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"><Text className="text-slate-600 font-bold text-[9px]">Edit</Text></Pressable>
                              {isInactive ? (
                                <Pressable onPress={() => handleReactivateSupplier(s.id)} className="py-1 px-2.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[9px]">Reactivate</Text></Pressable>
                              ) : (
                                <Pressable onPress={() => setDeleteSupplierConfirmId(s.id)} className="py-1 px-2.5 bg-rose-50 rounded-lg border border-rose-100 active:bg-rose-100"><Text className="text-rose-600 font-bold text-[9px]">Delete</Text></Pressable>
                              )}
                              {/* <Pressable onPress={() => setExpandedSupplierId(isExpanded ? null : s.id)} className={`py-1 px-2.5 rounded-lg border ${isExpanded ? 'bg-rose-500 border-rose-600' : 'bg-white border-slate-200'}`}>
                                <Text className={`font-bold text-[9px] ${isExpanded ? 'text-white' : 'text-slate-600'}`}>{isExpanded ? 'Close' : 'View Receipts'}</Text>
                              </Pressable> */}
                            </View>
                            {isExpanded && (
                              <View className="mt-3 bg-slate-50 border-t border-slate-100 p-3 rounded-xl gap-2">
                                <Text className="font-extrabold text-slate-700 text-[10px]">Recent Cold-Chain Stock Inwards</Text>
                                {supplierPurchases.length === 0 ? (
                                  <Text className="text-[10px] text-slate-400 font-semibold italic">No stock inward dispatches registered from this supplier yet.</Text>
                                ) : (
                                  supplierPurchases.map(p => {
                                    const totalQty = formatQty({ boxes: p.items.reduce((sum, item) => sum + item.quantity, 0), pieces: p.items.reduce((sum, item) => sum + item.quantity_pieces, 0) });
                                    const totalCost = p.items.reduce((sum, item) => sum + purchaseLineValue(item, item.purchase_price), 0);
                                    return (
                                      <View key={p.id} className="bg-white border border-slate-200 p-2.5 rounded-xl gap-1.5">
                                        <View className="flex-row justify-between border-b border-slate-100 pb-1"><Text className="text-slate-700 font-bold text-[10px]">Invoice: {p.invoice_number}</Text><Text className="text-slate-400 text-[10px]">{new Date(p.date).toLocaleDateString()}</Text></View>
                                        {p.items.map((item, idx) => {
                                          const prod = data.products.find(prod => prod.id === item.product_id);
                                          return (
                                            <View key={idx} className="bg-slate-50 p-1.5 rounded-lg">
                                              <View className="flex-row justify-between"><Text className="font-semibold text-slate-700 text-[10px]">{prod?.name || 'Unknown'}</Text><Text className="text-[10px] text-slate-600">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} ({formatPurchaseUnitRate(item, item.purchase_price)})</Text></View>
                                            </View>
                                          );
                                        })}
                                        <View className="flex-row justify-between items-center pt-1 border-t border-slate-100">
                                          <Text className="text-[10px] font-bold text-slate-700">Total: {totalQty}</Text>
                                          <View className="flex-row items-center gap-2">
                                            <Text className="text-[10px] font-black text-emerald-600">{formatWholeRupees(totalCost)}</Text>
                                            <Pressable onPress={() => openPurchaseViewer(p)} className="p-1.5 bg-slate-100 rounded-lg border border-slate-200 active:bg-slate-200">
                                              <Eye size={10} color="#64748b" />
                                            </Pressable>
                                            <Pressable onPress={() => handleDownloadStockReceiptPdf(p, s)} className="flex-row items-center gap-1 py-1 px-2 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100">
                                              <Download size={10} color="#4f46e5" />
                                              <Text className="text-indigo-600 font-bold text-[9px]">Download PDF</Text>
                                            </Pressable>
                                          </View>
                                        </View>
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
                );
              })()}
            </View>
          )}

          {salesTab === 'stores' && (
            <View className="gap-3">
              <View className="flex-row items-center gap-2 z-20">
                <View className="flex-1 lg:max-w-sm relative justify-center">
                  <View className="absolute left-3 z-10"><Search size={16} color="#94a3b8" /></View>
                  <AutocompleteInput value={storeSearch} onChangeText={setStoreSearch} suggestions={storeSearchSuggestions} placeholder="Search store name, owner, area..." placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2.5 text-xs rounded-xl" />
                </View>
                <Pressable onPress={handleOpenManageAreas} className="bg-slate-800 flex-row items-center gap-1.5 px-3 py-2.5 rounded-xl active:bg-slate-900"><Settings2 size={18} color="#fff" /><Text className="text-white font-bold text-xs">District Areas</Text></Pressable>
                <Pressable onPress={handleOpenManageVillages} className="bg-slate-700 flex-row items-center gap-1.5 px-3 py-2.5 rounded-xl active:bg-slate-800"><Settings2 size={18} color="#fff" /><Text className="text-white font-bold text-xs">Villages</Text></Pressable>
                <Pressable onPress={handleOpenManagePartnerTypes} className="bg-indigo-600 flex-row p-2.5 rounded-xl active:bg-indigo-700"><Settings2 size={18} color="#fff" /><Text className="text-white font-bold text-xs">Partner Types</Text></Pressable>
                <Pressable onPress={handleOpenAddStore} className="bg-rose-500 p-2.5 rounded-xl active:bg-rose-600"><Plus size={20} color="#fff" /></Pressable>
              </View>

              <FilterBar hideSearch>
                <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
                  <Pressable onPress={() => setStoreListTab('active')} className={`py-1.5 px-3 rounded-lg items-center justify-center ${storeListTab === 'active' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-extrabold ${storeListTab === 'active' ? 'text-white' : 'text-slate-500'}`}>Partners</Text>
                  </Pressable>
                  <Pressable onPress={() => setStoreListTab('inactive')} className={`py-1.5 px-3 rounded-lg items-center justify-center flex-row gap-1.5 ${storeListTab === 'inactive' ? 'bg-indigo-600' : ''}`}>
                    <RotateCcw size={13} color={storeListTab === 'inactive' ? '#ffffff' : '#64748b'} />
                    <Text className={`text-[10px] font-extrabold ${storeListTab === 'inactive' ? 'text-white' : 'text-slate-500'}`}>Removed Shops</Text>
                    {data.stores.filter(s => s.status === 'Inactive').length > 0 && (
                      <View className="bg-red-500 rounded-full px-1.5 py-0.5">
                        <Text className="text-white font-extrabold text-[8px]">{data.stores.filter(s => s.status === 'Inactive').length}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
                <SelectField
                  value={storeAreaFilter}
                  onValueChange={setStoreAreaFilter}
                  options={[{ label: 'All Areas', value: 'All' }, ...data.areas.map(a => ({ label: a.name, value: a.name }))]}
                  title="District Area"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                <SelectField
                  value={storeVillageFilter}
                  onValueChange={setStoreVillageFilter}
                  options={[{ label: 'All Villages', value: 'All' }, ...data.villages.map(v => ({ label: v.name, value: v.name }))]}
                  title="Village"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
              </FilterBar>

              {(() => {
                const emptyStoreText = storeListTab === 'inactive' ? 'No removed shop partners. Anything you remove will show up here for restoring.' : 'No partner stores match your search query.';

                if (data.stores.length === 0) {
                  return (
                    <View className="p-8 items-center bg-white border border-dashed border-slate-200 rounded-3xl gap-2">
                      <View className="w-12 h-12 bg-slate-50 rounded-full items-center justify-center border border-slate-100"><MapPin size={20} color="#94a3b8" /></View>
                      <Text className="text-xs font-black text-slate-800">No shop partners registered yet</Text>
                      <Pressable onPress={handleOpenAddStore} className="py-1.5 px-3 bg-rose-500 rounded-lg active:bg-rose-600"><Text className="text-white text-[10px] font-bold">+ Register First Shop Partner</Text></Pressable>
                    </View>
                  );
                }

                if (viewMode === 'table') {
                  return (
                    <DataTable
                      data={filteredStores}
                      keyExtractor={s => s.id}
                      emptyText={emptyStoreText}
                      columns={[
                        {
                          key: 'name', label: 'Store', width: 190,
                          render: (s: Store) => {
                            const assetBadge = getPartnerAssetBadge(s.id);
                            return (
                              <View>
                                <View className="flex-row items-center gap-1 flex-wrap">
                                  <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text>
                                  {assetBadge && <Text className="text-[8px] font-black px-1 rounded-full bg-sky-50 text-sky-600" numberOfLines={1}>{assetBadge}</Text>}
                                  <Text className={`text-[8px] font-black px-1 rounded-full ${s.ranking === 'Platinum' ? 'bg-indigo-50 text-indigo-600' : s.ranking === 'Gold' ? 'bg-amber-50 text-amber-600' : s.ranking === 'Silver' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-500'}`}>{s.ranking}</Text>
                                  {s.status === 'Inactive' && <Text className="text-[8px] font-black px-1 rounded-full bg-red-50 text-red-600">Inactive</Text>}
                                </View>
                              </View>
                            );
                          },
                        },
                        { key: 'owner', label: 'Owner', width: 120, render: (s: Store) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.owner_name}</Text> },
                        { key: 'type', label: 'Partner Type', width: 120, render: (s: Store) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.partner_type || 'Retail Shop'}</Text> },
                        { key: 'phone', label: 'Phone', width: 100, render: (s: Store) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.phone}</Text> },
                        {
                          key: 'outstanding', label: 'Outstanding/Limit', width: 130,
                          render: (s: Store) => <Text className={`text-[10px] font-bold ${s.outstanding_balance > s.credit_limit ? 'text-red-500' : 'text-slate-700'}`}>{formatWholeRupees(s.outstanding_balance)} / {formatWholeRupees(s.credit_limit)}</Text>,
                        },
                        { key: 'health', label: 'Health', width: 70, align: 'center' as const, render: (s: Store) => <Text className="font-extrabold text-indigo-500 text-[10px] text-center">{calculateStoreHealthScore(s)}/100</Text> },
                        {
                          key: 'actions', label: 'Actions', width: 160, grow: false,
                          render: (s: Store) => {
                            const isInactive = s.status === 'Inactive';
                            return (
                              <View className="flex-row flex-wrap items-center gap-1">
                                <Pressable onPress={() => setViewingStore(s)} className="py-0.5 px-1.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100"><Text className="text-indigo-600 font-bold text-[8px]">View Info</Text></Pressable>
                                <Pressable onPress={() => handleOpenStoreReport(s)} className="py-0.5 px-1.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[8px]">Report</Text></Pressable>
                                <Pressable
                                  onPress={() => {
                                    setSelectedStore(s);
                                    setStoreForm({ name: s.name, owner_name: s.owner_name, phone: s.phone, alt_phone: s.alt_phone, address: s.address, area: s.area, village: s.village || '', city: s.city, state: s.state, pincode: s.pincode, gst_number: s.gst_number, credit_limit: s.credit_limit, refill_frequency: s.refill_frequency, custom_days: s.custom_days || 7, ranking: s.ranking, partner_type: s.partner_type || 'Retail Shop' });
                                    const existingFreezerBox = partnerAssets.find(a => a.asset_type === 'Freezer Box' && a.assigned_partner_id === s.id);
                                    setFreezerBoxAssetId(existingFreezerBox?.id || '');
                                    setOriginalFreezerBoxAssetId(existingFreezerBox?.id || '');
                                    setActiveForm('edit_store');
                                  }}
                                  className="py-0.5 px-1.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"
                                ><Text className="text-slate-600 font-bold text-[8px]">Edit</Text></Pressable>
                                <Pressable onPress={() => handleOpenStorePricing(s)} className="py-0.5 px-1.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100"><Text className="text-indigo-600 font-bold text-[8px]">Pricing</Text></Pressable>
                                {isInactive ? (
                                  <Pressable onPress={() => handleReactivateStore(s.id)} className="py-0.5 px-1.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[8px]">Reactivate</Text></Pressable>
                                ) : (
                                  <Pressable onPress={() => setDeleteStoreConfirmId(s.id)} className="py-0.5 px-1.5 bg-rose-50 rounded-lg border border-rose-100 active:bg-rose-100"><Text className="text-rose-600 font-bold text-[8px]">Delete</Text></Pressable>
                                )}
                              </View>
                            );
                          },
                        },
                      ] as DataTableColumn<Store>[]}
                    />
                  );
                }

                return (
                  <View className={`gap-2.5 md:flex-row md:flex-wrap ${filteredStores.length === 0 ? 'flex-1' : ''}`}>
                    {filteredStores.length === 0 ? (
                      <EmptyState message={emptyStoreText} />
                    ) : (
                      filteredStores.map(s => {
                        const isExpanded = expandedStoreId === s.id;
                        const storeOrders = data.orders.filter(o => o.store_id === s.id);
                        const isInactive = s.status === 'Inactive';
                        const assetBadge = getPartnerAssetBadge(s.id);
                        return (
                          <View key={s.id} className={`w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 relative ${isInactive ? 'opacity-60' : ''}`}>
                            <View className="absolute top-3 right-3 items-end gap-1">
                              {assetBadge && <Text className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600">{assetBadge}</Text>}
                              <Text className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${s.ranking === 'Platinum' ? 'bg-indigo-50 text-indigo-600' : s.ranking === 'Gold' ? 'bg-amber-50 text-amber-600' : s.ranking === 'Silver' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-500'}`}>{s.ranking}</Text>
                              {isInactive && <Text className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Inactive</Text>}
                            </View>
                            <View className="flex-row items-start gap-2 pr-16">
                              <View className="p-2 bg-rose-50 rounded-xl mt-0.5"><MapPin size={16} color="#f43f5e" /></View>
                              <View className="flex-1">
                                <Text className="font-bold text-slate-800 text-xs">{s.name}</Text>
                                <Text className="text-[10px] text-slate-400 mt-0.5">Owner: {s.owner_name} - Phone: {s.phone}</Text>
                                <Text className="text-[9px] font-bold text-indigo-500 mt-0.5">{s.partner_type || 'Retail Shop'}</Text>
                              </View>
                            </View>
                            <View className="flex-row justify-between mt-3 pt-2 border-t border-slate-50">
                              <View><Text className="text-slate-400 text-[9px]">Outstanding Bal</Text><Text className={`font-bold text-[10px] ${s.outstanding_balance > s.credit_limit ? 'text-red-500' : 'text-slate-700'}`}>Rs. {s.outstanding_balance.toFixed(2)} / Rs. {s.credit_limit.toFixed(2)} Max</Text></View>
                              <View className="items-end"><Text className="text-slate-400 text-[9px]">Health Index</Text><Text className="font-extrabold text-indigo-500 text-[10px]">{calculateStoreHealthScore(s)}/100</Text></View>
                            </View>
                            <View className="flex-row flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-50 justify-end">
                              <Pressable onPress={() => setViewingStore(s)} className="py-1 px-2.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100"><Text className="text-indigo-600 font-bold text-[9px]">View Info</Text></Pressable>
                              <Pressable onPress={() => handleOpenStoreReport(s)} className="py-1 px-2.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[9px]">Report</Text></Pressable>
                              <Pressable
                                onPress={() => {
                                  setSelectedStore(s);
                                  setStoreForm({ name: s.name, owner_name: s.owner_name, phone: s.phone, alt_phone: s.alt_phone, address: s.address, area: s.area, village: s.village || '', city: s.city, state: s.state, pincode: s.pincode, gst_number: s.gst_number, credit_limit: s.credit_limit, refill_frequency: s.refill_frequency, custom_days: s.custom_days || 7, ranking: s.ranking, partner_type: s.partner_type || 'Retail Shop' });
                                  const existingFreezerBox = partnerAssets.find(a => a.asset_type === 'Freezer Box' && a.assigned_partner_id === s.id);
                                  setFreezerBoxAssetId(existingFreezerBox?.id || '');
                                  setOriginalFreezerBoxAssetId(existingFreezerBox?.id || '');
                                  setActiveForm('edit_store');
                                }}
                                className="py-1 px-2.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"
                              ><Text className="text-slate-600 font-bold text-[9px]">Edit</Text></Pressable>
                              <Pressable onPress={() => handleOpenStorePricing(s)} className="py-1 px-2.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100"><Text className="text-indigo-600 font-bold text-[9px]">Pricing</Text></Pressable>
                              {isInactive ? (
                                <Pressable onPress={() => handleReactivateStore(s.id)} className="py-1 px-2.5 bg-emerald-50 rounded-lg border border-emerald-100 active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[9px]">Reactivate</Text></Pressable>
                              ) : (
                                <Pressable onPress={() => setDeleteStoreConfirmId(s.id)} className="py-1 px-2.5 bg-rose-50 rounded-lg border border-rose-100 active:bg-rose-100"><Text className="text-rose-600 font-bold text-[9px]">Delete</Text></Pressable>
                              )}
                              {/* <Pressable onPress={() => setExpandedStoreId(isExpanded ? null : s.id)} className={`py-1 px-2.5 rounded-lg border ${isExpanded ? 'bg-rose-500 border-rose-600' : 'bg-white border-slate-200'}`}>
                                <Text className={`font-bold text-[9px] ${isExpanded ? 'text-white' : 'text-slate-600'}`}>{isExpanded ? 'Close' : 'View Details'}</Text>
                              </Pressable> */}
                            </View>
                            {isExpanded && (
                              <View className="mt-3 bg-slate-50 border-t border-slate-100 p-3 rounded-xl gap-2">
                                <View className="flex-row justify-between"><View><Text className="text-slate-400 text-[9px]">Alt Phone</Text><Text className="font-semibold text-slate-700 text-[10px]">{s.alt_phone || 'N/A'}</Text></View><View className="items-end"><Text className="text-slate-400 text-[9px]">GST Number</Text><Text className="font-semibold text-slate-700 text-[10px]">{s.gst_number || 'N/A'}</Text></View></View>
                                <View><Text className="text-slate-400 text-[9px]">Full Address</Text><Text className="font-semibold text-slate-700 text-[10px]">{s.address}{s.village ? `, ${s.village}` : ''}, {s.area}, {s.city}, {s.state} - {s.pincode}</Text></View>
                                <Text className="font-bold text-slate-700 text-[9px]">Recent Orders ({storeOrders.length})</Text>
                                {storeOrders.length === 0 ? (
                                  <Text className="text-[9px] text-slate-400 italic">No orders logged for this store yet.</Text>
                                ) : (
                                  storeOrders.slice(0, 5).map(o => {
                                    const totalQty = formatQty({ boxes: o.items.reduce((acc, item) => acc + item.quantity, 0), pieces: o.items.reduce((acc, item) => acc + item.quantity_pieces, 0) });
                                    const orderVal = o.items.reduce((sum, item) => sum + (effectiveLineValue(item, item.unit_price)), 0);
                                    return (
                                      <View key={o.id} className="bg-white border border-slate-100 p-2 rounded-lg flex-row justify-between items-center">
                                        <View><Text className="font-bold text-indigo-600 text-[9px]">#{o.id}</Text><Text className="text-slate-400 text-[9px]">{new Date(o.created_at).toLocaleDateString()} - {totalQty}</Text></View>
                                        <View className="items-end"><Text className={`px-1.5 py-0.5 rounded-md font-bold text-[8px] uppercase ${o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : o.status === 'Confirmed' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>{o.status}</Text><Text className="font-bold text-slate-700 text-[9px]">Rs. {orderVal.toFixed(2)}</Text></View>
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
                );
              })()}
            </View>
          )}

          {salesTab === 'orders' && (
            <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
              <View className="flex-row justify-between items-center border-b border-slate-100 pb-2">
                <Text className="font-bold text-slate-800 text-xs">Ice Cream Order Fleet Dispatch</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-[10px] text-slate-400">Total: {orders.total}</Text>
                  <Pressable
                    onPress={() => handleOpenCreateOrder()}
                    className="px-3 py-1.5 bg-blue-600 rounded-lg flex-row items-center gap-1 active:bg-blue-700"
                  >
                    <Plus size={12} color="#fff" />
                    <Text className="text-white font-bold text-[10px]">New Order</Text>
                  </Pressable>
                </View>
              </View>
              <FilterBar searchValue={orderSearch} onSearchChange={setOrderSearch} searchPlaceholder="Search by Outlet name, Owner, or Order ID...">
                <SelectField
                  value={orderStatusFilter}
                  onValueChange={v => setOrderStatusFilter(v as typeof orderStatusFilter)}
                  options={[
                    { label: 'All Statuses', value: 'All' },
                    { label: 'Confirmed', value: 'Confirmed' },
                    { label: 'Delivered', value: 'Delivered' },
                    { label: 'Cancelled', value: 'Cancelled' },
                  ]}
                  title="Fulfillment Status"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                <SelectField
                  value={orderPaymentFilter}
                  onValueChange={v => setOrderPaymentFilter(v as typeof orderPaymentFilter)}
                  options={[
                    { label: 'All Payments', value: 'All' },
                    { label: 'Fully Paid', value: 'Paid' },
                    { label: 'Partial Paid', value: 'Partial' },
                    { label: 'Not Paid', value: 'Unpaid' },
                  ]}
                  title="Settlement Status"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                <SelectField
                  value={orderPartnerTypeFilter}
                  onValueChange={setOrderPartnerTypeFilter}
                  options={[{ label: 'All Partner Types', value: 'All' }, ...data.partnerTypes.map(t => ({ label: t.name, value: t.name }))]}
                  title="Partner Type"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                <SelectField
                  value={orderSalespersonFilter}
                  onValueChange={setOrderSalespersonFilter}
                  options={[{ label: 'All Salespersons', value: 'All' }, ...data.users.filter(u => u.role === 'Salesperson').map(u => ({ label: u.name, value: u.id }))]}
                  title="Salesperson"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                <SelectField
                  value={orderTruckFilter}
                  onValueChange={setOrderTruckFilter}
                  options={[{ label: 'All Trucks', value: 'All' }, ...data.trucks.map(t => ({ label: t.vehicle_number, value: t.id }))]}
                  title="Truck"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                <SelectField
                  value={orderAreaFilter}
                  onValueChange={setOrderAreaFilter}
                  options={[{ label: 'All Areas', value: 'All' }, ...data.areas.map(a => ({ label: a.name, value: a.name }))]}
                  title="Area"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                {renderDateFilterField()}
              </FilterBar>

              <ScrollableSection height={ordersTableHeight}>
              {(() => {
                const filteredOrders = orders.data;

                if (orders.loading && filteredOrders.length === 0) {
                  return <View className="flex-1 items-center justify-center"><Text className="text-center text-slate-400 italic text-xs">Loading orders...</Text></View>;
                }
                if (orders.error) {
                  return <View className="flex-1 items-center justify-center"><Text className="text-center text-red-500 italic text-xs">{orders.error}</Text></View>;
                }

                if (viewMode === 'table') {
                  return (
                    <DataTable
                      data={filteredOrders}
                      keyExtractor={o => o.id}
                      emptyText="No orders match the current filters."
                      columns={[
                        {
                          key: 'store', label: 'Store / Order ID', width: 180,
                          render: (o: Order) => {
                            const store = data.stores.find(s => s.id === o.store_id);
                            return (
                              <View>
                                <Text className="font-extrabold text-slate-800 text-[11px]" numberOfLines={1}>{store?.name}</Text>
                                <View className="flex-row items-center gap-1 mt-0.5">
                                  <Text className="text-[8px] bg-slate-100 text-slate-400 font-bold uppercase px-1 rounded">{o.id}</Text>
                                  <Text className="text-[8px] bg-indigo-50 text-indigo-600 font-bold px-1 rounded" numberOfLines={1}>{store?.partner_type || 'Retail Shop'}</Text>
                                </View>
                              </View>
                            );
                          },
                        },
                        {
                          key: 'value', label: 'Items / Value', width: 110,
                          render: (o: Order) => {
                            const itemsQty = formatQty({ boxes: o.items.reduce((s, i) => s + i.quantity, 0), pieces: o.items.reduce((s, i) => s + i.quantity_pieces, 0) });
                            const orderVal = o.items.reduce((s, i) => s + (effectiveLineValue(i, i.unit_price)), 0);
                            return <Text className="text-[10px] text-slate-600">{itemsQty}{'\n'}Rs. {orderVal.toFixed(2)}</Text>;
                          },
                        },
                        { key: 'date', label: 'Date', width: 90, grow: false, render: (o: Order) => <Text className="text-[9px] text-slate-400">{new Date(o.created_at).toLocaleDateString()}</Text> },
                        {
                          key: 'status', label: 'Status', width: 90, grow: false,
                          render: (o: Order) => <Text className={`px-2 py-0.5 font-bold rounded text-[8px] uppercase self-start ${o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : o.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{o.status}</Text>,
                        },
                        {
                          key: 'payment', label: 'Payment', width: 90, grow: false,
                          render: (o: Order) => {
                            const inv = data.invoices.find(i => i.order_id === o.id);
                            if (o.status !== 'Delivered' || !inv) return <Text className="text-[9px] text-slate-300">-</Text>;
                            const isPaid = inv.payment_status === 'Paid';
                            const isPartial = inv.payment_status === 'Partial';
                            return <Text className={`px-2 py-0.5 font-black rounded text-[7px] uppercase self-start ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{isPaid ? 'Fully Paid' : isPartial ? 'Partial Paid' : 'Not Paid'}</Text>;
                          },
                        },
                        {
                          key: 'actions', label: 'Actions', width: 110, grow: false,
                          render: (o: Order) => {
                            const store = data.stores.find(s => s.id === o.store_id);
                            const inv = data.invoices.find(i => i.order_id === o.id);
                            return (
                              <View className="flex-row items-center gap-1">
                                {o.status === 'Delivered' && inv && store && (
                                  <>
                                    <Pressable onPress={() => downloadInvoicePDF(o, inv, store)} className="p-1.5 bg-slate-50 rounded-lg border border-slate-200 active:bg-slate-100"><Download size={13} color="#475569" /></Pressable>
                                    <Pressable onPress={() => handleWhatsAppShare(inv, store, o)} className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-200 active:bg-emerald-100"><MessageSquare size={13} color="#059669" /></Pressable>
                                  </>
                                )}
                                <Pressable onPress={() => { setSelectedOrder(o); setActiveForm('order_details'); }} className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 active:bg-slate-100"><Eye size={13} color="#64748b" /></Pressable>
                              </View>
                            );
                          },
                        },
                      ] as DataTableColumn<Order>[]}
                    />
                  );
                }

                return (
                  <View className={`gap-2.5 md:flex-row md:flex-wrap ${filteredOrders.length === 0 ? 'flex-1' : ''}`}>
                    {filteredOrders.length === 0 ? (
                      <EmptyState message="No orders match the current filters." />
                    ) : (
                      filteredOrders.map(o => {
                        const store = data.stores.find(s => s.id === o.store_id);
                        const itemsQty = formatQty({ boxes: o.items.reduce((s, i) => s + i.quantity, 0), pieces: o.items.reduce((s, i) => s + i.quantity_pieces, 0) });
                        const orderVal = o.items.reduce((s, i) => s + (effectiveLineValue(i, i.unit_price)), 0);
                        const inv = data.invoices.find(i => i.order_id === o.id);
                        return (
                          <View key={o.id} className="w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                            <View className="flex-1 pr-2">
                              <View className="flex-row items-center gap-2 flex-wrap">
                                <Text className="font-extrabold text-slate-800 text-xs">{store?.name}</Text>
                                <Text className="text-[8px] bg-slate-100 text-slate-400 font-bold uppercase px-1 rounded">{o.id}</Text>
                                <Text className="text-[8px] bg-indigo-50 text-indigo-600 font-bold px-1 rounded">{store?.partner_type || 'Retail Shop'}</Text>
                              </View>
                              <Text className="text-slate-400 text-[10px] mt-0.5">{itemsQty} - Rs. {orderVal.toFixed(2)}</Text>
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
                      })
                    )}
                  </View>
                );
              })()}
              </ScrollableSection>
              <PaginationFooter mode="offset" page={orders.page} totalPages={orders.totalPages} total={orders.total} loading={orders.loading} onPageChange={orders.goToPage} />
            </View>
          )}

          {salesTab === 'payments' && (
            <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
              <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                <Text className="font-bold text-slate-800 text-xs">UPI & Cash Payments Collection</Text>
                <Pressable onPress={() => setActiveForm('add_payment')} className="py-1 px-2.5 bg-emerald-50 border border-emerald-100 rounded-lg active:bg-emerald-100"><Text className="text-emerald-600 font-extrabold text-[9px]">+ Add Payment Collection</Text></Pressable>
              </View>
              <FilterBar searchValue={paymentSearch} onSearchChange={setPaymentSearch} searchPlaceholder="Search by store or owner name...">
                <SelectField
                  value={paymentMethodFilter}
                  onValueChange={setPaymentMethodFilter}
                  options={[
                    { label: 'All Methods', value: 'All' },
                    { label: 'Cash', value: 'Cash' },
                    { label: 'UPI', value: 'UPI' },
                    { label: 'Google Pay', value: 'Google Pay' },
                    { label: 'PhonePe', value: 'PhonePe' },
                    { label: 'Paytm', value: 'Paytm' },
                    { label: 'Bank Transfer', value: 'Bank Transfer' },
                    { label: 'Credit', value: 'Credit' },
                  ]}
                  title="Payment Method"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                <SelectField
                  value={paymentPartnerTypeFilter}
                  onValueChange={setPaymentPartnerTypeFilter}
                  options={[{ label: 'All Partner Types', value: 'All' }, ...data.partnerTypes.map(t => ({ label: t.name, value: t.name }))]}
                  title="Partner Type"
                  className={FILTER_PILL_CLASS}
                  textClassName={FILTER_PILL_TEXT_CLASS}
                />
                {renderDateFilterField()}
              </FilterBar>

              <ScrollableSection height={paymentsTableHeight}>
              {(() => {
                const filteredPayments = payments.data;

                if (payments.loading && filteredPayments.length === 0) {
                  return <View className="flex-1 items-center justify-center"><Text className="text-center text-slate-400 italic text-xs">Loading payments...</Text></View>;
                }
                if (payments.error) {
                  return <View className="flex-1 items-center justify-center"><Text className="text-center text-red-500 italic text-xs">{payments.error}</Text></View>;
                }

                if (viewMode === 'table') {
                  return (
                    <DataTable
                      data={filteredPayments}
                      keyExtractor={p => p.id}
                      emptyText="No payments match the current filters."
                      onRowPress={p => { const store = data.stores.find(s => s.id === p.store_id); if (store) setViewingStore(store); }}
                      columns={[
                        { key: 'store', label: 'Store', width: 170, render: (p: Payment) => <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{data.stores.find(s => s.id === p.store_id)?.name}</Text> },
                        { key: 'method', label: 'Method', width: 100, render: (p: Payment) => <Text className="text-[10px] text-slate-600">{p.method}</Text> },
                        { key: 'collected_by', label: 'Collected By', width: 130, render: (p: Payment) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{p.collected_by}</Text> },
                        { key: 'date', label: 'Date', width: 120, grow: false, render: (p: Payment) => <Text className="text-[9px] text-slate-400">{new Date(p.date).toLocaleString()}</Text> },
                        { key: 'amount', label: 'Amount', width: 100, align: 'right' as const, render: (p: Payment) => <Text className="text-emerald-600 font-black text-[11px] text-right">+Rs. {p.amount.toFixed(2)}</Text> },
                      ] as DataTableColumn<Payment>[]}
                    />
                  );
                }

                return (
                  <View className={`gap-2.5 md:flex-row md:flex-wrap ${filteredPayments.length === 0 ? 'flex-1' : ''}`}>
                    {filteredPayments.length === 0 ? (
                      <EmptyState message="No payments match the current filters." />
                    ) : (
                      filteredPayments.map(p => {
                        const store = data.stores.find(s => s.id === p.store_id);
                        return (
                          <Pressable key={p.id} onPress={() => store && setViewingStore(store)} className="w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                            <View>
                              <Text className="font-bold text-slate-800 text-xs">{store?.name}</Text>
                              <Text className="text-slate-400 text-[9px] mt-0.5">Method: {p.method} - Officer: {p.collected_by}</Text>
                              <Text className="text-[9px] text-slate-400">{new Date(p.date).toLocaleString()}</Text>
                            </View>
                            <Text className="text-emerald-600 font-black bg-emerald-50 px-2 py-1 rounded-xl text-xs">+Rs. {p.amount.toFixed(2)}</Text>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                );
              })()}
              </ScrollableSection>
              <PaginationFooter mode="offset" page={payments.page} totalPages={payments.totalPages} total={payments.total} loading={payments.loading} onPageChange={payments.goToPage} />
            </View>
          )}

          {salesTab === 'credit' && (
            <View className="gap-3">
              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 gap-3">
                <View>
                  <Text className="font-extrabold text-slate-800 text-xs uppercase">Outstanding Credit Limits Monitoring</Text>
                  <Text className="text-[10px] text-slate-400 font-medium">Filter, search, and sort partner outlet credit utilization</Text>
                </View>
                <FilterBar searchValue={creditSearch} onSearchChange={setCreditSearch} searchPlaceholder="Search partner...">
                  <SelectField
                    value={creditSort}
                    onValueChange={v => setCreditSort(v as any)}
                    options={[
                      { label: 'Balance: High to Low', value: 'balance_desc' }, { label: 'Balance: Low to High', value: 'balance_asc' },
                      { label: 'Credit Limit: High to Low', value: 'limit_desc' }, { label: 'Credit Limit: Low to High', value: 'limit_asc' },
                    ]}
                    title="Sort By"
                    className={FILTER_PILL_CLASS}
                    textClassName={FILTER_PILL_TEXT_CLASS}
                  />
                </FilterBar>
              </View>

              {(() => {
                const filteredCreditStores = data.stores
                  .filter(s => s.name.toLowerCase().includes(debouncedCreditSearch.toLowerCase()) || s.owner_name.toLowerCase().includes(debouncedCreditSearch.toLowerCase()))
                  .sort((a, b) => creditSort === 'balance_desc' ? b.outstanding_balance - a.outstanding_balance : creditSort === 'balance_asc' ? a.outstanding_balance - b.outstanding_balance : creditSort === 'limit_desc' ? b.credit_limit - a.credit_limit : a.credit_limit - b.credit_limit);

                if (viewMode === 'table') {
                  return (
                    <DataTable
                      data={filteredCreditStores}
                      keyExtractor={s => s.id}
                      emptyText="No partner outlets match the current filters."
                      columns={[
                        { key: 'store', label: 'Store', width: 160, render: (s: Store) => <Text className="font-extrabold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text> },
                        { key: 'owner', label: 'Owner / Phone', width: 150, render: (s: Store) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.owner_name} - {s.phone}</Text> },
                        {
                          key: 'used', label: 'Credit Used %', width: 90,
                          render: (s: Store) => {
                            const limitRatio = s.outstanding_balance / (s.credit_limit || 1);
                            const isOverdue = limitRatio > 0.8;
                            const percentUsed = Math.min(100, Math.round(limitRatio * 100));
                            return (
                              <View className="gap-1">
                                <Text className={`text-[9px] font-black ${isOverdue ? 'text-rose-600' : 'text-slate-700'}`}>{percentUsed}%</Text>
                                <View className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                  <View className={`h-full rounded-full ${isOverdue ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${percentUsed}%` }} />
                                </View>
                              </View>
                            );
                          },
                        },
                        { key: 'limit', label: 'Limit', width: 90, align: 'right' as const, render: (s: Store) => <Text className="text-[10px] font-bold text-slate-700 text-right">{formatWholeRupees(s.credit_limit)}</Text> },
                        {
                          key: 'outstanding', label: 'Outstanding', width: 100, align: 'right' as const,
                          render: (s: Store) => {
                            const isOverdue = (s.outstanding_balance / (s.credit_limit || 1)) > 0.8;
                            return <Text className={`text-[10px] font-extrabold text-right ${isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>{formatWholeRupees(s.outstanding_balance)}</Text>;
                          },
                        },
                        {
                          key: 'actions', label: 'Actions', width: 100, grow: false,
                          render: (s: Store) => (
                            <Pressable
                              onPress={() => { setPaymentForm({ store_id: s.id, invoice_id: 'general', amount: s.outstanding_balance > 0 ? s.outstanding_balance : 0, method: 'UPI' }); setActiveForm('add_payment'); }}
                              className="py-1 px-2 bg-emerald-600 rounded-lg flex-row items-center gap-1 active:bg-emerald-700 self-start"
                            >
                              <DollarSign size={11} color="#fff" />
                              <Text className="text-white text-[8px] font-black">Record</Text>
                            </Pressable>
                          ),
                        },
                      ] as DataTableColumn<Store>[]}
                    />
                  );
                }

                return (
                  <View className={`gap-2.5 md:flex-row md:flex-wrap ${filteredCreditStores.length === 0 ? 'flex-1' : ''}`}>
                    {filteredCreditStores.length === 0 ? (
                      <EmptyState message="No partner outlets match the current filters." />
                    ) : (
                      filteredCreditStores.map(s => {
                        const limitRatio = s.outstanding_balance / (s.credit_limit || 1);
                        const isOverdue = limitRatio > 0.8;
                        const percentUsed = Math.min(100, Math.round(limitRatio * 100));
                        return (
                          <View key={s.id} className="w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-4 border border-slate-200 gap-3">
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
                              <View><Text className="text-slate-400 font-semibold text-[11px]">Credit Limit:</Text><Text className="font-bold text-slate-700 text-[11px]">{formatWholeRupees(s.credit_limit)}</Text></View>
                              <View className="items-end"><Text className="text-slate-400 font-semibold text-[11px]">Outstanding:</Text><Text className={`font-extrabold text-[11px] ${isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>{formatWholeRupees(s.outstanding_balance)}</Text></View>
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
                      })
                    )}
                  </View>
                );
              })()}
            </View>
          )}

          {salesTab === 'refill' && (
            <View className="gap-2.5">
              <Text className="font-bold text-slate-600 text-xs">Smart Refill Cycles Reminders</Text>
              <ViewToggle />
              {(() => {
                const refillInfo = (s: Store) => {
                  const todayDate = new Date();
                  const nextRefill = new Date(s.next_refill_date);
                  const daysDiff = Math.ceil((nextRefill.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
                  let badgeClass = 'bg-slate-100'; let textClass = 'text-slate-600'; let text = `In ${daysDiff} Days`;
                  if (daysDiff < 0) { badgeClass = 'bg-red-500'; textClass = 'text-white'; text = `OVERDUE BY ${Math.abs(daysDiff)} DAYS`; }
                  else if (daysDiff === 0) { badgeClass = 'bg-red-500'; textClass = 'text-white'; text = 'DUE TODAY'; }
                  else if (daysDiff === 1) { badgeClass = 'bg-amber-500'; textClass = 'text-white'; text = 'DUE TOMORROW'; }
                  else if (daysDiff === 2) { badgeClass = 'bg-amber-100'; textClass = 'text-amber-700'; text = 'DUE IN 2 DAYS'; }
                  return { badgeClass, textClass, text };
                };

                if (viewMode === 'table') {
                  return (
                    <DataTable
                      data={data.stores}
                      keyExtractor={s => s.id}
                      emptyText="No partner stores found."
                      columns={[
                        { key: 'store', label: 'Store', width: 170, render: (s: Store) => <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text> },
                        { key: 'cycle', label: 'Refill Cycle', width: 100, render: (s: Store) => <Text className="text-[10px] text-slate-600">{s.refill_frequency}</Text> },
                        { key: 'last', label: 'Last Purchase', width: 110, render: (s: Store) => <Text className="text-[10px] text-slate-600">{s.last_purchase_date || 'N/A'}</Text> },
                        {
                          key: 'due', label: 'Due In', width: 150, grow: false,
                          render: (s: Store) => {
                            const { badgeClass, textClass, text } = refillInfo(s);
                            return <Text className={`px-2 py-0.5 text-[8px] font-black rounded-lg self-start ${badgeClass} ${textClass}`}>{text}</Text>;
                          },
                        },
                      ] as DataTableColumn<Store>[]}
                    />
                  );
                }

                return (
                  <View className={`gap-2.5 md:flex-row md:flex-wrap ${data.stores.length === 0 ? 'flex-1' : ''}`}>
                    {data.stores.length === 0 && <EmptyState message="No partner stores found." />}
                    {data.stores.map(s => {
                      const { badgeClass, textClass, text } = refillInfo(s);
                      return (
                        <View key={s.id} className="w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                          <View><Text className="font-bold text-slate-800 text-xs">{s.name}</Text><Text className="text-slate-400 text-[9px] mt-0.5">Cycle: {s.refill_frequency} - Last: {s.last_purchase_date || 'N/A'}</Text></View>
                          <Text className={`px-2.5 py-1 text-[9px] font-black rounded-lg ${badgeClass} ${textClass}`}>{text}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
            </View>
          )}

          {salesTab === 'inactive' && (
            <View className="gap-3">
              <View className="flex-row bg-slate-50 p-1 rounded-xl border border-slate-200">
                {([30, 60, 90] as const).map(days => (
                  <Pressable key={days} onPress={() => setInactiveDaysTab(days)} className={`flex-1 py-1 rounded-lg items-center ${inactiveDaysTab === days ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-extrabold ${inactiveDaysTab === days ? 'text-white' : 'text-slate-400'}`}>No order in {days} Days</Text>
                  </Pressable>
                ))}
              </View>
              <ViewToggle />
              {viewMode === 'table' ? (
                <DataTable
                  data={getInactiveStores(inactiveDaysTab)}
                  keyExtractor={s => s.id}
                  emptyText="No partner stores found in this inactivity range."
                  columns={[
                    { key: 'store', label: 'Store', width: 180, render: (s: Store) => <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text> },
                    { key: 'area', label: 'Area', width: 120, render: (s: Store) => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{s.area}</Text> },
                    { key: 'last', label: 'Last Purchase', width: 110, render: (s: Store) => <Text className="text-[10px] text-slate-600">{s.last_purchase_date || 'NEVER'}</Text> },
                    { key: 'status', label: 'Status', width: 90, grow: false, render: () => <Text className="bg-red-50 text-red-600 font-extrabold text-[8px] px-2 py-0.5 rounded-full border border-red-100 self-start">WARNING</Text> },
                  ] as DataTableColumn<Store>[]}
                />
              ) : (
                <View className={`gap-2.5 md:flex-row md:flex-wrap ${getInactiveStores(inactiveDaysTab).length === 0 ? 'flex-1' : ''}`}>
                  {getInactiveStores(inactiveDaysTab).map(s => (
                    <View key={s.id} className="w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 flex-row items-center justify-between">
                      <View><Text className="font-bold text-slate-800 text-xs">{s.name}</Text><Text className="text-slate-400 text-[10px] mt-0.5">Area: {s.area} - Last: {s.last_purchase_date || 'NEVER'}</Text></View>
                      <Text className="bg-red-50 text-red-600 font-extrabold text-[9px] px-2 py-0.5 rounded-full border border-red-100">WARNING</Text>
                    </View>
                  ))}
                  {getInactiveStores(inactiveDaysTab).length === 0 && (
                    <EmptyState message="No partner stores found in this inactivity range." />
                  )}
                </View>
              )}
            </View>
          )}

          {salesTab === 'prebookings' && (
            <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
              <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                <Text className="font-bold text-slate-800 text-xs">{hideAdminControls ? 'Upcoming Pre-Booking Orders' : 'Pre-Booking Orders List'}</Text>
                <Pressable
                  onPress={() => { setPreBookingStoreId(data.stores[0]?.id || ''); resetPreBookingForm(); setActiveForm('add_prebooking'); }}
                  className="px-3 py-1.5 bg-blue-600 rounded-lg flex-row items-center gap-1 active:bg-blue-700"
                >
                  <Plus size={12} color="#fff" />
                  <Text className="text-white font-bold text-[10px]">New Pre-Booking</Text>
                </Pressable>
              </View>
              <FilterBar searchValue={preBookingSearch} onSearchChange={setPreBookingSearch} searchPlaceholder="Search by Outlet name or Pre-Booking ID...">
                {!hideAdminControls && (
                  <SelectField
                    value={preBookingStatusFilter}
                    onValueChange={v => setPreBookingStatusFilter(v as typeof preBookingStatusFilter)}
                    options={[
                      { label: 'All Statuses', value: 'All' },
                      { label: 'Active / Booked', value: 'Booked' },
                      { label: 'Delivered', value: 'Delivered' },
                      { label: 'Cancelled', value: 'Cancelled' },
                    ]}
                    title="Fulfillment Status"
                    className={FILTER_PILL_CLASS}
                    textClassName={FILTER_PILL_TEXT_CLASS}
                  />
                )}
                {renderDateFilterField()}
              </FilterBar>

              <ScrollableSection height={preBookingsTableHeight}>
              {(() => {
                const filteredPreBookings = preBookings.data;

                if (preBookings.loading && filteredPreBookings.length === 0) {
                  return <View className="flex-1 items-center justify-center"><Text className="text-center text-slate-400 italic text-xs">Loading pre-booking orders...</Text></View>;
                }
                if (preBookings.error) {
                  return <View className="flex-1 items-center justify-center"><Text className="text-center text-red-500 italic text-xs">{preBookings.error}</Text></View>;
                }

                if (viewMode === 'table') {
                  return (
                    <DataTable
                      data={filteredPreBookings}
                      keyExtractor={pb => pb.id}
                      emptyText="No pre-booking orders match the current filters."
                      columns={[
                        {
                          key: 'store', label: 'Store / Booking ID', width: 180,
                          render: (pb: PreBookingOrder) => {
                            const store = data.stores.find(s => s.id === pb.store_id);
                            return (
                              <View>
                                <Text className="font-extrabold text-slate-800 text-[11px]" numberOfLines={1}>{store?.name}</Text>
                                <Text className="text-[8px] bg-slate-100 text-slate-400 font-bold uppercase px-1 rounded self-start mt-0.5">{pb.id}</Text>
                              </View>
                            );
                          },
                        },
                        {
                          key: 'booked_by', label: 'Booked By', width: 130,
                          render: (pb: PreBookingOrder) => {
                            const bookedBy = resolveActor(data.users, pb.salesperson_id);
                            return <Text className="text-[10px] text-slate-600" numberOfLines={1}>{bookedBy.name} ({bookedBy.role})</Text>;
                          },
                        },
                        { key: 'scheduled', label: 'Scheduled Date', width: 100, render: (pb: PreBookingOrder) => <Text className="text-[9px] text-slate-400">{new Date(pb.scheduled_delivery_date).toLocaleDateString()}</Text> },
                        {
                          key: 'value', label: 'Value', width: 90, align: 'right' as const,
                          render: (pb: PreBookingOrder) => {
                            const orderVal = pb.items.reduce((s, i) => s + (effectiveLineValue(i, i.unit_price)), 0);
                            return <Text className="text-[10px] font-bold text-slate-700 text-right">Rs. {orderVal.toFixed(2)}</Text>;
                          },
                        },
                        {
                          key: 'status', label: 'Status', width: 90, grow: false,
                          render: (pb: PreBookingOrder) => <Text className={`px-2 py-0.5 font-bold rounded text-[8px] uppercase self-start ${pb.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : pb.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{pb.status}</Text>,
                        },
                        {
                          key: 'actions', label: 'Actions', width: 160, grow: false,
                          render: (pb: PreBookingOrder) => (
                            <View className="flex-row flex-wrap items-center gap-1">
                              <Pressable onPress={() => openPreBookingViewer(pb)} className="p-1 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100"><Eye size={12} color="#475569" /></Pressable>
                              <Pressable onPress={() => handleDownloadPreBookingPdf(pb)} className="p-1 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100"><Download size={12} color="#475569" /></Pressable>
                              {pb.status === 'Booked' && (
                                <>
                                  {!hideAdminControls && (
                                    <>
                                      <Pressable onPress={() => handleOpenEditPreBooking(pb)} className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100"><Text className="text-slate-600 font-bold text-[8px]">Edit</Text></Pressable>
                                      <Pressable onPress={() => { const grandTotal = computeItemsTotal(pb.items).grand_total; setPreBookingSettleAmount(grandTotal); setPreBookingSettleMethod('UPI'); setPreBookingConfirmAction({ bookingId: pb.id, action: 'deliver' }); }} className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[8px]">Confirm</Text></Pressable>
                                    </>
                                  )}
                                  <Pressable onPress={() => setPreBookingConfirmAction({ bookingId: pb.id, action: 'cancel' })} className="px-1.5 py-0.5 bg-red-50 border border-red-200 rounded-lg active:bg-red-100"><Text className="text-red-600 font-bold text-[8px]">Cancel</Text></Pressable>
                                </>
                              )}
                            </View>
                          ),
                        },
                      ] as DataTableColumn<PreBookingOrder>[]}
                    />
                  );
                }

                return (
                  <View className={`gap-2.5 md:flex-row md:flex-wrap ${filteredPreBookings.length === 0 ? 'flex-1' : ''}`}>
                    {filteredPreBookings.length === 0 ? (
                      <EmptyState message="No pre-booking orders match the current filters." />
                    ) : (
                      filteredPreBookings.map(pb => {
                        const store = data.stores.find(s => s.id === pb.store_id);
                        const itemsQty = formatQty({ boxes: pb.items.reduce((s, i) => s + i.quantity, 0), pieces: pb.items.reduce((s, i) => s + i.quantity_pieces, 0) });
                        const orderVal = pb.items.reduce((s, i) => s + (effectiveLineValue(i, i.unit_price)), 0);
                        const bookedBy = resolveActor(data.users, pb.salesperson_id);
                        return (
                          <View key={pb.id} className="w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border border-slate-200 gap-2">
                            <View className="flex-row items-start justify-between">
                              <View className="flex-1 pr-2">
                                <View className="flex-row items-center gap-2 flex-wrap">
                                  <Text className="font-extrabold text-slate-800 text-xs">{store?.name}</Text>
                                  <Text className="text-[8px] bg-slate-100 text-slate-400 font-bold uppercase px-1 rounded">{pb.id}</Text>
                                </View>
                                <Text className="text-slate-400 text-[10px] mt-0.5">{itemsQty} - Rs. {orderVal.toFixed(2)}</Text>
                                <View className="flex-row items-center gap-1 mt-1">
                                  <Text className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Booked by: {bookedBy.name} ({bookedBy.role})</Text>
                                </View>
                                <Text className="text-[9px] text-slate-400 mt-1">Booked: {new Date(pb.created_at).toLocaleDateString()} - Scheduled: {new Date(pb.scheduled_delivery_date).toLocaleDateString()}</Text>
                                {pb.notes && <Text className="text-slate-500 italic text-[9px] bg-slate-50 p-1.5 rounded-lg border border-slate-100 mt-1">Note: {pb.notes}</Text>}
                              </View>
                              <Text className={`px-2 py-0.5 font-bold rounded text-[8px] uppercase ${pb.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : pb.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{pb.status}</Text>
                            </View>
                            <View className="border-t border-slate-100 pt-2 gap-1">
                              <Text className="text-[9px] font-bold text-slate-400 uppercase">Pre-booked Cargo:</Text>
                              {pb.items.map((item, idx) => {
                                const p = data.products.find(prod => prod.id === item.product_id);
                                const basis = p && item.unit_price === p.wholesale_price ? 'Wholesale' : p && item.unit_price === p.selling_price ? 'Selling' : '';
                                return (
                                  <View key={idx} className="flex-row justify-between bg-slate-50 p-1 rounded">
                                    <Text className="text-[9px] text-slate-600">{p?.name || item.product_id}</Text>
                                    <Text className="font-extrabold text-slate-800 text-[9px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} - {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}{basis ? ` (${basis})` : ''}</Text>
                                  </View>
                                );
                              })}
                            </View>
                            <View className="flex-row gap-2 justify-end pt-2 border-t border-slate-100">
                              <Pressable onPress={() => openPreBookingViewer(pb)} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100"><Eye size={14} color="#475569" /></Pressable>
                              <Pressable onPress={() => handleDownloadPreBookingPdf(pb)} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100"><Download size={14} color="#475569" /></Pressable>
                              {pb.status === 'Booked' && (
                                <>
                                  {!hideAdminControls && (
                                    <>
                                      <Pressable onPress={() => handleOpenEditPreBooking(pb)} className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg active:bg-slate-100"><Text className="text-slate-600 font-bold text-[9px]">Edit</Text></Pressable>
                                      <Pressable onPress={() => { const grandTotal = computeItemsTotal(pb.items).grand_total; setPreBookingSettleAmount(grandTotal); setPreBookingSettleMethod('UPI'); setPreBookingConfirmAction({ bookingId: pb.id, action: 'deliver' }); }} className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg active:bg-emerald-100"><Text className="text-emerald-600 font-bold text-[9px]">Confirm Delivery</Text></Pressable>
                                    </>
                                  )}
                                  <Pressable onPress={() => setPreBookingConfirmAction({ bookingId: pb.id, action: 'cancel' })} className="px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg active:bg-red-100"><Text className="text-red-600 font-bold text-[9px]">Cancel</Text></Pressable>
                                </>
                              )}
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              })()}
              </ScrollableSection>
              <PaginationFooter mode="offset" page={preBookings.page} totalPages={preBookings.totalPages} total={preBookings.total} loading={preBookings.loading} onPageChange={preBookings.goToPage} />
            </View>
          )}
        </View>
      )}

      <ConfirmModal
        visible={!!deleteSupplierConfirmId}
        onClose={() => setDeleteSupplierConfirmId(null)}
        icon={AlertTriangle}
        title="Confirm Supplier Deactivation"
        message={`Are you sure you want to remove this supplier? It will be hidden from supplier selection when receiving new stock, but historical purchase logs and reports will still show it. You can reactivate it later.`}
        confirmLabel="Yes, Remove"
        cancelLabel="No, Keep"
        onConfirm={async () => {
          const supplierToDelete = data.suppliers.find(s => s.id === deleteSupplierConfirmId);
          if (!supplierToDelete) return;
          try {
            await suppliersApi.setStatus(supplierToDelete.id, 'Inactive');
            await refreshData();
            addNotification('partner_update', `Supplier "${supplierToDelete.name}" has been deactivated.`, 'supplier', supplierToDelete.id);
          } catch (e: any) {
            showAlert(e.message ?? 'Unable to deactivate supplier.');
          } finally {
            setDeleteSupplierConfirmId(null);
          }
        }}
      />

      <ConfirmModal
        visible={!!deleteStoreConfirmId}
        onClose={() => setDeleteStoreConfirmId(null)}
        icon={AlertTriangle}
        title="Confirm Shop Partner Removal"
        message="Are you sure you want to remove this partner store? It will be hidden from selection in new orders and pre-bookings, but historical orders, dispatch schedules, and credit reports remain preserved. You can reactivate it later."
        confirmLabel="Yes, Remove"
        cancelLabel="No, Keep"
        onConfirm={async () => {
          const storeToDelete = data.stores.find(s => s.id === deleteStoreConfirmId);
          if (!storeToDelete) return;
          try {
            await storesApi.setStatus(storeToDelete.id, 'Inactive');
            await refreshData();
            addNotification('partner_update', `Partner store "${storeToDelete.name}" has been deactivated.`, 'store', storeToDelete.id);
          } catch (e: any) {
            showAlert(e.message ?? 'Unable to deactivate store.');
          } finally {
            setDeleteStoreConfirmId(null);
          }
        }}
      />

      <ConfirmModal
        visible={!!deleteAreaConfirmId}
        onClose={() => setDeleteAreaConfirmId(null)}
        icon={AlertTriangle}
        title="Delete District Area?"
        message="Are you sure you want to delete this district area? This can't be undone. Areas still used by a partner outlet can't be deleted - move those outlets to a different area first."
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        onConfirm={handleConfirmDeleteArea}
      />

      <ConfirmModal
        visible={!!deleteVillageConfirmId}
        onClose={() => setDeleteVillageConfirmId(null)}
        icon={AlertTriangle}
        title="Delete Village?"
        message="Are you sure you want to delete this village? This can't be undone. Villages still used by a partner outlet can't be deleted - move those outlets to a different village first."
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        onConfirm={handleConfirmDeleteVillage}
      />

      <ConfirmModal
        visible={!!deletePartnerTypeConfirmId}
        onClose={() => setDeletePartnerTypeConfirmId(null)}
        icon={AlertTriangle}
        title="Delete Partner Type?"
        message="Are you sure you want to delete this partner type? This can't be undone. Types still used by a partner can't be deleted - move those partners to a different type first."
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        onConfirm={handleConfirmDeletePartnerType}
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

      <ConfirmModal
        visible={!!deleteOrderConfirmId}
        onClose={() => setDeleteOrderConfirmId(null)}
        icon={AlertTriangle}
        title="Permanently Delete This Order?"
        message="This action is irreversible. The order and its invoice will be permanently removed, its item quantities will be returned to warehouse stock, any outstanding balance it added to the store will be reversed, and any payments collected against it will be removed from collection totals."
        confirmLabel="Yes, Delete Order"
        cancelLabel="No, Keep Order"
        confirmColor="bg-rose-600"
        onConfirm={() => { if (deleteOrderConfirmId) { executeDeleteOrder(deleteOrderConfirmId); setDeleteOrderConfirmId(null); } }}
      />

      <ConfirmModal
        visible={showConfirmOrderDialog}
        onClose={() => setShowConfirmOrderDialog(false)}
        icon={Check}
        iconBg="bg-emerald-50"
        iconColor="#059669"
        title="Confirm This Order?"
        message="Please make sure the selected products, quantities, and prices are all correct. If anything needs changing, go back and update the order first."
        confirmLabel="Yes, Details Are Correct"
        confirmColor="bg-emerald-600"
        cancelLabel="No, Let Me Review"
        onConfirm={() => { setShowConfirmOrderDialog(false); handleProceedToPayment(); }}
      />

      <Modal visible={showUnsavedPricingModal} transparent animationType="fade" onRequestClose={() => setShowUnsavedPricingModal(false)}>
        <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
          <View className="bg-white w-full max-w-sm rounded-3xl p-6 relative">
            <Pressable onPress={() => setShowUnsavedPricingModal(false)} className="absolute top-4 right-4 p-1 rounded-full z-10" hitSlop={8}>
              <X size={16} color="#94a3b8" />
            </Pressable>
            <View className="items-center mt-2">
              <View className="w-14 h-14 bg-amber-50 rounded-full items-center justify-center mb-4">
                <AlertTriangle size={24} color="#d97706" />
              </View>
              <Text className="text-base font-black text-slate-800 tracking-tight text-center">Unsaved Changes</Text>
              <Text className="text-xs text-slate-500 font-semibold mt-1.5 text-center leading-relaxed">
                You have unsaved changes related to product pricing. Do you want to save them before leaving?
              </Text>
              <View className="w-full mt-6 gap-2">
                <Pressable onPress={handleSaveAllPricingAndLeave} className="w-full py-2.5 bg-indigo-600 rounded-xl items-center active:bg-indigo-700">
                  <Text className="text-white font-black text-xs">Save & Leave</Text>
                </Pressable>
                <Pressable onPress={leaveStorePricing} className="w-full py-2.5 bg-rose-50 rounded-xl items-center active:bg-rose-100">
                  <Text className="text-rose-600 font-extrabold text-xs">Leave Without Saving</Text>
                </Pressable>
                <Pressable onPress={() => setShowUnsavedPricingModal(false)} className="w-full py-2.5 bg-slate-100 rounded-xl items-center active:bg-slate-200">
                  <Text className="text-slate-700 font-extrabold text-xs">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
        const grandTotal = computeItemsTotal(booking.items).grand_total;
        const isUnpaid = preBookingSettleMethod === 'Credit' || preBookingSettleAmount <= 0;
        const isPartial = !isUnpaid && preBookingSettleAmount < grandTotal - 0.05;
        let btnColor = 'bg-emerald-600 active:bg-emerald-700';
        let btnLabel = `Record Fully Paid (Rs. ${preBookingSettleAmount.toFixed(2)})`;
        if (isPartial) { btnColor = 'bg-amber-600 active:bg-amber-700'; btnLabel = `Record Partial Payment (Rs. ${preBookingSettleAmount.toFixed(2)})`; }
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

                  {/* Same product order as the picker (selection order), never alphabetical. */}
                  <View className="bg-slate-50 rounded-xl p-2.5 gap-1">
                    <Text className="text-slate-400 font-black text-[8px] uppercase mb-0.5">Pre-Booking Bill</Text>
                    {booking.items.map(item => {
                      const p = data.products.find(prod => prod.id === item.product_id);
                      return (
                        <View key={item.product_id} className="flex-row justify-between items-center">
                          <Text numberOfLines={1} className="flex-1 text-slate-700 font-bold text-[10px] pr-2">{p?.name || 'Unknown'} <Text className="text-slate-400 font-semibold">x{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })}</Text></Text>
                          <Text className="text-slate-600 font-bold text-[10px]">Rs. {(effectiveLineValue(item, item.unit_price)).toFixed(2)}</Text>
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
                          options={preBookingMethodOptions}
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
                        <Text className="text-[10px] text-amber-800 font-bold">Partial payment: Rs. {(grandTotal - preBookingSettleAmount).toFixed(2)} outstanding will be automatically added to store credit.</Text>
                      </View>
                    )}
                    {isUnpaid && (
                      <View className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                        <Text className="text-[10px] text-rose-700 font-bold">Full amount {formatWholeRupees(grandTotal)} will be added to store outstanding credit.</Text>
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
                    <Pressable onPress={() => handleDeliverPreBooking(booking.id)} className={`w-full py-2.5 rounded-xl items-center ${btnColor}`}>
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

      {pendingNewOrder && showNewOrderPaymentModal && (() => {
        const grandTotal = pendingNewOrder.grandTotal;
        const isUnpaid = newOrderSettleMethod === 'Credit' || newOrderSettleAmount <= 0;
        const isPartial = !isUnpaid && newOrderSettleAmount < grandTotal - 0.05;
        let btnColor = 'bg-emerald-600 active:bg-emerald-700';
        let btnLabel = `Confirm Order — Fully Paid (Rs. ${newOrderSettleAmount.toFixed(2)})`;
        if (isPartial) { btnColor = 'bg-amber-600 active:bg-amber-700'; btnLabel = `Confirm Order — Partial Payment (Rs. ${newOrderSettleAmount.toFixed(2)})`; }
        else if (isUnpaid) { btnColor = 'bg-rose-600 active:bg-rose-700'; btnLabel = 'Confirm Order — Unpaid (100% Credit)'; }

        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <ScrollView className="w-full max-w-sm" style={{ maxHeight: '92%' }} contentContainerStyle={{ flexGrow: 0 }}>
                <View className="bg-white w-full rounded-3xl p-4 gap-2.5">
                  <View className="flex-row items-center justify-between">
                    <Pressable onPress={handleSkipNewOrderPayment} className="py-1"><Text className="text-slate-400 text-xs font-bold">Back</Text></Pressable>
                    <Text className="text-base font-black text-slate-800">Collect Payment</Text>
                    <View style={{ width: 34 }} />
                  </View>
                  <Text className="text-[10px] text-slate-500 font-semibold text-center leading-relaxed">
                    Confirm how much will be collected from {pendingNewOrder.storeName} — the order is only created once you confirm.
                  </Text>

                  {/* Full item breakdown was already reviewed on the Order Confirmation page. */}
                  <View className="bg-slate-50 rounded-xl p-2.5 gap-1">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-slate-400 font-semibold text-[9px] uppercase">Round Off</Text>
                      <Text className="font-bold text-slate-500 text-[10px]">{pendingNewOrder.roundOff > 0 ? '+' : ''}Rs. {pendingNewOrder.roundOff.toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-slate-400 font-bold text-[10px] uppercase">Net Amount (Bill Total)</Text>
                      <Text className="font-black text-indigo-600 text-sm">{formatWholeRupees(grandTotal)}</Text>
                    </View>
                  </View>

                  <View className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 gap-2">
                    <Text className="font-extrabold text-indigo-900 text-xs uppercase">Record Settlement</Text>
                    <View className="flex-row gap-2">
                      <Pressable onPress={() => { setNewOrderSettleMethod('UPI'); setNewOrderSettleAmount(parseFloat(grandTotal.toFixed(2))); }} className={`flex-1 py-2.5 rounded-xl border items-center ${!isPartial && !isUnpaid ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-indigo-100'}`}>
                        <Text className={`font-extrabold text-[10px] ${!isPartial && !isUnpaid ? 'text-white' : 'text-slate-700'}`}>Fully Paid</Text>
                      </Pressable>
                      <Pressable onPress={() => { setNewOrderSettleMethod('UPI'); setNewOrderSettleAmount(parseFloat((grandTotal / 2).toFixed(2))); }} className={`flex-1 py-2.5 rounded-xl border items-center ${isPartial ? 'bg-amber-500 border-amber-500' : 'bg-white border-indigo-100'}`}>
                        <Text className={`font-extrabold text-[10px] ${isPartial ? 'text-white' : 'text-slate-700'}`}>Partial Paid</Text>
                      </Pressable>
                      <Pressable onPress={() => { setNewOrderSettleMethod('Credit'); setNewOrderSettleAmount(0); }} className={`flex-1 py-2.5 rounded-xl border items-center ${isUnpaid ? 'bg-rose-600 border-rose-600' : 'bg-white border-indigo-100'}`}>
                        <Text className={`font-extrabold text-[10px] ${isUnpaid ? 'text-white' : 'text-slate-700'}`}>No Payment</Text>
                      </Pressable>
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className="font-bold text-indigo-700 mb-1 text-xs">Settlement Method</Text>
                        <SelectField
                          value={newOrderSettleMethod}
                          onValueChange={v => {
                            const prevMethod = newOrderSettleMethod;
                            setNewOrderSettleMethod(v as any);
                            if (v === 'Credit') setNewOrderSettleAmount(0);
                            else if (prevMethod === 'Credit' || newOrderSettleAmount === 0) setNewOrderSettleAmount(parseFloat(grandTotal.toFixed(2)));
                          }}
                          options={preBookingMethodOptions}
                          title="Select Method"
                          className="bg-white border border-indigo-200 rounded-xl p-2.5 flex-row items-center justify-between"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="font-bold text-indigo-700 mb-1 text-xs">Settled Amount</Text>
                        <TextInput
                          editable={newOrderSettleMethod !== 'Credit'}
                          keyboardType="decimal-pad"
                          value={newOrderSettleAmount === 0 ? '' : String(newOrderSettleAmount)}
                          onChangeText={v => setNewOrderSettleAmount(Math.max(0, Math.min(grandTotal, parseFloat(v) || 0)))}
                          placeholder="0"
                          placeholderTextColor="#94a3b8"
                          className={`w-full border border-indigo-200 font-black text-indigo-900 rounded-xl p-2.5 ${newOrderSettleMethod === 'Credit' ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                        />
                      </View>
                    </View>

                    {isPartial && (
                      <View className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                        <Text className="text-[10px] text-amber-800 font-bold">Partial payment: Rs. {(grandTotal - newOrderSettleAmount).toFixed(2)} outstanding will be automatically added to store credit.</Text>
                      </View>
                    )}
                    {isUnpaid && (
                      <View className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                        <Text className="text-[10px] text-rose-700 font-bold">Full amount {formatWholeRupees(grandTotal)} will be added to store outstanding credit.</Text>
                      </View>
                    )}

                    {newOrderSettleMethod === 'UPI' && (
                      <View className="bg-white border border-slate-200 rounded-xl p-2 flex-row items-center gap-2.5">
                        <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=upi://pay?pa=distributor@ic-erp&pn=Ice%20Cream%20Distributors&am=${newOrderSettleAmount}&cu=INR` }} className="w-16 h-16" />
                        <Text className="flex-1 text-[9px] font-black text-slate-500 uppercase">Scan via GPay, PhonePe, Paytm, BHIM UPI</Text>
                      </View>
                    )}
                  </View>

                  <Pressable onPress={handleSettleNewOrder} className={`w-full py-2.5 rounded-xl items-center ${btnColor}`}>
                    <Text className="text-white font-black text-xs uppercase">{btnLabel}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </Modal>
        );
      })()}

      <Modal visible={!!viewingSupplier} transparent animationType="fade" onRequestClose={() => setViewingSupplier(null)}>
        {viewingSupplier && (() => {
          const supplierPurchases = data.purchases.filter(p => p.supplier_id === viewingSupplier.id);
          const totalUnitsSupplied = formatQty({
            boxes: supplierPurchases.reduce((acc, p) => acc + p.items.reduce((sum, item) => sum + item.quantity, 0), 0),
            pieces: supplierPurchases.reduce((acc, p) => acc + p.items.reduce((sum, item) => sum + item.quantity_pieces, 0), 0),
          });
          const totalSpend = supplierPurchases.reduce((acc, p) => acc + p.items.reduce((sum, item) => sum + purchaseLineValue(item, item.purchase_price), 0), 0);
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
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Volume</Text><Text className="text-xs font-black text-emerald-600">{formatWholeRupees(totalSpend)}</Text></View>
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
          const totalUnitsPurchased = formatQty({
            boxes: storeOrders.reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + item.quantity, 0), 0),
            pieces: storeOrders.reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + item.quantity_pieces, 0), 0),
          });
          const totalLtv = storeOrders.reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + (effectiveLineValue(item, item.unit_price)), 0), 0);
          const storeAssets = partnerAssets.filter(a => a.assigned_partner_id === viewingStore.id);
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-lg w-full max-h-[85%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <Text className="font-extrabold text-slate-800 text-sm">Partner Portfolio</Text>
                  <Pressable onPress={() => setViewingStore(null)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>
                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Orders</Text><Text className="text-xs font-black text-slate-800">{storeOrders.length}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Volume</Text><Text className="text-xs font-black text-slate-800">{totalUnitsPurchased}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">LTV</Text><Text className="text-xs font-black text-indigo-600">{formatWholeRupees(totalLtv)}</Text></View>
                </View>
                <View className="gap-1 bg-slate-50 p-3 rounded-2xl mb-3">
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Owner:</Text> {viewingStore.owner_name}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Partner Type:</Text> {viewingStore.partner_type || 'Retail Shop'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Phone:</Text> {viewingStore.phone} / {viewingStore.alt_phone || 'N/A'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">GST:</Text> {viewingStore.gst_number || 'N/A'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Address:</Text> {viewingStore.address}{viewingStore.village ? `, ${viewingStore.village}` : ''}, {viewingStore.area}, {viewingStore.city}, {viewingStore.state} - {viewingStore.pincode}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Refill Cycle:</Text> {viewingStore.refill_frequency}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Last Purchase:</Text> {viewingStore.last_purchase_date || 'No purchases'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Next Refill:</Text> {viewingStore.next_refill_date || 'N/A'}</Text>
                </View>

                {storeAssets.length > 0 && (
                  <View className="gap-1.5 mb-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-slate-500 text-[10px] font-black uppercase tracking-wide">Assigned Assets</Text>
                      <Text className="text-[9px] bg-sky-50 text-sky-600 font-extrabold px-1.5 py-0.5 rounded-full">{storeAssets.length}</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
                      <View className="gap-1.5">
                        {storeAssets.map(a => (
                          <View key={a.id} className="flex-row items-center justify-between bg-slate-50 rounded-xl px-2.5 py-2">
                            <View className="flex-1 pr-2">
                              <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{a.name}</Text>
                              <Text className="text-[9px] text-slate-400">{a.code} - {a.asset_type}{a.assigned_date ? ` - Since ${a.assigned_date}` : ''}</Text>
                            </View>
                            <Text className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{a.status}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                <Pressable onPress={() => setViewingStore(null)} className="w-full py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close Portfolio</Text></Pressable>
              </View>
            </View>
          );
        })()}
      </Modal>

      <Modal visible={showClonePricingModal} transparent animationType="fade" onRequestClose={() => setShowClonePricingModal(false)}>
        {pricingStore && (() => {
          const sourceOverrideCount = data.storePricing.filter(sp => sp.store_id === pricingStore.id).length;
          const cloneCandidates = data.stores
            .filter(s => s.status === 'Active' && s.id !== pricingStore.id)
            .filter(s => s.name.toLowerCase().includes(cloneStoreSearch.trim().toLowerCase()));
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-xl w-full h-[85%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <View>
                    <Text className="font-extrabold text-slate-800 text-sm">Clone Custom Pricing</Text>
                    <Text className="text-[10px] text-slate-400 mt-0.5">From {pricingStore.name} ({sourceOverrideCount} product{sourceOverrideCount === 1 ? '' : 's'})</Text>
                  </View>
                  <Pressable onPress={() => setShowClonePricingModal(false)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>

                <View className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 mb-3">
                  <Text className="text-[10px] text-amber-700 font-semibold leading-relaxed">
                    This replaces any existing custom pricing at the store(s) you select below with an exact copy of {pricingStore.name}'s price list.
                  </Text>
                </View>

                <View className="flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 mb-3">
                  <Search size={14} color="#94a3b8" />
                  <TextInput
                    value={cloneStoreSearch}
                    onChangeText={setCloneStoreSearch}
                    placeholder="Search destination stores..."
                    placeholderTextColor="#94a3b8"
                    className="flex-1 text-xs text-slate-800 py-2.5"
                    style={{ outlineStyle: 'none' } as any}
                  />
                  {cloneStoreSearch.length > 0 && (
                    <Pressable onPress={() => setCloneStoreSearch('')} hitSlop={8}>
                      <X size={14} color="#94a3b8" />
                    </Pressable>
                  )}
                </View>

                <View className="flex-row items-center justify-between mb-2 px-0.5">
                  <Text className="text-[10px] font-bold text-slate-500 uppercase">{cloneTargetStoreIds.length} store(s) selected</Text>
                  {cloneCandidates.length > 0 && (
                    <Pressable
                      onPress={() => setCloneTargetStoreIds(
                        cloneCandidates.every(s => cloneTargetStoreIds.includes(s.id))
                          ? cloneTargetStoreIds.filter(id => !cloneCandidates.some(s => s.id === id))
                          : [...new Set([...cloneTargetStoreIds, ...cloneCandidates.map(s => s.id)])]
                      )}
                    >
                      <Text className="text-[10px] font-bold text-indigo-600">
                        {cloneCandidates.every(s => cloneTargetStoreIds.includes(s.id)) ? 'Deselect All' : 'Select All'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <ScrollView className="flex-1 mb-3">
                  <View className="gap-1.5">
                    {cloneCandidates.map(s => {
                      const isSelected = cloneTargetStoreIds.includes(s.id);
                      const existingCount = data.storePricing.filter(sp => sp.store_id === s.id).length;
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => toggleClonePricingTarget(s.id)}
                          className={`flex-row items-center justify-between gap-2 p-2.5 rounded-lg border ${isSelected ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}
                        >
                          <View className="flex-1 min-w-0">
                            <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text>
                            <Text className="text-slate-400 text-[9px]">{s.area}{existingCount > 0 ? ` - has ${existingCount} custom price(s) already` : ''}</Text>
                          </View>
                          <View className={`w-5 h-5 rounded border items-center justify-center ${isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}>
                            {isSelected && <Check size={13} color="#fff" />}
                          </View>
                        </Pressable>
                      );
                    })}
                    {cloneCandidates.length === 0 && (
                      <Text className="text-[10px] text-slate-400 italic py-4 text-center">No other partner stores match your search.</Text>
                    )}
                  </View>
                </ScrollView>

                <View className="flex-row gap-2">
                  <Pressable onPress={handleConfirmClonePricing} className="flex-1 py-2.5 bg-emerald-600 rounded-2xl items-center active:bg-emerald-700 flex-row justify-center gap-1.5">
                    <Copy size={14} color="#fff" />
                    <Text className="text-white font-bold text-xs">Clone Pricing</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowClonePricingModal(false)} className="flex-1 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Cancel</Text></Pressable>
                </View>
              </View>
            </View>
          );
        })()}
      </Modal>

      <Modal visible={showCloneFromModal} transparent animationType="fade" onRequestClose={() => setShowCloneFromModal(false)}>
        {pricingStore && (() => {
          const sourceCandidates = data.stores
            .filter(s => s.status === 'Active' && s.id !== pricingStore.id)
            .filter(s => s.name.toLowerCase().includes(cloneFromStoreSearch.trim().toLowerCase()));
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-xl w-full h-[85%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <View>
                    <Text className="font-extrabold text-slate-800 text-sm">Clone Custom Pricing</Text>
                    <Text className="text-[10px] text-slate-400 mt-0.5">Into {pricingStore.name}</Text>
                  </View>
                  <Pressable onPress={() => setShowCloneFromModal(false)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>

                <View className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 mb-3">
                  <Text className="text-[10px] text-amber-700 font-semibold leading-relaxed">
                    This replaces {pricingStore.name}'s existing custom pricing with an exact copy of the source store's price list you select below.
                  </Text>
                </View>

                <View className="flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 mb-3">
                  <Search size={14} color="#94a3b8" />
                  <TextInput
                    value={cloneFromStoreSearch}
                    onChangeText={setCloneFromStoreSearch}
                    placeholder="Search source stores..."
                    placeholderTextColor="#94a3b8"
                    className="flex-1 text-xs text-slate-800 py-2.5"
                    style={{ outlineStyle: 'none' } as any}
                  />
                  {cloneFromStoreSearch.length > 0 && (
                    <Pressable onPress={() => setCloneFromStoreSearch('')} hitSlop={8}>
                      <X size={14} color="#94a3b8" />
                    </Pressable>
                  )}
                </View>

                <Text className="text-[10px] font-bold text-slate-500 uppercase mb-2 px-0.5">Select one source store</Text>

                <ScrollView className="flex-1 mb-3">
                  <View className="gap-1.5">
                    {sourceCandidates.map(s => {
                      const isSelected = cloneSourceStoreId === s.id;
                      const existingCount = data.storePricing.filter(sp => sp.store_id === s.id).length;
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => setCloneSourceStoreId(s.id)}
                          className={`flex-row items-center justify-between gap-2 p-2.5 rounded-lg border ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}
                        >
                          <View className="flex-1 min-w-0">
                            <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{s.name}</Text>
                            <Text className="text-slate-400 text-[9px]">{s.area}{existingCount > 0 ? ` - has ${existingCount} custom price(s)` : ' - no custom pricing yet'}</Text>
                          </View>
                          <View className={`w-5 h-5 rounded-full border items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                            {isSelected && <Check size={13} color="#fff" />}
                          </View>
                        </Pressable>
                      );
                    })}
                    {sourceCandidates.length === 0 && (
                      <Text className="text-[10px] text-slate-400 italic py-4 text-center">No other partner stores match your search.</Text>
                    )}
                  </View>
                </ScrollView>

                <View className="flex-row gap-2">
                  <Pressable onPress={handleConfirmCloneFromPricing} className="flex-1 py-2.5 bg-indigo-600 rounded-2xl items-center active:bg-indigo-700 flex-row justify-center gap-1.5">
                    <Copy size={14} color="#fff" />
                    <Text className="text-white font-bold text-xs">Clone Pricing</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowCloneFromModal(false)} className="flex-1 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Cancel</Text></Pressable>
                </View>
              </View>
            </View>
          );
        })()}
      </Modal>

      <Modal visible={!!reportingStore} transparent animationType="fade" onRequestClose={() => setReportingStore(null)}>
        {reportingStore && (() => {
          const storeOrders = data.orders
            .filter(o => o.store_id === reportingStore.id && isWithinDateFilterUtil(o.created_at, storeReportDateMode, storeReportFrom, storeReportTo))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          let totalBoxes = 0, totalPieces = 0, totalPurchaseValue = 0, totalOutstanding = 0;
          const rowsData = storeOrders.map(o => {
            const inv = data.invoices.find(i => i.order_id === o.id);
            const boxes = o.items.reduce((sum, item) => sum + item.quantity, 0);
            const pieces = o.items.reduce((sum, item) => sum + item.quantity_pieces, 0);
            const units = formatQty({ boxes, pieces });
            const grandTotal = inv ? inv.grand_total : computeItemsTotal(o.items).grand_total;
            const due = inv ? Math.max(0, inv.grand_total - (inv.paid_amount || 0)) : 0;
            const isPaid = inv?.payment_status === 'Paid';
            const isPartial = inv?.payment_status === 'Partial';
            const paymentLabel = !inv ? null : isPaid ? 'Fully Paid' : isPartial ? 'Partial Paid' : 'Not Paid';
            totalBoxes += boxes;
            totalPieces += pieces;
            totalPurchaseValue += grandTotal;
            totalOutstanding += due;
            return { order: o, invoice: inv, units, grandTotal, due, isPaid, isPartial, paymentLabel };
          });
          // Delivered pre-bookings already appear above as a real Order (see
          // deliverPreBooking in the backend), so only Booked/Cancelled ones
          // are shown here to avoid double-counting the same purchase twice.
          const storePreBookings = (data.preBookingOrders || [])
            .filter(pb => pb.store_id === reportingStore.id && pb.status !== 'Delivered' && isWithinDateFilterUtil(pb.scheduled_delivery_date, storeReportDateMode, storeReportFrom, storeReportTo))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const preBookingRows = storePreBookings.map(pb => {
            const units = formatQty({ boxes: pb.items.reduce((sum, item) => sum + item.quantity, 0), pieces: pb.items.reduce((sum, item) => sum + item.quantity_pieces, 0) });
            const grandTotal = computeItemsTotal(pb.items).grand_total;
            return { booking: pb, units, grandTotal };
          });

          // Recently Paid tab: Payment rows for this store, filtered by when
          // the payment itself happened (paidReportDateMode) rather than
          // when the underlying order was created - see storeReportTab's
          // declaration above for why a bill just paid today needs its own
          // filter/tab instead of reusing storeOrders' date filter.
          const storePayments = data.payments
            .filter(p => p.store_id === reportingStore.id && isWithinDateFilterUtil(p.date, paidReportDateMode, paidReportFrom, paidReportTo))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          let totalCollected = 0;
          const paidRowsData = storePayments.map(p => {
            // General Credit Recovery payments that fan out across several
            // bills produce one Payment row per bill (see recordPayment in
            // the backend) - each shown as its own row here, not grouped,
            // so the exact amount recovered per bill stays visible. order_id
            // is null only for a rare leftover-balance adjustment that isn't
            // tied to any tracked invoice.
            const linkedOrder = p.order_id ? data.orders.find(o => o.id === p.order_id) : undefined;
            const linkedInvoice = linkedOrder ? data.invoices.find(i => i.order_id === linkedOrder.id) : undefined;
            totalCollected += p.amount;
            return { payment: p, order: linkedOrder, invoice: linkedInvoice };
          });
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-xl w-full h-[85%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <View>
                    <Text className="font-extrabold text-slate-800 text-sm">Purchase Report</Text>
                    <Text className="text-[10px] text-slate-400 mt-0.5">{reportingStore.name}</Text>
                  </View>
                  <Pressable onPress={() => setReportingStore(null)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>

                <View className="flex-row bg-slate-100 p-1 rounded-xl gap-1 mb-3">
                  <Pressable onPress={() => setStoreReportTab('orders')} className={`flex-1 py-1.5 rounded-lg items-center ${storeReportTab === 'orders' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-extrabold ${storeReportTab === 'orders' ? 'text-white' : 'text-slate-500'}`}>All Orders</Text>
                  </Pressable>
                  <Pressable onPress={() => setStoreReportTab('paid')} className={`flex-1 py-1.5 rounded-lg items-center ${storeReportTab === 'paid' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-extrabold ${storeReportTab === 'paid' ? 'text-white' : 'text-slate-500'}`}>Recently Paid{storePayments.length > 0 ? ` (${storePayments.length})` : ''}</Text>
                  </Pressable>
                </View>

                {storeReportTab === 'orders' ? (
                  <>
                    <View className="mb-3 items-start">
                      <DateRangeFilterField
                        mode={storeReportDateMode}
                        onModeChange={setStoreReportDateMode}
                        customFrom={storeReportFrom}
                        customTo={storeReportTo}
                        onCustomFromChange={setStoreReportFrom}
                        onCustomToChange={setStoreReportTo}
                        title="Date Range"
                      />
                    </View>

                    <View className="flex-row gap-2 mb-3">
                      <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Orders</Text><Text className="text-xs font-black text-slate-800">{storeOrders.length}</Text></View>
                      <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Units</Text><Text className="text-xs font-black text-slate-800">{formatQty({ boxes: totalBoxes, pieces: totalPieces })}</Text></View>
                      <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Purchased</Text><Text className="text-xs font-black text-emerald-600">{formatWholeRupees(totalPurchaseValue)}</Text></View>
                      <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Due</Text><Text className={`text-xs font-black ${totalOutstanding > 0 ? 'text-red-500' : 'text-slate-800'}`}>{formatWholeRupees(totalOutstanding)}</Text></View>
                    </View>

                    <ScrollView className="flex-1 mb-3">
                      <Text className="font-bold text-slate-700 text-[9px] uppercase mb-1.5">Order Details ({storeOrders.length}) - tap to view, or use the download icon</Text>
                      <View className={`gap-1.5 mb-3 ${rowsData.length === 0 ? 'flex-1' : ''}`}>
                        {rowsData.length === 0 ? (
                          <EmptyState message="No orders in this date range." />
                        ) : (
                          rowsData.map(({ order: o, invoice, units, grandTotal, due, isPaid, isPartial, paymentLabel }) => (
                            <Pressable
                              key={o.id}
                              onPress={() => handleOpenOrderFromReport(o)}
                              className="bg-slate-50 border border-slate-100 p-2 rounded-lg flex-row justify-between items-center active:bg-slate-100"
                            >
                              <View>
                                <Text className="font-bold text-indigo-600 text-[9px]">#{o.id}</Text>
                                <Text className="text-slate-400 text-[9px]">{new Date(o.created_at).toLocaleDateString('en-IN')} - {units}</Text>
                                <View className="flex-row items-center gap-1 mt-1">
                                  <Text className={`px-1.5 py-0.5 rounded-md font-bold text-[8px] uppercase ${o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : o.status === 'Confirmed' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>{o.status}</Text>
                                  {paymentLabel && (
                                    <Text className={`px-1.5 py-0.5 rounded-md font-bold text-[8px] uppercase ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{paymentLabel}</Text>
                                  )}
                                </View>
                              </View>
                              <View className="flex-row items-center gap-1.5">
                                <View className="items-end">
                                  <Text className="font-bold text-slate-700 text-[9px]">{formatWholeRupees(grandTotal)}</Text>
                                  {due > 0.01 && <Text className="font-bold text-rose-500 text-[8px] mt-0.5">Due {formatWholeRupees(due)}</Text>}
                                </View>
                                {invoice && (
                                  <Pressable onPress={() => downloadInvoicePDF(o, invoice, reportingStore)} hitSlop={6} className="p-1.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100">
                                    <Download size={12} color="#4f46e5" />
                                  </Pressable>
                                )}
                                <Eye size={12} color="#94a3b8" />
                              </View>
                            </Pressable>
                          ))
                        )}
                      </View>

                      <Text className="font-bold text-slate-700 text-[9px] uppercase mb-1.5">Pre-Bookings ({storePreBookings.length}) - tap to view, or use the download icon</Text>
                      <View className={`gap-1.5 ${preBookingRows.length === 0 ? 'flex-1' : ''}`}>
                        {preBookingRows.length === 0 ? (
                          <EmptyState message="No active or cancelled pre-bookings in this date range." />
                        ) : (
                          preBookingRows.map(({ booking: pb, units, grandTotal }) => (
                            <Pressable
                              key={pb.id}
                              onPress={() => openPreBookingViewer(pb)}
                              className="bg-indigo-50/40 border border-indigo-100 p-2 rounded-lg flex-row justify-between items-center active:bg-indigo-100/60"
                            >
                              <View>
                                <Text className="font-bold text-indigo-600 text-[9px]">#{pb.id}</Text>
                                <Text className="text-slate-400 text-[9px]">Scheduled: {new Date(pb.scheduled_delivery_date).toLocaleDateString('en-IN')} - {units}</Text>
                                <Text className={`px-1.5 py-0.5 rounded-md font-bold text-[8px] uppercase mt-1 self-start ${pb.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{pb.status}</Text>
                              </View>
                              <View className="flex-row items-center gap-1.5">
                                <Text className="font-bold text-slate-700 text-[9px]">{formatWholeRupees(grandTotal)}</Text>
                                <Pressable onPress={() => handleDownloadPreBookingPdf(pb)} hitSlop={6} className="p-1.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100">
                                  <Download size={12} color="#4f46e5" />
                                </Pressable>
                                <Eye size={12} color="#94a3b8" />
                              </View>
                            </Pressable>
                          ))
                        )}
                      </View>
                    </ScrollView>
                  </>
                ) : (
                  <>
                    <View className="mb-3 items-start">
                      <DateRangeFilterField
                        mode={paidReportDateMode}
                        onModeChange={setPaidReportDateMode}
                        customFrom={paidReportFrom}
                        customTo={paidReportTo}
                        onCustomFromChange={setPaidReportFrom}
                        onCustomToChange={setPaidReportTo}
                        title="Date Range"
                      />
                    </View>

                    <View className="flex-row gap-2 mb-3">
                      <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Payments</Text><Text className="text-xs font-black text-slate-800">{storePayments.length}</Text></View>
                      <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Collected</Text><Text className="text-xs font-black text-emerald-600">{formatWholeRupees(totalCollected)}</Text></View>
                    </View>

                    <ScrollView className="flex-1 mb-3">
                      <Text className="font-bold text-slate-700 text-[9px] uppercase mb-1.5">Recently Paid ({storePayments.length}) - tap to view the bill</Text>
                      <View className={`gap-1.5 ${paidRowsData.length === 0 ? 'flex-1' : ''}`}>
                        {paidRowsData.length === 0 ? (
                          <EmptyState message="No payments recorded in this date range." />
                        ) : (
                          paidRowsData.map(({ payment: p, order: linkedOrder, invoice: linkedInvoice }) => {
                            const collector = resolveActor(data.users, p.collected_by);
                            const isPaid = linkedInvoice?.payment_status === 'Paid';
                            const isPartial = linkedInvoice?.payment_status === 'Partial';
                            return (
                              <Pressable
                                key={p.id}
                                disabled={!linkedOrder}
                                onPress={() => linkedOrder && handleOpenOrderFromReport(linkedOrder)}
                                className={`bg-slate-50 border border-slate-100 p-2 rounded-lg flex-row justify-between items-center ${linkedOrder ? 'active:bg-slate-100' : 'opacity-60'}`}
                              >
                                <View>
                                  <Text className="font-bold text-indigo-600 text-[9px]">{linkedOrder ? `#${linkedOrder.id}` : 'Store Credit Adjustment'}</Text>
                                  <Text className="text-slate-400 text-[9px]">{new Date(p.date).toLocaleDateString('en-IN')} - {p.method} - Collected by {collector.name}</Text>
                                  {linkedInvoice && (
                                    <View className="flex-row items-center gap-1 mt-1">
                                      <Text className={`px-1.5 py-0.5 rounded-md font-bold text-[8px] uppercase ${isPaid ? 'bg-emerald-100 text-emerald-800' : isPartial ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{isPaid ? 'Fully Paid' : isPartial ? 'Partial Paid' : 'Not Paid'}</Text>
                                    </View>
                                  )}
                                </View>
                                <View className="flex-row items-center gap-1.5">
                                  <Text className="font-bold text-emerald-600 text-[9px]">+{formatCurrency(p.amount)}</Text>
                                  {linkedOrder && <Eye size={12} color="#94a3b8" />}
                                </View>
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    </ScrollView>
                  </>
                )}

                <View className="flex-row gap-2">
                  <Pressable onPress={handleExportStoreReport} className="flex-1 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl items-center active:bg-emerald-100 flex-row justify-center gap-1.5">
                    <Download size={14} color="#059669" />
                    <Text className="text-emerald-600 font-bold text-xs">Download PDF</Text>
                  </Pressable>
                  <Pressable onPress={() => setReportingStore(null)} className="flex-1 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close</Text></Pressable>
                </View>
              </View>
            </View>
          );
        })()}
      </Modal>

      <Modal visible={!!reportingSupplier} transparent animationType="fade" onRequestClose={() => setReportingSupplier(null)}>
        {reportingSupplier && (() => {
          // Receipt count/units/spend stats still come from the already-loaded
          // full data blob (cheap, no extra network cost) so they stay
          // accurate across every matching receipt, not just the current
          // page - only the receipts list below is paginated server-side.
          const supplierPurchasesAll = data.purchases
            .filter(p => p.supplier_id === reportingSupplier.id && isWithinDateFilterUtil(p.date, supplierReportDateMode, supplierReportFrom, supplierReportTo));
          let totalBoxes = 0, totalPieces = 0, totalSpendVal = 0;
          for (const p of supplierPurchasesAll) {
            totalBoxes += p.items.reduce((sum, item) => sum + item.quantity, 0);
            totalPieces += p.items.reduce((sum, item) => sum + item.quantity_pieces, 0);
            totalSpendVal += p.items.reduce((sum, item) => sum + purchaseLineValue(item, item.purchase_price), 0);
          }
          const rowsData = supplierPurchases.data.map(p => ({
            purchase: p,
            units: formatQty({ boxes: p.items.reduce((sum, item) => sum + item.quantity, 0), pieces: p.items.reduce((sum, item) => sum + item.quantity_pieces, 0) }),
            value: p.items.reduce((sum, item) => sum + purchaseLineValue(item, item.purchase_price), 0),
          }));
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-xl w-full h-[85%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <View>
                    <Text className="font-extrabold text-slate-800 text-sm">Purchase Report</Text>
                    <Text className="text-[10px] text-slate-400 mt-0.5">{reportingSupplier.name}</Text>
                  </View>
                  <Pressable onPress={() => setReportingSupplier(null)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>

                <FilterBar searchValue={supplierReportSearch} onSearchChange={setSupplierReportSearch} searchPlaceholder="Search by invoice number...">
                  <DateRangeFilterField
                    mode={supplierReportDateMode}
                    onModeChange={setSupplierReportDateMode}
                    customFrom={supplierReportFrom}
                    customTo={supplierReportTo}
                    onCustomFromChange={setSupplierReportFrom}
                    onCustomToChange={setSupplierReportTo}
                    title="Date Range"
                    className={FILTER_PILL_CLASS}
                    textClassName={FILTER_PILL_TEXT_CLASS}
                  />
                </FilterBar>

                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Receipts</Text><Text className="text-xs font-black text-slate-800">{supplierPurchasesAll.length}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Units</Text><Text className="text-xs font-black text-slate-800">{formatQty({ boxes: totalBoxes, pieces: totalPieces })}</Text></View>
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Total Spend</Text><Text className="text-xs font-black text-emerald-600">{formatWholeRupees(totalSpendVal)}</Text></View>
                </View>

                <Text className="font-bold text-slate-700 text-[9px] uppercase mb-1.5">Stock Inward Receipts ({supplierPurchasesAll.length}) - tap a receipt to view its invoice</Text>
                <ScrollableSection height={260}>
                  <View className="gap-1.5 mb-3">
                    {supplierPurchases.loading && rowsData.length === 0 ? (
                      <Text className="text-[10px] text-slate-400 italic py-4 text-center">Loading receipts...</Text>
                    ) : supplierPurchases.error ? (
                      <Text className="text-[10px] text-red-500 italic py-4 text-center">{supplierPurchases.error}</Text>
                    ) : rowsData.length === 0 ? (
                      <EmptyState message="No stock inwards in this date range." />
                    ) : (
                      rowsData.map(({ purchase: p, units, value }) => (
                        <Pressable
                          key={p.id}
                          onPress={() => openPurchaseViewer(p)}
                          className="bg-slate-50 border border-slate-100 p-2 rounded-lg flex-row justify-between items-center active:bg-slate-100"
                        >
                          <View>
                            <Text className="font-bold text-indigo-600 text-[9px]">Invoice: {p.invoice_number}</Text>
                            <Text className="text-slate-400 text-[9px]">{new Date(p.date).toLocaleDateString('en-IN')} - {p.items.length} SKU(s), {units}</Text>
                          </View>
                          <View className="flex-row items-center gap-1.5">
                            <Text className="font-bold text-slate-700 text-[9px]">{formatWholeRupees(value)}</Text>
                            <Pressable onPress={() => handleDownloadStockReceiptPdf(p, reportingSupplier)} hitSlop={6} className="p-1.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100">
                              <Download size={12} color="#4f46e5" />
                            </Pressable>
                            <Eye size={14} color="#94a3b8" />
                          </View>
                        </Pressable>
                      ))
                    )}
                  </View>
                </ScrollableSection>
                <PaginationFooter mode="offset" page={supplierPurchases.page} totalPages={supplierPurchases.totalPages} total={supplierPurchases.total} loading={supplierPurchases.loading} onPageChange={supplierPurchases.goToPage} />

                <View className="flex-row gap-2">
                  <Pressable onPress={handleExportSupplierReport} className="flex-1 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl items-center active:bg-emerald-100 flex-row justify-center gap-1.5">
                    <Download size={14} color="#059669" />
                    <Text className="text-emerald-600 font-bold text-xs">Download PDF</Text>
                  </Pressable>
                  <Pressable onPress={() => setReportingSupplier(null)} className="flex-1 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close</Text></Pressable>
                </View>
              </View>
            </View>
          );
        })()}
      </Modal>

      <Modal visible={!!viewingPreBooking} transparent animationType="fade" onRequestClose={closePreBookingViewer}>
        {viewingPreBooking && (() => {
          const store = data.stores.find(s => s.id === viewingPreBooking.store_id);
          const units = formatQty({ boxes: viewingPreBooking.items.reduce((sum, item) => sum + item.quantity, 0), pieces: viewingPreBooking.items.reduce((sum, item) => sum + item.quantity_pieces, 0) });
          const { tax: taxTotal, grand_total: grandTotal, round_off: roundOff } = computeItemsTotal(viewingPreBooking.items);
          const bookedBy = resolveActor(data.users, viewingPreBooking.salesperson_id);
          return (
            <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
              <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-xl w-full h-[80%]">
                <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
                  <View>
                    <Text className="font-extrabold text-slate-800 text-sm">Pre-Booking Bill</Text>
                    <Text className="text-[10px] text-slate-400 mt-0.5">#{viewingPreBooking.id}</Text>
                  </View>
                  <Pressable onPress={closePreBookingViewer}><Text className="text-slate-400 text-lg">x</Text></Pressable>
                </View>

                <View className="gap-1 bg-slate-50 p-3 rounded-2xl mb-3">
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Store:</Text> {store?.name || 'Unknown'}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Booked On:</Text> {new Date(viewingPreBooking.created_at).toLocaleDateString('en-IN')}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Scheduled Delivery:</Text> {new Date(viewingPreBooking.scheduled_delivery_date).toLocaleDateString('en-IN')}</Text>
                  <Text className="text-slate-700 text-xs"><Text className="font-bold">Booked By:</Text> {bookedBy.name} ({bookedBy.role})</Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <Text className="text-slate-700 text-xs font-bold">Status:</Text>
                    <Text className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] uppercase ${viewingPreBooking.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : viewingPreBooking.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{viewingPreBooking.status}</Text>
                  </View>
                  {viewingPreBooking.notes && <Text className="text-slate-500 italic text-xs">Note: {viewingPreBooking.notes}</Text>}
                </View>

                <View className="mb-3">
                  <View className="flex-row gap-2">
                    <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Units</Text><Text className="text-xs font-black text-slate-800">{units}</Text></View>
                    <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Tax</Text><Text className="text-xs font-black text-slate-800">Rs. {taxTotal.toFixed(2)}</Text></View>
                    <View className="flex-1 bg-slate-50 p-2.5 rounded-2xl items-center"><Text className="text-slate-400 text-[8px] font-black uppercase">Net Amount</Text><Text className="text-xs font-black text-emerald-600">{formatWholeRupees(grandTotal)}</Text></View>
                  </View>
                  <View className="flex-row justify-between mt-1.5 px-0.5">
                    <Text className="text-slate-400 text-[9px]">Total (Before Round Off): Rs. {(grandTotal - roundOff).toFixed(2)}</Text>
                    <Text className="text-slate-400 text-[9px]">Round Off: {roundOff > 0 ? '+' : ''}Rs. {roundOff.toFixed(2)}</Text>
                  </View>
                </View>

                <Text className="font-bold text-slate-700 text-[9px] uppercase mb-1.5">Line Items</Text>
                <ScrollView className="flex-1 mb-3">
                  <View className="gap-1.5">
                    {viewingPreBooking.items.map((item, idx) => {
                      const p = data.products.find(prod => prod.id === item.product_id);
                      const lineTotal = effectiveLineValue(item, item.unit_price);
                      const basis = p && item.unit_price === p.wholesale_price ? 'Wholesale' : p && item.unit_price === p.selling_price ? 'Selling' : '';
                      return (
                        <View key={idx} className="bg-slate-50 border border-slate-100 p-2 rounded-lg flex-row justify-between items-center">
                          <Text className="font-bold text-slate-800 text-[10px] flex-1" numberOfLines={1}>{p?.name || item.product_id}</Text>
                          <Text className="text-slate-600 text-[10px]">{formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })} x {formatUnitRate({ boxes: item.quantity, pieces: item.quantity_pieces }, item.unit_price, p?.pieces_per_box ?? 1)}{basis ? ` (${basis})` : ''} = Rs. {lineTotal.toFixed(2)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Permission-gated override: a Delivered pre-booking normally
                    can't be changed - these let an operator with the
                    corresponding privilege (native Admin, or anyone
                    individually granted it via Manage Permissions) correct a
                    mistake by editing the real order/invoice it produced,
                    automatically reversing/reapplying warehouse stock either
                    way. Only shown once fulfilled_order_id is present (older
                    deliveries from before this feature existed have nothing
                    to link to). */}
                {viewingPreBooking.status === 'Delivered' && viewingPreBooking.fulfilled_order_id &&
                  (hasAdminOverride(currentUser, PREBOOKINGS_EDIT_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions) ||
                    hasAdminOverride(currentUser, PREBOOKINGS_DELETE_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions)) && (
                  deletePreBookingConfirmId === viewingPreBooking.id ? (
                    // Rendered inline inside this same Modal rather than as a
                    // second <ConfirmModal> - two RN <Modal>s don't reliably
                    // stack on top of one another (see openPreBookingViewer),
                    // so a nested confirm Modal could end up hidden behind
                    // this Pre-Booking Bill popup.
                    <View className="gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl mb-2">
                      <Text className="text-rose-700 text-[10px] font-bold leading-relaxed">
                        Permanently delete this pre-booking? This action is irreversible. The pre-booking and the real order/invoice it produced will be permanently removed, its item quantities will be returned to warehouse stock, any outstanding balance it added to the store will be reversed, and any payments collected against it will be removed from collection totals.
                      </Text>
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => executeDeleteDeliveredPreBooking(viewingPreBooking.id)}
                          className="flex-1 py-1.5 bg-rose-600 rounded-lg items-center active:bg-rose-700"
                        >
                          <Text className="text-white font-bold text-[10px]">Yes, Delete Pre-Booking</Text>
                        </Pressable>
                        <Pressable onPress={() => setDeletePreBookingConfirmId(null)} className="flex-1 py-1.5 bg-white border border-slate-200 rounded-lg items-center active:bg-slate-100">
                          <Text className="text-slate-700 font-bold text-[10px]">No, Keep It</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row gap-2 mb-2">
                      {hasAdminOverride(currentUser, PREBOOKINGS_EDIT_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions) && (
                        <Pressable onPress={() => handleOpenEditDeliveredPreBooking(viewingPreBooking)} className="flex-1 py-2 bg-slate-100 rounded-xl flex-row items-center justify-center gap-1.5 border border-slate-200 active:bg-slate-200">
                          <Edit size={13} color="#475569" />
                          <Text className="text-slate-700 font-bold text-xs">Edit</Text>
                        </Pressable>
                      )}
                      {hasAdminOverride(currentUser, PREBOOKINGS_DELETE_OVERRIDE_FEATURE, data.rolePermissions, data.userPermissions) && (
                        <Pressable onPress={() => handleDeleteDeliveredPreBooking(viewingPreBooking.id)} className="flex-1 py-2 bg-rose-50 rounded-xl flex-row items-center justify-center gap-1.5 border border-rose-200 active:bg-rose-100">
                          <Trash2 size={13} color="#e11d48" />
                          <Text className="text-rose-600 font-bold text-xs">Delete</Text>
                        </Pressable>
                      )}
                    </View>
                  )
                )}

                <View className="flex-row gap-2">
                  <Pressable onPress={() => handleDownloadPreBookingPdf(viewingPreBooking)} className="flex-1 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl items-center active:bg-emerald-100 flex-row justify-center gap-1.5">
                    <Download size={14} color="#059669" />
                    <Text className="text-emerald-600 font-bold text-xs">Download PDF</Text>
                  </Pressable>
                  <Pressable onPress={closePreBookingViewer} className="flex-1 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close</Text></Pressable>
                </View>
              </View>
            </View>
          );
        })()}
      </Modal>
    </View>
  );
}
