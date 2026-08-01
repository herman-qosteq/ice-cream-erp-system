import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView } from 'react-native';
import { Shield, AlertTriangle, RefreshCw, ClipboardList, Trash2, Truck as TruckIcon, RotateCcw, X, Edit, Plus, FileSpreadsheet, Search, Paperclip, Check } from 'lucide-react-native';
import { ERPData, ERPAuditLog, resolveActor } from '../../storage';
import { Product, AppNotification, NotificationEntityType, Truck, PurchaseOrderRequest, WarehouseInventory, BoxPieceQty } from '../../types';
import ProductImage from '../../components/common/ProductImage';
import SelectField from '../../components/common/SelectField';
import BoxPieceInput from '../../components/common/BoxPieceInput';
import AutocompleteInput from '../../components/common/AutocompleteInput';
import { formatQty, formatQtyShort, readQtyField, addQty, subtractQty, compareQty, isPositiveQty } from '../../utils/qty';
import DateField from '../../components/common/DateField';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useAppContext } from '../../context/AppContext';
import { trucksApi, purchasesApi, purchaseOrderRequestsApi, warehouseApi, dispatchApi, systemApi, productsApi, settingsApi } from '../../api/endpoints';
import { discountFromPrice, boxMrpFromMrp, mrpFromBoxMrp } from '../../utils/pricing';
import { isRetailPricingEnabled } from '../../utils/permissions';
import { formatDateTime12h } from '../../utils/format';
import { buildPurchaseOrderWorkbook, buildPurchaseOrderRef, exportExcelWorkbook } from '../../utils/excelExport';
import { pickBillFileAsDataUri, PickedFile } from '../../utils/documentPicker';
import ViewToggle from '../../components/common/ViewToggle';
import DataTable, { DataTableColumn } from '../../components/common/DataTable';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import EmptyState from '../../components/common/EmptyState';
import PaginationFooter from '../../components/common/PaginationFooter';
import FilterBar, { FILTER_PILL_CLASS, FILTER_PILL_TEXT_CLASS } from '../../components/common/FilterBar';
import DateRangeFilterField from '../../components/common/DateRangeFilterField';
import ScrollableSection from '../../components/common/ScrollableSection';
import { useViewMode } from '../../context/ViewModeContext';
import { useResetScrollOnChange } from '../../context/ScrollResetContext';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useResponsiveTableHeight } from '../../hooks/useResponsiveTableHeight';
import { DateFilterMode } from '../../utils/dateFilter';
import AdminAssets from './AdminAssets';

export type WarehouseTab = 'warehouse' | 'trucks' | 'transfers' | 'audits' | 'assets';

interface AdminWarehouseProps {
  data: ERPData;
  setData: (updater: ERPData | ((prev: ERPData) => ERPData)) => void;
  addNotification: (type: AppNotification['type'], message: string, entityType?: NotificationEntityType, entityId?: string) => void;
  currentUser: any;
  activeScreen?: string;
  setActiveScreen?: (screen: any) => void;
  showAlert: (opts: any) => void;
  hideAdminControls?: boolean;
  // Restricts the internal tab bar to exactly these tabs - used whenever
  // this component is mounted for an operator who was granted only some of
  // the 5 registry screens it renders (Warehouse Inventory/Truck Fleet Load/
  // Trucks/Movement Audit/Assets & Freezer Boxes - see WarehouseFlow.tsx and
  // ScreenHost.tsx). Omitted (the AdminFlow.tsx call site) means unrestricted
  // - Admin always sees all 5.
  allowedTabs?: WarehouseTab[];
  onViewTodayPreBookings?: () => void;
  pendingNotificationTarget?: { entityType: NotificationEntityType; entityId: string } | null;
  onConsumePendingNotificationTarget?: () => void;
  onNavigateToEntity?: (entityType: NotificationEntityType, entityId: string) => void;
  // Lets "Create Order" on an assigned asset's detail view (the 'assets' tab)
  // hand off to the Orders screen with that asset's partner pre-selected -
  // forwarded straight through to AdminAssets, see its own prop of the same
  // name for details.
  onCreateOrderForPartner?: (storeId: string) => void;
}

const ALL_WAREHOUSE_TABS: WarehouseTab[] = ['warehouse', 'transfers', 'trucks', 'audits', 'assets'];

// AuditLog.entity_type values are PascalCase, written at each logAudit() call
// site across the backend (e.g. 'Order', 'PreBookingOrder') - these don't
// match the lowercase NotificationEntityType union used by the cross-screen
// navigate-to-entity primitive, so map between them. Types with no mapping
// (Area/Category/System/PurchaseOrderRequest/Warehouse) have no detail view
// to navigate to - those rows just render non-clickable.
const AUDIT_ENTITY_TYPE_MAP: Record<string, NotificationEntityType | undefined> = {
  Order: 'order',
  PreBookingOrder: 'prebooking',
  Purchase: 'purchase',
  Store: 'store',
  Supplier: 'supplier',
  Product: 'product',
  User: 'user',
  Truck: 'truck',
  Asset: 'asset',
};
function mapAuditEntityType(raw: string): NotificationEntityType | null {
  return AUDIT_ENTITY_TYPE_MAP[raw] ?? null;
}

