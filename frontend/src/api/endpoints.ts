import { api } from './client';

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
};

// ---------- Products ----------
export const productsApi = {
  list: () => api.get<any[]>('/products'),
  create: (input: any) => api.post<any>('/products', input),
  update: (id: string, input: any) => api.patch<any>(`/products/${id}`, input),
  updatePrice: (id: string, input: { purchase_price: number; wholesale_price: number; selling_price: number }) =>
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
  create: (input: any) => api.post<any>('/purchases', input),
};

// ---------- Warehouse ----------
export const warehouseApi = {
  listInventory: () => api.get<any[]>('/warehouse/inventory'),
  adjust: (input: { product_id: string; type: string; direction: 'add' | 'subtract'; qty: number; reason?: string }) =>
    api.post<any>('/warehouse/inventory/adjust', input),
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
  load: (input: { truck_id: string; items: { product_id: string; qty: number; source: 'available_qty' | 'reserved_qty'; pre_booking_id?: string }[] }) =>
    api.post<any>('/dispatch/load', input),
  returnStock: (truckId: string, product_id: string, qty: number) =>
    api.post<any>(`/dispatch/trucks/${truckId}/return`, { product_id, qty }),
  returnAll: (truckId: string) => api.post<any>(`/dispatch/trucks/${truckId}/return-all`, {}),
  transfer: (input: { from_truck_id: string; to_truck_id: string; items: { product_id: string; qty: number }[] }) =>
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
  listInvoices: () => api.get<any[]>('/orders/invoices'),
  create: (input: { store_id: string; salesperson_id: string; truck_id: string; items: any[] }) =>
    api.post<{ order: any; invoice: any }>('/orders', input),
  settle: (id: string, input: { method: string; amount: number }) =>
    api.post<any>(`/orders/${id}/settle`, input),
  confirmDraft: (id: string) => api.post<any>(`/orders/${id}/confirm`, {}),
  deliverConfirmed: (id: string) => api.post<{ order: any; invoice: any }>(`/orders/${id}/deliver`, {}),
  cancel: (id: string) => api.patch<any>(`/orders/${id}/cancel`, {}),
};

// ---------- Payments ----------
export const paymentsApi = {
  list: () => api.get<any[]>('/payments'),
  create: (input: { store_id: string; invoice_id?: string; amount: number; method: string }) =>
    api.post<any>('/payments', input),
};

// ---------- PreBookings ----------
export const preBookingsApi = {
  list: () => api.get<any[]>('/prebookings'),
  create: (input: { store_id: string; salesperson_id: string; scheduled_delivery_date: string; items: any[]; notes?: string }) =>
    api.post<any>('/prebookings', input),
  update: (id: string, input: { store_id: string; scheduled_delivery_date: string; items: any[]; notes?: string }) =>
    api.patch<any>(`/prebookings/${id}`, input),
  deliver: (id: string, input: { method: string; amount: number }) =>
    api.post<any>(`/prebookings/${id}/deliver`, input),
  cancel: (id: string) => api.patch<any>(`/prebookings/${id}/cancel`, {}),
};

// ---------- Notifications ----------
export const notificationsApi = {
  list: () => api.get<any[]>('/notifications'),
  create: (input: { type: string; message: string }) => api.post<any>('/notifications', input),
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
};
