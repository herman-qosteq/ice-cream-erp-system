import { api } from './client';
import { BoxPieceQty } from '../types';

// Small shared helper for building query strings for the new paginated list
// endpoints - undefined/empty values are simply omitted rather than sent as
// literal "undefined" strings.
function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

// ---------- Auth ----------
export const authApi = {
  login: (identifier: string, password: string) =>
    api.post<{ token: string; user: any }>('/auth/login', { identifier, password }),
  me: () => api.get<any>('/auth/me'),
};

// ---------- Users ----------
export const usersApi = {
  list: () => api.get<any[]>('/users'),
  create: (input: { name: string; phone: string; role: string; password_hash: string }) =>
    api.post<any>('/users', input),
  update: (id: string, input: { name?: string; phone?: string; role?: string; status?: string }) =>
    api.patch<any>(`/users/${id}`, input),
  toggleStatus: (id: string) => api.patch<any>(`/users/${id}/status`, {}),
  resetPassword: (id: string, password: string) => api.patch<any>(`/users/${id}/password`, { password }),
};

// ---------- Categories ----------
export const categoriesApi = {
  list: () => api.get<any[]>('/categories'),
  create: (name: string) => api.post<any>('/categories', { name }),
  rename: (id: string, name: string) => api.patch<any>(`/categories/${id}`, { name }),
  toggleStatus: (id: string) => api.patch<any>(`/categories/${id}/status`, {}),
};

// ---------- District Areas ----------
export const areasApi = {
  list: () => api.get<any[]>('/areas'),
  create: (name: string) => api.post<any>('/areas', { name }),
  rename: (id: string, name: string) => api.patch<any>(`/areas/${id}`, { name }),
  remove: (id: string) => api.delete<any>(`/areas/${id}`),
};

// ---------- Villages ----------
export const villagesApi = {
  list: () => api.get<any[]>('/villages'),
  create: (name: string) => api.post<any>('/villages', { name }),
  rename: (id: string, name: string) => api.patch<any>(`/villages/${id}`, { name }),
  remove: (id: string) => api.delete<any>(`/villages/${id}`),
};

// ---------- Partner Types ----------
export const partnerTypesApi = {
  list: () => api.get<any[]>('/partner-types'),
  create: (name: string) => api.post<any>('/partner-types', { name }),
  rename: (id: string, name: string) => api.patch<any>(`/partner-types/${id}`, { name }),
  remove: (id: string) => api.delete<any>(`/partner-types/${id}`),
};

// ---------- Asset Types ----------
export const assetTypesApi = {
  list: () => api.get<any[]>('/asset-types'),
  create: (name: string) => api.post<any>('/asset-types', { name }),
  rename: (id: string, name: string) => api.patch<any>(`/asset-types/${id}`, { name }),
  remove: (id: string) => api.delete<any>(`/asset-types/${id}`),
};

