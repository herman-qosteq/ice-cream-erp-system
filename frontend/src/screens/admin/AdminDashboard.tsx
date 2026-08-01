import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { TrendingUp, DollarSign, Package, AlertTriangle, Calendar, Trophy, Users, Award, Truck, Boxes, Snowflake } from 'lucide-react-native';
import { ERPData } from '../../storage';
import { Asset, BoxPieceQty } from '../../types';
import { calculateDeliveredOrderProfit, getAveragePurchasePrice } from '../../data';
import { computeInvoiceTotals, formatWholeRupees } from '../../utils/billing';
import { assetsApi } from '../../api/endpoints';
import { formatQty, isPositiveQty, toTotalPieces } from '../../utils/qty';

interface AdminDashboardProps {
  data: ERPData;
  setActiveScreen: (screen: string) => void;
  showAlert: (opts: any) => void;
}

export default function AdminDashboard({ data, setActiveScreen, showAlert }: AdminDashboardProps) {
  // Assets aren't part of the main ERPData blob (paginated separately, see
  // AdminAssets.tsx) - the dashboard fetches its own lightweight summary
  // just for the stat tiles/reports below.
  const [assets, setAssets] = useState<Asset[]>([]);
  useEffect(() => {
    assetsApi.list().then(setAssets).catch(() => {});
  }, []);

  const partnerTypeCounts = data.partnerTypes.map(t => ({
    name: t.name,
    count: data.stores.filter(s => (s.partner_type || 'Retail Shop') === t.name).length,
  }));

  const assetStatusCounts = {
    total: assets.length,
    assigned: assets.filter(a => a.status === 'Assigned').length,
    available: assets.filter(a => a.status === 'Warehouse' || a.status === 'Returned').length,
    maintenance: assets.filter(a => a.status === 'Maintenance').length,
    lost: assets.filter(a => a.status === 'Lost').length,
  };

  const truckStockUnits = data.truck_inventory.reduce((sum, ti) => sum + ti.quantity, 0);
  const truckStockPieces = data.truck_inventory.reduce((sum, ti) => sum + ti.quantity_pieces, 0);
  const warehouseStockUnits = data.warehouse_inventory.reduce((sum, inv) => sum + inv.available_qty, 0);
  const warehouseStockPieces = data.warehouse_inventory.reduce((sum, inv) => sum + inv.available_pieces, 0);

  // Single source of truth for "how much revenue did this order generate" (tax
  // inclusive, matching the invoice actually billed to the store) — every KPI
  // below that talks about revenue (Total Revenue, Top Stores, Salesperson
  // Stats) must use this same definition or they can never be cross-added or
  // reconciled against each other.
  const getOrderRevenue = (o: (typeof data.orders)[number]) => {
    const inv = data.invoices.find(i => i.order_id === o.id);
    return inv ? inv.grand_total : computeInvoiceTotals(o.items).grand_total;
  };

  const totalRevenue = data.orders
    .filter(o => o.status === 'Delivered')
    .reduce((acc, o) => acc + getOrderRevenue(o), 0);
  const totalCollections = data.payments.reduce((acc, p) => acc + p.amount, 0);
  const pendingCollections = data.stores.reduce((acc, s) => acc + s.outstanding_balance, 0);

  const getInventoryCostValue = (productId: string, qty: BoxPieceQty) => {
    if (!isPositiveQty(qty)) return 0;
    const product = data.products.find(p => p.id === productId);
    const avgPurchasePrice = getAveragePurchasePrice(productId, data.purchases, product?.pieces_per_box ?? 1);
    const fallbackPrice = product?.purchase_price ?? 0;
    const unitCost = avgPurchasePrice || fallbackPrice;
    const piecesPerBox = product?.pieces_per_box ?? 1;
    return qty.boxes * unitCost + (qty.pieces * unitCost / Math.max(1, piecesPerBox));
  };

  const warehouseStockValue = data.warehouse_inventory.reduce((sum, inv) => sum + getInventoryCostValue(inv.product_id, { boxes: inv.available_qty, pieces: inv.available_pieces }), 0);

  let totalFleetStockValue = 0;
  data.truck_inventory.forEach(ti => {
    const qty = { boxes: ti.quantity, pieces: ti.quantity_pieces };
    if (isPositiveQty(qty)) totalFleetStockValue += getInventoryCostValue(ti.product_id, qty);
  });

  // Stock already reserved for pre-bookings — still physically in the
  // warehouse (not yet dispatched), so it's excluded from warehouseStockValue
  // above (that figure is "available to sell right now"). Broken out
  // separately here so reserved value isn't just invisible.
  const reservedStockValue = data.warehouse_inventory.reduce((sum, inv) => sum + getInventoryCostValue(inv.product_id, { boxes: inv.reserved_qty, pieces: inv.reserved_pieces }), 0);
  const reservedProducts = data.warehouse_inventory
    .filter(inv => isPositiveQty({ boxes: inv.reserved_qty, pieces: inv.reserved_pieces }))
    .map(inv => {
      const product = data.products.find(p => p.id === inv.product_id);
      const reservedQty: BoxPieceQty = { boxes: inv.reserved_qty, pieces: inv.reserved_pieces };
      const effectiveQty = toTotalPieces(reservedQty, product?.pieces_per_box ?? 1);
      const totalValue = getInventoryCostValue(inv.product_id, reservedQty);
      return {
        id: inv.product_id,
        name: product?.name || 'Unknown product',
        code: product?.code || '',
        reservedQty,
        unitCost: effectiveQty > 0 ? totalValue / effectiveQty : 0,
        value: totalValue,
      };
    })
    .sort((a, b) => b.value - a.value);

  // Only counts the portion of each delivered order's margin backed by money
  // actually collected so far (see calculateDeliveredOrderProfit) - unpaid
  // and pending balances contribute nothing until they're settled.
  const totalProfit = data.orders
    .filter(o => o.status === 'Delivered')
    .reduce((sum, order) => {
      const invoice = data.invoices.find(i => i.order_id === order.id);
      return sum + calculateDeliveredOrderProfit(order, data.purchases, data.products, invoice);
    }, 0);

  const today = new Date();
  const sevenDaysLater = new Date(today.getTime() + 7 * 86400000);
  const upcomingRefills = data.stores.filter(s => {
    if (!s.next_refill_date) return false;
    const refDate = new Date(s.next_refill_date);
    return refDate >= today && refDate <= sevenDaysLater;
  });

  const storeRevenues = data.stores.map(st => {
    const orders = data.orders.filter(o => o.store_id === st.id && o.status === 'Delivered');
    const rev = orders.reduce((sum, o) => sum + getOrderRevenue(o), 0);
    return { name: st.name, revenue: rev, ranking: st.ranking };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const productSales = data.products.map(p => {
    const deliveredItems = data.orders.filter(o => o.status === 'Delivered').flatMap(o => o.items.filter(item => item.product_id === p.id));
    const boxes = deliveredItems.reduce((sum, item) => sum + item.quantity, 0);
    const pieces = deliveredItems.reduce((sum, item) => sum + item.quantity_pieces, 0);
    const sortKey = toTotalPieces({ boxes, pieces }, p.pieces_per_box);
    return { name: p.name, qty: { boxes, pieces }, sortKey, category: p.category };
  }).sort((a, b) => b.sortKey - a.sortKey).slice(0, 5);

  return (
    <View className="gap-6">
      {/* MAIN KPIS */}
      <View className="flex-row flex-wrap gap-4">
        <View className="flex-1 min-w-[45%] lg:min-w-[22%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-blue-400">
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Revenue</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{formatWholeRupees(totalRevenue)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">Accumulated collected</Text>
        </View>

        <View className="flex-1 min-w-[45%] lg:min-w-[22%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-emerald-400">
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Profit</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{formatWholeRupees(totalProfit)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">From collected payments only</Text>
        </View>

        <View className="flex-1 min-w-[45%] lg:min-w-[22%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-violet-400">
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Collections</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{formatWholeRupees(totalCollections)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">Cash/UPI/Cards settled</Text>
        </View>

        <Pressable
          onPress={() => setActiveScreen('Credit')}
          className="flex-1 min-w-[45%] lg:min-w-[22%] bg-white/70 border border-white/50 p-4 rounded-2xl border-l-4 border-l-pink-400 active:bg-white"
        >
          <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Pending Collections</Text>
          <Text className="text-xl font-black mt-1 text-slate-800">{formatWholeRupees(pendingCollections)}</Text>
          <Text className="text-[9px] text-slate-500 font-medium">Overdue customer credit</Text>
        </Pressable>
      </View>

      {/* Warehouse and Truck stock valuation */}
      <View className="gap-4 md:flex-row md:flex-wrap">
        <View className="md:flex-1 md:min-w-[320px] bg-white/70 border border-white/50 p-4 rounded-2xl flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="p-3 bg-blue-500/10 rounded-xl border border-blue-200/50">
              <Package size={20} color="#2563eb" />
            </View>
            <View>
              <Text className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Warehouse Value</Text>
              <Text className="text-lg font-bold text-slate-800">{formatWholeRupees(warehouseStockValue)}</Text>
            </View>
          </View>
          <Pressable onPress={() => setActiveScreen('Warehouse')} className="bg-blue-500/10 py-1.5 px-3 rounded-lg border border-blue-200/50 active:bg-blue-500/20">
            <Text className="text-xs font-bold text-blue-700">Manage Stock</Text>
          </Pressable>
        </View>

        <View className="md:flex-1 md:min-w-[320px] bg-white/70 border border-white/50 p-4 rounded-2xl flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-200/50">
              <Truck size={20} color="#059669" />
            </View>
            <View>
              <Text className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Fleet Transit Value</Text>
              <Text className="text-lg font-bold text-slate-800">{formatWholeRupees(totalFleetStockValue)}</Text>
            </View>
          </View>
          <Pressable onPress={() => setActiveScreen('Trucks')} className="bg-emerald-500/10 py-1.5 px-3 rounded-lg border border-emerald-200/50 active:bg-emerald-500/20">
            <Text className="text-xs font-bold text-emerald-700">View Routes</Text>
          </Pressable>
        </View>

        <View className="md:flex-1 md:min-w-[320px] bg-white/70 border border-white/50 p-4 rounded-2xl flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="p-3 bg-amber-500/10 rounded-xl border border-amber-200/50">
              <Package size={20} color="#d97706" />
            </View>
            <View>
              <Text className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Reserved Stock Value</Text>
              <Text className="text-lg font-bold text-slate-800">{formatWholeRupees(reservedStockValue)}</Text>
            </View>
          </View>
          <Pressable onPress={() => setActiveScreen('Warehouse')} className="bg-amber-500/10 py-1.5 px-3 rounded-lg border border-amber-200/50 active:bg-amber-500/20">
            <Text className="text-xs font-bold text-amber-700">Manage Stock</Text>
          </Pressable>
        </View>
      </View>

      {/* PARTNER TYPE STATISTICS */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Users size={16} color="#4f46e5" />
          <Text className="font-bold text-slate-800 text-sm">Partner Type Statistics</Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {partnerTypeCounts.map(pt => (
            <View key={pt.name} className="flex-1 min-w-[45%] lg:min-w-[18%] bg-indigo-50/60 border border-indigo-100 p-3 rounded-xl">
              <Text className="text-[9px] uppercase font-bold tracking-wider text-indigo-400">{pt.name}</Text>
              <Text className="text-lg font-black text-indigo-700 mt-0.5">{pt.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ASSET & INVENTORY STATISTICS */}
      <View className="gap-4 md:flex-row md:flex-wrap">
        <Pressable onPress={() => setActiveScreen('Assets')} className="md:flex-1 md:min-w-[320px] bg-white/70 border border-white/50 p-4 rounded-2xl active:bg-white">
          <View className="flex-row items-center gap-1.5 mb-2">
            <Boxes size={16} color="#4f46e5" />
            <Text className="font-bold text-slate-800 text-sm">Asset Statistics</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <View className="flex-1 min-w-[30%]"><Text className="text-[9px] text-slate-400 uppercase font-bold">Total</Text><Text className="text-base font-black text-slate-800">{assetStatusCounts.total}</Text></View>
            <View className="flex-1 min-w-[30%]"><Text className="text-[9px] text-slate-400 uppercase font-bold">Assigned</Text><Text className="text-base font-black text-emerald-600">{assetStatusCounts.assigned}</Text></View>
            <View className="flex-1 min-w-[30%]"><Text className="text-[9px] text-slate-400 uppercase font-bold">Available</Text><Text className="text-base font-black text-blue-600">{assetStatusCounts.available}</Text></View>
            <View className="flex-1 min-w-[30%]"><Text className="text-[9px] text-slate-400 uppercase font-bold">Maintenance</Text><Text className="text-base font-black text-amber-600">{assetStatusCounts.maintenance}</Text></View>
            <View className="flex-1 min-w-[30%]"><Text className="text-[9px] text-slate-400 uppercase font-bold">Lost</Text><Text className="text-base font-black text-rose-600">{assetStatusCounts.lost}</Text></View>
          </View>
        </Pressable>

        <View className="md:flex-1 md:min-w-[320px] bg-white/70 border border-white/50 p-4 rounded-2xl">
          <View className="flex-row items-center gap-1.5 mb-2">
            <Snowflake size={16} color="#0ea5e9" />
            <Text className="font-bold text-slate-800 text-sm">Inventory Statistics (Units)</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <View className="flex-1 min-w-[30%]"><Text className="text-[9px] text-slate-400 uppercase font-bold">Warehouse</Text><Text className="text-base font-black text-slate-800">{formatQty({ boxes: warehouseStockUnits, pieces: warehouseStockPieces })}</Text></View>
            <View className="flex-1 min-w-[30%]"><Text className="text-[9px] text-slate-400 uppercase font-bold">Truck</Text><Text className="text-base font-black text-emerald-600">{formatQty({ boxes: truckStockUnits, pieces: truckStockPieces })}</Text></View>
          </View>
        </View>
      </View>

      {/* RESERVED PRODUCT PRICE DETAILS */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-1.5">
            <Package size={16} color="#d97706" />
            <Text className="font-bold text-slate-800 text-sm">Reserved Product Price Details</Text>
          </View>
          <Text className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200/50 font-extrabold px-2.5 py-0.5 rounded-full">
            {reservedProducts.length} Product{reservedProducts.length === 1 ? '' : 's'} Reserved
          </Text>
        </View>

        {reservedProducts.length === 0 ? (
          <Text className="text-xs text-slate-400 text-center py-4 font-medium italic">No warehouse stock is currently reserved for pre-bookings.</Text>
        ) : (
          <View className="gap-2 md:flex-row md:flex-wrap">
            {reservedProducts.map(p => (
              <View key={p.id} className="w-full md:w-[48%] xl:w-[32%] p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1">
                    <Text className="font-bold text-slate-800 text-[11px]" numberOfLines={1}>{p.name}</Text>
                    <Text className="text-[9px] text-slate-400 uppercase font-mono">{p.code}</Text>
                  </View>
                  <Text className="text-[9px] bg-amber-100 text-amber-700 font-extrabold px-1.5 py-0.5 rounded">{formatQty(p.reservedQty)}</Text>
                </View>
                <View className="flex-row justify-between mt-2.5 pt-2 border-t border-amber-100">
                  <View>
                    <Text className="text-slate-400 text-[9px]">Unit Cost</Text>
                    <Text className="font-semibold text-slate-600 text-[10px]">{formatWholeRupees(p.unitCost)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-slate-400 text-[9px]">Reserved Value</Text>
                    <Text className="font-extrabold text-amber-700 text-[10px]">{formatWholeRupees(p.value)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* UPCOMING REFILLS */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-1.5">
            <Calendar size={16} color="#ec4899" />
            <Text className="font-bold text-slate-800 text-sm">Upcoming Refills (7 Days)</Text>
          </View>
          <Text className="text-[10px] bg-pink-100 text-pink-700 border border-pink-200/50 font-extrabold px-2.5 py-0.5 rounded-full">
            {upcomingRefills.length} Stores Due
          </Text>
        </View>

        {upcomingRefills.length === 0 ? (
          <Text className="text-xs text-slate-400 text-center py-4 font-medium italic">No refills due in the next 7 days.</Text>
        ) : (
          <View className="gap-2 md:flex-row md:flex-wrap">
            {upcomingRefills.map(s => {
              const daysDiff = Math.ceil((new Date(s.next_refill_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              let badgeClass = 'bg-white text-slate-700 border border-slate-200';
              let label = `In ${daysDiff} days`;
              if (daysDiff === 0) { badgeClass = 'bg-rose-500'; label = 'Due Today'; }
              else if (daysDiff === 1) { badgeClass = 'bg-pink-500'; label = 'Due Tomorrow'; }
              const isColored = daysDiff <= 1;

              return (
                <View key={s.id} className="w-full md:w-[48%] p-2.5 rounded-xl bg-white/80 border border-white/60 flex-row items-center justify-between gap-2">
                  <View className="flex-1">
                    <Text className="font-bold text-slate-800 text-xs">{s.name}</Text>
                    <Text className="text-slate-400 text-[10px] font-medium">Area: {s.area} - Last Order: {s.last_purchase_date || 'N/A'}</Text>
                  </View>
                  <Text className={`text-[10px] font-bold px-2 py-1 rounded-lg ${badgeClass} ${isColored ? 'text-white' : ''}`}>
                    {label}
                  </Text>
                  <Pressable onPress={() => setActiveScreen('Refill')} className="py-1 px-3 bg-blue-600 rounded-lg active:bg-blue-700">
                    <Text className="text-white font-extrabold text-[10px]">View Refill</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* TOP STORES & PRODUCTS */}
      <View className="gap-4 md:flex-row md:flex-wrap">
        <View className="md:flex-1 md:min-w-[320px] bg-white/70 border border-white/50 rounded-2xl p-4">
          <View className="flex-row items-center gap-1.5 mb-3">
            <Trophy size={16} color="#f59e0b" />
            <Text className="font-bold text-slate-800 text-sm">Top Stores (by Revenue)</Text>
          </View>
          <View>
            {storeRevenues.map((st, i) => (
              <View key={i} className="flex-row items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-slate-400 text-xs">#{i + 1}</Text>
                  <View>
                    <Text className="font-semibold text-slate-800 text-xs">{st.name}</Text>
                    <Text className="text-[10px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded self-start">{st.ranking} Partner</Text>
                  </View>
                </View>
                <Text className="font-bold text-slate-700 text-xs">{formatWholeRupees(st.revenue)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="md:flex-1 md:min-w-[320px] bg-white/70 border border-white/50 rounded-2xl p-4">
          <View className="flex-row items-center gap-1.5 mb-3">
            <Award size={16} color="#0ea5e9" />
            <Text className="font-bold text-slate-800 text-sm">Top Products (by Volume)</Text>
          </View>
          <View>
            {productSales.map((p, i) => (
              <View key={i} className="flex-row items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-slate-400 text-xs">#{i + 1}</Text>
                  <View>
                    <Text className="font-semibold text-slate-800 text-xs">{p.name}</Text>
                    <Text className="text-[9px] text-slate-400 font-medium">{p.category}</Text>
                  </View>
                </View>
                <Text className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded-full text-[10px]">{formatQty(p.qty)} sold</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* TRUCK INVENTORY */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Truck size={16} color="#059669" />
          <Text className="font-bold text-slate-800 text-sm">Truck Inventory & Stock Value</Text>
        </View>
        <View className="flex-row border-b border-slate-100 pb-2 mb-1">
          <Text className="flex-1 text-slate-400 font-semibold uppercase text-[9px]">Vehicle / Driver</Text>
          <Text className="w-20 text-slate-400 font-semibold uppercase text-[9px] text-center">Route</Text>
          <Text className="w-14 text-slate-400 font-semibold uppercase text-[9px] text-right">Qty</Text>
        </View>
        {data.trucks.map(t => {
          const driver = data.users.find(u => u.id === t.driver_user_id);
          const inventories = data.truck_inventory.filter(ti => ti.truck_id === t.id);
          let totalQtyBoxes = 0, totalQtyPieces = 0, totalVal = 0;
          inventories.forEach(ti => {
            const prod = data.products.find(p => p.id === ti.product_id);
            const qty = { boxes: ti.quantity, pieces: ti.quantity_pieces };
            if (prod && isPositiveQty(qty)) {
              totalQtyBoxes += ti.quantity;
              totalQtyPieces += ti.quantity_pieces;
              totalVal += getInventoryCostValue(ti.product_id, qty);
            }
          });
          return (
            <View key={t.id} className="flex-row items-center py-2.5 border-b border-slate-50 last:border-0">
              <View className="flex-1">
                <Text className="font-bold text-slate-800 text-xs">{t.vehicle_number}</Text>
                <Text className="text-[9px] text-slate-500 font-medium">{driver?.name || 'Unassigned'}</Text>
                <Text className="text-emerald-600 font-bold text-[10px]">{formatWholeRupees(totalVal)}</Text>
              </View>
              <Text className="w-20 text-slate-600 font-medium text-center text-xs">{t.area}</Text>
              <Text className="w-14 font-semibold text-slate-700 text-right text-xs">{formatQty({ boxes: totalQtyBoxes, pieces: totalQtyPieces })}</Text>
            </View>
          );
        })}
        {data.trucks.length === 0 && (
          <Text className="py-4 text-center text-slate-400 italic text-xs">No trucks registered in the fleet.</Text>
        )}
      </View>

      {/* SALESPERSON PERFORMANCE */}
      <View className="bg-white/70 border border-white/50 rounded-2xl p-4">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Users size={16} color="#6366f1" />
          <Text className="font-bold text-slate-800 text-sm">Salesperson / Driver Stats</Text>
        </View>
        {data.users.filter(u => u.role === 'Salesperson').map(u => {
          const driverOrders = data.orders.filter(o => o.salesperson_id === u.id);
          const count = driverOrders.length;
          const revenue = driverOrders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + getOrderRevenue(o), 0);
          const collections = data.payments.filter(p => p.collected_by === u.id).reduce((sum, p) => sum + p.amount, 0);
          return (
            <View key={u.id} className="flex-row items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
              <Text className="font-bold text-slate-800 text-xs">{u.name.split(' ')[0]}</Text>
              <Text className="text-slate-600 font-medium text-xs">{count} orders</Text>
              <Text className="font-semibold text-slate-700 text-xs">{formatWholeRupees(revenue)}</Text>
              <Text className="text-emerald-600 font-bold text-xs">{formatWholeRupees(collections)}</Text>
            </View>
          );
        })}
      </View>

    </View>
  );
}