export default function AdminWarehouse({ data, setData, addNotification, currentUser, activeScreen, setActiveScreen, showAlert, hideAdminControls = false, allowedTabs, onViewTodayPreBookings, pendingNotificationTarget, onConsumePendingNotificationTarget, onNavigateToEntity, onCreateOrderForPartner }: AdminWarehouseProps) {
  const { refreshData } = useAppContext();
  const { viewMode } = useViewMode();
  const visibleTabs = allowedTabs ?? ALL_WAREHOUSE_TABS;
  const [activeTab, setActiveTab] = useState<WarehouseTab>(visibleTabs[0] ?? 'warehouse');
  const [warehouseSearch, setWarehouseSearch] = useState('');
  // Inventory is what users check most often (how much stock is loaded on a
  // truck) - fleet management (add/edit/remove trucks) is a rarer admin task,
  // so it defaults to the inventory view instead of whichever was used last.
  const [trucksSubTab, setTrucksSubTab] = useState<'inventory' | 'fleet'>('inventory');
  // Loading cargo from the warehouse onto a truck is the everyday operation -
  // moving stock truck-to-truck is a rarer exception, so it defaults here too.
  const [transfersSubTab, setTransfersSubTab] = useState<'load' | 'transfer'>('load');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState('All');
  const [auditUserFilter, setAuditUserFilter] = useState('All');
  const [auditDateFilterMode, setAuditDateFilterMode] = useState<DateFilterMode>('today');
  const [auditCustomDateFrom, setAuditCustomDateFrom] = useState('');
  const [auditCustomDateTo, setAuditCustomDateTo] = useState('');
  const auditLogs = usePaginatedList<ERPAuditLog, { entity_type?: string; user_id?: string }>({
    resource: 'audit-logs',
    mode: 'offset',
    pageSize: 25,
    enabled: activeTab === 'audits',
    filters: {
      entity_type: auditEntityTypeFilter !== 'All' ? auditEntityTypeFilter : undefined,
      user_id: auditUserFilter !== 'All' ? auditUserFilter : undefined,
    },
    search: auditSearch,
    dateFilterMode: auditDateFilterMode,
    customDateFrom: auditCustomDateFrom,
    customDateTo: auditCustomDateTo,
    fetcher: params => settingsApi.listAuditLogsPaged(params),
  });
  // ~330px of chrome sits above the table on this tab (tab bar, card title,
  // filter bar) - fixing the table itself to the remaining viewport height
  // means the outer page essentially never needs to scroll too, so only this
  // bounded region's own scrollbar is ever in play. Fixed, not a cap: a page
  // with only a few rows keeps this same height (empty space below the
  // rows) instead of the box shrinking to fit - the layout stays put
  // regardless of how many records the current page/filter turns up.
  const auditTableHeight = useResponsiveTableHeight(330);

  const todayIso = new Date().toISOString().split('T')[0];
  const todaysPreBookingsCount = (data.preBookingOrders || []).filter(
    pb => pb.scheduled_delivery_date === todayIso && pb.status === 'Booked'
  ).length;

  useEffect(() => {
    if (activeScreen === 'Warehouse') setActiveTab('warehouse');
    else if (activeScreen === 'Trucks') setActiveTab('transfers');
    else if (activeScreen === 'TruckInventory') setActiveTab('trucks');
    else if (activeScreen === 'MovementAudit') setActiveTab('audits');
    else if (activeScreen === 'Assets') setActiveTab('assets');
    // warehouseForm is checked in an early return before activeTab is even
    // considered (see the `if (warehouseForm === 'receive_stock') return (...)`
    // above the main render), so without this reset a still-open Receive
    // Stock form stays on screen no matter which tab/sidebar item is tapped
    // next. The rest are popups rendered as siblings to the main tab content
    // (gated only by their own visible flag), so they'd otherwise stay open
    // on top of whichever tab the user just navigated to - see the matching
    // comment in AdminSales.tsx's activeScreen effect.
    setWarehouseForm('list');
    setTruckFormMode('list');
    setEditingTruckId(null);
    setShowCorrectionModal(false);
    setShowResetModal(false);
    setConfirmResetType('none');
    setShowConfirmReceiveModal(false);
    setShowReturnAllConfirm(false);
    setShowNoSupplierWarning(false);
    setDeleteTruckConfirmId(null);
    setEditingPORequestId(null);
    setShowPurchaseOrderExport(false);
    setShowPendingPOList(false);
  }, [activeScreen]);

  // Redirect off a tab that just became disallowed for this operator (e.g.
  // an Admin revoked "Trucks" for them via Manage Permissions while they had
  // it open, arriving live through realtime refreshData()) instead of
  // rendering a tab bar with no active selection.
  useEffect(() => {
    if (!visibleTabs.includes(activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs.join(',')]);

  useEffect(() => {
    if (!pendingNotificationTarget || pendingNotificationTarget.entityType !== 'truck') return;
    const truck = data.trucks.find(t => t.id === pendingNotificationTarget.entityId);
    if (truck) {
      setActiveTab('trucks');
      setTrucksSubTab('fleet');
    }
    onConsumePendingNotificationTarget?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotificationTarget]);

  const [selectedTruckId, setSelectedTruckId] = useState<string>(data.trucks[0]?.id || '');
  const activeTruckId = selectedTruckId || data.trucks[0]?.id || '';

  const [correctionForm, setCorrectionForm] = useState({
    product_id: '',
    available_qty: { boxes: 0, pieces: 0 } as BoxPieceQty,
    reserved_qty: { boxes: 0, pieces: 0 } as BoxPieceQty,
    damaged_qty: { boxes: 0, pieces: 0 } as BoxPieceQty,
    expired_qty: { boxes: 0, pieces: 0 } as BoxPieceQty,
    comment: '',
  });
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  const [dispatchTruckId, setDispatchTruckId] = useState<string>(data.trucks[0]?.id || '');
  const [dispatchItems, setDispatchItems] = useState<{ product_id: string; qty: BoxPieceQty; source: 'available_qty' | 'reserved_qty'; preBookingId?: string }[]>([]);
  const [showDispatchPreBookings, setShowDispatchPreBookings] = useState(false);

  const [swapFromTruckId, setSwapFromTruckId] = useState<string>(data.trucks[0]?.id || '');
  const [swapToTruckId, setSwapToTruckId] = useState<string>(data.trucks[1]?.id || '');
  const [swapItems, setSwapItems] = useState<{ product_id: string; qty: BoxPieceQty }[]>([
    { product_id: data.products[0]?.id || '', qty: { boxes: 10, pieces: 0 } }
  ]);

  const [returnQuantities, setReturnQuantities] = useState<Record<string, BoxPieceQty>>({});
  const [showReturnAllConfirm, setShowReturnAllConfirm] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmResetType, setConfirmResetType] = useState<'none' | 'clear_stock' | 'factory_reset'>('none');
  const [showNoSupplierWarning, setShowNoSupplierWarning] = useState(false);
  const [showConfirmReceiveModal, setShowConfirmReceiveModal] = useState(false);

  // Purchase Order (Excel) export: pick a supplier + products + how many
  // cases to order, then download a formatted .xlsx to send them. Also
  // saved as a Pending PurchaseOrderRequest so Receive Stock can later
  // pre-fill from it once the supplier packs the order and sends prices back.
  const [showPurchaseOrderExport, setShowPurchaseOrderExport] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poOrderCase, setPoOrderCase] = useState<Record<string, string>>({});
  const [poOrderCasePieces, setPoOrderCasePieces] = useState<Record<string, string>>({});
  const [poSearch, setPoSearch] = useState('');
  const debouncedPoSearch = useDebouncedValue(poSearch, 150);
  const [pendingPOForReceive, setPendingPOForReceive] = useState<PurchaseOrderRequest | null>(null);
  const [showPendingPOList, setShowPendingPOList] = useState(false);
  // Set while the Purchase Order modal is being reused to edit an existing
  // Pending draft (instead of creating a new one) - null means "create" mode.
  const [editingPORequestId, setEditingPORequestId] = useState<string | null>(null);
  const [confirmDeletePOId, setConfirmDeletePOId] = useState<string | null>(null);
  // Supplier's own bill/price-list photo, PDF, or Excel - attached when
  // confirming a stock receipt so it's kept alongside the Purchase record.
  const [billFile, setBillFile] = useState<PickedFile | null>(null);

  const [truckFormMode, setTruckFormMode] = useState<'list' | 'add' | 'edit'>('list');
  useResetScrollOnChange(activeTab, trucksSubTab, transfersSubTab, truckFormMode);
  const [truckFleetTab, setTruckFleetTab] = useState<'active' | 'inactive'>('active');
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [truckForm, setTruckForm] = useState({ vehicle_number: '', driver_user_id: '', route: '', area: '' });
  const [deleteTruckConfirmId, setDeleteTruckConfirmId] = useState<string | null>(null);

  // Drivers already at the wheel of another active truck aren't offered -
  // one driver, one truck at a time. Excludes the truck currently being
  // edited (editingTruckId) so its own existing driver still shows up as a
  // pickable option instead of disappearing because it's "assigned to
  // itself"; on Register New Truck editingTruckId is null, so every active
  // truck's driver counts as taken.
  const driversOnOtherActiveTrucks = new Set(
    data.trucks
      .filter(t => t.status === 'Active' && t.driver_user_id && t.id !== editingTruckId)
      .map(t => t.driver_user_id as string)
  );
  const driverOptions = data.users
    .filter(u => u.role === 'Salesperson' && u.status === 'Active' && !driversOnOtherActiveTrucks.has(u.id))
    .map(u => ({ label: u.name, value: u.id }));
  // "Unassigned" (value '') is always the first option so Edit Truck can
  // explicitly clear the driver - trucksApi.update() accepts an empty
  // driver_user_id and the backend normalizes it to null (see
  // updateTruckSchema in trucks.controller.ts); Register New Truck still
  // requires picking a real driver before it'll save (see handleSaveTruck).
  const truckFormDriverOptionsBase = driverOptions.some(o => o.value === truckForm.driver_user_id)
    ? driverOptions
    : [...driverOptions, ...data.users.filter(u => u.id === truckForm.driver_user_id).map(u => ({ label: `${u.name} (Inactive)`, value: u.id }))];
  const truckFormDriverOptions = [{ label: 'Unassigned', value: '' }, ...truckFormDriverOptionsBase];

  const handleOpenAddTruck = () => {
    setTruckForm({ vehicle_number: '', driver_user_id: data.users.find(u => u.role === 'Salesperson')?.id || '', route: '', area: '' });
    setEditingTruckId(null);
    setTruckFormMode('add');
  };

  const handleOpenEditTruck = (t: Truck) => {
    // Empty when null (a deactivated truck whose driver was auto-cleared -
    // see Truck.driver_user_id in types.ts) so the driver dropdown comes up
    // unselected and has to be re-picked before this form can be saved,
    // rather than silently reusing a stale/no-longer-relevant driver id.
    setTruckForm({ vehicle_number: t.vehicle_number, driver_user_id: t.driver_user_id ?? '', route: t.route, area: t.area });
    setEditingTruckId(t.id);
    setTruckFormMode('edit');
  };

  const handleSaveTruck = async () => {
    if (!truckForm.vehicle_number.trim() || !truckForm.area.trim()) {
      showAlert('Vehicle number and area are required.');
      return;
    }
    // Only Register New Truck requires a driver - Edit Truck can save with
    // "Unassigned" selected (see truckFormDriverOptions above), matching
    // what the backend actually allows per mode (createTruckSchema vs.
    // updateTruckSchema in trucks.controller.ts).
    if (truckFormMode === 'add' && !truckForm.driver_user_id.trim()) {
      showAlert('A driver must be assigned to register a new truck.');
      return;
    }

    try {
      if (truckFormMode === 'add') {
        const created = await trucksApi.create(truckForm);
        await refreshData();
        addNotification('stock_update', `New delivery truck added to fleet: ${truckForm.vehicle_number}.`, 'truck', created.id);
        showAlert(`Truck ${truckForm.vehicle_number} added to the fleet successfully!`);
      } else if (truckFormMode === 'edit' && editingTruckId) {
        await trucksApi.update(editingTruckId, truckForm);
        await refreshData();
        addNotification('stock_update', `Truck ${truckForm.vehicle_number} details were updated.`, 'truck', editingTruckId);
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
      // Any cargo still loaded on this truck is automatically returned to
      // warehouse stock as part of deactivating it (see trucks.service.ts
      // setStatus) - surface that in the confirmation instead of a generic
      // "removed" message when it actually happened.
      const result = await trucksApi.setStatus(truckId, 'Inactive');
      await refreshData();
      const returnMsg = (result.returnedUnits > 0 || result.returnedPieces > 0)
        ? ` ${formatQty({ boxes: result.returnedUnits, pieces: result.returnedPieces ?? 0 })} of loaded cargo (${result.returnedSummary}) were automatically returned to warehouse stock.`
        : '';
      addNotification('stock_update', `Truck ${truck.vehicle_number} was removed from the active fleet.${returnMsg}`, 'truck', truckId);
      showAlert({ type: 'success', message: `"${truck.vehicle_number}" has been removed from the active fleet.${returnMsg}` });

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
      addNotification('stock_update', `Truck ${truck.vehicle_number} was reactivated into the fleet.`, 'truck', truckId);
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
  const emptyPurchaseItem = { product_id: '', quantity: 100, quantity_pieces: 0, mrp: 0, box_mrp: 0, purchase_discount_pct: 0, wholesale_discount_pct: 0, retail_discount_pct: 0, purchase_price: 0, wholesale_price: 0, retail_price: 0, mfg_date: '2026-06-27', expiry_date: '2026-12-24' };
  type PurchaseFormItem = typeof emptyPurchaseItem;
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', invoice_number: '', date: todayIso,
    items: [{ ...emptyPurchaseItem }]
  });

  // Single source of truth for the percentage-based pricing math, matching
  // the exact formula used everywhere else in the app (Product Catalog,
  // Pricing screen, backend serializeProduct): price = mrp * (1 - pct/100).
  const priceFromDiscount = (mrp: number, discountPct: number) => Math.max(0, mrp * (1 - discountPct / 100));

  // Discount percentages above 100 would make priceFromDiscount go negative,
  // so typed input is clamped to 100 and the admin is told why.
  const parseDiscountPct = (v: string): number => {
    const num = Number(v) || 0;
    if (num > 100) {
      showAlert({ type: 'warning', message: 'Discount percentage cannot be greater than 100%.' });
      return 100;
    }
    return num;
  };

  // Recomputes every derived price for a row from its own mrp/discount
  // fields, so Purchase/Wholesale/Selling always reflect the values
  // currently typed into that row - not the product's last-saved catalog
  // values once the admin starts editing them here. Used whenever mrp/%
  // changes (or a different product is picked) - price flows FROM %.
  // Box MRP is likewise re-derived here from mrp * pieces_per_box (the
  // product's fixed box/piece conversion factor), matching the same
  // MRP <-> Box MRP relationship kept in AdminProducts.tsx.
  const withRecalculatedPrice = (item: typeof emptyPurchaseItem) => {
    const piecesPerBox = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
    return {
      ...item,
      box_mrp: boxMrpFromMrp(item.mrp, piecesPerBox),
      purchase_price: parseFloat(priceFromDiscount(item.mrp, item.purchase_discount_pct).toFixed(2)),
      wholesale_price: parseFloat(priceFromDiscount(item.mrp, item.wholesale_discount_pct).toFixed(2)),
      retail_price: parseFloat(priceFromDiscount(item.mrp, item.retail_discount_pct).toFixed(2)),
    };
  };

  const handleOpenReceiveStock = () => {
    if (data.suppliers.length === 0) {
      setShowNoSupplierWarning(true);
      return;
    }
    setPurchaseForm({
      supplier_id: data.suppliers[0].id,
      invoice_number: 'SUP-INV-' + Math.floor(Math.random() * 9000 + 1000),
      date: todayIso,
      items: [{ ...emptyPurchaseItem }]
    });
    setPendingPOForReceive(null);
    setBillFile(null);
    setWarehouseForm('receive_stock');
  };

  // Pre-fills the manifest from a saved Purchase Order Excel request - the
  // admin still reviews/adjusts prices manually below, since the supplier's
  // actual rates only arrive after they pack the order.
  const handleFillReceiveStockFromPO = (request: PurchaseOrderRequest) => {
    const items = request.items.map(i => {
      const product = data.products.find(p => p.id === i.product_id);
      const mrp = product?.mrp || 0;
      const purchase_discount_pct = product?.purchase_discount_pct || 0;
      const wholesale_discount_pct = product?.wholesale_discount_pct || 0;
      const retail_discount_pct = product?.retail_discount_pct || 0;
      return {
        ...emptyPurchaseItem,
        product_id: i.product_id,
        quantity: i.order_case,
        quantity_pieces: i.order_case_pieces,
        mrp,
        box_mrp: boxMrpFromMrp(mrp, product?.pieces_per_box || 1),
        purchase_discount_pct,
        wholesale_discount_pct,
        retail_discount_pct,
        purchase_price: parseFloat(priceFromDiscount(mrp, purchase_discount_pct).toFixed(2)),
        wholesale_price: parseFloat(priceFromDiscount(mrp, wholesale_discount_pct).toFixed(2)),
        retail_price: parseFloat(priceFromDiscount(mrp, retail_discount_pct).toFixed(2)),
      };
    });
    setPurchaseForm({
      supplier_id: request.supplier_id,
      invoice_number: 'SUP-INV-' + Math.floor(Math.random() * 9000 + 1000),
      date: todayIso,
      items,
    });
    setPendingPOForReceive(request);
    setBillFile(null);
    setShowPendingPOList(false);
    setWarehouseForm('receive_stock');
  };

  const handleOpenPurchaseOrderExport = () => {
    if (data.suppliers.filter(s => s.status === 'Active').length === 0) {
      setShowNoSupplierWarning(true);
      return;
    }
    setPoSupplierId(data.suppliers.find(s => s.status === 'Active')!.id);
    setPoOrderCase({});
    setPoOrderCasePieces({});
    setPoSearch('');
    setEditingPORequestId(null);
    setShowPurchaseOrderExport(true);
  };

  // Reuses the same Purchase Order modal to correct a mistake in a still-
  // Pending draft (wrong product/case count) instead of a separate form.
  const handleOpenEditPendingPO = (request: PurchaseOrderRequest) => {
    setPoSupplierId(request.supplier_id);
    const caseMap: Record<string, string> = {};
    const casePiecesMap: Record<string, string> = {};
    request.items.forEach(i => { caseMap[i.product_id] = String(i.order_case); casePiecesMap[i.product_id] = String(i.order_case_pieces || ''); });
    setPoOrderCase(caseMap);
    setPoOrderCasePieces(casePiecesMap);
    setPoSearch('');
    setEditingPORequestId(request.id);
    setShowPendingPOList(false);
    setShowPurchaseOrderExport(true);
  };

  const handleClosePurchaseOrderModal = () => {
    setShowPurchaseOrderExport(false);
    setEditingPORequestId(null);
  };

  const handleSaveEditedPurchaseOrder = async () => {
    if (!editingPORequestId) return;
    if (!poSupplierId) {
      showAlert('Please select which supplier you are sending this order to.');
      return;
    }
    const selectedProducts = data.products.filter(p => Number(poOrderCase[p.id]) > 0 || Number(poOrderCasePieces[p.id]) > 0);
    if (selectedProducts.length === 0) {
      showAlert('Select at least one product and enter its order case quantity.');
      return;
    }
    const requestId = editingPORequestId;
    const orderRef = data.purchaseOrderRequests.find(r => r.id === requestId)?.order_ref
      || buildPurchaseOrderRef(data.purchaseOrderRequests.map(r => r.order_ref));
    const excelItems = selectedProducts.map(p => ({
      category: p.category,
      code: p.code,
      description: `${p.name} (${p.unit_value}${p.unit_type})`,
      orderCase: Number(poOrderCase[p.id]) || 0,
      orderCasePieces: Number(poOrderCasePieces[p.id]) || 0,
    }));
    const workbook = buildPurchaseOrderWorkbook(excelItems, orderRef);
    // Close before showing the result alert - two RN <Modal>s open at once
    // don't reliably stack, so the alert renders behind this one otherwise.
    setShowPurchaseOrderExport(false);
    setEditingPORequestId(null);
    await exportExcelWorkbook(workbook, `Purchase_Order_${orderRef}.xlsx`, showAlert);
    try {
      await purchaseOrderRequestsApi.update(requestId, {
        supplier_id: poSupplierId,
        items: selectedProducts.map(p => ({ product_id: p.id, order_case: Number(poOrderCase[p.id]) || 0, order_case_pieces: Number(poOrderCasePieces[p.id]) || 0 })),
      });
      await refreshData();
    } catch (e: any) {
      // The Excel already downloaded successfully - only the save step
      // failed, so this is a distinct, softer warning rather than blocking
      // the flow the admin just completed.
      showAlert({ type: 'warning', message: `Excel downloaded, but couldn't save the changes: ${e.message ?? 'unknown error'}.` });
    }
  };

  const handleConfirmDeletePendingPO = async (requestId: string) => {
    setConfirmDeletePOId(null);
    try {
      await purchaseOrderRequestsApi.cancel(requestId);
      await refreshData();
    } catch (e: any) {
      // Close first - the Pending Orders modal is still open at this point,
      // and a still-open <Modal> hides the (non-portaled) global alert.
      setShowPendingPOList(false);
      showAlert(e.message ?? 'Unable to delete this purchase order.');
    }
  };

  const handleDownloadPurchaseOrderExcel = async () => {
    if (!poSupplierId) {
      showAlert('Please select which supplier you are sending this order to.');
      return;
    }
    const selectedProducts = data.products.filter(p => Number(poOrderCase[p.id]) > 0 || Number(poOrderCasePieces[p.id]) > 0);
    if (selectedProducts.length === 0) {
      showAlert('Select at least one product and enter its order case quantity.');
      return;
    }
    const orderRef = buildPurchaseOrderRef(data.purchaseOrderRequests.map(r => r.order_ref));
    const excelItems = selectedProducts.map(p => ({
      category: p.category,
      code: p.code,
      description: `${p.name} (${p.unit_value}${p.unit_type})`,
      orderCase: Number(poOrderCase[p.id]) || 0,
      orderCasePieces: Number(poOrderCasePieces[p.id]) || 0,
    }));
    const workbook = buildPurchaseOrderWorkbook(excelItems, orderRef);
    // Close this modal before showing the result alert - two RN <Modal>s open
    // at once don't reliably stack, so the alert was rendering behind this
    // one until it got dismissed.
    setShowPurchaseOrderExport(false);
    await exportExcelWorkbook(workbook, `Purchase_Order_${orderRef}.xlsx`, showAlert);

    try {
      await purchaseOrderRequestsApi.create({
        order_ref: orderRef,
        supplier_id: poSupplierId,
        items: selectedProducts.map(p => ({ product_id: p.id, order_case: Number(poOrderCase[p.id]) || 0, order_case_pieces: Number(poOrderCasePieces[p.id]) || 0 })),
      });
      await refreshData();
    } catch (e: any) {
      // The Excel already downloaded successfully - only the save-for-later
      // step failed, so this is a distinct, softer warning rather than
      // blocking the flow the admin just completed.
      showAlert({ type: 'warning', message: `Excel downloaded, but couldn't save it for auto-fill later: ${e.message ?? 'unknown error'}. You can still fill Receive Stock manually.` });
    }
  };

  const validatePurchaseForm = () => {
    if (!purchaseForm.invoice_number) {
      showAlert('Supplier invoice number is required.');
      return false;
    }
    if (purchaseForm.items.some(item => !item.product_id)) {
      showAlert('Please select an ice cream item for every row in the cargo manifest before confirming receipt.');
      return false;
    }
    if (purchaseForm.items.some(item => item.mrp <= 0)) {
      showAlert('Please enter a valid Piece MRP greater than zero for every item before confirming receipt.');
      return false;
    }
    return true;
  };

  const handleOpenConfirmReceive = () => {
    if (!validatePurchaseForm()) return;
    setShowConfirmReceiveModal(true);
  };

  const handleSavePurchase = async () => {
    if (!validatePurchaseForm()) return;
    const suppName = data.suppliers.find(s => s.id === purchaseForm.supplier_id)?.name || 'Supplier';
    try {
      const createdPurchase = await purchasesApi.create({
        ...purchaseForm,
        items: purchaseForm.items.map(({ mrp, box_mrp, purchase_discount_pct, wholesale_discount_pct, retail_discount_pct, wholesale_price, retail_price, ...rest }) => rest),
        bill_file_url: billFile?.dataUri,
        bill_file_name: billFile?.name,
        bill_file_type: billFile?.mimeType,
        source_request_id: pendingPOForReceive?.id,
      });

      // Any row whose MRP/% the admin edited on this page updates that
      // product's catalog pricing everywhere else in the app too (Product
      // Catalog, Orders, Pre-Booking, Dashboard, ...), since they all read
      // the same mrp/discount fields from the product record.
      const pricingUpdates = purchaseForm.items.filter(item => {
        const product = data.products.find(p => p.id === item.product_id);
        if (!product) return false;
        return (
          product.mrp !== item.mrp ||
          product.purchase_discount_pct !== item.purchase_discount_pct ||
          product.wholesale_discount_pct !== item.wholesale_discount_pct ||
          product.retail_discount_pct !== item.retail_discount_pct
        );
      });
      let pricingUpdateFailures = 0;
      for (const item of pricingUpdates) {
        try {
          await productsApi.updatePrice(item.product_id, {
            mrp: item.mrp,
            purchase_discount_pct: item.purchase_discount_pct,
            wholesale_discount_pct: item.wholesale_discount_pct,
            retail_discount_pct: item.retail_discount_pct,
          });
        } catch {
          pricingUpdateFailures += 1;
        }
      }

      await refreshData();
      addNotification('stock_update', `Stock inward received from ${suppName}: warehouse quantities updated.`, 'purchase', createdPurchase.id);
      if (pricingUpdates.length > 0 && pricingUpdateFailures === 0) {
        addNotification('product_update', `Updated catalog pricing for ${pricingUpdates.length} product(s) from ${suppName}'s stock inward.`);
      }
      showAlert(pricingUpdateFailures > 0
        ? `Stock received, but ${pricingUpdateFailures} product pricing update(s) failed to save. Please review pricing for those items in the Catalog.`
        : 'Stock received successfully!');
      setWarehouseForm('list');
      setPendingPOForReceive(null);
      setBillFile(null);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to receive stock.');
    }
  };

  const handleAttachBillFile = async () => {
    const picked = await pickBillFileAsDataUri(showAlert);
    if (picked) setBillFile(picked);
  };

  const handleAddPurchaseItem = () => {
    setPurchaseForm({
      ...purchaseForm,
      items: [...purchaseForm.items, { ...emptyPurchaseItem }]
    });
  };

  const handleRemovePurchaseItem = (index: number) => {
    if (purchaseForm.items.length <= 1) return;
    setPurchaseForm({ ...purchaseForm, items: purchaseForm.items.filter((_, i) => i !== index) });
  };

  // Shared by both the Card and Table renderings of the Cargo Manifest below
  // so the two views can't drift into different update behavior.
  const updatePurchaseItem = (index: number, patch: Partial<PurchaseFormItem>) => {
    const newItems = [...purchaseForm.items];
    newItems[index] = withRecalculatedPrice({ ...newItems[index], ...patch });
    setPurchaseForm({ ...purchaseForm, items: newItems });
  };
  // Price -> % direction: only that field's % is recalculated; the price
  // itself is stored exactly as typed (not round-tripped through
  // withRecalculatedPrice's toFixed).
  const updatePurchaseItemPrice = (index: number, field: 'purchase' | 'wholesale' | 'retail', price: number) => {
    const newItems = [...purchaseForm.items];
    const current = newItems[index];
    newItems[index] = { ...current, [`${field}_price`]: price, [`${field}_discount_pct`]: discountFromPrice(current.mrp, price) };
    setPurchaseForm({ ...purchaseForm, items: newItems });
  };
  // Box MRP -> MRP direction: editing Box MRP recomputes mrp (via
  // mrpFromBoxMrp) and routes through updatePurchaseItem so the
  // purchase/wholesale/retail prices stay in sync too.
  const updatePurchaseItemBoxMrp = (index: number, boxMrp: number) => {
    const item = purchaseForm.items[index];
    const piecesPerBox = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
    updatePurchaseItem(index, { mrp: mrpFromBoxMrp(boxMrp, piecesPerBox) });
  };

  useEffect(() => {
    if (swapFromTruckId === swapToTruckId) {
      const otherTruck = data.trucks.find(t => t.id !== swapFromTruckId);
      if (otherTruck) setSwapToTruckId(otherTruck.id);
    }
  }, [swapFromTruckId, swapToTruckId, data.trucks]);

  useEffect(() => {
    const sourceCargo = data.truck_inventory.filter(ti => ti.truck_id === swapFromTruckId && isPositiveQty(readQtyField(ti, 'quantity', 'quantity_pieces')));
    if (sourceCargo.length > 0) {
      const ppb = data.products.find(p => p.id === sourceCargo[0].product_id)?.pieces_per_box ?? 1;
      const available = readQtyField(sourceCargo[0], 'quantity', 'quantity_pieces');
      const initial = compareQty({ boxes: 10, pieces: 0 }, available, ppb) > 0 ? available : { boxes: 10, pieces: 0 };
      setSwapItems([{ product_id: sourceCargo[0].product_id, qty: initial }]);
    } else {
      setSwapItems([]);
    }
  }, [swapFromTruckId, data.truck_inventory]);

  const warehousePoolQty = (prodId: string, source: 'available_qty' | 'reserved_qty'): BoxPieceQty => {
    const inv = data.warehouse_inventory.find(i => i.product_id === prodId);
    if (!inv) return { boxes: 0, pieces: 0 };
    return source === 'reserved_qty' ? { boxes: inv.reserved_qty, pieces: inv.reserved_pieces } : { boxes: inv.available_qty, pieces: inv.available_pieces };
  };

  const updateDispatchItem = (index: number, field: 'product_id' | 'qty' | 'source', value: any) => {
    const updated = [...dispatchItems];
    if (field === 'product_id') {
      const ppb = data.products.find(p => p.id === value)?.pieces_per_box ?? 1;
      const availableQty = warehousePoolQty(value, updated[index].source);
      const currentQty = updated[index].qty;
      const fallback = { boxes: 1, pieces: 0 };
      const nextQty = !isPositiveQty(availableQty) ? { boxes: 0, pieces: 0 }
        : compareQty(currentQty, availableQty, ppb) > 0 ? availableQty
        : (isPositiveQty(currentQty) ? currentQty : fallback);
      updated[index] = { ...updated[index], product_id: value, qty: nextQty };
    } else if (field === 'qty') {
      const prodId = updated[index].product_id;
      const prodName = data.products.find(p => p.id === prodId)?.name || 'This product';
      const ppb = data.products.find(p => p.id === prodId)?.pieces_per_box ?? 1;
      const maxAllowed = warehousePoolQty(prodId, updated[index].source);
      const requested: BoxPieceQty = value;
      if (compareQty(requested, maxAllowed, ppb) > 0) {
        showAlert(!isPositiveQty(maxAllowed)
          ? `${prodName} has none available in that pool right now.`
          : `Limit exceeded! Only ${formatQty(maxAllowed)} of ${prodName} are available in that pool.`);
      }
      const nextQty = compareQty(requested, maxAllowed, ppb) > 0 ? maxAllowed : requested;
      updated[index] = { ...updated[index], qty: nextQty };
    } else if (field === 'source') {
      const prodId = updated[index].product_id;
      const ppb = data.products.find(p => p.id === prodId)?.pieces_per_box ?? 1;
      const availableQty = warehousePoolQty(prodId, value);
      const tenBoxes = { boxes: 10, pieces: 0 };
      const nextQty = !isPositiveQty(availableQty) ? { boxes: 0, pieces: 0 } : (compareQty(tenBoxes, availableQty, ppb) > 0 ? availableQty : tenBoxes);
      updated[index] = { ...updated[index], source: value, qty: nextQty };
    }
    setDispatchItems(updated);
  };

  const addDispatchItem = () => {
    const selectedIds = dispatchItems.map(item => item.product_id);
    const activeProducts = data.products.filter(p => p.status === 'Active');
    const unusedProduct = activeProducts.find(p => !selectedIds.includes(p.id));
    const nextId = unusedProduct ? unusedProduct.id : (activeProducts[0]?.id || '');
    const ppb = data.products.find(p => p.id === nextId)?.pieces_per_box ?? 1;
    const availableQty = warehousePoolQty(nextId, 'available_qty');
    const tenBoxes = { boxes: 10, pieces: 0 };
    const initialQty = !isPositiveQty(availableQty) ? { boxes: 0, pieces: 0 } : (compareQty(tenBoxes, availableQty, ppb) > 0 ? availableQty : tenBoxes);
    setDispatchItems([...dispatchItems, { product_id: nextId, qty: initialQty, source: 'available_qty' }]);
  };

  const removeDispatchItem = (index: number) => {
    setDispatchItems(dispatchItems.filter((_, i) => i !== index));
  };

  const handleAddPreBookingItemToDispatch = (productId: string, qty: BoxPieceQty, preBookingId: string) => {
    const ppb = data.products.find(p => p.id === productId)?.pieces_per_box ?? 1;
    setDispatchItems(prev => {
      const existingIdx = prev.findIndex(item => item.product_id === productId && item.preBookingId === preBookingId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], qty: addQty(updated[existingIdx].qty, qty, ppb) };
        return updated;
      }
      return [...prev, { product_id: productId, qty, source: 'reserved_qty' as const, preBookingId }];
    });
    showAlert({ type: 'success', message: `Added ${formatQty(qty)} of ${data.products.find(p => p.id === productId)?.name || 'product'} to the dispatch queue from the reserved pool.` });
  };

  const handleAddAllPreBookingItemsToDispatch = (items: { product_id: string; quantity: number; quantity_pieces: number }[], preBookingId: string) => {
    setDispatchItems(prev => {
      let updated = [...prev];
      items.forEach(item => {
        const ppb = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
        const itemQty: BoxPieceQty = { boxes: item.quantity, pieces: item.quantity_pieces };
        const existingIdx = updated.findIndex(di => di.product_id === item.product_id && di.preBookingId === preBookingId);
        if (existingIdx >= 0) {
          updated[existingIdx] = { ...updated[existingIdx], qty: addQty(updated[existingIdx].qty, itemQty, ppb) };
        } else {
          updated.push({ product_id: item.product_id, qty: itemQty, source: 'reserved_qty' as const, preBookingId });
        }
      });
      return updated;
    });
    showAlert({ type: 'success', message: 'Added all pre-booked items to the dispatch queue from the reserved pool.' });
  };

  const truckCargoQty = (truckId: string, prodId: string): BoxPieceQty => {
    const inv = data.truck_inventory.find(ti => ti.truck_id === truckId && ti.product_id === prodId);
    return inv ? { boxes: inv.quantity, pieces: inv.quantity_pieces } : { boxes: 0, pieces: 0 };
  };

  const updateSwapItem = (index: number, field: 'product_id' | 'qty', value: any) => {
    const updated = [...swapItems];
    if (field === 'product_id') {
      const ppb = data.products.find(p => p.id === value)?.pieces_per_box ?? 1;
      const available = truckCargoQty(swapFromTruckId, value);
      const currentQty = updated[index].qty;
      const fallback = { boxes: 1, pieces: 0 };
      const nextQty = !isPositiveQty(available) ? { boxes: 0, pieces: 0 }
        : compareQty(currentQty, available, ppb) > 0 ? available
        : (isPositiveQty(currentQty) ? currentQty : fallback);
      updated[index] = { ...updated[index], product_id: value, qty: nextQty };
    } else {
      const prodId = updated[index].product_id;
      const prodName = data.products.find(p => p.id === prodId)?.name || 'This product';
      const ppb = data.products.find(p => p.id === prodId)?.pieces_per_box ?? 1;
      const maxAllowed = truckCargoQty(swapFromTruckId, prodId);
      const requested: BoxPieceQty = value;
      if (compareQty(requested, maxAllowed, ppb) > 0) {
        showAlert(`Limit exceeded! Only ${formatQty(maxAllowed)} of ${prodName} are loaded on the source truck.`);
      }
      const nextQty = compareQty(requested, maxAllowed, ppb) > 0 ? maxAllowed : requested;
      updated[index] = { ...updated[index], qty: nextQty };
    }
    setSwapItems(updated);
  };

  const addSwapItem = () => {
    const selectedIds = swapItems.map(item => item.product_id);
    const unusedCargo = data.truck_inventory.find(ti => ti.truck_id === swapFromTruckId && isPositiveQty(readQtyField(ti, 'quantity', 'quantity_pieces')) && !selectedIds.includes(ti.product_id));
    if (!unusedCargo) return;
    const ppb = data.products.find(p => p.id === unusedCargo.product_id)?.pieces_per_box ?? 1;
    const available = readQtyField(unusedCargo, 'quantity', 'quantity_pieces');
    const tenBoxes = { boxes: 10, pieces: 0 };
    const initial = compareQty(tenBoxes, available, ppb) > 0 ? available : tenBoxes;
    setSwapItems([...swapItems, { product_id: unusedCargo.product_id, qty: initial }]);
  };

  const removeSwapItem = (index: number) => {
    if (swapItems.length <= 1) return;
    setSwapItems(swapItems.filter((_, i) => i !== index));
  };

  const handleEditWarehouseProduct = (productId: string) => {
    const inv = data.warehouse_inventory.find(i => i.product_id === productId);
    setCorrectionForm({
      product_id: productId,
      available_qty: { boxes: inv?.available_qty ?? 0, pieces: inv?.available_pieces ?? 0 },
      reserved_qty: { boxes: inv?.reserved_qty ?? 0, pieces: inv?.reserved_pieces ?? 0 },
      damaged_qty: { boxes: inv?.damaged_qty ?? 0, pieces: inv?.damaged_pieces ?? 0 },
      expired_qty: { boxes: inv?.expired_qty ?? 0, pieces: inv?.expired_pieces ?? 0 },
      comment: '',
    });
    setShowCorrectionModal(true);
  };

  const handleApplyCorrection = async () => {
    try {
      await warehouseApi.correct({
        product_id: correctionForm.product_id,
        available_qty: correctionForm.available_qty,
        reserved_qty: correctionForm.reserved_qty,
        damaged_qty: correctionForm.damaged_qty,
        expired_qty: correctionForm.expired_qty,
        comment: correctionForm.comment,
      });
      await refreshData();
      showAlert('Warehouse stock corrected and audit logs recorded.');
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to correct stock.');
    } finally {
      setShowCorrectionModal(false);
    }
  };

  const handleLoadStock = async () => {
    if (dispatchItems.length === 0) {
      showAlert('Please add at least one item to dispatch.');
      return;
    }
    for (const item of dispatchItems) {
      if (!isPositiveQty(item.qty)) {
        showAlert('All dispatch quantities must be greater than zero.');
        return;
      }
    }

    const truckNum = data.trucks.find(t => t.id === dispatchTruckId)?.vehicle_number || 'Truck';
    try {
      await dispatchApi.load({
        truck_id: dispatchTruckId,
        items: dispatchItems.map(item => ({ product_id: item.product_id, qty: item.qty, source: item.source, pre_booking_id: item.preBookingId })),
      });
      await refreshData();
      addNotification('delivery', `Truck Batch Loaded: Loaded ${dispatchItems.length} product(s) onto vehicle ${truckNum}`);
      showAlert('Stock batch loaded successfully to truck inventory.');
      setDispatchItems([]);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to load stock onto truck.');
    }
  };

  const handleReturnStock = async (truckId: string, productId: string, qty: BoxPieceQty) => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'Warehouse') {
      showAlert('Unauthorized: Only Admin or Warehouse operators can return stock to the warehouse.');
      return;
    }
    if (!isPositiveQty(qty)) {
      showAlert('Please enter a valid return quantity.');
      return;
    }

    try {
      const prodName = data.products.find(p => p.id === productId)?.name || 'Product';
      const truckNum = data.trucks.find(t => t.id === truckId)?.vehicle_number || 'Truck';
      await dispatchApi.returnStock(truckId, productId, qty);
      await refreshData();
      addNotification('delivery', `Stock returned: recalled ${formatQty(qty)} of ${prodName} from ${truckNum}`);
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
      const returnedBoxes = truckCargo.reduce((sum, c) => sum + Number(c.quantity), 0);
      const returnedPieces = truckCargo.reduce((sum, c) => sum + Number(c.quantity_pieces), 0);
      const returnedLabel = formatQty({ boxes: returnedBoxes, pieces: returnedPieces });
      const truckNum = data.trucks.find(t => t.id === truckId)?.vehicle_number || 'Truck';
      await dispatchApi.returnAll(truckId);
      await refreshData();
      addNotification('delivery', `Stock returned: recalled ALL (${returnedLabel}) products from Truck ${truckNum}`);
      showAlert(`Successfully returned all ${returnedLabel} back to the warehouse.`);
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
      if (!isPositiveQty(item.qty)) {
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
        items: swapItems.map(item => ({ product_id: item.product_id, qty: item.qty })),
      });
      await refreshData();
      addNotification('delivery', `Inter-truck stock batch transfer: Moved ${swapItems.length} product(s) from ${sourceNum} to ${destNum}`);
      showAlert('Inter-truck batch transfer successful!');
      setSwapItems([{ product_id: data.products[0]?.id || '', qty: { boxes: 10, pieces: 0 } }]);
    } catch (e: any) {
      showAlert(e.message ?? 'Unable to transfer stock between trucks.');
    }
  };

  const productOptions = data.products.filter(p => p.status === 'Active').map(p => ({ label: p.name, value: p.id }));
  // Deleted (Inactive) products are hidden from the warehouse stock list -
  // their inventory row still exists for historical/audit purposes, but a
  // removed catalog item shouldn't clutter the active silo view.
  // Derived from the product catalog (not from warehouse_inventory) so every
  // active product always appears here, even one that doesn't have a
  // warehouse_inventory row yet (e.g. imported directly into the database) -
  // otherwise it would silently vanish from this list while still showing up
  // in the Ice Cream Catalog, making the two screens disagree on what exists.
  const activeWarehouseInventory: WarehouseInventory[] = data.products
    .filter(p => p.status === 'Active')
    .map(p => data.warehouse_inventory.find(inv => inv.product_id === p.id) ?? { product_id: p.id, available_qty: 0, available_pieces: 0, reserved_qty: 0, reserved_pieces: 0, damaged_qty: 0, damaged_pieces: 0, expired_qty: 0, expired_pieces: 0 });
  const oosFlavorCount = activeWarehouseInventory.filter(i => i.available_qty === 0).length;
  const lowFlavorCount = activeWarehouseInventory.filter(i => i.available_qty > 0 && i.available_qty <= 100).length;
  // Client-side filter over the already-loaded product list (no network
  // round-trip) - matches on product name or SKU code, same as the Purchase
  // Order product search elsewhere on this screen. Out-of-stock/low-stock
  // badges above intentionally keep counting the FULL list regardless of
  // this search, since they're a warehouse-wide health signal, not scoped
  // to whatever's currently being searched for.
  // Debounced so typing/backspacing doesn't re-filter and re-render the
  // whole warehouse stock list on every keystroke - see useDebouncedValue.
  const debouncedWarehouseSearch = useDebouncedValue(warehouseSearch, 150);
  const filteredWarehouseInventory = useMemo(() => activeWarehouseInventory.filter(inv => {
    const q = debouncedWarehouseSearch.trim().toLowerCase();
    if (!q) return true;
    const product = data.products.find(p => p.id === inv.product_id);
    return !!product && (product.name.toLowerCase().includes(q) || product.code.toLowerCase().includes(q));
  }), [activeWarehouseInventory, data.products, debouncedWarehouseSearch]);
  const warehouseSearchSuggestions = useMemo(() => data.products.filter(p => p.status === 'Active').map(p => p.name), [data.products]);
  const truckOptions = data.trucks.filter(t => t.status === 'Active').map(t => ({ label: `${t.vehicle_number} (${t.area})`, value: t.id }));
  const supplierOptions = data.suppliers.filter(s => s.status === 'Active').map(s => ({ label: s.name, value: s.id }));
  const pendingPurchaseOrders = data.purchaseOrderRequests.filter(r => r.status === 'Pending');
  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800";
  const retailEnabled = isRetailPricingEnabled(currentUser, data.rolePermissions, data.userPermissions);

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
              <SelectField value={purchaseForm.supplier_id} onValueChange={v => setPurchaseForm({ ...purchaseForm, supplier_id: v })} options={supplierOptions} title="Select Supplier" searchable className={inputClass + ' flex-row items-center justify-between'} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-slate-500 mb-1 text-xs">Supplier Invoice #</Text>
              <TextInput value={purchaseForm.invoice_number} onChangeText={v => setPurchaseForm({ ...purchaseForm, invoice_number: v })} className={inputClass} />
            </View>
          </View>

          <View className="border border-slate-100 rounded-xl p-2.5 bg-slate-50 gap-2">
            <View className="flex-row items-center justify-between flex-wrap gap-2 px-0.5">
              <Text className="font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                Cargo Manifest ({purchaseForm.items.length} item{purchaseForm.items.length === 1 ? '' : 's'})
              </Text>
              <View className="flex-row items-center gap-2">
                <ViewToggle />
                <Pressable onPress={handleAddPurchaseItem} className="flex-row items-center gap-1">
                  <Plus size={12} color="#e11d48" />
                  <Text className="text-rose-500 font-extrabold text-[10px]">Add Product</Text>
                </Pressable>
              </View>
            </View>

            {viewMode === 'table' ? (
              <DataTable
                data={purchaseForm.items}
                keyExtractor={(_, index) => String(index)}
                emptyText="No items in this manifest yet."
                columns={[
                  {
                    key: 'item', label: 'Ice Cream Item', width: 190,
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return productOptions.length === 0 ? (
                        <Text className="text-amber-700 text-[9px] font-bold">No products in the catalog yet.</Text>
                      ) : (
                        <SelectField
                          value={item.product_id}
                          onValueChange={v => {
                            const prod = data.products.find(p => p.id === v);
                            updatePurchaseItem(index, {
                              product_id: v,
                              mrp: prod?.mrp || 0,
                              purchase_discount_pct: prod?.purchase_discount_pct || 0,
                              wholesale_discount_pct: prod?.wholesale_discount_pct || 0,
                              retail_discount_pct: prod?.retail_discount_pct || 0,
                            });
                          }}
                          options={productOptions}
                          title="Select Product"
                          searchable
                          className="bg-white border border-slate-200 rounded p-1.5 flex-row items-center justify-between"
                        />
                      );
                    },
                  },
                  {
                    key: 'qty', label: 'Qty', width: 130, align: 'center',
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      const piecesPerBox = data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1;
                      return (
                        <BoxPieceInput
                          value={{ boxes: item.quantity, pieces: item.quantity_pieces }}
                          onChange={q => updatePurchaseItem(index, { quantity: q.boxes, quantity_pieces: q.pieces })}
                          piecesPerBox={piecesPerBox}
                          compact
                        />
                      );
                    },
                  },
                  {
                    key: 'mfg', label: 'Mfg Date', width: 120,
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <DateField value={item.mfg_date || ''} onValueChange={v => updatePurchaseItem(index, { mfg_date: v })} title="Select Manufacturing Date" className="w-full bg-white border border-slate-200 rounded p-1.5 flex-row items-center justify-between" textClassName="text-[10px] text-slate-800 flex-1" />;
                    },
                  },
                  {
                    key: 'expiry', label: 'Expiry Date', width: 120,
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <DateField value={item.expiry_date || ''} onValueChange={v => updatePurchaseItem(index, { expiry_date: v })} title="Select Expiry Date" className="w-full bg-white border border-slate-200 rounded p-1.5 flex-row items-center justify-between" textClassName="text-[10px] text-slate-800 flex-1" />;
                    },
                  },
                  {
                    key: 'mrp', label: 'Pc MRP', width: 80, align: 'center',
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <TextInput keyboardType="decimal-pad" value={item.mrp === 0 ? '' : String(item.mrp)} onChangeText={v => updatePurchaseItem(index, { mrp: Number(v) || 0 })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs text-center" />;
                    },
                  },
                  {
                    key: 'box_mrp', label: 'Box MRP', width: 80, align: 'center',
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <TextInput keyboardType="decimal-pad" value={item.box_mrp === 0 ? '' : String(item.box_mrp)} onChangeText={v => updatePurchaseItemBoxMrp(index, Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs text-center" />;
                    },
                  },
                  {
                    key: 'purchase_pct', label: 'Purch %', width: 80, align: 'center',
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <TextInput keyboardType="decimal-pad" value={item.purchase_discount_pct === 0 ? '' : String(item.purchase_discount_pct)} onChangeText={v => updatePurchaseItem(index, { purchase_discount_pct: parseDiscountPct(v) })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs text-center" />;
                    },
                  },
                  {
                    key: 'purchase_price', label: 'Purch Price', width: 95, align: 'center',
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <TextInput keyboardType="decimal-pad" value={item.purchase_price === 0 ? '' : String(item.purchase_price)} onChangeText={v => updatePurchaseItemPrice(index, 'purchase', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 font-extrabold text-slate-700 text-xs text-center" />;
                    },
                  },
                  {
                    key: 'wholesale_pct', label: 'Whsl %', width: 80, align: 'center',
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <TextInput keyboardType="decimal-pad" value={item.wholesale_discount_pct === 0 ? '' : String(item.wholesale_discount_pct)} onChangeText={v => updatePurchaseItem(index, { wholesale_discount_pct: parseDiscountPct(v) })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs text-center" />;
                    },
                  },
                  {
                    key: 'wholesale_price', label: 'Whsl Price', width: 95, align: 'center',
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return <TextInput keyboardType="decimal-pad" value={item.wholesale_price === 0 ? '' : String(item.wholesale_price)} onChangeText={v => updatePurchaseItemPrice(index, 'wholesale', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 font-extrabold text-emerald-600 text-xs text-center" />;
                    },
                  },
                  ...(retailEnabled ? [
                    {
                      key: 'retail_pct', label: 'Sell %', width: 80, align: 'center' as const,
                      render: (item: PurchaseFormItem) => {
                        const index = purchaseForm.items.indexOf(item);
                        return <TextInput keyboardType="decimal-pad" value={item.retail_discount_pct === 0 ? '' : String(item.retail_discount_pct)} onChangeText={v => updatePurchaseItem(index, { retail_discount_pct: parseDiscountPct(v) })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs text-center" />;
                      },
                    },
                    {
                      key: 'retail_price', label: 'Sell Price', width: 95, align: 'center' as const,
                      render: (item: PurchaseFormItem) => {
                        const index = purchaseForm.items.indexOf(item);
                        return <TextInput keyboardType="decimal-pad" value={item.retail_price === 0 ? '' : String(item.retail_price)} onChangeText={v => updatePurchaseItemPrice(index, 'retail', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1.5 font-extrabold text-rose-500 text-xs text-center" />;
                      },
                    },
                  ] : []),
                  {
                    key: 'actions', label: '', width: 50, align: 'center', grow: false,
                    render: item => {
                      const index = purchaseForm.items.indexOf(item);
                      return purchaseForm.items.length > 1 ? (
                        <Pressable onPress={() => handleRemovePurchaseItem(index)} hitSlop={8} className="self-center p-1.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                          <Trash2 size={13} color="#e11d48" />
                        </Pressable>
                      ) : null;
                    },
                  },
                ] as DataTableColumn<PurchaseFormItem>[]}
              />
            ) : (
              // Grid view: cards wrap into columns (2-up on tablet, 3-up on
              // desktop) instead of stretching one-per-row - a single full-width
              // card of this form only needs a few hundred px of content, so
              // stretching it across an entire desktop viewport was what left
              // all the dead space the compact grid fixes.
              <View className="flex-row flex-wrap gap-2">
                {purchaseForm.items.map((item, index) => {
                  const updateItem = (patch: Partial<PurchaseFormItem>) => updatePurchaseItem(index, patch);
                  const updateItemPrice = (field: 'purchase' | 'wholesale' | 'retail', price: number) => updatePurchaseItemPrice(index, field, price);
                  return (
                  <View key={index} className="w-full md:w-[48%] xl:w-[32%] bg-white border border-slate-200 p-2 rounded-xl gap-1.5">
                    <View className="flex-row items-end gap-1.5">
                      <View className="flex-1 min-w-0">
                        <Text className="font-bold text-slate-400 text-[9px] mb-1">Ice Cream Item</Text>
                        {productOptions.length === 0 ? (
                          <View className="bg-amber-50 border border-amber-200 rounded p-1.5 gap-1">
                            <Text className="text-amber-700 text-[10px] font-bold text-center">No products in the catalog yet.</Text>
                            {!hideAdminControls ? (
                              <Pressable onPress={() => setActiveScreen?.('Products')} className="flex-row items-center gap-1 justify-center">
                                <Plus size={11} color="#b45309" />
                                <Text className="text-amber-700 text-[10px] font-extrabold underline">Add Product to Catalog</Text>
                              </Pressable>
                            ) : (
                              <Text className="text-amber-600 text-[10px]">Ask an Admin to add a product first.</Text>
                            )}
                          </View>
                        ) : (
                          <SelectField
                            value={item.product_id}
                            onValueChange={v => {
                              const prod = data.products.find(p => p.id === v);
                              updateItem({
                                product_id: v,
                                mrp: prod?.mrp || 0,
                                purchase_discount_pct: prod?.purchase_discount_pct || 0,
                                wholesale_discount_pct: prod?.wholesale_discount_pct || 0,
                                retail_discount_pct: prod?.retail_discount_pct || 0,
                              });
                            }}
                            options={productOptions}
                            title="Select Product"
                            searchable
                            className="bg-slate-50 border border-slate-200 rounded p-1.5 flex-row items-center justify-between"
                          />
                        )}
                      </View>
                      {purchaseForm.items.length > 1 && (
                        <Pressable onPress={() => handleRemovePurchaseItem(index)} hitSlop={8} className="p-1.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                          <Trash2 size={13} color="#e11d48" />
                        </Pressable>
                      )}
                    </View>

                    <View className="flex-row gap-1.5">
                      <View>
                        <Text className="font-bold text-slate-400 text-[9px] mb-1">Qty</Text>
                        <BoxPieceInput
                          value={{ boxes: item.quantity, pieces: item.quantity_pieces }}
                          onChange={q => updateItem({ quantity: q.boxes, quantity_pieces: q.pieces })}
                          piecesPerBox={data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1}
                        />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="font-bold text-slate-400 text-[9px] mb-1">Mfg Date</Text>
                        <DateField value={item.mfg_date || ''} onValueChange={v => updateItem({ mfg_date: v })} title="Select Manufacturing Date" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 flex-row items-center justify-between" textClassName="text-[11px] text-slate-800 flex-1" />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="font-bold text-slate-400 text-[9px] mb-1">Expiry Date</Text>
                        <DateField value={item.expiry_date || ''} onValueChange={v => updateItem({ expiry_date: v })} title="Select Expiry Date" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 flex-row items-center justify-between" textClassName="text-[11px] text-slate-800 flex-1" />
                      </View>
                    </View>

                    {/* Percentage-based pricing editor for this line item - editing
                        MRP/% here updates the product's catalog pricing everywhere
                        else in the app once the receipt is confirmed, not just this
                        one purchase record. */}
                    {!!item.product_id && (
                      <View className="border-t border-slate-100 pt-1.5 gap-1.5">
                        <Text className="font-bold text-slate-400 text-[9px] uppercase">Pricing for this product</Text>
                        <View className="flex-row flex-wrap gap-1.5">
                          <View className="w-[48%]">
                            <Text className="font-bold text-slate-400 text-[9px] mb-1">Piece MRP (Rs)</Text>
                            <TextInput keyboardType="decimal-pad" value={item.mrp === 0 ? '' : String(item.mrp)} onChangeText={v => updateItem({ mrp: Number(v) || 0 })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center" />
                          </View>
                          <View className="w-[48%]">
                            <Text className="font-bold text-slate-400 text-[9px] mb-1">Box MRP (Rs)</Text>
                            <TextInput keyboardType="decimal-pad" value={item.box_mrp === 0 ? '' : String(item.box_mrp)} onChangeText={v => updatePurchaseItemBoxMrp(index, Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center" />
                          </View>
                          <View className="w-[48%]">
                            <Text className="font-bold text-slate-400 text-[9px] mb-1">Purchase %</Text>
                            <TextInput keyboardType="decimal-pad" value={item.purchase_discount_pct === 0 ? '' : String(item.purchase_discount_pct)} onChangeText={v => updateItem({ purchase_discount_pct: parseDiscountPct(v) })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center" />
                          </View>
                          <View className="w-[48%]">
                            <Text className="font-bold text-slate-400 text-[9px] mb-1">Wholesale %</Text>
                            <TextInput keyboardType="decimal-pad" value={item.wholesale_discount_pct === 0 ? '' : String(item.wholesale_discount_pct)} onChangeText={v => updateItem({ wholesale_discount_pct: parseDiscountPct(v) })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center" />
                          </View>
                          {retailEnabled && (
                            <View className="w-[48%]">
                              <Text className="font-bold text-slate-400 text-[9px] mb-1">Selling %</Text>
                              <TextInput keyboardType="decimal-pad" value={item.retail_discount_pct === 0 ? '' : String(item.retail_discount_pct)} onChangeText={v => updateItem({ retail_discount_pct: parseDiscountPct(v) })} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-center" />
                            </View>
                          )}
                        </View>
                        <View className="flex-row flex-wrap gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1.5">
                          <View className="flex-1 min-w-[72px]">
                            <Text className="text-slate-400 text-[8px] font-bold uppercase">Purchase</Text>
                            <TextInput keyboardType="decimal-pad" value={item.purchase_price === 0 ? '' : String(item.purchase_price)} onChangeText={v => updateItemPrice('purchase', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1 font-extrabold text-slate-700 text-xs" />
                          </View>
                          <View className="flex-1 min-w-[72px]">
                            <Text className="text-slate-400 text-[8px] font-bold uppercase">Wholesale</Text>
                            <TextInput keyboardType="decimal-pad" value={item.wholesale_price === 0 ? '' : String(item.wholesale_price)} onChangeText={v => updateItemPrice('wholesale', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1 font-extrabold text-emerald-600 text-xs" />
                          </View>
                          {retailEnabled && (
                            <View className="flex-1 min-w-[72px]">
                              <Text className="text-slate-400 text-[8px] font-bold uppercase">Selling</Text>
                              <TextInput keyboardType="decimal-pad" value={item.retail_price === 0 ? '' : String(item.retail_price)} onChangeText={v => updateItemPrice('retail', Number(v) || 0)} placeholder="0" placeholderTextColor="#94a3b8" className="w-full bg-white border border-slate-200 rounded p-1 font-extrabold text-rose-500 text-xs" />
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                  );
                })}
              </View>
            )}
          </View>

          <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 gap-2">
            <Text className="font-bold text-slate-500 text-[10px] uppercase">Supplier Bill (optional)</Text>
            {billFile ? (
              <View className="flex-row items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg p-2">
                <View className="flex-1 min-w-0 flex-row items-center gap-1.5">
                  <Paperclip size={12} color="#059669" />
                  <Text className="flex-1 text-slate-700 text-[11px] font-bold" numberOfLines={1}>{billFile.name}</Text>
                </View>
                <Pressable onPress={() => setBillFile(null)} hitSlop={8} className="p-1 bg-rose-50 border border-rose-100 rounded active:bg-rose-100">
                  <X size={12} color="#e11d48" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={handleAttachBillFile} className="flex-row items-center justify-center gap-1.5 py-2 bg-white border border-dashed border-slate-300 rounded-lg active:bg-slate-100">
                <Paperclip size={13} color="#475569" />
                <Text className="text-slate-600 font-bold text-[11px]">Attach Supplier Bill (Photo / PDF / Excel)</Text>
              </Pressable>
            )}
          </View>

          <Pressable onPress={handleOpenConfirmReceive} className="w-full py-2.5 bg-emerald-500 rounded-xl items-center active:bg-emerald-600">
            <Text className="text-white font-bold text-xs">Confirm Stock Inward Receive</Text>
          </Pressable>
        </View>

        <ConfirmModal
          visible={showConfirmReceiveModal}
          onClose={() => setShowConfirmReceiveModal(false)}
          icon={ClipboardList}
          iconBg="bg-emerald-50"
          iconColor="#059669"
          title="Confirm Stock Inward Receipt"
          message={`Receive ${purchaseForm.items.length} item(s) from ${data.suppliers.find(s => s.id === purchaseForm.supplier_id)?.name || 'this supplier'} (Invoice #${purchaseForm.invoice_number})? Warehouse quantities will be updated immediately.`}
          confirmLabel="Yes, Receive Stock"
          confirmColor="bg-emerald-600"
          onConfirm={() => { setShowConfirmReceiveModal(false); handleSavePurchase(); }}
        />
      </View>
    );
  }

  if (visibleTabs.length === 0) {
    return (
      <View className="items-center justify-center py-20 gap-2">
        <Text className="text-slate-500 font-bold text-sm text-center">You don't currently have access to any Warehouse & Fleet screens.</Text>
        <Text className="text-slate-400 text-xs text-center">Contact your administrator.</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
        {visibleTabs.map(t => (
          <Pressable key={t} onPress={() => setActiveTab(t)} className={`py-1.5 px-3 rounded-lg items-center ${activeTab === t ? 'bg-indigo-600' : ''}`}>
            <Text className={`text-[10px] font-extrabold capitalize ${activeTab === t ? 'text-white' : 'text-slate-500'}`}>
              {t === 'transfers' ? 'Load & Transfer' : t === 'audits' ? 'Movement Logs' : t === 'assets' ? 'Assets & Freezer Boxes' : t}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'warehouse' ? (
        <View className="gap-3">
          <View className="gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200 sm:flex-row sm:items-center sm:justify-between">
            <Text className="text-[10px] font-bold text-slate-600 sm:flex-1 sm:mr-2">{hideAdminControls ? 'Log new cold supply chain deliveries:' : 'Manage cold supply chain partners:'}</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {!hideAdminControls && (
                <Pressable onPress={() => setActiveScreen?.('Suppliers')} className="py-1 px-2.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                  <Text className="text-rose-600 text-[9px] font-extrabold">Manage Partners</Text>
                </Pressable>
              )}
              <Pressable onPress={handleOpenPurchaseOrderExport} className="py-1 px-2.5 bg-emerald-50 border border-emerald-100 rounded-lg active:bg-emerald-100 flex-row items-center gap-1">
                <FileSpreadsheet size={11} color="#059669" />
                <Text className="text-emerald-600 text-[9px] font-extrabold">Purchase Order (Excel)</Text>
              </Pressable>
              {pendingPurchaseOrders.length > 0 && (
                <Pressable onPress={() => { setConfirmDeletePOId(null); setShowPendingPOList(true); }} className="py-1 px-2.5 bg-amber-50 border border-amber-100 rounded-lg active:bg-amber-100 flex-row items-center gap-1">
                  <ClipboardList size={11} color="#b45309" />
                  <Text className="text-amber-700 text-[9px] font-extrabold">Pending Orders ({pendingPurchaseOrders.length})</Text>
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

          <View className="bg-white rounded-2xl border border-slate-200 p-2.5">
            <View className="flex-row items-center justify-between flex-wrap gap-1.5 mb-1.5 px-0.5">
              <Text className="font-bold text-slate-800 text-xs">Warehouse Silos Stock Levels</Text>
              <View className="flex-row items-center gap-1.5">
                {oosFlavorCount > 0 && (
                  <View className="flex-row items-center gap-1 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                    <AlertTriangle size={10} color="#ef4444" />
                    <Text className="text-[9px] font-extrabold text-red-600">{oosFlavorCount} Out of Stock</Text>
                  </View>
                )}
                {lowFlavorCount > 0 && (
                  <View className="flex-row items-center gap-1 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                    <Shield size={10} color="#f59e0b" />
                    <Text className="text-[9px] font-extrabold text-amber-600">{lowFlavorCount} Low</Text>
                  </View>
                )}
                <Text className="text-[10px] text-slate-400">Total: {filteredWarehouseInventory.length}</Text>
              </View>
            </View>

            <View className="flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 mb-1.5 z-20">
              <Search size={14} color="#94a3b8" />
              <AutocompleteInput
                value={warehouseSearch}
                onChangeText={setWarehouseSearch}
                suggestions={warehouseSearchSuggestions}
                placeholder="Search product name or SKU code..."
                placeholderTextColor="#94a3b8"
                containerClassName="flex-1"
                className="text-xs text-slate-800 py-2.5"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>

            <View className="mb-1.5">
              <ViewToggle />
            </View>

            {viewMode === 'table' ? (
              <DataTable
                data={filteredWarehouseInventory}
                keyExtractor={inv => inv.product_id}
                emptyText={warehouseSearch.trim() ? 'No products match your search.' : 'No warehouse stock records found.'}
                columns={[
                  {
                    key: 'product', label: 'Product', width: 160,
                    render: inv => <Text numberOfLines={1} className="font-bold text-slate-800 text-[11px]">{data.products.find(p => p.id === inv.product_id)?.name || 'Unknown'}</Text>,
                  },
                  {
                    key: 'available', label: 'Avail', width: 80, align: 'center',
                    render: inv => {
                      const isOOS = inv.available_qty === 0;
                      const isLow = inv.available_qty > 0 && inv.available_qty <= 100;
                      return <Text className={`text-center text-[11px] font-black ${isOOS ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-800'}`}>{formatQtyShort({ boxes: inv.available_qty, pieces: inv.available_pieces })}</Text>;
                    },
                  },
                  { key: 'reserved', label: 'Reserved', width: 80, align: 'center', render: inv => <Text className="text-center text-slate-600 text-[11px] font-black">{formatQtyShort({ boxes: inv.reserved_qty, pieces: inv.reserved_pieces })}</Text> },
                  { key: 'damaged', label: 'Damaged', width: 80, align: 'center', render: inv => <Text className="text-center text-red-500 text-[11px] font-black">{formatQtyShort({ boxes: inv.damaged_qty, pieces: inv.damaged_pieces })}</Text> },
                  { key: 'expired', label: 'Expired', width: 80, align: 'center', render: inv => <Text className="text-center text-purple-500 text-[11px] font-black">{formatQtyShort({ boxes: inv.expired_qty, pieces: inv.expired_pieces })}</Text> },
                  {
                    key: 'status', label: 'Status', width: 70, align: 'center', grow: false,
                    render: inv => {
                      const isOOS = inv.available_qty === 0;
                      const isLow = inv.available_qty > 0 && inv.available_qty <= 100;
                      return (
                        <View className="items-center">
                          {isOOS && <Text className="text-[8px] bg-red-100 text-red-700 px-1 rounded font-extrabold uppercase">OOS</Text>}
                          {isLow && <Text className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded font-extrabold uppercase">Low</Text>}
                          {!isOOS && !isLow && <Text className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded font-extrabold uppercase">OK</Text>}
                        </View>
                      );
                    },
                  },
                  {
                    key: 'actions', label: '', width: 50, align: 'center', grow: false,
                    render: inv => (
                      <Pressable onPress={() => handleEditWarehouseProduct(inv.product_id)} className="self-center p-1.5 bg-blue-50 border border-blue-100 rounded-lg active:bg-blue-100">
                        <Edit size={13} color="#2563eb" />
                      </Pressable>
                    ),
                  },
                ] as DataTableColumn<typeof activeWarehouseInventory[number]>[]}
              />
            ) : (
              <View className={`gap-3 md:flex-row md:flex-wrap ${filteredWarehouseInventory.length === 0 ? 'flex-1' : ''}`}>
                {filteredWarehouseInventory.length === 0 ? (
                  <EmptyState message={warehouseSearch.trim() ? 'No products match your search.' : 'No warehouse stock records found.'} />
                ) : (
                  filteredWarehouseInventory.map(inv => {
                    const product = data.products.find(p => p.id === inv.product_id);
                    const isOOS = inv.available_qty === 0;
                    const isLow = inv.available_qty > 0 && inv.available_qty <= 100;
                    return (
                      <View key={inv.product_id} className={`w-full md:w-[48%] xl:w-[32%] bg-white rounded-2xl p-3 border ${isOOS ? 'border-red-200' : isLow ? 'border-amber-200' : 'border-slate-200'} flex-row items-start gap-3`}>
                        <ProductImage uri={product?.image_url} className="w-14 h-14 rounded-xl bg-slate-50 flex-shrink-0" iconSize={22} />
                        <View className="flex-1 gap-1.5 min-w-0">
                          <View className="flex-row items-center justify-between gap-2">
                            <Text numberOfLines={1} className="font-bold text-slate-800 text-xs flex-1 min-w-0">{product?.name || 'Unknown'}</Text>
                            <Pressable onPress={() => handleEditWarehouseProduct(inv.product_id)} className="p-1 bg-blue-50 border border-blue-100 rounded-lg active:bg-blue-100 flex-shrink-0">
                              <Edit size={12} color="#2563eb" />
                            </Pressable>
                          </View>

                          {isOOS ? (
                            <Text className="self-start text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-extrabold uppercase">Out of Stock</Text>
                          ) : isLow ? (
                            <Text className="self-start text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-extrabold uppercase">Low Stock</Text>
                          ) : (
                            <Text className="self-start text-[8px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md font-extrabold uppercase">In Stock</Text>
                          )}

                          <View className="flex-row justify-between pt-1.5 border-t border-slate-50">
                            <View className="flex-1 items-start">
                              <Text className="text-slate-400 text-[8px] font-bold uppercase">Avail</Text>
                              <Text className={`font-black text-[12px] ${isOOS ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-800'}`}>{formatQtyShort({ boxes: inv.available_qty, pieces: inv.available_pieces })}</Text>
                            </View>
                            <View className="flex-1 items-center">
                              <Text className="text-slate-400 text-[8px] font-bold uppercase">Reserved</Text>
                              <Text className="font-black text-[12px] text-slate-600">{formatQtyShort({ boxes: inv.reserved_qty, pieces: inv.reserved_pieces })}</Text>
                            </View>
                            <View className="flex-1 items-center">
                              <Text className="text-slate-400 text-[8px] font-bold uppercase">Damaged</Text>
                              <Text className="font-black text-[12px] text-red-500">{formatQtyShort({ boxes: inv.damaged_qty, pieces: inv.damaged_pieces })}</Text>
                            </View>
                            <View className="flex-1 items-end">
                              <Text className="text-slate-400 text-[8px] font-bold uppercase">Expired</Text>
                              <Text className="font-black text-[12px] text-purple-500">{formatQtyShort({ boxes: inv.expired_qty, pieces: inv.expired_pieces })}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        </View>
      ) : activeTab === 'trucks' ? (
        <View className="gap-4">
          <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
            {([
              { key: 'inventory' as const, label: 'Truck Inventory' },
              { key: 'fleet' as const, label: 'Truck Fleet Management' },
            ]).map(sub => (
              <Pressable
                key={sub.key}
                onPress={() => setTrucksSubTab(sub.key)}
                className={`flex-1 min-w-[45%] py-1.5 rounded-lg items-center ${trucksSubTab === sub.key ? 'bg-indigo-600' : ''}`}
              >
                <Text className={`text-[10px] font-extrabold ${trucksSubTab === sub.key ? 'text-white' : 'text-slate-500'}`}>
                  {sub.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {trucksSubTab === 'fleet' && (
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

                <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
                  <Pressable onPress={() => setTruckFleetTab('active')} className={`py-1.5 px-3 rounded-lg items-center justify-center ${truckFleetTab === 'active' ? 'bg-indigo-600' : ''}`}>
                    <Text className={`text-[10px] font-extrabold ${truckFleetTab === 'active' ? 'text-white' : 'text-slate-500'}`}>Fleet Roster</Text>
                  </Pressable>
                  <Pressable onPress={() => setTruckFleetTab('inactive')} className={`py-1.5 px-3 rounded-lg items-center justify-center flex-row gap-1.5 ${truckFleetTab === 'inactive' ? 'bg-indigo-600' : ''}`}>
                    <RotateCcw size={13} color={truckFleetTab === 'inactive' ? '#ffffff' : '#64748b'} />
                    <Text className={`text-[10px] font-extrabold ${truckFleetTab === 'inactive' ? 'text-white' : 'text-slate-500'}`}>Removed Trucks</Text>
                    {data.trucks.filter(t => t.status === 'Inactive').length > 0 && (
                      <View className="bg-red-500 rounded-full px-1.5 py-0.5">
                        <Text className="text-white font-extrabold text-[8px]">{data.trucks.filter(t => t.status === 'Inactive').length}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>

                <ViewToggle />

                {(() => {
                  const filteredTrucks = data.trucks.filter(t => truckFleetTab === 'inactive' ? t.status === 'Inactive' : t.status === 'Active');
                  const emptyText = truckFleetTab === 'inactive' ? 'No removed trucks. Anything you remove from the fleet will show up here for restoring.' : 'No trucks registered yet — tap "Add Truck" to register your first vehicle.';

                  if (viewMode === 'table') {
                    return (
                      <DataTable
                        data={filteredTrucks}
                        keyExtractor={t => t.id}
                        emptyText={emptyText}
                        columns={[
                          {
                            key: 'vehicle', label: 'Vehicle', width: 130,
                            render: t => (
                              <View className="flex-row items-center gap-1.5">
                                <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{t.vehicle_number}</Text>
                                {t.status === 'Inactive' && <Text className="text-[8px] font-black px-1 rounded-full bg-red-50 text-red-600">Inactive</Text>}
                              </View>
                            ),
                          },
                          { key: 'driver', label: 'Driver', width: 130, render: t => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{data.users.find(u => u.id === t.driver_user_id)?.name || 'Unassigned'}</Text> },
                          { key: 'area', label: 'Area', width: 110, render: t => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{t.area}</Text> },
                          { key: 'route', label: 'Route', width: 150, render: t => <Text className="text-[10px] text-slate-600" numberOfLines={1}>{t.route}</Text> },
                          {
                            key: 'actions', label: 'Actions', width: 90, grow: false,
                            render: t => (
                              <View className="flex-row items-center gap-1.5">
                                <Pressable onPress={() => handleOpenEditTruck(t)} className="p-1.5 bg-blue-50 border border-blue-100 rounded-lg active:bg-blue-100">
                                  <Edit size={13} color="#2563eb" />
                                </Pressable>
                                {t.status === 'Inactive' ? (
                                  <Pressable onPress={() => handleReactivateTruck(t.id)} className="p-1.5 bg-emerald-50 border border-emerald-100 rounded-lg active:bg-emerald-100">
                                    <RotateCcw size={13} color="#059669" />
                                  </Pressable>
                                ) : (
                                  <Pressable onPress={() => setDeleteTruckConfirmId(t.id)} className="p-1.5 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                                    <Trash2 size={13} color="#e11d48" />
                                  </Pressable>
                                )}
                              </View>
                            ),
                          },
                        ] as DataTableColumn<Truck>[]}
                      />
                    );
                  }

                  return (
                    <View className={`gap-2 md:flex-row md:flex-wrap ${filteredTrucks.length === 0 ? 'flex-1' : ''}`}>
                      {filteredTrucks.map(t => {
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
                      {filteredTrucks.length === 0 && (
                        <EmptyState message={emptyText} />
                      )}
                    </View>
                  );
                })()}
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
                    searchable
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
          )}

          {trucksSubTab === 'inventory' && (
          <>
          <View className="bg-white p-3 rounded-2xl border border-slate-200 gap-2">
            <Text className="font-bold text-slate-700 text-xs">Select Active Delivery Fleet Truck:</Text>
            <SelectField
              value={activeTruckId}
              onValueChange={v => { setSelectedTruckId(v); setReturnQuantities({}); }}
              options={truckOptions}
              title="Select Truck"
              searchable
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

            <View className="mb-2">
              <ViewToggle />
            </View>

            {(() => {
              const truckCargo = data.truck_inventory.filter(ti => ti.truck_id === activeTruckId && !!data.products.find(p => p.id === ti.product_id));

              const renderStepper = (ti: typeof truckCargo[number]) => {
                const prod = data.products.find(p => p.id === ti.product_id)!;
                const cargoQty: BoxPieceQty = { boxes: ti.quantity, pieces: ti.quantity_pieces };
                const currentVal = returnQuantities[ti.product_id] ?? { boxes: 1, pieces: 0 };
                return (
                  <View className="flex-row items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200">
                    <BoxPieceInput
                      value={currentVal}
                      onChange={q => {
                        if (compareQty(q, cargoQty, prod.pieces_per_box) > 0) showAlert(`Only ${formatQty(cargoQty)} of ${prod.name} are loaded on this truck.`);
                        const clamped = compareQty(q, cargoQty, prod.pieces_per_box) > 0 ? cargoQty : q;
                        setReturnQuantities(prev => ({ ...prev, [ti.product_id]: clamped }));
                      }}
                      piecesPerBox={prod.pieces_per_box}
                      compact
                    />
                    <Pressable
                      onPress={() => {
                        if (isPositiveQty(currentVal) && compareQty(currentVal, cargoQty, prod.pieces_per_box) <= 0) {
                          handleReturnStock(activeTruckId, ti.product_id, currentVal);
                          setReturnQuantities(prev => { const next = { ...prev }; delete next[ti.product_id]; return next; });
                        } else {
                          showAlert(`Please enter a quantity between 1 pc and ${formatQty(cargoQty)}`);
                        }
                      }}
                      className="py-1.5 px-2.5 bg-indigo-500 rounded-md items-center active:bg-indigo-600"
                    >
                      <Text className="text-white text-[9px] font-extrabold">Return Qty</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { handleReturnStock(activeTruckId, ti.product_id, cargoQty); setReturnQuantities(prev => { const next = { ...prev }; delete next[ti.product_id]; return next; }); }}
                      className="py-1.5 px-2 bg-slate-200 rounded-md items-center active:bg-slate-300"
                    >
                      <Text className="text-slate-600 text-[9px] font-extrabold">All</Text>
                    </Pressable>
                  </View>
                );
              };

              if (viewMode === 'table') {
                return (
                  <DataTable
                    data={truckCargo}
                    keyExtractor={ti => ti.product_id}
                    emptyText="This truck has no cargo stock loaded currently."
                    columns={[
                      {
                        key: 'product', label: 'Product', width: 160,
                        render: ti => {
                          const prod = data.products.find(p => p.id === ti.product_id)!;
                          return (
                            <View>
                              <Text className="font-bold text-slate-800 text-xs" numberOfLines={1}>{prod.name}</Text>
                              <Text className="text-[9px] text-slate-400 uppercase font-mono" numberOfLines={1}>{ti.product_id}</Text>
                            </View>
                          );
                        },
                      },
                      { key: 'qty', label: 'Qty Loaded', width: 90, align: 'center', grow: false, render: ti => <Text className="font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded text-[10px] text-center">{formatQtyShort({ boxes: ti.quantity, pieces: ti.quantity_pieces })}</Text> },
                      { key: 'return', label: 'Return Quantity', width: 260, grow: false, render: renderStepper },
                    ] as DataTableColumn<typeof truckCargo[number]>[]}
                  />
                );
              }

              return truckCargo.length === 0 ? (
                <EmptyState message="This truck has no cargo stock loaded currently." />
              ) : (
                <View className="gap-2 md:flex-row md:flex-wrap">
                  {truckCargo.map(ti => {
                    const prod = data.products.find(p => p.id === ti.product_id)!;
                    return (
                      <View key={ti.product_id} className="w-full md:w-[48%] p-2.5 rounded-xl bg-slate-50 border border-slate-100 gap-2">
                        <View className="flex-row items-center justify-between">
                          <View>
                            <Text className="font-bold text-slate-800 text-xs">{prod.name}</Text>
                            <Text className="text-[9px] text-slate-400 uppercase font-mono">{ti.product_id}</Text>
                          </View>
                          <Text className="font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded text-[10px]">{formatQty({ boxes: ti.quantity, pieces: ti.quantity_pieces })} loaded</Text>
                        </View>
                        {renderStepper(ti)}
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
          </>
          )}
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

          <View className="flex-row flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
            {([
              { key: 'load' as const, label: 'Load Cargo Stock' },
              { key: 'transfer' as const, label: 'Inter-Truck Stock Transfer' },
            ]).map(sub => (
              <Pressable
                key={sub.key}
                onPress={() => setTransfersSubTab(sub.key)}
                className={`flex-1 min-w-[45%] py-1.5 rounded-lg items-center ${transfersSubTab === sub.key ? 'bg-indigo-600' : ''}`}
              >
                <Text className={`text-[10px] font-extrabold ${transfersSubTab === sub.key ? 'text-white' : 'text-slate-500'}`}>
                  {sub.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {transfersSubTab === 'load' && (
          <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
            <View className="border-b border-slate-100 pb-2">
              <Text className="font-bold text-slate-800 text-xs">Load Cargo Stock: Warehouse to Truck</Text>
              <Text className="text-[10px] text-slate-400 font-medium">Select a vehicle and add multiple products to load them simultaneously.</Text>
            </View>

            <View>
              <Text className="font-extrabold text-slate-500 mb-1 text-xs">Target Dispatch Truck</Text>
              <SelectField value={dispatchTruckId} onValueChange={setDispatchTruckId} options={truckOptions} title="Select Truck" searchable className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
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
              const totalUnits = formatQty({
                boxes: pendingPreBookings.reduce((sum, pb) => sum + pb.items.reduce((s, i) => s + i.quantity, 0), 0),
                pieces: pendingPreBookings.reduce((sum, pb) => sum + pb.items.reduce((s, i) => s + i.quantity_pieces, 0), 0),
              });
              return (
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 gap-2">
                  <Pressable onPress={() => setShowDispatchPreBookings(!showDispatchPreBookings)} className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2 flex-1">
                      <ClipboardList size={16} color="#b45309" />
                      <Text className="text-[11px] font-bold text-amber-800 flex-1">
                        {pendingPreBookings.length} pre-booked order(s) ({totalUnits}) still reserved and waiting to be loaded onto a truck - don't forget to dispatch this cargo!
                      </Text>
                    </View>
                    <Text className="text-[10px] font-bold text-amber-700 underline">{showDispatchPreBookings ? 'Hide' : 'Invoice Draft & Preview'}</Text>
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
                                  <Text className="text-[10px] text-slate-600 flex-1">{product?.name || item.product_id} x {formatQty({ boxes: item.quantity, pieces: item.quantity_pieces })}</Text>
                                  <Pressable
                                    onPress={() => !alreadyAdded && handleAddPreBookingItemToDispatch(item.product_id, { boxes: item.quantity, pieces: item.quantity_pieces }, pb.id)}
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
              <View className="flex-row items-center justify-between flex-wrap gap-2">
                <Text className="font-extrabold text-slate-500 text-xs">Products to Dispatch</Text>
                {dispatchItems.length > 0 && <ViewToggle />}
              </View>
              {dispatchItems.length === 0 ? (
                <View className="py-6 items-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <Text className="text-slate-400 text-[11px] font-semibold">No products added yet.</Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">Tap "+ Add Another Product" below, or add pre-booked items from the reminder above.</Text>
                </View>
              ) : viewMode === 'table' ? (
                <DataTable
                  data={dispatchItems}
                  keyExtractor={(_, i) => String(i)}
                  columns={[
                    {
                      key: 'product', label: 'Product', width: 220,
                      render: item => {
                        const index = dispatchItems.indexOf(item);
                        const isEmpty = !isPositiveQty(warehousePoolQty(item.product_id, item.source));
                        return (
                          <SelectField
                            value={item.product_id}
                            onValueChange={v => updateDispatchItem(index, 'product_id', v)}
                            options={data.products.filter(p => p.status === 'Active' || p.id === item.product_id).map(p => {
                              const pQty = warehousePoolQty(p.id, item.source);
                              return { label: `${p.name} (${!isPositiveQty(pQty) ? 'Out of stock' : formatQty(pQty) + ' in pool'})`, value: p.id };
                            })}
                            title="Select Product"
                            searchable
                            className={`bg-white border rounded-lg p-1.5 flex-row items-center justify-between ${isEmpty ? 'border-rose-300' : 'border-slate-200'}`}
                          />
                        );
                      },
                    },
                    {
                      key: 'pool', label: 'Pool', width: 170,
                      render: item => {
                        const index = dispatchItems.indexOf(item);
                        return (
                          <SelectField
                            value={item.source}
                            onValueChange={v => updateDispatchItem(index, 'source', v)}
                            options={[
                              { label: `Available (${formatQty(warehousePoolQty(item.product_id, 'available_qty'))})`, value: 'available_qty' },
                              { label: `Reserved (${formatQty(warehousePoolQty(item.product_id, 'reserved_qty'))})`, value: 'reserved_qty' },
                            ]}
                            title="Select Pool"
                            className="bg-white border border-slate-200 rounded-lg p-1.5 flex-row items-center justify-between"
                          />
                        );
                      },
                    },
                    {
                      key: 'qty', label: 'Qty', width: 140,
                      render: item => {
                        const index = dispatchItems.indexOf(item);
                        const isEmpty = !isPositiveQty(warehousePoolQty(item.product_id, item.source));
                        return (
                          <BoxPieceInput
                            value={item.qty}
                            onChange={q => updateDispatchItem(index, 'qty', q)}
                            piecesPerBox={data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1}
                            compact
                          />
                        );
                      },
                    },
                    {
                      key: 'status', label: 'Pool Status', width: 160, grow: false,
                      render: item => {
                        const maxAllowedStock = warehousePoolQty(item.product_id, item.source);
                        const isEmpty = !isPositiveQty(maxAllowedStock);
                        return isEmpty ? (
                          <View className="flex-row items-center gap-1">
                            <AlertTriangle size={12} color="#e11d48" />
                            <Text className="text-[9px] text-rose-600 font-extrabold">Pool empty!</Text>
                          </View>
                        ) : (
                          <Text className="text-[10px] text-slate-500 font-bold">Avail: <Text className="text-slate-700">{formatQty(maxAllowedStock)}</Text></Text>
                        );
                      },
                    },
                    {
                      key: 'actions', label: '', width: 50, align: 'center', grow: false,
                      render: item => {
                        const index = dispatchItems.indexOf(item);
                        return (
                          <Pressable onPress={() => removeDispatchItem(index)} className="self-center p-1.5 active:bg-rose-50 rounded-lg">
                            <Trash2 size={15} color="#f43f5e" />
                          </Pressable>
                        );
                      },
                    },
                  ] as DataTableColumn<typeof dispatchItems[number]>[]}
                />
              ) : (
                dispatchItems.map((item, index) => {
                  const maxAllowedStock = warehousePoolQty(item.product_id, item.source);
                  const isEmpty = !isPositiveQty(maxAllowedStock);
                  return (
                    <View key={index} className="gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <SelectField
                        value={item.product_id}
                        onValueChange={v => updateDispatchItem(index, 'product_id', v)}
                        options={data.products.filter(p => p.status === 'Active' || p.id === item.product_id).map(p => {
                          const pQty = warehousePoolQty(p.id, item.source);
                          return { label: `${p.name} (${!isPositiveQty(pQty) ? 'Out of stock' : formatQty(pQty) + ' in pool'})`, value: p.id };
                        })}
                        title="Select Product"
                        searchable
                        className={`bg-white border rounded-lg p-1.5 flex-row items-center justify-between ${isEmpty ? 'border-rose-300' : 'border-slate-200'}`}
                      />
                      <View className="flex-row items-center gap-1.5">
                        <View className="flex-1">
                          <SelectField
                            value={item.source}
                            onValueChange={v => updateDispatchItem(index, 'source', v)}
                            options={[
                              { label: `Available Pool (${formatQty(warehousePoolQty(item.product_id, 'available_qty'))})`, value: 'available_qty' },
                              { label: `Reserved Pool (${formatQty(warehousePoolQty(item.product_id, 'reserved_qty'))})`, value: 'reserved_qty' },
                            ]}
                            title="Select Pool"
                            className="bg-white border border-slate-200 rounded-lg p-1.5 flex-row items-center justify-between"
                          />
                        </View>
                        <BoxPieceInput
                          value={item.qty}
                          onChange={q => updateDispatchItem(index, 'qty', q)}
                          piecesPerBox={data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1}
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
                        <Text className="text-[10px] text-slate-400 font-bold px-1">Available in Selected Pool: <Text className="text-slate-600">{formatQty(maxAllowedStock)}</Text></Text>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            <View className="flex-row justify-between items-center pt-2">
              <Pressable onPress={addDispatchItem} disabled={dispatchItems.length >= data.products.filter(p => p.status === 'Active').length} className="py-1 px-3 bg-slate-100 rounded-lg active:bg-slate-200">
                <Text className="text-slate-700 font-extrabold text-[10px]">+ Add Another Product</Text>
              </Pressable>
              <Text className="text-[10px] font-bold text-slate-400">{dispatchItems.length} item(s) in queue</Text>
            </View>

            <Pressable onPress={handleLoadStock} disabled={dispatchItems.length === 0} className={`w-full py-2 rounded-lg items-center ${dispatchItems.length === 0 ? 'bg-rose-200' : 'bg-rose-500 active:bg-rose-600'}`}>
              <Text className="text-white font-bold text-xs">Dispatch Cargo Load to Vehicle</Text>
            </Pressable>
          </View>
          )}

          {transfersSubTab === 'transfer' && (
          <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
            <View className="border-b border-slate-100 pb-2">
              <Text className="font-bold text-slate-800 text-xs">Inter-Truck Stock Transfer</Text>
              <Text className="text-[10px] text-slate-400 font-medium">Select source and destination vehicles to transfer multiple products directly.</Text>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-extrabold text-slate-500 mb-1 text-xs">From Source Truck</Text>
                <SelectField value={swapFromTruckId} onValueChange={setSwapFromTruckId} options={truckOptions} title="From Truck" searchable className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold text-slate-500 mb-1 text-xs">To Destination Truck</Text>
                <SelectField value={swapToTruckId} onValueChange={setSwapToTruckId} options={truckOptions} title="To Truck" searchable className={inputClass + ' rounded-xl flex-row items-center justify-between'} />
              </View>
            </View>

            <View className="gap-3">
              <View className="flex-row items-center justify-between flex-wrap gap-2">
                <Text className="font-extrabold text-slate-500 text-xs">Products to Swap/Transfer</Text>
                {swapItems.length > 0 && <ViewToggle />}
              </View>
              {swapItems.length === 0 ? (
                <View className="p-4 rounded-xl border border-dashed border-amber-200 bg-amber-50 items-center gap-1">
                  <Text className="font-extrabold text-xs text-amber-700">No Cargo Available on Source Truck</Text>
                  <Text className="text-[10px] text-amber-600 font-medium text-center">Selected source truck has no products in its current inventory to transfer.</Text>
                </View>
              ) : viewMode === 'table' ? (
                <DataTable
                  data={swapItems}
                  keyExtractor={(_, i) => String(i)}
                  columns={[
                    {
                      key: 'product', label: 'Product', width: 220,
                      render: item => {
                        const index = swapItems.indexOf(item);
                        const isEmpty = !isPositiveQty(truckCargoQty(swapFromTruckId, item.product_id));
                        const availableItems = data.truck_inventory.filter(ti => ti.truck_id === swapFromTruckId && isPositiveQty(readQtyField(ti, 'quantity', 'quantity_pieces')));
                        return (
                          <SelectField
                            value={item.product_id}
                            onValueChange={v => updateSwapItem(index, 'product_id', v)}
                            options={availableItems.map(ti => {
                              const p = data.products.find(pp => pp.id === ti.product_id);
                              return { label: `${p?.name || 'Product'} (${formatQty({ boxes: ti.quantity, pieces: ti.quantity_pieces })} loaded)`, value: ti.product_id };
                            })}
                            title="Select Product"
                            searchable
                            className={`bg-white border rounded-lg p-1.5 flex-row items-center justify-between ${isEmpty ? 'border-rose-300' : 'border-slate-200'}`}
                          />
                        );
                      },
                    },
                    {
                      key: 'qty', label: 'Quantity', width: 140,
                      render: item => {
                        const index = swapItems.indexOf(item);
                        return (
                          <BoxPieceInput
                            value={item.qty}
                            onChange={q => updateSwapItem(index, 'qty', q)}
                            piecesPerBox={data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1}
                            compact
                          />
                        );
                      },
                    },
                    {
                      key: 'loaded', label: 'Loaded on Source', width: 150, grow: false,
                      render: item => (
                        <Text className="text-[10px] text-slate-400 font-bold">Loaded: <Text className="text-slate-600">{formatQty(truckCargoQty(swapFromTruckId, item.product_id))}</Text></Text>
                      ),
                    },
                    {
                      key: 'actions', label: '', width: 50, align: 'center', grow: false,
                      render: item => {
                        const index = swapItems.indexOf(item);
                        return (
                          <Pressable onPress={() => removeSwapItem(index)} disabled={swapItems.length <= 1} className="self-center p-1.5 active:bg-rose-50 rounded-lg">
                            <Trash2 size={15} color={swapItems.length <= 1 ? '#cbd5e1' : '#f43f5e'} />
                          </Pressable>
                        );
                      },
                    },
                  ] as DataTableColumn<typeof swapItems[number]>[]}
                />
              ) : (
                swapItems.map((item, index) => {
                  const availableOnSource = truckCargoQty(swapFromTruckId, item.product_id);
                  const isEmpty = !isPositiveQty(availableOnSource);
                  const availableItems = data.truck_inventory.filter(ti => ti.truck_id === swapFromTruckId && isPositiveQty(readQtyField(ti, 'quantity', 'quantity_pieces')));
                  return (
                    <View key={index} className="gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <SelectField
                        value={item.product_id}
                        onValueChange={v => updateSwapItem(index, 'product_id', v)}
                        options={availableItems.map(ti => {
                          const p = data.products.find(pp => pp.id === ti.product_id);
                          return { label: `${p?.name || 'Product'} (${formatQty({ boxes: ti.quantity, pieces: ti.quantity_pieces })} loaded)`, value: ti.product_id };
                        })}
                        title="Select Product"
                        searchable
                        className={`bg-white border rounded-lg p-1.5 flex-row items-center justify-between ${isEmpty ? 'border-rose-300' : 'border-slate-200'}`}
                      />
                      <View className="flex-row items-center gap-2">
                        <BoxPieceInput
                          value={item.qty}
                          onChange={q => updateSwapItem(index, 'qty', q)}
                          piecesPerBox={data.products.find(p => p.id === item.product_id)?.pieces_per_box ?? 1}
                        />
                        <Pressable onPress={() => removeSwapItem(index)} disabled={swapItems.length <= 1} className="p-2 active:bg-rose-50 rounded-lg">
                          <Trash2 size={16} color={swapItems.length <= 1 ? '#cbd5e1' : '#f43f5e'} />
                        </Pressable>
                      </View>
                      <Text className="text-[10px] text-slate-400 font-bold px-1">Loaded on Source Truck: <Text className="text-slate-600">{formatQty(availableOnSource)}</Text></Text>
                    </View>
                  );
                })
              )}
            </View>

            <View className="flex-row justify-between items-center pt-2">
              <Pressable
                onPress={addSwapItem}
                disabled={swapItems.length === 0 || swapItems.length >= data.truck_inventory.filter(ti => ti.truck_id === swapFromTruckId && isPositiveQty(readQtyField(ti, 'quantity', 'quantity_pieces'))).length}
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
          )}
        </View>
      ) : activeTab === 'audits' ? (
        <View className="bg-white p-4 rounded-2xl border border-slate-200 gap-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
            <Text className="font-bold text-slate-800 text-xs">Inventory Logistics Audit Trail</Text>
            <Text className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold uppercase">SECURED</Text>
          </View>

          <FilterBar searchValue={auditSearch} onSearchChange={setAuditSearch} searchPlaceholder="Search by record ID, actor, action, or details...">
            <SelectField
              value={auditEntityTypeFilter}
              onValueChange={setAuditEntityTypeFilter}
              options={[
                { label: 'All Types', value: 'All' },
                { label: 'Order', value: 'Order' },
                { label: 'Pre-Booking', value: 'PreBookingOrder' },
                { label: 'Purchase', value: 'Purchase' },
                { label: 'Purchase Order Request', value: 'PurchaseOrderRequest' },
                { label: 'Store', value: 'Store' },
                { label: 'Supplier', value: 'Supplier' },
                { label: 'Product', value: 'Product' },
                { label: 'Truck', value: 'Truck' },
                { label: 'User', value: 'User' },
                { label: 'Category', value: 'Category' },
                { label: 'Area', value: 'Area' },
                { label: 'Partner Type', value: 'PartnerType' },
                { label: 'Asset Type', value: 'AssetType' },
                { label: 'Asset', value: 'Asset' },
                { label: 'Warehouse', value: 'Warehouse' },
                { label: 'System', value: 'System' },
              ]}
              title="Record Type"
              className={FILTER_PILL_CLASS}
              textClassName={FILTER_PILL_TEXT_CLASS}
            />
            <SelectField
              value={auditUserFilter}
              onValueChange={setAuditUserFilter}
              options={[{ label: 'All Users', value: 'All' }, ...data.users.map(u => ({ label: `${u.name} (${u.role})`, value: u.id }))]}
              title="By"
              className={FILTER_PILL_CLASS}
              textClassName={FILTER_PILL_TEXT_CLASS}
            />
            <DateRangeFilterField
              mode={auditDateFilterMode}
              onModeChange={setAuditDateFilterMode}
              customFrom={auditCustomDateFrom}
              customTo={auditCustomDateTo}
              onCustomFromChange={setAuditCustomDateFrom}
              onCustomToChange={setAuditCustomDateTo}
              title="Date Range"
            />
          </FilterBar>

          <ScrollableSection height={auditTableHeight}>
          {auditLogs.loading && auditLogs.data.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-center text-slate-400 italic text-xs">Loading audit trail...</Text>
            </View>
          ) : auditLogs.error ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-center text-red-500 italic text-xs">{auditLogs.error}</Text>
            </View>
          ) : viewMode === 'table' ? (
            <DataTable
              data={auditLogs.data}
              keyExtractor={l => l.id}
              emptyText="No audit log entries recorded yet."
              onRowPress={l => {
                const entityType = mapAuditEntityType(l.entity_type);
                if (entityType) onNavigateToEntity?.(entityType, l.entity_id);
              }}
              columns={[
                { key: 'action', label: 'Action', width: 140, render: l => <Text className="font-bold text-indigo-600 uppercase text-[9px]" numberOfLines={1}>{l.action}</Text> },
                { key: 'details', label: 'Details', width: 320, render: l => <Text className="text-slate-700 font-medium leading-relaxed text-[10px]" numberOfLines={2}>{l.details}</Text> },
                {
                  key: 'by', label: 'By', width: 150,
                  render: l => {
                    const actor = l.user_name && l.user_role ? { name: l.user_name, role: l.user_role } : resolveActor(data.users, l.user_id);
                    return <Text className="text-[9px] text-slate-400 uppercase" numberOfLines={1}>{actor.role} - {actor.name}</Text>;
                  },
                },
                { key: 'time', label: 'Time', width: 130, render: l => <Text className="text-[9px] text-slate-400">{formatDateTime12h(l.timestamp)}</Text> },
                {
                  key: 'nav', label: '', width: 60, grow: false, align: 'center',
                  render: l => (mapAuditEntityType(l.entity_type) ? <Text className="text-indigo-500 font-extrabold text-[9px]">View →</Text> : null),
                },
              ] as DataTableColumn<ERPAuditLog>[]}
            />
          ) : auditLogs.data.length === 0 ? (
            <EmptyState message="No audit log entries recorded yet." />
          ) : (
            <View className="gap-2 md:flex-row md:flex-wrap">
              {auditLogs.data.map(l => {
                const actor = l.user_name && l.user_role ? { name: l.user_name, role: l.user_role } : resolveActor(data.users, l.user_id);
                const entityType = mapAuditEntityType(l.entity_type);
                return (
                <Pressable
                  key={l.id}
                  onPress={() => { if (entityType) onNavigateToEntity?.(entityType, l.entity_id); }}
                  className="w-full md:w-[48%] xl:w-[32%] p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex-row items-start gap-2"
                >
                  <View className="p-1 bg-indigo-50 rounded mt-0.5">
                    <ClipboardList size={14} color="#6366f1" />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between gap-1">
                      <Text className="font-bold text-indigo-600 uppercase text-[9px]">{l.action}</Text>
                      <Text className="text-[8px] text-slate-400">{formatDateTime12h(l.timestamp)}</Text>
                    </View>
                    <Text className="text-slate-700 mt-1 font-medium leading-relaxed text-[10px]">{l.details}</Text>
                    <View className="flex-row items-center justify-between mt-0.5">
                      <Text className="text-[8px] text-slate-400 uppercase">By: {actor.role} - {actor.name}</Text>
                      {entityType && <Text className="text-indigo-500 font-extrabold text-[9px]">View →</Text>}
                    </View>
                  </View>
                </Pressable>
                );
              })}
            </View>
          )}
          </ScrollableSection>

          <PaginationFooter mode="offset" page={auditLogs.page} totalPages={auditLogs.totalPages} total={auditLogs.total} loading={auditLogs.loading} onPageChange={auditLogs.goToPage} />
        </View>
      ) : (
        <AdminAssets
          data={data}
          setData={setData}
          addNotification={addNotification}
          currentUser={currentUser}
          showAlert={showAlert}
          pendingNotificationTarget={pendingNotificationTarget}
          onConsumePendingNotificationTarget={onConsumePendingNotificationTarget}
          onCreateOrderForPartner={onCreateOrderForPartner}
        />
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
        message={(() => {
          const truckName = data.trucks.find(t => t.id === deleteTruckConfirmId)?.vehicle_number || 'this truck';
          const cargo = data.truck_inventory.filter(ti => ti.truck_id === deleteTruckConfirmId);
          const loadedQty = { boxes: cargo.reduce((sum, ti) => sum + ti.quantity, 0), pieces: cargo.reduce((sum, ti) => sum + ti.quantity_pieces, 0) };
          const cargoNote = isPositiveQty(loadedQty) ? ` This truck currently has ${formatQty(loadedQty)} of cargo loaded - it will be automatically returned to warehouse stock as part of removing the truck.` : '';
          return `Are you sure you want to remove "${truckName}" from the active fleet?${cargoNote} It will be hidden from dispatch/transfer selection but its history is preserved and it can be reactivated later.`;
        })()}
        confirmLabel="Yes, Remove Truck"
        confirmColor="bg-rose-600"
        onConfirm={handleConfirmDeleteTruck}
      />

      <Modal transparent visible={showCorrectionModal} animationType="fade" onRequestClose={() => setShowCorrectionModal(false)}>
        <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
          <View className="bg-white w-full max-w-md rounded-3xl p-5 relative gap-3">
            <Pressable onPress={() => setShowCorrectionModal(false)} className="absolute top-4 right-4 p-1 z-10" hitSlop={8}>
              <X size={16} color="#94a3b8" />
            </Pressable>

            <View className="flex-row items-center gap-1.5 border-b border-slate-100 pb-2.5 pr-6">
              <View className="w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-xl items-center justify-center">
                <Edit size={15} color="#6366f1" />
              </View>
              <View className="flex-1">
                <Text className="font-extrabold text-slate-800 text-sm">Stock Correction</Text>
                <Text className="text-[10px] text-slate-400" numberOfLines={1}>{data.products.find(p => p.id === correctionForm.product_id)?.name || 'Unknown product'}</Text>
              </View>
            </View>

            <View className="flex-row flex-wrap gap-2.5">
              <View className="w-[48%]">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Available Qty</Text>
                <BoxPieceInput value={correctionForm.available_qty} onChange={q => setCorrectionForm({ ...correctionForm, available_qty: q })} piecesPerBox={data.products.find(p => p.id === correctionForm.product_id)?.pieces_per_box ?? 1} />
              </View>
              <View className="w-[48%]">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Reserved Qty</Text>
                <BoxPieceInput value={correctionForm.reserved_qty} onChange={q => setCorrectionForm({ ...correctionForm, reserved_qty: q })} piecesPerBox={data.products.find(p => p.id === correctionForm.product_id)?.pieces_per_box ?? 1} />
              </View>
              <View className="w-[48%]">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Damaged Qty</Text>
                <BoxPieceInput value={correctionForm.damaged_qty} onChange={q => setCorrectionForm({ ...correctionForm, damaged_qty: q })} piecesPerBox={data.products.find(p => p.id === correctionForm.product_id)?.pieces_per_box ?? 1} />
              </View>
              <View className="w-[48%]">
                <Text className="font-bold text-slate-500 mb-1 text-xs">Expired Qty</Text>
                <BoxPieceInput value={correctionForm.expired_qty} onChange={q => setCorrectionForm({ ...correctionForm, expired_qty: q })} piecesPerBox={data.products.find(p => p.id === correctionForm.product_id)?.pieces_per_box ?? 1} />
              </View>
            </View>

            <View>
              <Text className="font-bold text-slate-500 mb-1 text-xs">Comment (optional)</Text>
              <TextInput
                value={correctionForm.comment}
                onChangeText={v => setCorrectionForm({ ...correctionForm, comment: v })}
                placeholder="Leave blank to auto-generate a comment from the changes made..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                className={inputClass + ' min-h-[48px]'}
              />
            </View>

            <View className="flex-row gap-2">
              <Pressable onPress={() => setShowCorrectionModal(false)} className="flex-1 py-2.5 bg-slate-100 rounded-lg items-center active:bg-slate-200">
                <Text className="text-slate-700 font-bold text-xs">Cancel</Text>
              </Pressable>
              <Pressable onPress={handleApplyCorrection} className="flex-1 py-2.5 bg-indigo-500 rounded-lg flex-row items-center justify-center gap-1.5 active:bg-indigo-600">
                <Check size={14} color="#fff" />
                <Text className="text-white font-bold text-xs">Apply Correction</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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

      <Modal visible={showPurchaseOrderExport} transparent animationType="fade" onRequestClose={handleClosePurchaseOrderModal}>
        <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
          <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-xl w-full h-[85%]">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <View>
                <Text className="font-extrabold text-slate-800 text-sm">{editingPORequestId ? 'Edit Purchase Order' : 'Purchase Order (Excel)'}</Text>
                <Text className="text-[10px] text-slate-400 mt-0.5">
                  {editingPORequestId ? 'Correct the supplier, products, or case counts for this pending order.' : 'Select products and how many cases to order, then download the sheet to send a supplier.'}
                </Text>
              </View>
              <Pressable onPress={handleClosePurchaseOrderModal}><Text className="text-slate-400 text-lg">x</Text></Pressable>
            </View>

            <View className="mb-3">
              <Text className="font-bold text-slate-500 mb-1 text-xs">Sending To Supplier</Text>
              <SelectField value={poSupplierId} onValueChange={setPoSupplierId} options={supplierOptions} title="Select Supplier" searchable className={inputClass + ' flex-row items-center justify-between'} />
            </View>

            <View className="flex-row items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 mb-3 z-20">
              <Search size={14} color="#94a3b8" />
              <AutocompleteInput
                value={poSearch}
                onChangeText={setPoSearch}
                suggestions={warehouseSearchSuggestions}
                placeholder="Search product name or code..."
                placeholderTextColor="#94a3b8"
                containerClassName="flex-1"
                className="text-xs text-slate-800 py-2.5"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>

            <ScrollView className="flex-1 mb-3">
              <View className="gap-1.5">
                {data.products
                  .filter(p => p.status === 'Active')
                  .filter(p => p.name.toLowerCase().includes(debouncedPoSearch.trim().toLowerCase()) || p.code.toLowerCase().includes(debouncedPoSearch.trim().toLowerCase()))
                  .map(p => {
                    const qty = poOrderCase[p.id] || '';
                    const qtyPieces = poOrderCasePieces[p.id] || '';
                    const isSelected = Number(qty) > 0 || Number(qtyPieces) > 0;
                    return (
                      <View key={p.id} className={`flex-row items-center justify-between gap-2 p-2 rounded-lg border ${isSelected ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                        <View className="flex-1 min-w-0">
                          <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{p.name}</Text>
                          <Text className="text-slate-400 text-[9px]">{p.category} - {p.code} - {p.unit_value}{p.unit_type}</Text>
                        </View>
                        <BoxPieceInput
                          value={{ boxes: Number(qty) || 0, pieces: Number(qtyPieces) || 0 }}
                          onChange={q => {
                            setPoOrderCase({ ...poOrderCase, [p.id]: q.boxes === 0 ? '' : String(q.boxes) });
                            setPoOrderCasePieces({ ...poOrderCasePieces, [p.id]: q.pieces === 0 ? '' : String(q.pieces) });
                          }}
                          piecesPerBox={p.pieces_per_box}
                          compact
                        />
                      </View>
                    );
                  })}
                {data.products.filter(p => p.status === 'Active').length === 0 && (
                  <Text className="text-[10px] text-slate-400 italic py-4 text-center">No active products in the catalog.</Text>
                )}
              </View>
            </ScrollView>

            <View className="flex-row items-center justify-between mb-3 px-0.5">
              <Text className="text-[10px] font-bold text-slate-500 uppercase">
                {data.products.filter(p => Number(poOrderCase[p.id]) > 0 || Number(poOrderCasePieces[p.id]) > 0).length} product(s) selected
              </Text>
            </View>

            <View className="flex-row gap-2">
              {editingPORequestId ? (
                <Pressable onPress={handleSaveEditedPurchaseOrder} className="flex-1 py-2.5 bg-emerald-600 rounded-2xl items-center active:bg-emerald-700 flex-row justify-center gap-1.5">
                  <Check size={14} color="#fff" />
                  <Text className="text-white font-bold text-xs">Save Changes</Text>
                </Pressable>
              ) : (
                <Pressable onPress={handleDownloadPurchaseOrderExcel} className="flex-1 py-2.5 bg-emerald-600 rounded-2xl items-center active:bg-emerald-700 flex-row justify-center gap-1.5">
                  <FileSpreadsheet size={14} color="#fff" />
                  <Text className="text-white font-bold text-xs">Download Excel</Text>
                </Pressable>
              )}
              <Pressable onPress={handleClosePurchaseOrderModal} className="flex-1 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200"><Text className="text-slate-700 font-bold text-xs">Close</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPendingPOList} transparent animationType="fade" onRequestClose={() => setShowPendingPOList(false)}>
        <View className="flex-1 bg-slate-900/60 items-center justify-center p-4">
          <View className="bg-white rounded-3xl border border-slate-200 p-5 max-w-xl w-full h-[85%]">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <View>
                <Text className="font-extrabold text-slate-800 text-sm">Pending Purchase Orders</Text>
                <Text className="text-[10px] text-slate-400 mt-0.5">Sent to a supplier, waiting to be received. Tap one to auto-fill Receive Stock.</Text>
              </View>
              <Pressable onPress={() => setShowPendingPOList(false)}><Text className="text-slate-400 text-lg">x</Text></Pressable>
            </View>

            <ScrollView className="flex-1">
              <View className={`gap-2 ${pendingPurchaseOrders.length === 0 ? 'flex-1' : ''}`}>
                {pendingPurchaseOrders.map(req => {
                  const supplier = data.suppliers.find(s => s.id === req.supplier_id);
                  const isConfirmingDelete = confirmDeletePOId === req.id;
                  return (
                    <View key={req.id} className="rounded-xl border border-amber-100 bg-amber-50 overflow-hidden">
                      <Pressable
                        onPress={() => handleFillReceiveStockFromPO(req)}
                        className="p-3 active:bg-amber-100"
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="font-extrabold text-slate-800 text-xs">{req.order_ref}</Text>
                          <Text className="text-[9px] text-slate-400">{req.created_at?.slice(0, 10)}</Text>
                        </View>
                        <Text className="text-[10px] text-slate-500 mt-0.5">{supplier?.name || 'Unknown supplier'} - {req.items.length} product(s)</Text>
                      </Pressable>

                      {isConfirmingDelete ? (
                        <View className="flex-row items-center gap-2 px-3 pb-2.5 pt-1.5 border-t border-amber-200/70 bg-rose-50">
                          <Text className="flex-1 text-[10px] font-bold text-rose-700">Delete this pending order?</Text>
                          <Pressable onPress={() => handleConfirmDeletePendingPO(req.id)} className="py-1 px-2.5 bg-rose-600 rounded-lg active:bg-rose-700">
                            <Text className="text-white font-bold text-[9px]">Yes, Delete</Text>
                          </Pressable>
                          <Pressable onPress={() => setConfirmDeletePOId(null)} className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg active:bg-slate-100">
                            <Text className="text-slate-700 font-bold text-[9px]">Cancel</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View className="flex-row gap-1.5 px-3 pb-2.5 pt-0.5 border-t border-amber-100/70">
                          <Pressable onPress={() => handleOpenEditPendingPO(req)} className="flex-row items-center gap-1 py-1 px-2 bg-white border border-slate-200 rounded-lg active:bg-slate-50">
                            <Edit size={11} color="#475569" />
                            <Text className="text-slate-600 text-[9px] font-extrabold">Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => setConfirmDeletePOId(req.id)} className="flex-row items-center gap-1 py-1 px-2 bg-rose-50 border border-rose-100 rounded-lg active:bg-rose-100">
                            <Trash2 size={11} color="#e11d48" />
                            <Text className="text-rose-600 text-[9px] font-extrabold">Delete</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
                {pendingPurchaseOrders.length === 0 && (
                  <EmptyState message="No pending purchase orders." />
                )}
              </View>
            </ScrollView>

            <Pressable onPress={() => setShowPendingPOList(false)} className="mt-3 py-2.5 bg-slate-100 rounded-2xl items-center active:bg-slate-200">
              <Text className="text-slate-700 font-bold text-xs">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