// ---------- Assets (freezer boxes, fridges, carts, ...) ----------
export const assetsApi = {
  list: () => api.get<any[]>('/assets'),
  listPaged: (params: { page?: number; pageSize?: number; search?: string; status?: string; asset_type?: string; location_type?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/assets${toQueryString(params)}`),
  create: (input: { name: string; code: string; asset_type: string; serial_number?: string; capacity?: string; notes?: string }) =>
    api.post<any>('/assets', input),
  update: (id: string, input: Partial<{ name: string; code: string; asset_type: string; serial_number: string; capacity: string; notes: string; last_service_date: string }>) =>
    api.patch<any>(`/assets/${id}`, input),
  assign: (id: string, input: { partner_id: string; notes?: string }) => api.post<any>(`/assets/${id}/assign`, input),
  return: (id: string, input: { notes?: string } = {}) => api.post<any>(`/assets/${id}/return`, input),
  maintenanceStart: (id: string, input: { notes?: string } = {}) => api.post<any>(`/assets/${id}/maintenance-start`, input),
  maintenanceEnd: (id: string, input: { notes?: string } = {}) => api.post<any>(`/assets/${id}/maintenance-end`, input),
  markLost: (id: string, input: { notes?: string } = {}) => api.post<any>(`/assets/${id}/mark-lost`, input),
  reactivate: (id: string, input: { notes?: string } = {}) => api.post<any>(`/assets/${id}/reactivate`, input),
  deactivate: (id: string, input: { notes?: string } = {}) => api.post<any>(`/assets/${id}/deactivate`, input),
  history: (id: string) => api.get<any[]>(`/assets/${id}/history`),
  inventory: (id: string) => api.get<any[]>(`/assets/${id}/inventory`),
  inventorySummary: () => api.get<{ totalUnits: number }>('/assets/inventory-summary'),
  allInventory: () => api.get<any[]>('/assets/inventory'),
  allHistory: () => api.get<any[]>('/assets/history'),
};

// ---------- Inventory Movements (unified movement ledger) ----------
export const inventoryMovementsApi = {
  list: (params: { from_location_type?: string; to_location_type?: string; product_id?: string; dateFrom?: string; dateTo?: string } = {}) =>
    api.get<any[]>(`/inventory-movements${toQueryString(params)}`),
  listPaged: (params: { page?: number; pageSize?: number; from_location_type?: string; to_location_type?: string; product_id?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/inventory-movements${toQueryString(params)}`),
  move: (input: { from_type: string; from_id?: string; to_type: string; to_id?: string; product_id: string; qty: BoxPieceQty; reason?: string }) =>
    api.post<any>('/inventory-movements/move', input),
};

// ---------- Store-Specific Pricing Overrides ----------
export const storePricingApi = {
  list: () => api.get<any[]>('/store-pricing'),
  upsert: (input: { store_id: string; product_id: string; wholesale_discount_pct: number | null; retail_discount_pct: number | null }) =>
    api.put<any>('/store-pricing', input),
  remove: (id: string) => api.delete<any>(`/store-pricing/${id}`),
  clone: (input: { source_store_id: string; target_store_ids: string[] }) =>
    api.post<any[]>('/store-pricing/clone', input),
};

// ---------- Products ----------
export const productsApi = {
  list: () => api.get<any[]>('/products'),
  create: (input: any) => api.post<any>('/products', input),
  update: (id: string, input: any) => api.patch<any>(`/products/${id}`, input),
  updatePrice: (id: string, input: { mrp: number; purchase_discount_pct: number; wholesale_discount_pct: number; retail_discount_pct: number }) =>
    api.patch<any>(`/products/${id}/price`, input),
  setStatus: (id: string, status: 'Active' | 'Inactive') => api.patch<any>(`/products/${id}/status`, { status }),
};

// ---------- Suppliers ----------
export const suppliersApi = {
  list: () => api.get<any[]>('/suppliers'),
  create: (input: any) => api.post<any>('/suppliers', input),
  update: (id: string, input: any) => api.patch<any>(`/suppliers/${id}`, input),
  setStatus: (id: string, status: 'Active' | 'Inactive') => api.patch<any>(`/suppliers/${id}/status`, { status }),
};

// ---------- Purchases ----------
export const purchasesApi = {
  list: () => api.get<any[]>('/purchases'),
  listPaged: (params: { page?: number; pageSize?: number; search?: string; supplier_id?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/purchases${toQueryString(params)}`),
  create: (input: any) => api.post<any>('/purchases', input),
  updateBillFile: (id: string, input: { bill_file_url: string | null; bill_file_name: string | null; bill_file_type: string | null }) =>
    api.patch<any>(`/purchases/${id}/bill-file`, input),
};

// ---------- Purchase Order Requests (saved PO Excel drafts) ----------
export const purchaseOrderRequestsApi = {
  list: () => api.get<any[]>('/purchase-order-requests'),
  create: (input: { order_ref: string; supplier_id: string; items: { product_id: string; order_case: number; order_case_pieces?: number }[] }) =>
    api.post<any>('/purchase-order-requests', input),
  update: (id: string, input: { supplier_id: string; items: { product_id: string; order_case: number; order_case_pieces?: number }[] }) =>
    api.patch<any>(`/purchase-order-requests/${id}`, input),
  cancel: (id: string) => api.patch<any>(`/purchase-order-requests/${id}/cancel`, {}),
};

// ---------- Warehouse ----------
export const warehouseApi = {
  listInventory: () => api.get<any[]>('/warehouse/inventory'),
  adjust: (input: { product_id: string; type: string; direction: 'add' | 'subtract'; qty: BoxPieceQty; reason?: string }) =>
    api.post<any>('/warehouse/inventory/adjust', input),
  correct: (input: { product_id: string; available_qty: BoxPieceQty; reserved_qty: BoxPieceQty; damaged_qty: BoxPieceQty; expired_qty: BoxPieceQty; comment?: string }) =>
    api.post<any>('/warehouse/inventory/correct', input),
};

// ---------- Trucks ----------
export const trucksApi = {
  list: () => api.get<any[]>('/trucks'),
  create: (input: any) => api.post<any>('/trucks', input),
  update: (id: string, input: any) => api.patch<any>(`/trucks/${id}`, input),
  setStatus: (id: string, status: 'Active' | 'Inactive') => api.patch<any>(`/trucks/${id}/status`, { status }),
};

// ---------- Dispatch ----------
export const dispatchApi = {
  listAllTruckInventory: () => api.get<any[]>('/dispatch/trucks/inventory'),
  listTruckInventory: (truckId: string) => api.get<any[]>(`/dispatch/trucks/${truckId}/inventory`),
  load: (input: { truck_id: string; items: { product_id: string; qty: BoxPieceQty; source: 'available_qty' | 'reserved_qty'; pre_booking_id?: string }[] }) =>
    api.post<any>('/dispatch/load', input),
  returnStock: (truckId: string, product_id: string, qty: BoxPieceQty) =>
    api.post<any>(`/dispatch/trucks/${truckId}/return`, { product_id, qty }),
  returnAll: (truckId: string) => api.post<any>(`/dispatch/trucks/${truckId}/return-all`, {}),
  transfer: (input: { from_truck_id: string; to_truck_id: string; items: { product_id: string; qty: BoxPieceQty }[] }) =>
    api.post<any>('/dispatch/transfer', input),
};

// ---------- Stores ----------
export const storesApi = {
  list: () => api.get<any[]>('/stores'),
  create: (input: any) => api.post<any>('/stores', input),
  update: (id: string, input: any) => api.patch<any>(`/stores/${id}`, input),
  setStatus: (id: string, status: 'Active' | 'Inactive') => api.patch<any>(`/stores/${id}/status`, { status }),
  listVisits: (storeId?: string) => api.get<any[]>(`/stores/visits${storeId ? `?store_id=${storeId}` : ''}`),
  recordVisit: (input: { store_id: string; notes: string; follow_up_date?: string }) =>
    api.post<any>('/stores/visits', input),
};

// ---------- Orders ----------
export const ordersApi = {
  list: () => api.get<any[]>('/orders'),
  listPaged: (params: { page?: number; pageSize?: number; search?: string; status?: string; paymentStatus?: string; partnerType?: string; salespersonId?: string; truckId?: string; area?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/orders${toQueryString(params)}`),
  listInvoices: () => api.get<any[]>('/orders/invoices'),
  create: (input: { store_id: string; salesperson_id: string; truck_id?: string; items: any[] }) =>
    api.post<{ order: any; invoice: any }>('/orders', input),
  settle: (id: string, input: { method: string; amount: number }) =>
    api.post<any>(`/orders/${id}/settle`, input),
  confirmDraft: (id: string) => api.post<any>(`/orders/${id}/confirm`, {}),
  deliverConfirmed: (id: string) => api.post<{ order: any; invoice: any }>(`/orders/${id}/deliver`, {}),
  cancel: (id: string) => api.patch<any>(`/orders/${id}/cancel`, {}),
  // Admin-only: editing/deleting a Confirmed or Delivered order.
  edit: (id: string, input: { items: { product_id: string; quantity: number; quantity_pieces?: number; unit_price: number; tax_pct: number }[] }) =>
    api.patch<{ order: any; invoice?: any }>(`/orders/${id}/edit`, input),
  remove: (id: string) => api.delete<{ id: string; deleted: true }>(`/orders/${id}`),
};

// ---------- Payments ----------
export const paymentsApi = {
  list: () => api.get<any[]>('/payments'),
  listPaged: (params: { page?: number; pageSize?: number; search?: string; method?: string; partnerType?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/payments${toQueryString(params)}`),
  create: (input: { store_id: string; invoice_id?: string; amount: number; method: string }) =>
    api.post<any>('/payments', input),
};

// ---------- PreBookings ----------
export const preBookingsApi = {
  list: () => api.get<any[]>('/prebookings'),
  listPaged: (params: { page?: number; pageSize?: number; search?: string; status?: string; partnerType?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/prebookings${toQueryString(params)}`),
  create: (input: { store_id: string; salesperson_id: string; scheduled_delivery_date: string; items: any[]; notes?: string }) =>
    api.post<any>('/prebookings', input),
  update: (id: string, input: { store_id: string; scheduled_delivery_date: string; items: any[]; notes?: string }) =>
    api.patch<any>(`/prebookings/${id}`, input),
  deliver: (id: string, input: { method: string; amount: number }) =>
    api.post<any>(`/prebookings/${id}/deliver`, input),
  cancel: (id: string) => api.patch<any>(`/prebookings/${id}/cancel`, {}),
  // Admin-only: editing/deleting a Delivered booking (operates on the real
  // order it produced - see backend prebookings.service.ts).
  editDelivered: (id: string, input: { items: { product_id: string; quantity: number; quantity_pieces?: number; unit_price: number; tax_pct: number }[] }) =>
    api.patch<{ booking: any; order: any; invoice?: any }>(`/prebookings/${id}/edit-delivered`, input),
  removeDelivered: (id: string) => api.delete<{ id: string; deleted: true }>(`/prebookings/${id}`),
};

// ---------- Notifications ----------
export const notificationsApi = {
  list: () => api.get<any[]>('/notifications'),
  listPaged: (params: { page?: number; pageSize?: number; search?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/notifications${toQueryString(params)}`),
  create: (input: { type: string; message: string; entity_type?: string; entity_id?: string }) => api.post<any>('/notifications', input),
  markRead: (id: string) => api.patch<any>(`/notifications/${id}/read`, {}),
  clearAll: () => api.delete<{ ok: boolean }>('/notifications'),
};

// ---------- System (destructive dev/admin utilities) ----------
export const systemApi = {
  clearWarehouseStock: () => api.post<{ ok: boolean }>('/system/clear-warehouse-stock', {}),
  factoryReset: () => api.post<{ ok: boolean }>('/system/factory-reset', {}),
};

// ---------- Settings ----------
export const settingsApi = {
  getQr: () => api.get<{ image_url: string; is_enabled: boolean }>('/settings/qr-code'),
  updateQr: (input: { image_url?: string; is_enabled?: boolean }) => api.patch<any>('/settings/qr-code', input),
  listAuditLogs: () => api.get<any[]>('/settings/audit-logs'),
  listAuditLogsPaged: (params: { page?: number; pageSize?: number; search?: string; action?: string; entity_type?: string; user_id?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<{ data: any[]; page: number; pageSize: number; total: number; totalPages: number }>(`/settings/audit-logs${toQueryString(params)}`),
  listPermissions: () => api.get<any[]>('/settings/permissions'),
  setPermission: (input: { role: 'Admin' | 'Salesperson' | 'Warehouse'; feature: string; enabled: boolean }) => api.patch<any>('/settings/permissions', input),
  listUserPermissions: () => api.get<any[]>('/settings/user-permissions'),
  setUserPermissions: (userId: string, permissions: { feature: string; enabled: boolean }[]) =>
    api.patch<any>(`/settings/user-permissions/${userId}`, { permissions }),
  resetUserPermissions: (userId: string) => api.delete<any>(`/settings/user-permissions/${userId}`),
};
